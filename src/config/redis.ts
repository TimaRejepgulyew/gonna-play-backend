import { Redis } from "ioredis";

import env from "@/config/env.js";

// Lifecycle wrapper around a single ioredis client: private module slot, lazy
// getter, explicit close. The Fastify plugin in `src/plugins/redis.ts` owns the
// lifetime and hands the very same instance to `@fastify/redis`, so
// `server.redis` and this slot always point at one connection.
//
// Fail-open posture: when Redis is unreachable, commands reject immediately
// (`enableOfflineQueue: false`) instead of hanging, so cache/rate-limit helpers
// fall back to the source of truth. `keyPrefix` namespaces every key with `gp:`.
let client: Redis | null = null;

export function createRedisClient(): Redis {
  // Options carried over unchanged from the previous module singleton.
  const next = new Redis(env.REDIS_URL, {
    keyPrefix: env.REDIS_KEY_PREFIX,
    lazyConnect: false,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });

  // Swallow connection-level errors so a down Redis never crashes the process.
  // Per-operation failures are logged by the cache/rate-limit helpers instead.
  next.on("error", () => {
    /* fail-open: intentionally ignored (see helpers for op-level logging) */
  });

  return next;
}

/** Lazy creation: the first caller creates the client, the rest get the same object. */
export function getRedis(): Redis {
  if (client === null) client = createRedisClient();
  return client;
}

/** Test seam: the unit suite installs an in-memory stub here. */
export function setRedis(next: Redis): void {
  client = next;
}

/** Closes the client and frees the slot, so the next getRedis() creates a new one. */
export async function closeRedis(): Promise<void> {
  if (client === null) return;
  const current = client;
  client = null;
  await current.quit();
}
