import type { PostgresDb } from '@fastify/postgres';
import bcrypt from 'bcrypt';
import { User } from '../types';

interface CreateUserInput {
  email: string;
  password: string;
  username?: string;
  full_name?: string;
  phone?: string;
  profile_picture?: string;
}

interface UpdateUserInput {
  username?: string;
  full_name?: string;
  phone?: string;
  profile_picture?: string;
}

export class UserService {
  constructor(private pg: PostgresDb) {}

  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  private async comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  async createUser(input: CreateUserInput): Promise<Omit<User, 'password'>> {
    const hashedPassword = await this.hashPassword(input.password);

    const { rows } = await this.pg.query(
      `INSERT INTO users(email, password, username, full_name, phone, profile_picture) 
       VALUES($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, username, full_name, phone, profile_picture, created_at`,
      [
        input.email,
        hashedPassword,
        input.username || null,
        input.full_name || null,
        input.phone || null,
        input.profile_picture || null,
      ]
    );

    return rows[0];
  }

  async findUserByEmail(
    email: string
  ): Promise<{ id: number; email: string; password: string; username?: string } | null> {
    const { rows } = await this.pg.query(
      'SELECT id, email, password, username FROM users WHERE email = $1',
      [email]
    );
    return rows[0] || null;
  }

  async findUserById(id: number): Promise<Omit<User, 'password'> | null> {
    const { rows } = await this.pg.query(
      'SELECT id, email, username, full_name, phone, profile_picture, created_at FROM users WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }

  async updateUser(userId: number, input: UpdateUserInput): Promise<Omit<User, 'password'> | null> {
    // Build dynamic query based on provided fields
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    // Add each field that needs to be updated
    if (input.username !== undefined) {
      updates.push(`username = $${paramIndex++}`);
      values.push(input.username);
    }

    if (input.full_name !== undefined) {
      updates.push(`full_name = $${paramIndex++}`);
      values.push(input.full_name);
    }

    if (input.phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      values.push(input.phone);
    }

    if (input.profile_picture !== undefined) {
      updates.push(`profile_picture = $${paramIndex++}`);
      values.push(input.profile_picture);
    }

    // If no updates, return the current user
    if (updates.length === 0) {
      return this.findUserById(userId);
    }

    // Add the user ID as the last parameter
    values.push(userId);

    const { rows } = await this.pg.query(
      `UPDATE users 
       SET ${updates.join(', ')} 
       WHERE id = $${paramIndex} 
       RETURNING id, email, username, full_name, phone, profile_picture, created_at`,
      values
    );

    return rows[0] || null;
  }

  async validateCredentials(
    email: string,
    password: string
  ): Promise<Omit<User, 'password'> | null> {
    const user = await this.findUserByEmail(email);

    if (!user) {
      return null;
    }

    const isPasswordValid = await this.comparePassword(password, user.password);

    if (!isPasswordValid) {
      return null;
    }

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword as Omit<User, 'password'>;
  }
}
