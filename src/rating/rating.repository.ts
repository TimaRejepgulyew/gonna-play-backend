import { type MATCH_STATUS, PARTICIPANT_STATUS } from "@/constants/enums.js";
import type { PrismaClient } from "@/types/prisma.js";
import type PlayerRating from "./rating.model.js";

import type { CreateRatingData, IRatingRepository, PlayerRatingsResult } from "./rating.service.js";

export default class RatingRepository implements IRatingRepository {
  constructor(private prisma: PrismaClient) {}

  async createRating(data: CreateRatingData): Promise<PlayerRating> {
    const created = await this.prisma.playerRating.create({
      data: {
        matchId: data.matchId,
        raterId: data.raterId,
        ratedId: data.ratedId,
        score: data.score,
        comment: data.comment,
      },
    });
    return created as unknown as PlayerRating;
  }

  // Aggregate is computed from raw rows, not materialized.
  async getByPlayer(playerId: number): Promise<PlayerRatingsResult> {
    const [aggregate, ratings] = await Promise.all([
      this.prisma.playerRating.aggregate({
        where: { ratedId: playerId },
        _avg: { score: true },
        _count: { score: true },
      }),
      this.prisma.playerRating.findMany({
        where: { ratedId: playerId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return {
      aggregate: {
        playerId,
        average: aggregate._avg.score ?? 0,
        count: aggregate._count.score ?? 0,
      },
      ratings: ratings as unknown as PlayerRating[],
    };
  }

  async getByMatch(matchId: number): Promise<PlayerRating[]> {
    const ratings = await this.prisma.playerRating.findMany({
      where: { matchId },
      orderBy: { createdAt: "desc" },
    });
    return ratings as unknown as PlayerRating[];
  }

  async findById(id: number): Promise<PlayerRating | null> {
    return this.prisma.playerRating.findUnique({
      where: { id },
    }) as unknown as Promise<PlayerRating | null>;
  }

  async deleteRating(id: number): Promise<void> {
    await this.prisma.playerRating.delete({ where: { id } });
  }

  async getMatchStatus(matchId: number): Promise<MATCH_STATUS | null> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { status: true },
    });
    return (match?.status as MATCH_STATUS) ?? null;
  }

  async isConfirmedParticipant(matchId: number, playerId: number): Promise<boolean> {
    const participant = await this.prisma.matchParticipant.findUnique({
      where: { matchId_playerId: { matchId, playerId } },
      select: { status: true },
    });
    return (
      participant?.status === PARTICIPANT_STATUS.CONFIRMED ||
      participant?.status === PARTICIPANT_STATUS.CHECKED_IN
    );
  }

  async isMatchParticipant(matchId: number, playerId: number): Promise<boolean> {
    const participant = await this.prisma.matchParticipant.findUnique({
      where: { matchId_playerId: { matchId, playerId } },
      select: { id: true },
    });
    return !!participant;
  }
}
