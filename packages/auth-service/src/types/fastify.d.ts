import '@fastify/jwt';
import { FastifyRequest, FastifyReply } from 'fastify';
import { TokenPayload } from '../services/auth.service';

declare module 'fastify' {
  interface FastifyRequest {
    user: TokenPayload;
    jwtVerify<Decoded extends object = any>(): Promise<Decoded>;
  }

  interface FastifyReply {
    jwt: {
      sign: (payload: any, options?: object) => string;
      verify: <T = any>(token: string) => T;
    };
  }
} 