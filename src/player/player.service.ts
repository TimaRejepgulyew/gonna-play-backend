import { errorCodes } from "fastify";
import { errorCodes as userErrorCodes } from "@/constants/index.js";
import { User } from "@/user/user.model.js";
import UserRepository from "@/user/user.repository.js";
import Player from "./player.model.js";
import PlayerRepository from "./player.repository.js";

import type { ErrorResponse } from "@/types/prisma.js";
import type { CreateUser, UpdateUser } from "@/user/types.js";
import { Logger } from "pino";

export interface CreatePlayer
  extends Omit<Player, "id" | "createdAt" | "updatedAt" | "user"> {
  user: CreateUser | UpdateUser;
}

export interface UpdatePlayer
  extends Omit<Player, "createdAt" | "updatedAt" | "user"> {
  user: UpdateUser;
}

export interface IPlayerRepository {
  getPlayerList(): Promise<Player[]>;
  createPlayer(player: CreatePlayer): Promise<Player | null>;
  getPlayer(id: number): Promise<Player | null>;
  updatePlayer(player: UpdatePlayer): Promise<Player | null>;
  deletePlayer(id: number): Promise<number | null>;
}

export class PlayerService {
  constructor(
    private playerRepository: PlayerRepository,
    private userRepository: UserRepository,
    private logger: Logger
  ) {}

  getPlayerList() {
    return this.playerRepository.getPlayerList();
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
      throw errorCodes.FST_ERR_CTP_INVALID_HANDLER;
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

      return new Player(createdPlayer);
    } catch (error) {
      this.logger.error(error);
      throw errorCodes.FST_ERR_CTP_INVALID_HANDLER;
    }
  }

  async getPlayer(id: number): Promise<Player | null> {
    const player = await this.playerRepository.getPlayer(id);

    if (!player) {
      throw errorCodes.FST_ERR_NOT_FOUND();
    }

    if (!player.userId) {
      throw errorCodes.FST_ERR_NOT_FOUND();
    }

    const user = await this.userRepository.getUser(player.userId);

    return new Player(Object.assign(player, { user }));
  }

  async updatePlayer(player: UpdatePlayer): Promise<Player | null> {
    let user: User | null = null;
    if (player.user && player.userId) {
      user = await this.userRepository.getUser(player.userId);

      await this.userRepository.updateUser(player.user);

      if (!user) {
        throw errorCodes.FST_ERR_NOT_FOUND();
      }
    }

    const updatedPlayer = await this.playerRepository.updatePlayer(player);

    if (!updatedPlayer) {
      throw errorCodes.FST_ERR_NOT_FOUND();
    }

    return new Player(Object.assign(updatedPlayer, { user }));
  }

  async deletePlayer(id: number): Promise<number | null> {
    return this.playerRepository.deletePlayer(id);
  }
}
