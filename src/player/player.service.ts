import { errorCodes } from "fastify";
import { User } from "@/user/user.model.js";
import Player from "./player.model.js";
import PlayerRepository from "./player.repository.js";
import UserService, {
  type CreateUser,
  type UpdateUser,
} from "@/user/user.service.js";

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
  private playerRepository: PlayerRepository;
  private userService: UserService;
  constructor() {
    this.playerRepository = new PlayerRepository();
    this.userService = new UserService();
  }

  getPlayerList(): Promise<Player[]> {
    return this.playerRepository.getPlayerList();
  }

  async createPlayer(player: CreatePlayer): Promise<Player | null> {
    let user: User | null = null;

    if (!player.userId && player.user) {
      user = await this.userService.createUser(player.user);
    } else {
      if (player.userId) {
        user = await this.userService.getUser(player.userId);
      } else {
        throw errorCodes.FST_ERR_REQ_INVALID_VALIDATION_INVOCATION;
      }
    }

    if (!user) {
      throw errorCodes.FST_ERR_NOT_FOUND;
    }

    const createdPlayer = await this.playerRepository.createPlayer(player);

    return new Player(Object.assign(createdPlayer, { user, userId: user.id }));
  }

  async getPlayer(id: number): Promise<Player | null> {
    const player = await this.playerRepository.getPlayer(id);

    if (!player) {
      throw errorCodes.FST_ERR_NOT_FOUND();
    }

    if (!player.userId) {
      throw errorCodes.FST_ERR_NOT_FOUND();
    }

    const user = await this.userService.getUser(player.userId);

    return new Player(Object.assign(player, { user }));
  }

  async updatePlayer(player: UpdatePlayer): Promise<Player | null> {
    let user: User | null = null;
    if (player.user && player.userId) {
      user = await this.userService.getUser(player.userId);

      await this.userService.updateUser(player.user);

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
