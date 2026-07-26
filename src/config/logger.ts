import type { FastifyServerOptions } from "fastify";
import pino from "pino";
import env from "./env.js";

const STDOUT_FD = 1;
const STDERR_FD = 2;

type LoggerEnv = Pick<typeof env, "LOG_LEVEL" | "LOG_TRANSPORT" | "LOG_FILE">;

const transportTargets = (cfg: LoggerEnv) => ({
  file: {
    target: "pino/file", // built into pino v10, no extra dependency
    options: { destination: cfg.LOG_FILE, mkdir: true },
  },
  pretty: {
    target: "pino-pretty",
    options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
  },
  stdout: {
    target: "pino/file",
    options: { destination: STDOUT_FD },
  },
});

export const REDACT_PATHS = [
  // 1. Ошибка — главный канал утечки: stdSerializers.err копирует все
  //    перечислимые свойства, а errorHandler логирует объект целиком.
  "err.idToken",
  "err.identityToken",
  "err.authorizationCode",
  "err.hash",
  "err.password",
  "err.credential",
  "err.proof",
  "err.ticket",
  "err.body",
  "err.request",
  "err.response",
  // 2. Тело и заголовки запроса — страховка на случай кастомного
  //    сериализатора req: штатный тело не пишет, но это не гарантия навсегда.
  "req.body.idToken",
  "req.body.identityToken",
  "req.body.authorizationCode",
  "req.body.hash",
  "req.body.password",
  "req.body.ticket",
  "req.body.proof",
  "req.body.credential",
  "req.headers.authorization",
  "req.headers.cookie",
  // 3. Верхний уровень и один уровень вложенности — прямые вызовы вида
  //    logger.info({ idToken }) и logger.info({ payload: { hash } }).
  //    snake_case имена — из ответов и тел запросов Apple.
  //    `code` намеренно не редактируется: у нас это числовой HTTP-статус
  //    конверта ошибки, редакция сделала бы логи нечитаемыми.
  "idToken",
  "identityToken",
  "authorizationCode",
  "hash",
  "password",
  "credential",
  "proof",
  "ticket",
  "accessToken",
  "refreshToken",
  "client_secret",
  "refresh_token",
  "access_token",
  "id_token",
  "*.idToken",
  "*.identityToken",
  "*.authorizationCode",
  "*.hash",
  "*.password",
  "*.credential",
  "*.proof",
  "*.ticket",
  "*.accessToken",
  "*.refreshToken",
  "*.client_secret",
  "*.refresh_token",
  "*.access_token",
  "*.id_token",
] as const;

// censor, а не remove: молча исчезнувший ключ не отличить от отсутствующего.
const redactOptions = { paths: [...REDACT_PATHS], censor: "[Redacted]" };

/** Pure factory — unit-tested with a literal cfg, no process.env stubbing. */
export function buildLoggerConfig(cfg: LoggerEnv): FastifyServerOptions["logger"] {
  const targets = transportTargets(cfg);
  const transport = targets[cfg.LOG_TRANSPORT] ?? targets.file; // unknown value → default
  return { level: cfg.LOG_LEVEL, transport, redact: redactOptions };
}

/**
 * Logger for code outside the Fastify lifecycle (bootstrap catch in src/index.ts).
 * Synchronous destination on purpose: the process exits right after writing, so a
 * worker-thread transport would lose the final fatal record.
 */
export function createBootstrapLogger() {
  return pino(
    { level: env.LOG_LEVEL, redact: redactOptions },
    env.LOG_TRANSPORT === "file"
      ? pino.destination({ dest: env.LOG_FILE, sync: true, mkdir: true })
      : pino.destination({ dest: STDERR_FD, sync: true }),
  );
}

export default buildLoggerConfig(env);
