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

/** Pure factory — unit-tested with a literal cfg, no process.env stubbing. */
export function buildLoggerConfig(cfg: LoggerEnv): FastifyServerOptions["logger"] {
  const targets = transportTargets(cfg);
  const transport = targets[cfg.LOG_TRANSPORT] ?? targets.file; // unknown value → default
  return { level: cfg.LOG_LEVEL, transport };
}

/**
 * Logger for code outside the Fastify lifecycle (bootstrap catch in src/index.ts).
 * Synchronous destination on purpose: the process exits right after writing, so a
 * worker-thread transport would lose the final fatal record.
 */
export function createBootstrapLogger() {
  return pino(
    { level: env.LOG_LEVEL },
    env.LOG_TRANSPORT === "file"
      ? pino.destination({ dest: env.LOG_FILE, sync: true, mkdir: true })
      : pino.destination({ dest: STDERR_FD, sync: true }),
  );
}

export default buildLoggerConfig(env);
