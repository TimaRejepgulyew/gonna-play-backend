import { Redis } from "ioredis";

import env from "@/config/env.js";

// Single ioredis client, mirroring the Prisma singleton in `src/config/prisma.ts`.
// The service layer imports this as `@/config/redis.js`; the Fastify plugin in
// `src/plugins/redis.ts` hands the very same instance to `@fastify/redis`, so
// `server.redis` and this singleton always point at one connection.
//
// Fail-open posture: when Redis is unreachable, commands reject immediately
// (`enableOfflineQueue: false`) instead of hanging, so cache/rate-limit helpers
// fall back to the source of truth. `keyPrefix` namespaces every key with `gp:`.
const redis = new Redis(env.REDIS_URL, {
  keyPrefix: env.REDIS_KEY_PREFIX,
  lazyConnect: false,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 200, 5000),
});

// Swallow connection-level errors so a down Redis never crashes the process.
// Per-operation failures are logged by the cache/rate-limit helpers instead.
redis.on("error", () => {
  /* fail-open: intentionally ignored (see helpers for op-level logging) */
});

export default redis;
