import { FastifyReply } from 'fastify';
import { config } from '@/config/server';

interface User {
  id: number;
  email: string;
}

export async function generateTokens(user: User, reply: FastifyReply) {
  const accessToken = await reply.jwtSign(
    {
      id: user.id,
      email: user.email,
    },
    {
      sign: {
        expiresIn: config.JWT_EXPIRES_IN,
      },
    }
  );

  const refreshToken = await reply.jwtSign(
    {
      id: user.id,
    },
    {
      sign: {
        expiresIn: config.REFRESH_TOKEN_EXPIRES_IN,
      },
    }
  );

  return { accessToken, refreshToken };
}

export async function verifyRefreshToken(token: string, reply: FastifyReply) {
  try {
    const decoded = await reply.jwtVerify({ token });
    return decoded;
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
} 