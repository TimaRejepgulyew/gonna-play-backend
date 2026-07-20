import redis from "@/config/redis.js";
import env from "@/config/env.js";

// Structural request/reply shapes. The project's legacy `@types/fastify-jwt`
// strips the defaults off `FastifyRequest`/`FastifyReply`, so referencing them
// bare needs all 9 generics; these minimal interfaces sidestep that (and stay
// assignable to Fastify's preHandler by parameter contravariance).
export interface RateLimitRequest {
  ip: string;
  body?: unknown;
}

interface RateLimitReply {
  header(name: string, value: string): unknown;
  code(statusCode: number): { send(payload: unknown): unknown };
}

// Fixed-window rate limiter (cache-design.md §6): `INCR rate:<action>:<id>`,
// with `EXPIRE` set on the first hit of a window. Fail-open — if Redis errors,
// the request is allowed through. Attach as a route `preHandler`.
export interface RateLimitOptions {
  action: string;
  windowSeconds: number;
  max: number;
  // Extra identifier beyond IP (e.g. login email) to key a second counter on.
  identifier?: (req: RateLimitRequest) => string | undefined;
}

type PreHandler = (
  req: RateLimitRequest,
  reply: RateLimitReply
) => Promise<void>;

export function rateLimit(options: RateLimitOptions): PreHandler {
  return async (req, reply) => {
    if (!env.RATE_LIMIT_ENABLED) return;

    const id = options.identifier ? options.identifier(req) : req.ip;
    if (!id) return; // nothing to key on -> allow

    const key = `rate:${options.action}:${id}`;
    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, options.windowSeconds);
      }
      if (count > options.max) {
        const ttl = await redis.ttl(key);
        reply.header(
          "Retry-After",
          String(ttl > 0 ? ttl : options.windowSeconds)
        );
        await reply
          .code(429)
          .send({ code: 429, message: "Too many requests, please retry later" });
      }
    } catch {
      /* fail-open: Redis unavailable -> do not block the request */
    }
  };
}
