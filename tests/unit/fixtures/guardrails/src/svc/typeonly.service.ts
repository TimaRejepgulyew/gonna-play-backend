// Негативная пара к svc.service.ts: типовой импорт из fastify остаётся законным.
import type { FastifyBaseLogger } from "fastify";

export type ServiceLogger = FastifyBaseLogger;
