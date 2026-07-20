import cors from "@fastify/cors";

import configureRoutes from "./router.js";
import env from "./config/env.js";
import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import authPlugin from "./plugins/auth.js";
import swaggerPlugin from "./plugins/swagger.js";
import { isErrorShape } from "./utils/cache.js";
import server from "./server.js";

server.register(cors, {
  origin: true,
  credentials: true,
});

server.register(prismaPlugin);

// Redis cache/auth/rate-limit layer: after Prisma, before routes so caching
// helpers and rate-limit preHandlers have `server.redis` available.
server.register(redisPlugin);

// Register JWT + auth decorators before routes that use `authenticate`.
server.register(authPlugin);

// OpenAPI spec from route schemas (решение Р6); must precede configureRoutes.
server.register(swaggerPlugin);

// Domain errors are returned from services as `{ code, message }` and handlers
// pass them through as the response body. Without this hook they would serialize
// with HTTP 200. Registered before routes so every child context inherits it:
// when the body is the error shape, promote its `code` to the HTTP status.
server.addHook("preSerialization", async (_request, reply, payload) => {
  if (isErrorShape(payload)) {
    reply.code((payload as { code: number }).code);
  }
  return payload;
});

configureRoutes(server);

server.get("/ping", (_req, reply) => {
  reply.send({ message: "pong" });
});

const start = async () => {
  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`Server listening on ${env.HOST}:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
