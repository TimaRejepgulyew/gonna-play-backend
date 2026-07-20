import fp from "fastify-plugin";
import fastifyRedis from "@fastify/redis";

import redis from "@/config/redis.js";

// Mirrors the Prisma double-pattern (`src/plugins/prisma.ts`): the singleton
// client lives in `src/config/redis.ts`, and this plugin exposes it as
// `server.redis` for request-scoped consumers (rate-limit preHandlers,
// access-token blacklist checks). `closeClient: true` disconnects on shutdown.
//
// Registered in `src/index.ts` after `prismaPlugin` and before `configureRoutes`.
const redisPlugin = fp(async (fastify) => {
  await fastify.register(fastifyRedis, { client: redis, closeClient: true });
  fastify.log.info("Redis plugin registered");
});

export default redisPlugin;
