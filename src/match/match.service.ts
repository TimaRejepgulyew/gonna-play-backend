import { Prisma } from "@prisma/client";

import { errorCodes as appErrorCodes } from "@/constants/index.js";
import {
  MATCH_FORMAT,
  MATCH_STATUS,
  MATCH_TEAM,
  PARTICIPANT_STATUS,
} from "@/constants/enums.js";
import { PLAYER_LEVEL, PLAYER_POSITION } from "@/player/constant.js";
import {
  CACHE_TTL,
  cacheKeys,
  cacheDel,
  bumpVersion,
  getOrSet,
  getOrSetList,
  isCacheable,
  participantsClass,
  fieldScheduleClass,
} from "@/utils/cache.js";
import { Match } from "./match.model.js";

import type { Logger } from "pino";
import type { ErrorResponse } from "@/types/prisma.js";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/types/pagination.js";
import type { JwtPayload } from "@/plugins/auth.js";
import type { IFieldRepository } from "@/field/field.service.js";

export interface CreateMatchInput {
  fieldId: number;
  startTime: string;
  durationMinutes?: number;
  format: MATCH_FORMAT;
  requiredLevel?: PLAYER_LEVEL;
  price?: number;
  maxPlayers: number;
}

export interface UpdateMatchInput {
  startTime?: string;
  durationMinutes?: number;
  requiredLevel?: PLAYER_LEVEL;
  price?: number;
  maxPlayers?: number;
  status?: MATCH_STATUS;
}

export interface MatchListFilters {
  city?: string;
  dateFrom?: string;
  dateTo?: string;
  format?: MATCH_FORMAT;
  level?: PLAYER_LEVEL;
  status?: MATCH_STATUS;
  fieldId?: number;
  organizerId?: number;
}

export interface CreateMatchData {
  organizerId: number;
  fieldId: number;
  startTime: Date;
  durationMinutes?: number;
  format: MATCH_FORMAT;
  requiredLevel?: PLAYER_LEVEL;
  price?: number;
  maxPlayers: number;
  status: MATCH_STATUS;
}

export interface UpdateMatchData {
  startTime?: Date;
  durationMinutes?: number;
  requiredLevel?: PLAYER_LEVEL;
  price?: number;
  maxPlayers?: number;
  status?: MATCH_STATUS;
}

export interface MatchRecord {
  id: number;
  organizerId: number;
  fieldId: number;
  format: MATCH_FORMAT;
  maxPlayers: number;
  status: MATCH_STATUS;
}

export interface ParticipantRecord {
  id: number;
  matchId: number;
  playerId: number;
  position: PLAYER_POSITION | null;
  team: MATCH_TEAM | null;
  status: PARTICIPANT_STATUS;
}

export interface CreateParticipantData {
  matchId: number;
  playerId: number;
  position?: PLAYER_POSITION;
  team?: MATCH_TEAM;
  status: PARTICIPANT_STATUS;
}

export interface IMatchRepository {
  listMatches(
    pagination?: PaginationQuery,
    filters?: MatchListFilters
  ): Promise<PaginatedResult<Match>>;
  getMatch(id: number): Promise<Match | null>;
  findById(id: number): Promise<MatchRecord | null>;
  createMatch(data: CreateMatchData): Promise<Match>;
  updateMatch(id: number, data: UpdateMatchData): Promise<Match | null>;
  setStatus(id: number, status: MATCH_STATUS): Promise<void>;
}

export interface IMatchParticipantRepository {
  listByMatch(
    matchId: number,
    status?: PARTICIPANT_STATUS
  ): Promise<ParticipantRecord[]>;
  findById(id: number): Promise<ParticipantRecord | null>;
  findByMatchAndPlayer(
    matchId: number,
    playerId: number
  ): Promise<ParticipantRecord | null>;
  create(data: CreateParticipantData): Promise<ParticipantRecord>;
  updateStatus(
    id: number,
    status: PARTICIPANT_STATUS
  ): Promise<ParticipantRecord>;
  countConfirmed(matchId: number): Promise<number>;
  // Atomic confirm: re-counts inside a transaction and refuses when capacity
  // is already reached (returns null), flipping the match to FULL on the last
  // seat. Prevents two concurrent accepts from exceeding maxPlayers.
  confirmWithCapacity(
    matchId: number,
    participantId: number,
    maxPlayers: number
  ): Promise<ParticipantRecord | null>;
}

