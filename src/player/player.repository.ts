import { Prisma, PrismaClient } from "@prisma/client";
import Player from "./player.model.js";

import type {
  IPlayerRepository,
  CreatePlayer,
  UpdatePlayer,
} from "./player.service.js";

const playerTable = new Map<number, Player>();

export default class PlayerRepository implements IPlayerRepository {
  constructor(private prisma: PrismaClient) {}

  async getPlayerList(): Promise<Player[]> {
    const players = (await this.prisma.player.findMany({
      include: {
        user: true,
      },
    })) as unknown as Player[];

    return players;
  }

  async createPlayer(player: CreatePlayer): Promise<Player> {
    const newPlayer = await this.prisma.player.create({
      data: {
        name: player.name,
        userId: player.userId,
        level: player.level,
        position: player.position,
      },
    });

    return newPlayer as unknown as Player;
  }

  async getPlayer(id: number): Promise<Player | null> {
    return playerTable.has(id) ? (playerTable.get(id) as Player) : null;
  }

  async updatePlayer(player: UpdatePlayer): Promise<Player | null> {
    const prevPlayer = playerTable.get(player.id);

    if (prevPlayer) {
      playerTable.set(
        player.id,
        Object.assign(
          prevPlayer,
          Object.assign(player, {
            updatedAt: new Date().toISOString(),
          })
        )
      );

      return playerTable.get(player.id) as Player;
    }
    return null;
  }

  async deletePlayer(id: number): Promise<number | null> {
    return playerTable.delete(id) ? 1 : null;
  }
}
