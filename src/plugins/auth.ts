import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";

import env from "@/config/env.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import { isAccessBlacklisted } from "@/auth/refreshStore.js";

export interface JwtPayload {
  sub: number; // user.id
  email: string;
  roles: string[]; // role names from UserRole -> Role.name
  playerId?: number; // id of the game profile, if any
  type?: "access" | "refresh";
  jti?: string; // unique token id (refresh rotation / access blacklist)
  exp?: number; // expiry (epoch seconds), set by the signer
  iat?: number; // issued-at (epoch seconds), set by the signer
}

// Canonical typing for the signer input and the verified `req.user` payload.
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

// Reads the verified JWT payload off the request in a type-safe way.
export function getAuthPayload(req: { user?: unknown }): JwtPayload {
  return req.user as JwtPayload;
}

export default fp(async (fastify) => {
  fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN }, // access-token lifetime
  });

  // preHandler: verifies the access token and puts the payload on req.user.
  fastify.decorate("authenticate", async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply
        .code(appErrorCodes.AUTH_TOKEN_INVALID.code)
        .send(appErrorCodes.AUTH_TOKEN_INVALID);
    }

    const payload = getAuthPayload(req);

    // Only access tokens may open private routes. A long-lived refresh token
    // (`type: "refresh"`) must never authenticate. Absent `type` is allowed
    // for backward compatibility with pre-typed tokens.
    if (payload?.type !== undefined && payload.type !== "access") {
      return reply
        .code(appErrorCodes.AUTH_TOKEN_INVALID.code)
        .send(appErrorCodes.AUTH_TOKEN_INVALID);
    }

    // Optional stateful revocation of access tokens (cache-design.md §5.2).
    // Fail-open: a Redis outage never rejects an otherwise valid token.
    if (env.ACCESS_BLACKLIST_ENABLED) {
      if (payload?.jti && (await isAccessBlacklisted(payload.jti))) {
        return reply
          .code(appErrorCodes.AUTH_TOKEN_INVALID.code)
          .send(appErrorCodes.AUTH_TOKEN_INVALID);
      }
    }
  });

  // preHandler factory for role checks. Use AFTER `authenticate`.
  fastify.decorate(
    "authorize",
    (...roles: string[]) =>
      async (req, reply) => {
        const payload = getAuthPayload(req);
        if (!payload?.roles?.some((r) => roles.includes(r))) {
          return reply
            .code(appErrorCodes.AUTH_FORBIDDEN.code)
            .send(appErrorCodes.AUTH_FORBIDDEN);
        }
      }
  );
});
