import { FastifyReply, FastifyRequest } from 'fastify';
import { UserService, UserServiceImpl } from '@/services/user.service';
import { RegisterUserInput, LoginUserInput, RefreshTokenInput } from '@/schemas/user.schema';
import sql from '@/database/connection';
import { verifyRefreshToken } from '@/utils/jwt';

export class AuthController {
  private userService: UserService;

  constructor() {
    this.userService = new UserServiceImpl();
  }

  async register(
    request: FastifyRequest<{ Body: RegisterUserInput }>,
    reply: FastifyReply
  ) {
    try {
      const user = await this.userService.register(request.body);
      return reply.code(201).send(user);
    } catch (error) {
      if (error instanceof Error && error.message.includes('duplicate key')) {
        return reply.code(409).send({ error: 'Email already exists' });
      }
      return reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async login(
    request: FastifyRequest<{ Body: LoginUserInput }>,
    reply: FastifyReply
  ) {
    try {
      const tokens = await this.userService.login(request.body, reply);
      return reply.code(200).send(tokens);
    } catch (error) {
      if (error instanceof Error) {
        return reply.code(401).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async refreshToken(
    request: FastifyRequest<{ Body: RefreshTokenInput }>,
    reply: FastifyReply
  ) {
    try {
      const { refreshToken } = request.body;

      // Verify the refresh token
      const decoded = await verifyRefreshToken(refreshToken, reply);

      // Check if the refresh token exists in the database
      const [token] = await sql`
        SELECT * FROM refresh_tokens
        WHERE token = ${refreshToken}
        AND expires_at > NOW()
      `;

      if (!token) {
        return reply.code(401).send({ error: 'Invalid refresh token' });
      }

      // Get user
      const user = await this.userService.getUserById(decoded.id);
      if (!user) {
        return reply.code(401).send({ error: 'User not found' });
      }

      // Generate new tokens
      const { accessToken: newAccessToken, refreshToken: newRefreshToken } = await this.userService.login(
        { email: user.email, password: user.password },
        reply
      );

      // Delete old refresh token
      await sql`
        DELETE FROM refresh_tokens
        WHERE token = ${refreshToken}
      `;

      return reply.code(200).send({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      if (error instanceof Error) {
        return reply.code(401).send({ error: error.message });
      }
      return reply.code(500).send({ error: 'Internal server error' });
    }
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    try {
      const refreshToken = request.headers.authorization?.replace('Bearer ', '');

      if (refreshToken) {
        await sql`
          DELETE FROM refresh_tokens
          WHERE token = ${refreshToken}
        `;
      }

      return reply.code(200).send({ message: 'Logged out successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error' });
    }
  }
} 