import { errorCodes } from "fastify";
import { errorCodes as userErrorCodes } from "@/constants/index.js";
import { User } from "@/user/user.model.js";
import UserRepository from "@/user/user.repository.js";
import { PLAYER_STATUS } from "@/constants/enums.js";
import {
  CACHE_TTL,
  cacheKeys,
  cacheDel,
  bumpVersion,
  getOrSet,
  getOrSetList,
} from "@/utils/cache.js";
import { PLAYER_LEVEL, PLAYER_POSITION } from "./constant.js";
import Player from "./player.model.js";
import PlayerRepository from "./player.repository.js";

import type { ErrorResponse } from "@/types/prisma.js";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/types/pagination.js";
import type { CreateUser, UpdateUser } from "@/user/types.js";
import type { FastifyBaseLogger } from "fastify";

export interface CreatePlayer
  extends Omit<Player, "id" | "createdAt" | "updatedAt" | "user" | "rating"> {
  user?: CreateUser;
}

export interface UpdatePlayer
  extends Partial<
    Omit<Player, "id" | "createdAt" | "updatedAt" | "user" | "rating">
  > {
  id: number;
  user?: Omit<UpdateUser, "id">;
}

export interface PlayerListFilters {
  level?: PLAYER_LEVEL;
  position?: PLAYER_POSITION;
  status?: PLAYER_STATUS;
  search?: string;
}

export interface IPlayerRepository {
  getPlayerList(
    pagination?: PaginationQuery,
    filters?: PlayerListFilters
  ): Promise<PaginatedResult<Player>>;
  createPlayer(player: CreatePlayer): Promise<Player | null>;
  getPlayer(id: number): Promise<Player | null>;
  updatePlayer(player: UpdatePlayer): Promise<Player | null>;
  deletePlayer(id: number): Promise<number | null>;
}

export class PlayerService {
  constructor(
    private playerRepository: PlayerRepository,
    private userRepository: UserRepository,
    private logger: FastifyBaseLogger
  ) {}

  getPlayerList(
    pagination?: PaginationQuery,
    filters?: PlayerListFilters
  ): Promise<PaginatedResult<Player>> {
    // Cache class `player:list` (versioned).
    return getOrSetList(
      "player:list",
      { ...pagination, ...filters },
      CACHE_TTL.PLAYER_LIST,
      () => this.playerRepository.getPlayerList(pagination, filters)
    );
  }

  async createPlayer(player: CreatePlayer): Promise<Player | ErrorResponse> {
    let user: User | null = null;
    try {
      if (!player.userId && player.user) {
        const hasDuplicateEmail = await this.userRepository.getUserByEmail(
          player.user.email
        );

        if (hasDuplicateEmail) {
          this.logger.error(
            `User with email ${player.user.email} already exists`
          );
          return userErrorCodes.USER_EMAIL_DUPLICATED;
        }

        user = await this.userRepository.createUser(player.user);
      } else {
        if (player.userId) {
          user = await this.userRepository.getUser(player.userId);
        } else {
          this.logger.error(`User with id ${player.userId} not found`);
          throw userErrorCodes.USER_NOT_CREATED;
        }
      }
    } catch (error) {
      this.logger.error(error);
      throw errorCodes.FST_ERR_CTP_INVALID_HANDLER();
    }

    if (!user) {
      const errorMessage = player.userId
        ? userErrorCodes.USER_NOT_FOUND
        : userErrorCodes.USER_NOT_CREATED;

      this.logger.error(errorMessage);
      return errorMessage;
    }

    try {
      const createdPlayer = await this.playerRepository.createPlayer(
        Object.assign(player, { userId: user.id, user })
      );

      await bumpVersion("player:list");
      return new Player(createdPlayer as Player);
    } catch (error) {
      this.logger.error(error);
      throw errorCodes.FST_ERR_CTP_INVALID_HANDLER();
    }
  }

  async getPlayer(id: number): Promise<Player> {
    // Cache class `player:detail` (single key, includes rating aggregate).
    const player = await getOrSet(
      cacheKeys.playerDetail(id),
      CACHE_TTL.PLAYER_DETAIL,
      () => this.playerRepository.getPlayer(id)
    );

    if (!player) {
      throw errorCodes.FST_ERR_NOT_FOUND();
    }

    return new Player(player);
  }

  async updatePlayer(player: UpdatePlayer): Promise<Player | null> {
    if (player.user && player.userId) {
      const user = await this.userRepository.getUser(player.userId);

      if (!user) {
        throw errorCodes.FST_ERR_NOT_FOUND();
      }

      await this.userRepository.updateUser({ ...player.user, id: player.userId });
    }

    const updatedPlayer = await this.playerRepository.updatePlayer(player);

    if (!updatedPlayer) {
      throw errorCodes.FST_ERR_NOT_FOUND();
    }

    await Promise.all([
      bumpVersion("player:list"),
      cacheDel(cacheKeys.playerDetail(player.id)),
    ]);
    return new Player(updatedPlayer);
  }

  async deletePlayer(id: number): Promise<number | null> {
    const deleted = await this.playerRepository.deletePlayer(id);
    await Promise.all([
      bumpVersion("player:list"),
      cacheDel(cacheKeys.playerDetail(id)),
    ]);
    return deleted;
  }
}
