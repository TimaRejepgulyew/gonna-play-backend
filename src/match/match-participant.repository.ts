import { PrismaClient } from "@prisma/client";

import { MATCH_STATUS, PARTICIPANT_STATUS } from "@/constants/enums.js";

import type {
  CreateParticipantData,
  IMatchParticipantRepository,
  ParticipantRecord,
} from "./match.service.js";

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
      orderBy: { createdAt: "asc" },
    });
    return rows as unknown as ParticipantRecord[];
  }

  async findById(id: number): Promise<ParticipantRecord | null> {
    return this.prisma.matchParticipant.findUnique({
      where: { id },
    }) as unknown as Promise<ParticipantRecord | null>;
  }

  async findByMatchAndPlayer(
    matchId: number,
    playerId: number
  ): Promise<ParticipantRecord | null> {
    return this.prisma.matchParticipant.findUnique({
      where: { matchId_playerId: { matchId, playerId } },
    }) as unknown as Promise<ParticipantRecord | null>;
  }

  async create(data: CreateParticipantData): Promise<ParticipantRecord> {
    const created = await this.prisma.matchParticipant.create({
      data: {
        matchId: data.matchId,
        playerId: data.playerId,
        position: data.position,
        team: data.team,
        status: data.status,
      },
    });
    return created as unknown as ParticipantRecord;
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

  async countConfirmed(matchId: number): Promise<number> {
    return this.prisma.matchParticipant.count({
      where: { matchId, status: PARTICIPANT_STATUS.CONFIRMED },
    });
  }

  // Serializable-safe capacity gate: the confirmed count is re-read inside the
  // transaction, so concurrent accepts cannot both pass the maxPlayers check.
  async confirmWithCapacity(
    matchId: number,
    participantId: number,
    maxPlayers: number
  ): Promise<ParticipantRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const confirmed = await tx.matchParticipant.count({
        where: { matchId, status: PARTICIPANT_STATUS.CONFIRMED },
      });
      if (confirmed >= maxPlayers) {
        return null;
      }
      const updated = await tx.matchParticipant.update({
        where: { id: participantId },
        data: { status: PARTICIPANT_STATUS.CONFIRMED },
      });
      // Flip to FULL only when still OPEN and the last seat was just taken.
      if (confirmed + 1 >= maxPlayers) {
        await tx.match.updateMany({
          where: { id: matchId, status: MATCH_STATUS.OPEN },
          data: { status: MATCH_STATUS.FULL },
        });
      }
      return updated as unknown as ParticipantRecord;
    });
  }
}
