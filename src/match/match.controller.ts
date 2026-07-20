import prisma from "@/config/prisma.js";
import { getAuthPayload } from "@/plugins/auth.js";
import FieldRepository from "@/field/field.repository.js";
import MatchRepository from "./match.repository.js";
import MatchParticipantRepository from "./match-participant.repository.js";
import {
  CreateMatchInput,
  MatchListFilters,
  MatchService,
  UpdateMatchInput,
} from "./match.service.js";

import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import type { PaginationQuery } from "@/types/pagination.js";
import type { PARTICIPANT_STATUS, MATCH_TEAM } from "@/constants/enums.js";
import type { PLAYER_POSITION } from "@/player/constant.js";

export class MatchController {
  private matchService: MatchService;

  constructor(
    server: FastifyInstance<any, any, any, Logger, any, any, any, any>
  ) {
    const matchRepository = new MatchRepository(prisma);
    const participantRepository = new MatchParticipantRepository(prisma);
    const fieldRepository = new FieldRepository(prisma);
    this.matchService = new MatchService(
      matchRepository,
      participantRepository,
      fieldRepository,
      server.log
    );
  }

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
      { city, dateFrom, dateTo, format, level, status, fieldId, organizerId }
    );
  }

  getMatch(req: { params: { id: string } }) {
    return this.matchService.getMatch(Number(req.params.id));
  }

  createMatch(req: { body: CreateMatchInput; user?: unknown }) {
    return this.matchService.createMatch(getAuthPayload(req), req.body);
  }

  updateMatch(req: {
    params: { id: string };
    body: UpdateMatchInput;
    user?: unknown;
  }) {
    return this.matchService.updateMatch(
      Number(req.params.id),
      getAuthPayload(req),
      req.body
    );
  }

  cancelMatch(req: { params: { id: string }; user?: unknown }) {
    return this.matchService.cancelMatch(
      Number(req.params.id),
      getAuthPayload(req)
    );
  }

  getParticipants(req: {
    params: { id: string };
    query: { status?: PARTICIPANT_STATUS };
  }) {
    return this.matchService.getParticipants(
      Number(req.params.id),
      req.query.status
    );
  }

  invite(req: {
    params: { id: string };
    body: { playerId: number; position?: PLAYER_POSITION; team?: MATCH_TEAM };
    user?: unknown;
  }) {
    return this.matchService.invite(
      Number(req.params.id),
      getAuthPayload(req),
      req.body
    );
  }

  join(req: {
    params: { id: string };
    body?: { position?: PLAYER_POSITION; team?: MATCH_TEAM };
    user?: unknown;
  }) {
    return this.matchService.join(
      Number(req.params.id),
      getAuthPayload(req),
      req.body ?? {}
    );
  }

  accept(req: { params: { id: string; pid: string }; user?: unknown }) {
    return this.matchService.transition(
      Number(req.params.id),
      Number(req.params.pid),
      "accept",
      getAuthPayload(req)
    );
  }

  decline(req: { params: { id: string; pid: string }; user?: unknown }) {
    return this.matchService.transition(
      Number(req.params.id),
      Number(req.params.pid),
      "decline",
      getAuthPayload(req)
    );
  }

  leave(req: { params: { id: string }; user?: unknown }) {
    return this.matchService.leave(
      Number(req.params.id),
      getAuthPayload(req)
    );
  }
}
