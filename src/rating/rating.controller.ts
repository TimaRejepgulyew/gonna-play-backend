import type { FastifyInstance } from "fastify";
import { getPrisma } from "@/config/prisma.js";
import { getAuthPayload } from "@/plugins/auth.js";
import RatingRepository from "./rating.repository.js";
import { type CreateRatingInput, RatingService } from "./rating.service.js";

export class RatingController {
  private ratingService: RatingService;

  constructor(server: FastifyInstance) {
    const prisma = getPrisma();
    const ratingRepository = new RatingRepository(prisma);
    this.ratingService = new RatingService(ratingRepository, server.log);
  }

  createRating(req: { body: CreateRatingInput; user?: unknown }) {
    return this.ratingService.createRating(getAuthPayload(req), req.body);
  }

  getPlayerRatings(req: { params: { playerId: string } }) {
    return this.ratingService.getPlayerRatings(Number(req.params.playerId));
  }

  getMatchRatings(req: { params: { matchId: string }; user?: unknown }) {
    return this.ratingService.getMatchRatings(Number(req.params.matchId), getAuthPayload(req));
  }

  deleteRating(req: { params: { id: string }; user?: unknown }) {
    return this.ratingService.deleteRating(Number(req.params.id), getAuthPayload(req));
  }
}
