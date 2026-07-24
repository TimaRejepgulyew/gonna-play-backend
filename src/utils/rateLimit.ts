import type { FastifyReply, FastifyRequest } from "fastify";
import env from "@/config/env.js";
import { getRedis } from "@/config/redis.js";

// Fixed-window rate limiter (cache-design.md §6): `INCR rate:<action>:<id>`,
// with `EXPIRE` set on the first hit of a window. Fail-open — if Redis errors,
// the request is allowed through. Attach as a route `preHandler`.
export interface RateLimitOptions {
  action: string;
  windowSeconds: number;
  max: number;
  // Extra identifier beyond IP (e.g. login email) to key a second counter on.
  identifier?: (req: FastifyRequest) => string | undefined;
}

type PreHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

export function rateLimit(options: RateLimitOptions): PreHandler {
  return async (req, reply) => {
    if (!env.RATE_LIMIT_ENABLED) return;

    const id = options.identifier ? options.identifier(req) : req.ip;
    if (!id) return; // nothing to key on -> allow

    const key = `rate:${options.action}:${id}`;
    try {
      const redis = getRedis();
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, options.windowSeconds);
      }
      if (count > options.max) {
        const ttl = await redis.ttl(key);
        reply.header("Retry-After", String(ttl > 0 ? ttl : options.windowSeconds));
        await reply.code(429).send({ code: 429, message: "Too many requests, please retry later" });
      }
    } catch {
      /* fail-open: Redis unavailable -> do not block the request */
    }
  };
}
