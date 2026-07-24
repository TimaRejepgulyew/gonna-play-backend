import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { getPrisma } from "@/config/prisma.js";
import type { PARTICIPANT_STATUS } from "@/constants/enums.js";
import FieldRepository from "@/field/field.repository.js";
import type { PLAYER_POSITION } from "@/player/constant.js";
import { getAuthPayload } from "@/plugins/auth.js";
import type { PaginationQuery } from "@/types/pagination.js";
import MatchRepository from "./match.repository.js";
import {
  type CreateMatchInput,
  type MatchListFilters,
  MatchService,
  type UpdateMatchInput,
} from "./match.service.js";
import MatchParticipantRepository from "./match-participant.repository.js";

export class MatchController {
  private matchService: MatchService;

  constructor(server: FastifyInstance) {
    const prisma = getPrisma();
    const matchRepository = new MatchRepository(prisma);
    const participantRepository = new MatchParticipantRepository(prisma);
    const fieldRepository = new FieldRepository(prisma);
    this.matchService = new MatchService(
      matchRepository,
      participantRepository,
      fieldRepository,
      server.log as unknown as Logger,
    );
  }

  // -------- Match resource --------

  listMatches(req: { query: PaginationQuery & MatchListFilters }) {
    const {
      page,
      limit,
      sort,
      order,
      city,
      dateFrom,
      dateTo,
      format,
      level,
      status,
      fieldId,
      organizerId,
    } = req.query;
    return this.matchService.listMatches(
      { page, limit, sort, order },
      { city, dateFrom, dateTo, format, level, status, fieldId, organizerId },
    );
  }

  getMatch(req: { params: { id: string } }) {
    return this.matchService.getMatch(Number(req.params.id));
  }

  createMatch(req: { body: CreateMatchInput; user?: unknown }) {
    return this.matchService.createMatch(getAuthPayload(req), req.body);
  }

  updateMatch(req: { params: { id: string }; body: UpdateMatchInput; user?: unknown }) {
    return this.matchService.updateMatch(Number(req.params.id), getAuthPayload(req), req.body);
  }

  // -------- Match status transitions --------

  publish(req: { params: { id: string }; user?: unknown }) {
    return this.matchService.publish(Number(req.params.id), getAuthPayload(req));
  }

  confirm(req: { params: { id: string }; user?: unknown }) {
    return this.matchService.confirm(Number(req.params.id), getAuthPayload(req));
  }

  cancel(req: { params: { id: string }; user?: unknown }) {
    return this.matchService.cancel(Number(req.params.id), getAuthPayload(req));
  }

  // -------- Participation --------

  getParticipants(req: { params: { id: string }; query: { status?: PARTICIPANT_STATUS } }) {
    return this.matchService.getParticipants(Number(req.params.id), req.query.status);
  }

  join(req: { params: { id: string }; body?: { position?: PLAYER_POSITION }; user?: unknown }) {
    return this.matchService.join(Number(req.params.id), getAuthPayload(req), req.body ?? {});
  }

  leave(req: { params: { id: string }; user?: unknown }) {
    return this.matchService.leave(Number(req.params.id), getAuthPayload(req));
  }

  checkIn(req: { params: { id: string }; user?: unknown }) {
    return this.matchService.checkIn(Number(req.params.id), getAuthPayload(req));
  }
}
