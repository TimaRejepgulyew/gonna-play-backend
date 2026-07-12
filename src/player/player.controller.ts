import { Logger } from "pino";

import PlayerRepository from "./player.repository.js";
import { CreatePlayer, PlayerService, UpdatePlayer } from "./player.service.js";

import prisma from "@/config/prisma.js";
import UserRepository from "../user/user.repository.js";
import UserService from "../user/user.service.js";

import type { FastifyInstance } from "fastify";
export class PlayerController {
  private playerService: PlayerService;

  constructor(
    _server: FastifyInstance<any, any, any, Logger, any, any, any, any>
  ) {
    const playerRepository = new PlayerRepository(prisma);
    const userRepository = new UserRepository(prisma);
    this.playerService = new PlayerService(
      playerRepository,
      userRepository,
      _server.log
    );
  }

  getPlayerList() {
    return this.playerService.getPlayerList();
  }

  createPlayer(req: { body: CreatePlayer }) {
    return this.playerService.createPlayer(req.body);
  }

  getPlayer(req: { params: { id: string } }) {
    return this.playerService.getPlayer(Number(req.params.id));
  }

  updatePlayer(req: { body: UpdatePlayer; params: { id: string } }) {
    return this.playerService.updatePlayer(req.body);
  }

  async deletePlayer(req: { params: { id: string } }) {
    await this.playerService.deletePlayer(Number(req.params.id));

    return {
      status: "success",
      message: "Player deleted successfully",
    };
  }
}
