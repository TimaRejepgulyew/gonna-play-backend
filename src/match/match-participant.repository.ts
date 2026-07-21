import { Prisma, PrismaClient } from "@prisma/client";

import { MATCH_STATUS, PARTICIPANT_STATUS } from "@/constants/enums.js";

import { SEATED_STATUSES } from "./match.service.js";

import type {
  IMatchParticipantRepository,
  ParticipantRecord,
} from "./match.service.js";
import type { PLAYER_POSITION } from "@/player/constant.js";

export default class MatchParticipantRepository
  implements IMatchParticipantRepository
{
  constructor(private prisma: PrismaClient) {}

  async listByMatch(
    matchId: number,
    status?: PARTICIPANT_STATUS
  ): Promise<ParticipantRecord[]> {
    const rows = await this.prisma.matchParticipant.findMany({
      where: { matchId, ...(status ? { status } : {}) },
      include: { player: true },
      orderBy: { joinedAt: "asc" },
    });
    return rows as unknown as ParticipantRecord[];
  }

  async findByMatchAndPlayer(
    matchId: number,
    playerId: number
  ): Promise<ParticipantRecord | null> {
    return this.prisma.matchParticipant.findUnique({
      where: { matchId_playerId: { matchId, playerId } },
    }) as unknown as Promise<ParticipantRecord | null>;
  }

  async updateStatus(
    id: number,
    status: PARTICIPANT_STATUS
  ): Promise<ParticipantRecord> {
    const updated = await this.prisma.matchParticipant.update({
      where: { id },
      data: { status },
    });
    return updated as unknown as ParticipantRecord;
  }

  async countSeated(matchId: number): Promise<number> {
    return this.prisma.matchParticipant.count({
      where: { matchId, status: { in: SEATED_STATUSES } },
    });
  }

  // Serializable transaction with a single retry on the Postgres write
  // conflict / serialization failure (Prisma P2034). Every capacity-sensitive
  // transaction routes through here so the Prisma error code never leaks to the
  // service layer.
  private async runSerializable<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    const run = () =>
      this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    try {
      return await run();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        return run();
      }
      throw error;
    }
  }

  // Transactional join. Seated count is re-read inside the transaction so
  // concurrent joins cannot both take the last seat. Returns null when an
  // active participation already exists; reuses a CANCELLED row (resetting
  // joinedAt) so the unique (matchId, playerId) constraint is honoured.
  async joinWithCapacity(
    matchId: number,
    playerId: number,
    maxPlayers: number,
    data: { position?: PLAYER_POSITION }
  ): Promise<{ participant: ParticipantRecord; waitlisted: boolean } | null> {
    return this.runSerializable(async (tx) => {
      const seated = await tx.matchParticipant.count({
        where: { matchId, status: { in: SEATED_STATUSES } },
      });
      const target =
        seated < maxPlayers
          ? PARTICIPANT_STATUS.REGISTERED
          : PARTICIPANT_STATUS.WAITLISTED;

      const existing = (await tx.matchParticipant.findUnique({
        where: { matchId_playerId: { matchId, playerId } },
      })) as unknown as ParticipantRecord | null;

      let participant: ParticipantRecord;
      if (!existing) {
        const created = await tx.matchParticipant.create({
          data: {
            matchId,
            playerId,
            status: target,
            position: data.position,
          },
        });
        participant = created as unknown as ParticipantRecord;
      } else if (existing.status === PARTICIPANT_STATUS.CANCELLED) {
        const updated = await tx.matchParticipant.update({
          where: { id: existing.id },
          data: {
            status: target,
            joinedAt: new Date(),
            position: data.position ?? null,
          },
        });
        participant = updated as unknown as ParticipantRecord;
      } else {
        return null;
      }

      // Flip to FULL only when still OPEN and the last seat was just taken.
      if (
        target === PARTICIPANT_STATUS.REGISTERED &&
        seated + 1 >= maxPlayers
      ) {
        await tx.match.updateMany({
          where: { id: matchId, status: MATCH_STATUS.OPEN },
          data: { status: MATCH_STATUS.FULL },
        });
      }

      return {
        participant,
        waitlisted: target === PARTICIPANT_STATUS.WAITLISTED,
      };
    });
  }

  // Transactional leave: cancels the caller, then — when they occupied a seat —
  // promotes the head of the waitlist (freeing exactly one seat) or reopens a
  // FULL match with no queue. A WAITLISTED leaver promotes no one.
  async leaveWithPromotion(
    matchId: number,
    participantId: number,
    wasSeated: boolean,
    maxPlayers: number
  ): Promise<{ left: ParticipantRecord; promoted: ParticipantRecord | null }> {
    return this.runSerializable(async (tx) => {
      const left = await tx.matchParticipant.update({
        where: { id: participantId },
        data: { status: PARTICIPANT_STATUS.CANCELLED },
      });

      let promoted: ParticipantRecord | null = null;
      if (wasSeated) {
        const promotedList = await this.promoteToCapacity(
          tx,
          matchId,
          maxPlayers
        );
        promoted = promotedList[0] ?? null;
      }

      return { left: left as unknown as ParticipantRecord, promoted };
    });
  }

  // Bulk REGISTERED -> CONFIRMED for `confirm`; returns the affected count.
  async confirmAllRegistered(matchId: number): Promise<number> {
    const result = await this.prisma.matchParticipant.updateMany({
      where: { matchId, status: PARTICIPANT_STATUS.REGISTERED },
      data: { status: PARTICIPANT_STATUS.CONFIRMED },
    });
    return result.count;
  }

  // Promote waitlisted players up to a raised maxPlayers (used when updateMatch
  // raises the limit on a FULL match). Returns the number promoted.
  async promoteWaitlist(matchId: number, maxPlayers: number): Promise<number> {
    const promoted = await this.runSerializable((tx) =>
      this.promoteToCapacity(tx, matchId, maxPlayers)
    );
    return promoted.length;
  }

  // Shared promotion cycle for leave and maxPlayers raise: fill free seats from
  // the waitlist head (joinedAt asc, covered by [matchId, status, joinedAt]),
  // and flip FULL -> OPEN when seats remain after the queue is drained.
  private async promoteToCapacity(
    tx: Prisma.TransactionClient,
    matchId: number,
    maxPlayers: number
  ): Promise<ParticipantRecord[]> {
    const promoted: ParticipantRecord[] = [];
    let seated = await tx.matchParticipant.count({
      where: { matchId, status: { in: SEATED_STATUSES } },
    });
    while (seated < maxPlayers) {
      const next = await tx.matchParticipant.findFirst({
        where: { matchId, status: PARTICIPANT_STATUS.WAITLISTED },
        orderBy: { joinedAt: "asc" },
      });
      if (!next) break;
      const updated = await tx.matchParticipant.update({
        where: { id: next.id },
        data: { status: PARTICIPANT_STATUS.REGISTERED },
      });
      promoted.push(updated as unknown as ParticipantRecord);
      seated += 1;
    }
    if (seated < maxPlayers) {
      await tx.match.updateMany({
        where: { id: matchId, status: MATCH_STATUS.FULL },
        data: { status: MATCH_STATUS.OPEN },
      });
    }
    return promoted;
  }
}
