import type { PostgresDb } from '@fastify/postgres';
import { Location } from '../types';

interface CreateLocationInput {
  name: string;
  address: string;
  city: string;
  latitude?: number;
  longitude?: number;
}

interface UpdateLocationInput {
  name?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
}

export class LocationService {
  constructor(private pg: PostgresDb) {}

  async createLocation(input: CreateLocationInput): Promise<Location> {
    const { rows } = await this.pg.query(
      `INSERT INTO locations(name, address, city, latitude, longitude) 
       VALUES($1, $2, $3, $4, $5) 
       RETURNING *`,
      [input.name, input.address, input.city, input.latitude || null, input.longitude || null]
    );

    return rows[0];
  }

  async findLocationById(id: number): Promise<Location | null> {
    const { rows } = await this.pg.query('SELECT * FROM locations WHERE id = $1', [id]);
    return rows[0] || null;
  }

  async updateLocation(locationId: number, input: UpdateLocationInput): Promise<Location | null> {
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

    // If no updates, return the current location
    if (updates.length === 0) {
      return this.findLocationById(locationId);
    }

    // Add the location ID as the last parameter
    values.push(locationId);

    const { rows } = await this.pg.query(
      `UPDATE locations 
       SET ${updates.join(', ')} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      values
    );

    return rows[0] || null;
  }

  async listLocations(city?: string, limit = 20, offset = 0): Promise<Location[]> {
    const values: any[] = [];
    let query = 'SELECT * FROM locations';

    if (city) {
      query += ' WHERE city = $1';
      values.push(city);
    }

    query += ' ORDER BY name ASC LIMIT $' + (values.length + 1) + ' OFFSET $' + (values.length + 2);
    values.push(limit, offset);

    const { rows } = await this.pg.query(query, values);
    return rows;
  }

  async deleteLocation(locationId: number): Promise<boolean> {
    const { rowCount } = await this.pg.query('DELETE FROM locations WHERE id = $1', [locationId]);

    return rowCount ? rowCount > 0 : false;
  }

  async searchLocations(searchTerm: string, limit = 20): Promise<Location[]> {
    const { rows } = await this.pg.query(
      `SELECT * FROM locations 
       WHERE name ILIKE $1 OR address ILIKE $1 OR city ILIKE $1 
       ORDER BY name ASC 
       LIMIT $2`,
      [`%${searchTerm}%`, limit]
    );

    return rows;
  }
}
