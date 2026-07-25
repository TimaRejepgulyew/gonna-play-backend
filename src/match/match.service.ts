import type { Logger } from "pino";
import {
  type MATCH_FORMAT,
  MATCH_STATUS,
  type MATCH_VISIBILITY,
  PARTICIPANT_STATUS,
  type TEAM_SIDE,
} from "@/constants/enums.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import type { IFieldRepository } from "@/field/field.service.js";
import { type PLAYER_LEVEL, PLAYER_LEVEL_ORDER, type PLAYER_POSITION } from "@/player/constant.js";
import type { JwtPayload } from "@/plugins/auth.js";
import type { PaginatedResult, PaginationQuery } from "@/types/pagination.js";
import type { ErrorResponse } from "@/types/prisma.js";
import { Prisma } from "@/types/prisma.js";
import {
  bumpVersion,
  CACHE_TTL,
  cacheDel,
  cacheKeys,
  fieldScheduleClass,
  getOrSet,
  getOrSetList,
  participantsClass,
} from "@/utils/cache.js";
import type { Match } from "./match.model.js";

export interface CreateMatchInput {
  fieldId: number;
  title: string;
  startsAt: string;
  durationMin?: number;
  format: MATCH_FORMAT;
  minPlayers: number;
  maxPlayers: number;
  price?: number;
  currency?: string;
  visibility?: MATCH_VISIBILITY;
  skillMin?: PLAYER_LEVEL;
  skillMax?: PLAYER_LEVEL;
  description?: string;
}

export interface UpdateMatchInput {
  title?: string;
  startsAt?: string;
  durationMin?: number;
  minPlayers?: number;
  maxPlayers?: number;
  price?: number;
  currency?: string;
  visibility?: MATCH_VISIBILITY;
  skillMin?: PLAYER_LEVEL;
  skillMax?: PLAYER_LEVEL;
  description?: string;
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
  title: string;
  startsAt: Date;
  durationMin?: number;
  format: MATCH_FORMAT;
  minPlayers: number;
  maxPlayers: number;
  price?: number;
  currency?: string;
  visibility?: MATCH_VISIBILITY;
  skillMin?: PLAYER_LEVEL;
  skillMax?: PLAYER_LEVEL;
  description?: string;
  status: MATCH_STATUS;
}

export interface UpdateMatchData {
  title?: string;
  startsAt?: Date;
  durationMin?: number;
  minPlayers?: number;
  maxPlayers?: number;
  price?: number;
  currency?: string;
  visibility?: MATCH_VISIBILITY;
  skillMin?: PLAYER_LEVEL;
  skillMax?: PLAYER_LEVEL;
  description?: string;
  status?: MATCH_STATUS;
}

export interface MatchRecord {
  id: number;
  organizerId: number;
  fieldId: number;
  format: MATCH_FORMAT;
  minPlayers: number;
  maxPlayers: number;
  status: MATCH_STATUS;
}

export interface ParticipantRecord {
  id: number;
  matchId: number;
  playerId: number;
  position: PLAYER_POSITION | null;
  team: TEAM_SIDE | null;
  status: PARTICIPANT_STATUS;
}

export interface IMatchRepository {
  listMatches(
    pagination?: PaginationQuery,
    filters?: MatchListFilters,
  ): Promise<PaginatedResult<Match>>;
  getMatch(id: number): Promise<Match | null>;
  findById(id: number): Promise<MatchRecord | null>;
  createMatch(data: CreateMatchData): Promise<Match>;
  updateMatch(id: number, data: UpdateMatchData): Promise<Match | null>;
  setStatus(id: number, status: MATCH_STATUS): Promise<void>;
}

export interface IMatchParticipantRepository {
  listByMatch(matchId: number, status?: PARTICIPANT_STATUS): Promise<ParticipantRecord[]>;
  findByMatchAndPlayer(matchId: number, playerId: number): Promise<ParticipantRecord | null>;
  updateStatus(id: number, status: PARTICIPANT_STATUS): Promise<ParticipantRecord>;
  // Seated players occupy a slot: REGISTERED | CONFIRMED | CHECKED_IN.
  countSeated(matchId: number): Promise<number>;
  // Transactional join. Returns null when an active participation already
  // exists (=> PARTICIPANT_ALREADY_JOINED); otherwise seats the player as
  // REGISTERED or WAITLISTED and flips the match to FULL on the last seat.
  joinWithCapacity(
    matchId: number,
    playerId: number,
    maxPlayers: number,
    data: { position?: PLAYER_POSITION },
  ): Promise<{ participant: ParticipantRecord; waitlisted: boolean } | null>;
  // Transactional leave: CANCELLED + head-of-queue promotion + FULL<->OPEN flip.
  leaveWithPromotion(
    matchId: number,
    participantId: number,
    wasSeated: boolean,
    maxPlayers: number,
  ): Promise<{ left: ParticipantRecord; promoted: ParticipantRecord | null }>;
  // Bulk REGISTERED -> CONFIRMED; returns affected count.
  confirmAllRegistered(matchId: number): Promise<number>;
  // Promote waitlisted players up to a raised maxPlayers and flip FULL -> OPEN
  // when seats remain; returns the number promoted.
  promoteWaitlist(matchId: number, maxPlayers: number): Promise<number>;
}

