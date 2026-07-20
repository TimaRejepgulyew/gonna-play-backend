import { Logger } from "pino";

import prisma from "@/config/prisma.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import { getAuthPayload } from "@/plugins/auth.js";
import UserRepository from "../user/user.repository.js";
import PlayerRepository from "./player.repository.js";
import {
  CreatePlayer,
  PlayerListFilters,
  PlayerService,
  UpdatePlayer,
} from "./player.service.js";

import type { FastifyInstance } from "fastify";
import type { PaginationQuery } from "@/types/pagination.js";

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

  getPlayerList(req: { query: PaginationQuery & PlayerListFilters }) {
    const { page, limit, sort, order, level, position, status, search } =
      req.query;
    return this.playerService.getPlayerList(
      { page, limit, sort, order },
      { level, position, status, search }
    );
  }

  createPlayer(req: { body: CreatePlayer; user?: unknown }) {
    const payload = getAuthPayload(req);
    const body = req.body;
    const isAdmin = !!payload.roles?.includes("admin");
    // Prevent binding a player profile to someone else's account: a supplied
    // userId must equal the caller (admins may act on any user).
    if (body.userId !== undefined && body.userId !== payload.sub && !isAdmin) {
      return appErrorCodes.AUTH_FORBIDDEN;
    }
    // Link the new profile to the caller when no explicit owner is provided.
    if (!body.userId && !body.user) {
      body.userId = payload.sub;
    }
    return this.playerService.createPlayer(body);
  }

  getPlayer(req: { params: { id: string } }) {
    return this.playerService.getPlayer(Number(req.params.id));
  }

  async updatePlayer(req: {
    body: UpdatePlayer;
    params: { id: string };
    user?: unknown;
  }) {
    const id = Number(req.params.id);
    const payload = getAuthPayload(req);
    const existing = await this.playerService.getPlayer(id);
    if (
      existing.userId !== payload.sub &&
      !payload.roles?.includes("admin")
    ) {
      return appErrorCodes.AUTH_FORBIDDEN;
    }
    return this.playerService.updatePlayer({ ...req.body, id });
  }

  async deletePlayer(req: { params: { id: string } }) {
    await this.playerService.deletePlayer(Number(req.params.id));

    return {
      status: "success",
      message: "Player deleted successfully",
    };
  }
}
