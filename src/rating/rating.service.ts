import { Prisma } from "@prisma/client";

import { errorCodes as appErrorCodes } from "@/constants/index.js";
import { MATCH_STATUS } from "@/constants/enums.js";
import {
  CACHE_TTL,
  cacheKeys,
  cacheDel,
  bumpVersion,
  getOrSet,
} from "@/utils/cache.js";
import PlayerRating, { RatingAggregate } from "./rating.model.js";

import type { Logger } from "pino";
import type { ErrorResponse } from "@/types/prisma.js";
import type { JwtPayload } from "@/plugins/auth.js";

export interface CreateRatingInput {
  matchId: number;
  ratedId: number;
  score: number;
  comment?: string;
}

export interface CreateRatingData extends CreateRatingInput {
  raterId: number;
}

export interface PlayerRatingsResult {
  aggregate: RatingAggregate;
  ratings: PlayerRating[];
}

export interface IRatingRepository {
  createRating(data: CreateRatingData): Promise<PlayerRating>;
  getByPlayer(playerId: number): Promise<PlayerRatingsResult>;
  getByMatch(matchId: number): Promise<PlayerRating[]>;
  findById(id: number): Promise<PlayerRating | null>;
  deleteRating(id: number): Promise<void>;
  getMatchStatus(matchId: number): Promise<MATCH_STATUS | null>;
  isConfirmedParticipant(matchId: number, playerId: number): Promise<boolean>;
  isMatchParticipant(matchId: number, playerId: number): Promise<boolean>;
}

export class RatingService {
  constructor(
    private ratingRepository: IRatingRepository,
    private logger: Logger
  ) {}

  async createRating(
    payload: JwtPayload,
    input: CreateRatingInput
  ): Promise<PlayerRating | ErrorResponse> {
    if (!payload.playerId) {
      return appErrorCodes.PLAYER_PROFILE_REQUIRED;
    }
    const raterId = payload.playerId;

    if (raterId === input.ratedId) {
      return appErrorCodes.RATING_SELF_NOT_ALLOWED;
    }

    const status = await this.ratingRepository.getMatchStatus(input.matchId);
    if (!status) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    if (status !== MATCH_STATUS.COMPLETED) {
      return appErrorCodes.MATCH_NOT_COMPLETED;
    }

    const [raterOk, ratedOk] = await Promise.all([
      this.ratingRepository.isConfirmedParticipant(input.matchId, raterId),
      this.ratingRepository.isConfirmedParticipant(input.matchId, input.ratedId),
    ]);
    if (!raterOk || !ratedOk) {
      return appErrorCodes.NOT_MATCH_PARTICIPANT;
    }

    let created: PlayerRating;
    try {
      created = await this.ratingRepository.createRating({ ...input, raterId });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return appErrorCodes.RATING_ALREADY_EXISTS;
      }
      this.logger.error(error);
      throw error;
    }
    await this.invalidateRating(input.ratedId);
    return created;
  }

  // Invalidate the rated player's aggregate, card (embeds the aggregate) and
  // the leaderboard version — cache-design.md §4.
  private async invalidateRating(ratedId: number): Promise<void> {
    await Promise.all([
      cacheDel(cacheKeys.playerRating(ratedId)),
      cacheDel(cacheKeys.playerDetail(ratedId)),
      bumpVersion("player:leaderboard"),
    ]);
  }

  getPlayerRatings(playerId: number): Promise<PlayerRatingsResult> {
    // Cache class `player:rating` (aggregate + rating list for the player).
    return getOrSet(cacheKeys.playerRating(playerId), CACHE_TTL.PLAYER_RATING, () =>
      this.ratingRepository.getByPlayer(playerId)
    );
  }

  async getMatchRatings(
    matchId: number,
    payload: JwtPayload
  ): Promise<PlayerRating[] | ErrorResponse> {
    const allowed =
      (payload.playerId !== undefined &&
        (await this.ratingRepository.isMatchParticipant(
          matchId,
          payload.playerId
        ))) ||
      !!payload.roles?.includes("admin");

    if (!allowed) {
      return appErrorCodes.NOT_MATCH_PARTICIPANT;
    }
    return this.ratingRepository.getByMatch(matchId);
  }

  async deleteRating(
    id: number,
    payload: JwtPayload
  ): Promise<{ status: string } | ErrorResponse> {
    const rating = await this.ratingRepository.findById(id);
    if (!rating) {
      return appErrorCodes.RATING_NOT_FOUND;
    }
    if (
      rating.raterId !== payload.playerId &&
      !payload.roles?.includes("admin")
    ) {
      return appErrorCodes.AUTH_FORBIDDEN;
    }
    await this.ratingRepository.deleteRating(id);
    await this.invalidateRating(rating.ratedId);
    return { status: "success" };
  }
}
