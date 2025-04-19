import type { PostgresDb } from '@fastify/postgres';
import { Game, GameStatus, SkillLevel } from '../types';

interface CreateGameInput {
  created_by: number;
  title: string;
  description?: string;
  start_time: Date;
  end_time: Date;
  location_id: number;
  max_players?: number;
  min_players?: number;
  price?: number;
  skill_level?: SkillLevel;
}

interface UpdateGameInput {
  title?: string;
  description?: string;
  start_time?: Date;
  end_time?: Date;
  location_id?: number;
  max_players?: number;
  min_players?: number;
  status?: GameStatus;
  price?: number;
  skill_level?: SkillLevel;
}

interface GameFilters {
  status?: GameStatus;
  location_id?: number;
  start_after?: Date;
  start_before?: Date;
  skill_level?: SkillLevel;
  created_by?: number;
}

export class GameService {
  constructor(private pg: PostgresDb) {}

  async createGame(input: CreateGameInput): Promise<Game> {
    const { rows } = await this.pg.query(
      `INSERT INTO games(
        created_by, title, description, start_time, end_time, 
        location_id, max_players, min_players, price, skill_level
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      RETURNING *`,
      [
        input.created_by,
        input.title,
        input.description || null,
        input.start_time,
        input.end_time,
        input.location_id,
        input.max_players || 10,
        input.min_players || 2,
        input.price || null,
        input.skill_level || null,
      ]
    );

    return rows[0];
  }

  async findGameById(id: number): Promise<Game | null> {
    const { rows } = await this.pg.query('SELECT * FROM games WHERE id = $1', [id]);
    return rows[0] || null;
  }

  async updateGame(gameId: number, input: UpdateGameInput): Promise<Game | null> {
    // Build dynamic query based on provided fields
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Add each field that needs to be updated
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    });

    // If no updates, return the current game
    if (updates.length === 0) {
      return this.findGameById(gameId);
    }

    // Add the game ID as the last parameter
    values.push(gameId);

    const { rows } = await this.pg.query(
      `UPDATE games 
       SET ${updates.join(', ')} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      values
    );

    return rows[0] || null;
  }

  async listGames(filters: GameFilters = {}, limit = 20, offset = 0): Promise<Game[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Add filter conditions
    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    if (filters.location_id) {
      conditions.push(`location_id = $${paramIndex++}`);
      values.push(filters.location_id);
    }

    if (filters.start_after) {
      conditions.push(`start_time >= $${paramIndex++}`);
      values.push(filters.start_after);
    }

    if (filters.start_before) {
      conditions.push(`start_time <= $${paramIndex++}`);
      values.push(filters.start_before);
    }

    if (filters.skill_level) {
      conditions.push(`skill_level = $${paramIndex++}`);
      values.push(filters.skill_level);
    }

    if (filters.created_by) {
      conditions.push(`created_by = $${paramIndex++}`);
      values.push(filters.created_by);
    }

    // Build the WHERE clause if there are conditions
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Add pagination parameters
    values.push(limit);
    values.push(offset);

    const { rows } = await this.pg.query(
      `SELECT * FROM games 
       ${whereClause} 
       ORDER BY start_time ASC 
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      values
    );

    return rows;
  }

  async deleteGame(gameId: number): Promise<boolean> {
    const { rowCount } = await this.pg.query('DELETE FROM games WHERE id = $1', [gameId]);

    return rowCount ? rowCount > 0 : false;
  }

  async getParticipantCount(gameId: number): Promise<number> {
    const { rows } = await this.pg.query(
      'SELECT COUNT(*) as count FROM participants WHERE game_id = $1 AND status = $2',
      [gameId, 'confirmed']
    );

    return parseInt(rows[0].count, 10);
  }

  async updateGameStatus(gameId: number, status: GameStatus): Promise<Game | null> {
    const { rows } = await this.pg.query('UPDATE games SET status = $1 WHERE id = $2 RETURNING *', [
      status,
      gameId,
    ]);

    return rows[0] || null;
  }
}