// Allowed match status transitions for organizer/admin edits.
const MATCH_TRANSITIONS: Record<MATCH_STATUS, MATCH_STATUS[]> = {
  [MATCH_STATUS.OPEN]: [
    MATCH_STATUS.FULL,
    MATCH_STATUS.ONGOING,
    MATCH_STATUS.COMPLETED,
    MATCH_STATUS.CANCELLED,
  ],
  [MATCH_STATUS.FULL]: [
    MATCH_STATUS.OPEN,
    MATCH_STATUS.ONGOING,
    MATCH_STATUS.COMPLETED,
    MATCH_STATUS.CANCELLED,
  ],
  [MATCH_STATUS.ONGOING]: [MATCH_STATUS.COMPLETED, MATCH_STATUS.CANCELLED],
  [MATCH_STATUS.COMPLETED]: [],
  [MATCH_STATUS.CANCELLED]: [],
};

export class MatchService {
  constructor(
    private matchRepository: IMatchRepository,
    private participantRepository: IMatchParticipantRepository,
    private fieldRepository: IFieldRepository,
    private logger: Logger
  ) {}

  private isAdmin(payload: JwtPayload): boolean {
    return !!payload.roles?.includes("admin");
  }

  private isOrganizer(payload: JwtPayload, match: MatchRecord): boolean {
    return payload.playerId !== undefined && payload.playerId === match.organizerId;
  }

  // -------- Match CRUD --------

  listMatches(
    pagination?: PaginationQuery,
    filters?: MatchListFilters
  ): Promise<PaginatedResult<Match>> {
    // Cache class `match:list` (versioned) — cache-design.md §3/§4.
    return getOrSetList(
      "match:list",
      { ...pagination, ...filters },
      CACHE_TTL.MATCH_LIST,
      () => this.matchRepository.listMatches(pagination, filters)
    );
  }

  async getMatch(id: number): Promise<Match | ErrorResponse> {
    // Cache class `match:detail` (single key, DEL invalidation).
    const match = await getOrSet(
      cacheKeys.matchDetail(id),
      CACHE_TTL.MATCH_DETAIL,
      () => this.matchRepository.getMatch(id)
    );
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    return match;
  }

  async createMatch(
    payload: JwtPayload,
    input: CreateMatchInput
  ): Promise<Match | ErrorResponse> {
    if (!payload.playerId) {
      return appErrorCodes.PLAYER_PROFILE_REQUIRED;
    }
    const field = await this.fieldRepository.getField(input.fieldId);
    if (!field) {
      return appErrorCodes.FIELD_NOT_FOUND;
    }
    if (field.format !== input.format) {
      return appErrorCodes.MATCH_FORMAT_MISMATCH;
    }

    const created = await this.matchRepository.createMatch({
      organizerId: payload.playerId,
      fieldId: input.fieldId,
      startTime: new Date(input.startTime),
      durationMinutes: input.durationMinutes,
      format: input.format,
      requiredLevel: input.requiredLevel,
      price: input.price,
      maxPlayers: input.maxPlayers,
      status: MATCH_STATUS.OPEN,
    });
    // New match affects the list and the field's schedule.
    await Promise.all([
      bumpVersion("match:list"),
      bumpVersion(fieldScheduleClass(input.fieldId)),
    ]);
    return created;
  }

  async updateMatch(
    id: number,
    payload: JwtPayload,
    input: UpdateMatchInput
  ): Promise<Match | ErrorResponse> {
    const match = await this.matchRepository.findById(id);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    if (!this.isOrganizer(payload, match) && !this.isAdmin(payload)) {
      return appErrorCodes.FORBIDDEN_NOT_ORGANIZER;
    }
    if (
      match.status === MATCH_STATUS.COMPLETED ||
      match.status === MATCH_STATUS.CANCELLED
    ) {
      return appErrorCodes.MATCH_NOT_EDITABLE;
    }
    if (
      input.status &&
      input.status !== match.status &&
      !MATCH_TRANSITIONS[match.status].includes(input.status)
    ) {
      return appErrorCodes.MATCH_NOT_EDITABLE;
    }

    const data: UpdateMatchData = {
      ...(input.startTime ? { startTime: new Date(input.startTime) } : {}),
      ...(input.durationMinutes !== undefined
        ? { durationMinutes: input.durationMinutes }
        : {}),
      ...(input.requiredLevel ? { requiredLevel: input.requiredLevel } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.maxPlayers !== undefined
        ? { maxPlayers: input.maxPlayers }
        : {}),
      ...(input.status ? { status: input.status } : {}),
    };

    const updated = await this.matchRepository.updateMatch(id, data);
    if (!updated) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    // Edit touches the list, this match's card, and the field schedule
    // (fieldId is immutable on update, so old == new field).
    await Promise.all([
      bumpVersion("match:list"),
      cacheDel(cacheKeys.matchDetail(id)),
      bumpVersion(fieldScheduleClass(match.fieldId)),
    ]);
    return updated;
  }

