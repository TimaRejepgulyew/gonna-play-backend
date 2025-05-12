import Player from "./player.model.js";

import type {
  IPlayerRepository,
  CreatePlayer,
  UpdatePlayer,
} from "./player.service.js";

const playerTable = new Map<number, Player>();

export default class PlayerRepository implements IPlayerRepository {
  constructor() {}

  async getPlayerList(): Promise<Player[]> {
    return Array.from(playerTable.values());
  }

  async createPlayer(player: Omit<CreatePlayer, "user">): Promise<Player> {
    const id = playerTable.size + 1;

    playerTable.set(
      id,
      Object.assign(player, {
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );

    return playerTable.get(id) as Player;
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
