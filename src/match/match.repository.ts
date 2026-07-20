import { PrismaClient } from "@prisma/client";

import { PARTICIPANT_STATUS } from "@/constants/enums.js";
import { resolvePagination } from "@/types/pagination.js";
import { Match } from "./match.model.js";

import type {
  CreateMatchData,
  IMatchRepository,
  MatchListFilters,
  MatchRecord,
  UpdateMatchData,
} from "./match.service.js";
import type { MATCH_STATUS } from "@/constants/enums.js";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/types/pagination.js";

const MATCH_SORT_FIELDS = ["startTime", "createdAt", "price", "maxPlayers"];

export default class MatchRepository implements IMatchRepository {
  constructor(private prisma: PrismaClient) {}

  async listMatches(
    pagination: PaginationQuery = {},
    filters: MatchListFilters = {}
  ): Promise<PaginatedResult<Match>> {
    const { skip, take, page, limit, orderBy } = resolvePagination(
      pagination,
      MATCH_SORT_FIELDS,
      "startTime",
      "asc"
    );

    const startTime: { gte?: Date; lte?: Date } = {};
    if (filters.dateFrom) startTime.gte = new Date(filters.dateFrom);
    if (filters.dateTo) startTime.lte = new Date(filters.dateTo);

    const where = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.format ? { format: filters.format } : {}),
      ...(filters.level ? { requiredLevel: filters.level } : {}),
      ...(filters.fieldId ? { fieldId: filters.fieldId } : {}),
      ...(filters.organizerId ? { organizerId: filters.organizerId } : {}),
      ...(startTime.gte || startTime.lte ? { startTime } : {}),
      ...(filters.city
        ? { field: { location: { city: filters.city } } }
        : {}),
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
              participants: { where: { status: PARTICIPANT_STATUS.CONFIRMED } },
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
        startTime: data.startTime,
        format: data.format,
        maxPlayers: data.maxPlayers,
        status: data.status,
        ...(data.durationMinutes !== undefined
          ? { durationMinutes: data.durationMinutes }
          : {}),
        ...(data.requiredLevel ? { requiredLevel: data.requiredLevel } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
      },
      include: { field: { include: { location: true } } },
    });
    return created as unknown as Match;
  }

  async updateMatch(
    id: number,
    data: UpdateMatchData
  ): Promise<Match | null> {
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