  // Soft-cancel: preserve participation/rating history.
  async cancelMatch(
    id: number,
    payload: JwtPayload
  ): Promise<{ status: string } | ErrorResponse> {
    const match = await this.matchRepository.findById(id);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    if (!this.isOrganizer(payload, match) && !this.isAdmin(payload)) {
      return appErrorCodes.FORBIDDEN_NOT_ORGANIZER;
    }
    await this.matchRepository.setStatus(id, MATCH_STATUS.CANCELLED);
    // Cancellation frees the slot: refresh list, card and field schedule.
    await Promise.all([
      bumpVersion("match:list"),
      cacheDel(cacheKeys.matchDetail(id)),
      bumpVersion(fieldScheduleClass(match.fieldId)),
    ]);
    return { status: "success" };
  }

  // -------- Participation --------

  async getParticipants(
    matchId: number,
    status?: PARTICIPANT_STATUS
  ): Promise<ParticipantRecord[] | ErrorResponse> {
    const match = await this.matchRepository.findById(matchId);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    // Cache class `match:participants` (per-match version, status variants).
    return getOrSetList(
      participantsClass(matchId),
      { status },
      CACHE_TTL.MATCH_PARTICIPANTS,
      () => this.participantRepository.listByMatch(matchId, status)
    );
  }

  // Invalidation shared by every participation mutation: refresh the match
  // card and the per-match participants list. `affectsList` also bumps the
  // match list version when confirmed-count / match status can change
  // (accept, decline, leave) — cache-design.md §4.
  private async invalidateParticipation(
    matchId: number,
    affectsList: boolean
  ): Promise<void> {
    const ops: Promise<void>[] = [
      cacheDel(cacheKeys.matchDetail(matchId)),
      bumpVersion(participantsClass(matchId)),
    ];
    if (affectsList) ops.push(bumpVersion("match:list"));
    await Promise.all(ops);
  }

  async invite(
    matchId: number,
    payload: JwtPayload,
    input: { playerId: number; position?: PLAYER_POSITION; team?: MATCH_TEAM }
  ): Promise<ParticipantRecord | ErrorResponse> {
    const match = await this.matchRepository.findById(matchId);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    if (!this.isOrganizer(payload, match) && !this.isAdmin(payload)) {
      return appErrorCodes.FORBIDDEN_NOT_ORGANIZER;
    }
    if (match.status !== MATCH_STATUS.OPEN) {
      return appErrorCodes.MATCH_NOT_OPEN;
    }
    const confirmed = await this.participantRepository.countConfirmed(matchId);
    if (confirmed >= match.maxPlayers) {
      return appErrorCodes.MATCH_FULL;
    }
    const existing = await this.participantRepository.findByMatchAndPlayer(
      matchId,
      input.playerId
    );
    if (existing) {
      return appErrorCodes.PARTICIPANT_ALREADY_JOINED;
    }

    const result = await this.createParticipant({
      matchId,
      playerId: input.playerId,
      position: input.position,
      team: input.team,
      status: PARTICIPANT_STATUS.INVITED,
    });
    // Invite does not change confirmed count -> no match:list bump.
    if (isCacheable(result)) await this.invalidateParticipation(matchId, false);
    return result;
  }

  async join(
    matchId: number,
    payload: JwtPayload,
    input: { position?: PLAYER_POSITION; team?: MATCH_TEAM }
  ): Promise<ParticipantRecord | ErrorResponse> {
    if (!payload.playerId) {
      return appErrorCodes.PLAYER_PROFILE_REQUIRED;
    }
    const match = await this.matchRepository.findById(matchId);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    if (match.status !== MATCH_STATUS.OPEN) {
      return appErrorCodes.MATCH_NOT_OPEN;
    }
    const confirmed = await this.participantRepository.countConfirmed(matchId);
    if (confirmed >= match.maxPlayers) {
      return appErrorCodes.MATCH_FULL;
    }
    const existing = await this.participantRepository.findByMatchAndPlayer(
      matchId,
      payload.playerId
    );
    if (existing) {
      return appErrorCodes.PARTICIPANT_ALREADY_JOINED;
    }

    const result = await this.createParticipant({
      matchId,
      playerId: payload.playerId,
      position: input.position,
      team: input.team,
      status: PARTICIPANT_STATUS.REQUESTED,
    });
    // A pending request does not change confirmed count -> no match:list bump.
    if (isCacheable(result)) await this.invalidateParticipation(matchId, false);
    return result;
  }

  // accept/decline share this endpoint; the right to act depends on the
  // participant's current status and the caller's role (see api-design §4.4).
  async transition(
    matchId: number,
    participantId: number,
    action: "accept" | "decline",
    payload: JwtPayload
  ): Promise<ParticipantRecord | ErrorResponse> {
    const result = await this.resolveTransition(
      matchId,
      participantId,
      action,
      payload
    );
    // accept/decline change confirmed count and can flip match status.
    if (isCacheable(result)) await this.invalidateParticipation(matchId, true);
    return result;
  }

