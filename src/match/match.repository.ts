import type { PrismaClient } from "@prisma/client";

import { MATCH_STATUS, MATCH_VISIBILITY } from "@/constants/enums.js";
import { type PLAYER_LEVEL, PLAYER_LEVEL_ORDER } from "@/player/constant.js";
import type { PaginatedResult, PaginationQuery } from "@/types/pagination.js";
import { resolvePagination } from "@/types/pagination.js";
import type { Match } from "./match.model.js";

import type {
  CreateMatchData,
  IMatchRepository,
  MatchListFilters,
  MatchRecord,
  UpdateMatchData,
} from "./match.service.js";
import { SEATED_STATUSES } from "./match.service.js";

const MATCH_SORT_FIELDS = ["startsAt", "createdAt", "price", "maxPlayers"];

// Skill-window helpers over PLAYER_LEVEL_ORDER: a queried `level` fits a match
// when the match's skillMin is at or below it and skillMax is at or above it.
const levelsAtOrBelow = (level: PLAYER_LEVEL): PLAYER_LEVEL[] => {
  const idx = PLAYER_LEVEL_ORDER.indexOf(level);
  return PLAYER_LEVEL_ORDER.filter((_, i) => i <= idx);
};

const levelsAtOrAbove = (level: PLAYER_LEVEL): PLAYER_LEVEL[] => {
  const idx = PLAYER_LEVEL_ORDER.indexOf(level);
  return PLAYER_LEVEL_ORDER.filter((_, i) => i >= idx);
};

export default class MatchRepository implements IMatchRepository {
  constructor(private prisma: PrismaClient) {}

  async listMatches(
    pagination: PaginationQuery = {},
    filters: MatchListFilters = {},
  ): Promise<PaginatedResult<Match>> {
    const { skip, take, page, limit, orderBy } = resolvePagination(
      pagination,
      MATCH_SORT_FIELDS,
      "startsAt",
      "asc",
    );

    const startsAt: { gte?: Date; lte?: Date } = {};
    if (filters.dateFrom) startsAt.gte = new Date(filters.dateFrom);
    if (filters.dateTo) startsAt.lte = new Date(filters.dateTo);

    // Base list is always public and never DRAFT. A status filter is added
    // alongside (not replacing) the DRAFT exclusion, so no query can surface a
    // DRAFT match — a `status=DRAFT` filter yields a contradiction => empty.
    const and: Record<string, unknown>[] = [{ status: { not: MATCH_STATUS.DRAFT } }];
    if (filters.status) and.push({ status: filters.status });
    if (filters.level) {
      and.push({
        AND: [
          {
            OR: [{ skillMin: null }, { skillMin: { in: levelsAtOrBelow(filters.level) } }],
          },
          {
            OR: [{ skillMax: null }, { skillMax: { in: levelsAtOrAbove(filters.level) } }],
          },
        ],
      });
    }

    const where = {
      visibility: MATCH_VISIBILITY.PUBLIC,
      ...(filters.format ? { format: filters.format } : {}),
      ...(filters.fieldId ? { fieldId: filters.fieldId } : {}),
      ...(filters.organizerId ? { organizerId: filters.organizerId } : {}),
      ...(startsAt.gte || startsAt.lte ? { startsAt } : {}),
      ...(filters.city ? { field: { location: { city: filters.city } } } : {}),
      AND: and,
    };

    const [rows, total] = await Promise.all([
      this.prisma.match.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          field: { include: { location: true } },
          _count: {
            select: {
              participants: { where: { status: { in: SEATED_STATUSES } } },
            },
          },
        },
      }),
      this.prisma.match.count({ where }),
    ]);

    return {
      data: rows as unknown as Match[],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getMatch(id: number): Promise<Match | null> {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: {
        field: { include: { location: true } },
        participants: { include: { player: true } },
      },
    });
    return match as unknown as Match | null;
  }

  async findById(id: number): Promise<MatchRecord | null> {
    return this.prisma.match.findUnique({
      where: { id },
      select: {
        id: true,
        organizerId: true,
        fieldId: true,
        format: true,
        minPlayers: true,
        maxPlayers: true,
        status: true,
      },
    }) as unknown as Promise<MatchRecord | null>;
  }

  async createMatch(data: CreateMatchData): Promise<Match> {
    const created = await this.prisma.match.create({
      data: {
        organizerId: data.organizerId,
        fieldId: data.fieldId,
        title: data.title,
        startsAt: data.startsAt,
        format: data.format,
        minPlayers: data.minPlayers,
        maxPlayers: data.maxPlayers,
        status: data.status,
        ...(data.durationMin !== undefined ? { durationMin: data.durationMin } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
        ...(data.skillMin !== undefined ? { skillMin: data.skillMin } : {}),
        ...(data.skillMax !== undefined ? { skillMax: data.skillMax } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
      include: { field: { include: { location: true } } },
    });
    return created as unknown as Match;
  }

  async updateMatch(id: number, data: UpdateMatchData): Promise<Match | null> {
    const updated = await this.prisma.match.update({
      where: { id },
      data,
      include: {
        field: { include: { location: true } },
        participants: { include: { player: true } },
      },
    });
    return updated as unknown as Match | null;
  }

  async setStatus(id: number, status: MATCH_STATUS): Promise<void> {
    await this.prisma.match.update({ where: { id }, data: { status } });
  }
}
