import { FastifyReply } from 'fastify';
import * as argon2 from 'argon2';
import sql from '@/database/connection';
import { RegisterUserInput, LoginUserInput } from '@/schemas/user.schema';
import { generateTokens } from '@/utils/jwt';

interface User {
  id: number;
  email: string;
  password: string;
  first_name: string | null;
  last_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserService {
  register(input: RegisterUserInput): Promise<{ id: number }>;
  login(input: LoginUserInput, reply: FastifyReply): Promise<{ accessToken: string; refreshToken: string }>;
  getUserByEmail(email: string): Promise<User | null>;
  getUserById(id: number): Promise<User | null>;
}

export class UserServiceImpl implements UserService {
  async register(input: RegisterUserInput) {
    const hashedPassword = await argon2.hash(input.password);

    const [user] = await sql<[{ id: number }]>`
      INSERT INTO users (
        email,
        password,
        first_name,
        last_name
      ) VALUES (
        ${input.email},
        ${hashedPassword},
        ${input.firstName || null},
        ${input.lastName || null}
      )
      RETURNING id
    `;

    return { id: user.id };
  }

  async login(input: LoginUserInput, reply: FastifyReply) {
    const user = await this.getUserByEmail(input.email);
    
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const validPassword = await argon2.verify(user.password, input.password);
    
    if (!validPassword) {
      throw new Error('Invalid email or password');
    }

    const { accessToken, refreshToken } = await generateTokens(user, reply);

    // Store refresh token
    await sql`
      INSERT INTO refresh_tokens (
        user_id,
        token,
        expires_at
      ) VALUES (
        ${user.id},
        ${refreshToken},
        ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)}
      )
    `;

    return { accessToken, refreshToken };
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [user] = await sql<[User?]>`
      SELECT * FROM users WHERE email = ${email}
    `;
    return user || null;
  }

  async getUserById(id: number): Promise<User | null> {
    const [user] = await sql<[User?]>`
      SELECT * FROM users WHERE id = ${id}
    `;
    return user || null;
  }
} 