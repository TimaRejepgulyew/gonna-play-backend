import { describe, expect, it } from "vitest";
import { buildLoggerConfig } from "@/config/logger.js";

const STDOUT_FD = 1;

const baseCfg = {
  LOG_LEVEL: "info",
  LOG_TRANSPORT: "file",
  LOG_FILE: "logs/app.log",
};

describe("buildLoggerConfig transport matrix", () => {
  it("file → pino/file with destination from cfg and mkdir", () => {
    const config = buildLoggerConfig({ ...baseCfg, LOG_TRANSPORT: "file" });

    expect(config).toMatchObject({
      level: "info",
      transport: {
        target: "pino/file",
        options: { destination: "logs/app.log", mkdir: true },
      },
    });
  });

  it("pretty → pino-pretty", () => {
    const config = buildLoggerConfig({ ...baseCfg, LOG_TRANSPORT: "pretty" });

    expect(config).toMatchObject({ transport: { target: "pino-pretty" } });
  });

  it("stdout → pino/file with fd 1", () => {
    const config = buildLoggerConfig({ ...baseCfg, LOG_TRANSPORT: "stdout" });

    expect(config).toMatchObject({
      transport: {
        target: "pino/file",
        options: { destination: STDOUT_FD },
      },
    });
  });

  it("unknown transport → falls back to file", () => {
    const config = buildLoggerConfig({
      ...baseCfg,
      LOG_TRANSPORT: "nonsense",
      LOG_FILE: "logs/custom.log",
    });

    expect(config).toMatchObject({
      transport: {
        target: "pino/file",
        options: { destination: "logs/custom.log", mkdir: true },
      },
    });
  });

  it("propagates LOG_LEVEL", () => {
    const config = buildLoggerConfig({ ...baseCfg, LOG_LEVEL: "debug" });

    expect(config).toMatchObject({ level: "debug" });
  });
});