// A player seated in the match occupies one of maxPlayers slots. WAITLISTED,
// CANCELLED and NO_SHOW do not. Exported for the repository and rating module.
export const SEATED_STATUSES: PARTICIPANT_STATUS[] = [
  PARTICIPANT_STATUS.REGISTERED,
  PARTICIPANT_STATUS.CONFIRMED,
  PARTICIPANT_STATUS.CHECKED_IN,
];

// Allowed match status transitions (docs/wiki/data-model.md lifecycle).
// OPEN<->FULL edges exist for join/leave transactions only; the transition
// guard rejects them as manual targets.
const MATCH_TRANSITIONS: Record<MATCH_STATUS, MATCH_STATUS[]> = {
  [MATCH_STATUS.DRAFT]: [MATCH_STATUS.OPEN, MATCH_STATUS.CANCELLED],
  [MATCH_STATUS.OPEN]: [MATCH_STATUS.FULL, MATCH_STATUS.CONFIRMED, MATCH_STATUS.CANCELLED],
  [MATCH_STATUS.FULL]: [MATCH_STATUS.OPEN, MATCH_STATUS.CONFIRMED, MATCH_STATUS.CANCELLED],
  [MATCH_STATUS.CONFIRMED]: [MATCH_STATUS.IN_PROGRESS, MATCH_STATUS.CANCELLED],
  [MATCH_STATUS.IN_PROGRESS]: [MATCH_STATUS.FINISHED, MATCH_STATUS.CANCELLED],
  [MATCH_STATUS.FINISHED]: [],
  [MATCH_STATUS.CANCELLED]: [],
};

export class MatchService {
  constructor(
    private matchRepository: IMatchRepository,
    private participantRepository: IMatchParticipantRepository,
    private fieldRepository: IFieldRepository,
    private logger: Logger,
  ) {}

  private isAdmin(payload: JwtPayload): boolean {
    return !!payload.roles?.includes("admin");
  }

  private isOrganizer(payload: JwtPayload, match: MatchRecord): boolean {
    return payload.playerId !== undefined && payload.playerId === match.organizerId;
  }

  // skillMin must not rank above skillMax; either being absent is valid.
  private isSkillRangeValid(min?: PLAYER_LEVEL | null, max?: PLAYER_LEVEL | null): boolean {
    if (!min || !max) return true;
    return PLAYER_LEVEL_ORDER.indexOf(min) <= PLAYER_LEVEL_ORDER.indexOf(max);
  }

  // -------- Match CRUD --------

  listMatches(
    pagination?: PaginationQuery,
    filters?: MatchListFilters,
  ): Promise<PaginatedResult<Match>> {
    // Cache class `match:list` (versioned) — cache-design.md §3/§4.
    return getOrSetList("match:list", { ...pagination, ...filters }, CACHE_TTL.MATCH_LIST, () =>
      this.matchRepository.listMatches(pagination, filters),
    );
  }

  async getMatch(id: number): Promise<Match | ErrorResponse> {
    // Cache class `match:detail` (single key, DEL invalidation).
    const match = await getOrSet(cacheKeys.matchDetail(id), CACHE_TTL.MATCH_DETAIL, () =>
      this.matchRepository.getMatch(id),
    );
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    return match;
  }

