import Fastify from "fastify";
import cors from "@fastify/cors";

import configureRoutes from "./router.js";
import loggerConfig from "./config/logger.js";
import prismaPlugin from "./plugins/prisma.js";
import redisPlugin from "./plugins/redis.js";
import authPlugin from "./plugins/auth.js";
import swaggerPlugin from "./plugins/swagger.js";
import { isErrorShape } from "./utils/cache.js";

import type { FastifyInstance, FastifyServerOptions } from "fastify";

// Тип экземпляра, который возвращает Fastify({ logger }) — тот же, что принимает
// configureRoutes (src/router.ts:12-14). Логгер здесь FastifyBaseLogger, а не pino Logger:
// подстановка pino Logger делает тип несовместимым с сигнатурой configureRoutes.
export type AppInstance = FastifyInstance;

export interface BuildAppOptions {
  /** По умолчанию — pino-pretty из src/config/logger.ts. Тесты передают { level: "silent" }. */
  logger?: FastifyServerOptions["logger"];
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<AppInstance> {
  const server: AppInstance = Fastify({ logger: opts.logger ?? loggerConfig });

  // Порядок ниже перенесён без изменений из src/index.ts:12-44.
  server.register(cors, { origin: true, credentials: true });
  server.register(prismaPlugin);
  server.register(redisPlugin);
  server.register(authPlugin);
  server.register(swaggerPlugin);

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

  await server.ready();
  return server;
}
