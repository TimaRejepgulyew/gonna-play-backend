import fastifyRedis from "@fastify/redis";
import fp from "fastify-plugin";

import { closeRedis, getRedis } from "@/config/redis.js";

// Ownership mirrors `src/plugins/prisma.ts`: the single client lives in the
// module slot of `src/config/redis.ts`, and this plugin hands that very same
// instance to `@fastify/redis`, so `server.redis` and the slot never diverge.
// Note: nothing reads `server.redis` today — the cache, rate-limit and refresh
// helpers reach the client through `getRedis()` directly.
//
// `closeClient: false` on purpose: with `true` plus the `onClose` hook below the
// connection would be closed twice, and the module slot would keep pointing at a
// dead client. Closing goes through `closeRedis()`, which frees the slot first.
//
// Registered in `src/app.ts` after `prismaPlugin` and before `configureRoutes`.
const redisPlugin = fp(async (fastify) => {
  await fastify.register(fastifyRedis, {
    client: getRedis(),
    closeClient: false,
  });

  fastify.addHook("onClose", async () => {
    await closeRedis();
  });

  fastify.log.info("Redis plugin registered");
});

export default redisPlugin;