  async createMatch(payload: JwtPayload, input: CreateMatchInput): Promise<Match | ErrorResponse> {
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
    if (input.minPlayers > input.maxPlayers) {
      return appErrorCodes.MATCH_PLAYERS_RANGE_INVALID;
    }
    if (!this.isSkillRangeValid(input.skillMin, input.skillMax)) {
      return appErrorCodes.MATCH_SKILL_RANGE_INVALID;
    }

    const created = await this.matchRepository.createMatch({
      organizerId: payload.playerId,
      fieldId: input.fieldId,
      title: input.title,
      startsAt: new Date(input.startsAt),
      durationMin: input.durationMin,
      format: input.format,
      minPlayers: input.minPlayers,
      maxPlayers: input.maxPlayers,
      price: input.price,
      currency: input.currency,
      visibility: input.visibility,
      skillMin: input.skillMin,
      skillMax: input.skillMax,
      description: input.description,
      status: MATCH_STATUS.DRAFT,
    });
    // New match affects the list and the field's schedule.
    await Promise.all([bumpVersion("match:list"), bumpVersion(fieldScheduleClass(input.fieldId))]);
    return created;
  }

  async updateMatch(
    id: number,
    payload: JwtPayload,
    input: UpdateMatchInput,
  ): Promise<Match | ErrorResponse> {
    const match = await this.matchRepository.findById(id);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    if (!this.isOrganizer(payload, match) && !this.isAdmin(payload)) {
      return appErrorCodes.FORBIDDEN_NOT_ORGANIZER;
    }
    if (match.status === MATCH_STATUS.FINISHED || match.status === MATCH_STATUS.CANCELLED) {
      return appErrorCodes.MATCH_NOT_EDITABLE;
    }

    const effectiveMin = input.minPlayers ?? match.minPlayers;
    const effectiveMax = input.maxPlayers ?? match.maxPlayers;
    if (effectiveMin > effectiveMax) {
      return appErrorCodes.MATCH_PLAYERS_RANGE_INVALID;
    }
    if (!this.isSkillRangeValid(input.skillMin, input.skillMax)) {
      return appErrorCodes.MATCH_SKILL_RANGE_INVALID;
    }
    // A maxPlayers change needs the current seated count twice: to reject
    // shrinking below occupied seats, and to detect when the new limit leaves
    // no free slot (the OPEN -> FULL flip below).
    let seated: number | null = null;
    if (input.maxPlayers !== undefined) {
      seated = await this.participantRepository.countSeated(id);
      if (input.maxPlayers < seated) {
        return appErrorCodes.MATCH_PLAYERS_RANGE_INVALID;
      }
    }

    const data: UpdateMatchData = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
      ...(input.durationMin !== undefined ? { durationMin: input.durationMin } : {}),
      ...(input.minPlayers !== undefined ? { minPlayers: input.minPlayers } : {}),
      ...(input.maxPlayers !== undefined ? { maxPlayers: input.maxPlayers } : {}),
      ...(input.price !== undefined ? { price: input.price } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...(input.skillMin !== undefined ? { skillMin: input.skillMin } : {}),
      ...(input.skillMax !== undefined ? { skillMax: input.skillMax } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    };

    let response: Match | null = null;
    if (Object.keys(data).length > 0) {
      response = await this.matchRepository.updateMatch(id, data);
      if (!response) {
        return appErrorCodes.MATCH_NOT_FOUND;
      }
      // Raising maxPlayers on a FULL match promotes the queue and reopens it.
      const promoted =
        input.maxPlayers !== undefined &&
        input.maxPlayers > match.maxPlayers &&
        match.status === MATCH_STATUS.FULL;
      if (promoted) {
        await this.participantRepository.promoteWaitlist(id, input.maxPlayers!);
      }
      // Lowering (or setting) maxPlayers to exactly the seated count leaves no
      // free slot, so an OPEN match must flip to FULL — the mirror of the
      // FULL->OPEN reopen above. This is a system flip, written directly rather
      // than routed through the manual transition guard.
      const filledUp =
        input.maxPlayers !== undefined &&
        match.status === MATCH_STATUS.OPEN &&
        seated !== null &&
        input.maxPlayers === seated;
      if (filledUp) {
        await this.matchRepository.setStatus(id, MATCH_STATUS.FULL);
      }
      // Edit touches the list, this match's card, and the field schedule
      // (fieldId is immutable on update, so old == new field). Promotion also
      // reseats WAITLISTED->REGISTERED, so bump the participants list too.
      const ops: Promise<void>[] = [
        bumpVersion("match:list"),
        cacheDel(cacheKeys.matchDetail(id)),
        bumpVersion(fieldScheduleClass(match.fieldId)),
      ];
      if (promoted) ops.push(bumpVersion(participantsClass(id)));
      await Promise.all(ops);
      // A promotion (FULL->OPEN) or a fill-up (OPEN->FULL) also changed status
      // in the DB; re-read so the response reflects the post-flip snapshot.
      if (promoted || filledUp) {
        response = await this.matchRepository.getMatch(id);
        if (!response) {
          return appErrorCodes.MATCH_NOT_FOUND;
        }
      }
    }

    // A status field routes through the shared transition guard so there is no
    // path around its side effects (§9.6). Re-read the record first: fields were
    // just written (e.g. a raised minPlayers) and status may have system-flipped,
    // so the guard must gate on the current state, not the pre-update snapshot.
    if (input.status && input.status !== match.status) {
      const current = await this.matchRepository.findById(id);
      if (!current) {
        return appErrorCodes.MATCH_NOT_FOUND;
      }
      return this.transitionStatus(current, input.status, payload);
    }

    if (response) {
      return response;
    }
    const current = await this.matchRepository.getMatch(id);
    return current ?? appErrorCodes.MATCH_NOT_FOUND;
  }

  // -------- Match status transitions --------

  // Single point of status change. Checks organizer/admin rights, the matrix
  // edge, then applies status-specific side effects. Manual OPEN<->FULL is
  // rejected — those edges belong to join/leave transactions only.
  private async transitionStatus(
    match: MatchRecord,
    next: MATCH_STATUS,
    payload: JwtPayload,
  ): Promise<Match | ErrorResponse> {
    if (!this.isOrganizer(payload, match) && !this.isAdmin(payload)) {
      return appErrorCodes.FORBIDDEN_NOT_ORGANIZER;
    }
    if (
      next === MATCH_STATUS.FULL ||
      (next === MATCH_STATUS.OPEN && match.status === MATCH_STATUS.FULL)
    ) {
      return appErrorCodes.MATCH_INVALID_TRANSITION;
    }
    if (!MATCH_TRANSITIONS[match.status].includes(next)) {
      return appErrorCodes.MATCH_INVALID_TRANSITION;
    }

    if (next === MATCH_STATUS.CONFIRMED) {
      const seated = await this.participantRepository.countSeated(match.id);
      if (seated < match.minPlayers) {
        return appErrorCodes.MATCH_MIN_PLAYERS_NOT_REACHED;
      }
      await this.participantRepository.confirmAllRegistered(match.id);
    }

    await this.matchRepository.setStatus(match.id, next);

    const ops: Promise<void>[] = [
      bumpVersion("match:list"),
      cacheDel(cacheKeys.matchDetail(match.id)),
      bumpVersion(fieldScheduleClass(match.fieldId)),
    ];
    // confirm mass-updates participant statuses.
    if (next === MATCH_STATUS.CONFIRMED) {
      ops.push(bumpVersion(participantsClass(match.id)));
    }
    await Promise.all(ops);

    const updated = await this.matchRepository.getMatch(match.id);
    if (!updated) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    return updated;
  }

  private async runTransition(
    id: number,
    next: MATCH_STATUS,
    payload: JwtPayload,
  ): Promise<Match | ErrorResponse> {
    const match = await this.matchRepository.findById(id);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    return this.transitionStatus(match, next, payload);
  }

  // DRAFT -> OPEN.
  publish(id: number, payload: JwtPayload): Promise<Match | ErrorResponse> {
    return this.runTransition(id, MATCH_STATUS.OPEN, payload);
  }

  // OPEN|FULL -> CONFIRMED (requires minPlayers, mass-confirms the roster).
  confirm(id: number, payload: JwtPayload): Promise<Match | ErrorResponse> {
    return this.runTransition(id, MATCH_STATUS.CONFIRMED, payload);
  }

  // Soft-cancel: preserve participation/rating history.
  cancel(id: number, payload: JwtPayload): Promise<Match | ErrorResponse> {
    return this.runTransition(id, MATCH_STATUS.CANCELLED, payload);
  }

  // -------- Participation --------

  async getParticipants(
    matchId: number,
    status?: PARTICIPANT_STATUS,
  ): Promise<ParticipantRecord[] | ErrorResponse> {
    const match = await this.matchRepository.findById(matchId);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    // Cache class `match:participants` (per-match version, status variants).
    return getOrSetList(participantsClass(matchId), { status }, CACHE_TTL.MATCH_PARTICIPANTS, () =>
      this.participantRepository.listByMatch(matchId, status),
    );
  }

  // Invalidation shared by every participation mutation: refresh the match
  // card and the per-match participants list. `affectsList` also bumps the
  // match list version when seated count / match status can change (join,
  // leave) — cache-design.md §4.
  private async invalidateParticipation(matchId: number, affectsList: boolean): Promise<void> {
    const ops: Promise<void>[] = [
      cacheDel(cacheKeys.matchDetail(matchId)),
      bumpVersion(participantsClass(matchId)),
    ];
    if (affectsList) ops.push(bumpVersion("match:list"));
    await Promise.all(ops);
  }

  // Transactional join: seats the caller as REGISTERED or queues them as
  // WAITLISTED; capacity is re-counted inside the transaction.
  async join(
    matchId: number,
    payload: JwtPayload,
    input: { position?: PLAYER_POSITION },
  ): Promise<ParticipantRecord | ErrorResponse> {
    if (!payload.playerId) {
      return appErrorCodes.PLAYER_PROFILE_REQUIRED;
    }
    const match = await this.matchRepository.findById(matchId);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    if (match.status !== MATCH_STATUS.OPEN && match.status !== MATCH_STATUS.FULL) {
      return appErrorCodes.MATCH_NOT_OPEN;
    }

    let result: {
      participant: ParticipantRecord;
      waitlisted: boolean;
    } | null;
    try {
      result = await this.participantRepository.joinWithCapacity(
        matchId,
        payload.playerId,
        match.maxPlayers,
        { position: input.position },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return appErrorCodes.PARTICIPANT_ALREADY_JOINED;
      }
      this.logger.error(error);
      throw error;
    }
    if (!result) {
      return appErrorCodes.PARTICIPANT_ALREADY_JOINED;
    }
    // Seated count and match status can change -> refresh list too.
    await this.invalidateParticipation(matchId, true);
    return result.participant;
  }

  // Transactional leave: frees the slot and promotes the head of the queue.
  async leave(matchId: number, payload: JwtPayload): Promise<ParticipantRecord | ErrorResponse> {
    if (!payload.playerId) {
      return appErrorCodes.PLAYER_PROFILE_REQUIRED;
    }
    const match = await this.matchRepository.findById(matchId);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    const participant = await this.participantRepository.findByMatchAndPlayer(
      matchId,
      payload.playerId,
    );
    if (!participant) {
      return appErrorCodes.PARTICIPANT_NOT_FOUND;
    }
    if (
      match.status !== MATCH_STATUS.OPEN &&
      match.status !== MATCH_STATUS.FULL &&
      match.status !== MATCH_STATUS.CONFIRMED
    ) {
      return appErrorCodes.MATCH_INVALID_TRANSITION;
    }
    if (participant.status === PARTICIPANT_STATUS.CANCELLED) {
      return appErrorCodes.PARTICIPANT_INVALID_TRANSITION;
    }

    const wasSeated = SEATED_STATUSES.includes(participant.status);
    const result = await this.participantRepository.leaveWithPromotion(
      matchId,
      participant.id,
      wasSeated,
      match.maxPlayers,
    );
    // Leaving frees a slot and can flip status -> refresh list too.
    await this.invalidateParticipation(matchId, true);
    return result.left;
  }

  // Self check-in on arrival: REGISTERED|CONFIRMED -> CHECKED_IN.
  async checkIn(matchId: number, payload: JwtPayload): Promise<ParticipantRecord | ErrorResponse> {
    if (!payload.playerId) {
      return appErrorCodes.PLAYER_PROFILE_REQUIRED;
    }
    const match = await this.matchRepository.findById(matchId);
    if (!match) {
      return appErrorCodes.MATCH_NOT_FOUND;
    }
    if (match.status !== MATCH_STATUS.CONFIRMED && match.status !== MATCH_STATUS.IN_PROGRESS) {
      return appErrorCodes.CHECK_IN_NOT_ALLOWED;
    }
    const participant = await this.participantRepository.findByMatchAndPlayer(
      matchId,
      payload.playerId,
    );
    if (!participant) {
      return appErrorCodes.PARTICIPANT_NOT_FOUND;
    }
    if (
      participant.status !== PARTICIPANT_STATUS.REGISTERED &&
      participant.status !== PARTICIPANT_STATUS.CONFIRMED
    ) {
      return appErrorCodes.PARTICIPANT_INVALID_TRANSITION;
    }

    const updated = await this.participantRepository.updateStatus(
      participant.id,
      PARTICIPANT_STATUS.CHECKED_IN,
    );
    // Check-in does not change seated count -> no match:list bump.
    await this.invalidateParticipation(matchId, false);
    return updated;
  }
}
