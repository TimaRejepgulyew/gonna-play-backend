import type { PrismaClient } from "@prisma/client";
import type { PaginatedResult, PaginationQuery } from "@/types/pagination.js";
import { resolvePagination } from "@/types/pagination.js";
import type Player from "./player.model.js";
import type {
  CreatePlayer,
  IPlayerRepository,
  PlayerListFilters,
  UpdatePlayer,
} from "./player.service.js";

const PLAYER_SORT_FIELDS = ["createdAt", "updatedAt", "name", "level"];

export default class PlayerRepository implements IPlayerRepository {
  constructor(private prisma: PrismaClient) {}

  async getPlayerList(
    pagination: PaginationQuery = {},
    filters: PlayerListFilters = {},
  ): Promise<PaginatedResult<Player>> {
    const { skip, take, page, limit, orderBy } = resolvePagination(
      pagination,
      PLAYER_SORT_FIELDS,
      "createdAt",
    );

    const where = {
      ...(filters.level ? { level: filters.level } : {}),
      ...(filters.position ? { position: filters.position } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: "insensitive" as const } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.player.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { user: true },
      }),
      this.prisma.player.count({ where }),
    ]);

    return {
      data: rows as unknown as Player[],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async createPlayer(player: CreatePlayer): Promise<Player> {
    const newPlayer = await this.prisma.player.create({
      data: {
        name: player.name,
        userId: player.userId,
        level: player.level,
        position: player.position,
        status: player.status,
      },
    });

    return newPlayer as unknown as Player;
  }

  async getPlayer(id: number): Promise<Player | null> {
    const player = await this.prisma.player.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!player) {
      return null;
    }

    // Aggregate rating from raw PlayerRating rows (not materialized).
    const aggregate = await this.prisma.playerRating.aggregate({
      where: { ratedId: id },
      _avg: { score: true },
      _count: { score: true },
    });

    return Object.assign(player as unknown as Player, {
      rating: {
        average: aggregate._avg.score ?? 0,
        count: aggregate._count.score ?? 0,
      },
    });
  }

  async updatePlayer(player: UpdatePlayer): Promise<Player | null> {
    const updatedPlayer = await this.prisma.player.update({
      where: { id: player.id },
      data: {
        name: player.name,
        level: player.level,
        position: player.position,
        status: player.status,
      },
      include: { user: true },
    });

    return updatedPlayer as unknown as Player | null;
  }

  async deletePlayer(id: number): Promise<number | null> {
    const deleted = await this.prisma.player.delete({ where: { id } });
    return deleted ? deleted.id : null;
  }
}