  private async resolveTransition(
    matchId: number,
    participantId: number,
    action: "accept" | "decline",
    payload: JwtPayload
  ): Promise<ParticipantRecord | ErrorResponse> {
    const match = await this.matchRepository.findById(matchId);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    const participant = await this.participantRepository.findById(participantId);
    if (!participant || participant.matchId !== matchId) {
      return appErrorCodes.PARTICIPANT_NOT_FOUND;
    }

    const isOrganizer =
      this.isOrganizer(payload, match) || this.isAdmin(payload);
    const isOwnerPlayer =
      payload.playerId !== undefined &&
      payload.playerId === participant.playerId;

    switch (participant.status) {
      case PARTICIPANT_STATUS.INVITED:
        if (action === "accept") {
          if (!isOwnerPlayer) return appErrorCodes.AUTH_FORBIDDEN;
          return this.confirmParticipant(match, participant);
        }
        if (!isOwnerPlayer && !isOrganizer) return appErrorCodes.AUTH_FORBIDDEN;
        return this.setParticipantStatus(
          match,
          participant,
          PARTICIPANT_STATUS.DECLINED
        );

      case PARTICIPANT_STATUS.REQUESTED:
        if (action === "accept") {
          if (!isOrganizer) return appErrorCodes.AUTH_FORBIDDEN;
          return this.confirmParticipant(match, participant);
        }
        if (!isOrganizer && !isOwnerPlayer) return appErrorCodes.AUTH_FORBIDDEN;
        return this.setParticipantStatus(
          match,
          participant,
          PARTICIPANT_STATUS.DECLINED
        );

      case PARTICIPANT_STATUS.CONFIRMED:
        // Organizer removing a confirmed player -> LEFT.
        if (action === "decline") {
          if (!isOrganizer) return appErrorCodes.AUTH_FORBIDDEN;
          return this.setParticipantStatus(
            match,
            participant,
            PARTICIPANT_STATUS.LEFT
          );
        }
        return appErrorCodes.PARTICIPANT_INVALID_TRANSITION;

      default:
        return appErrorCodes.PARTICIPANT_INVALID_TRANSITION;
    }
  }

  async leave(
    matchId: number,
    payload: JwtPayload
  ): Promise<ParticipantRecord | ErrorResponse> {
    if (!payload.playerId) {
      return appErrorCodes.PLAYER_PROFILE_REQUIRED;
    }
    const match = await this.matchRepository.findById(matchId);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    const participant = await this.participantRepository.findByMatchAndPlayer(
      matchId,
      payload.playerId
    );
    if (!participant) {
      return appErrorCodes.PARTICIPANT_NOT_FOUND;
    }
    if (
      participant.status === PARTICIPANT_STATUS.DECLINED ||
      participant.status === PARTICIPANT_STATUS.LEFT
    ) {
      return appErrorCodes.PARTICIPANT_INVALID_TRANSITION;
    }
    const result = await this.setParticipantStatus(
      match,
      participant,
      PARTICIPANT_STATUS.LEFT
    );
    // Leaving frees a confirmed slot -> refresh list too.
    await this.invalidateParticipation(matchId, true);
    return result;
  }

  private async createParticipant(
    data: CreateParticipantData
  ): Promise<ParticipantRecord | ErrorResponse> {
    try {
      return await this.participantRepository.create(data);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return appErrorCodes.PARTICIPANT_ALREADY_JOINED;
      }
      this.logger.error(error);
      throw error;
    }
  }

  // Confirm a participant. Capacity check, status update and the OPEN->FULL
  // flip run atomically in the repository transaction so parallel accepts
  // cannot exceed maxPlayers; a lost race returns MATCH_FULL.
  private async confirmParticipant(
    match: MatchRecord,
    participant: ParticipantRecord
  ): Promise<ParticipantRecord | ErrorResponse> {
    const updated = await this.participantRepository.confirmWithCapacity(
      match.id,
      participant.id,
      match.maxPlayers
    );
    if (!updated) {
      return appErrorCodes.MATCH_FULL;
    }
    return updated;
  }

  // Move to DECLINED/LEFT, freeing a slot and reopening a FULL match.
  private async setParticipantStatus(
    match: MatchRecord,
    participant: ParticipantRecord,
    status: PARTICIPANT_STATUS
  ): Promise<ParticipantRecord> {
    const wasConfirmed = participant.status === PARTICIPANT_STATUS.CONFIRMED;
    const updated = await this.participantRepository.updateStatus(
      participant.id,
      status
    );
    if (wasConfirmed && match.status === MATCH_STATUS.FULL) {
      await this.matchRepository.setStatus(match.id, MATCH_STATUS.OPEN);
    }
    return updated;
  }
}
