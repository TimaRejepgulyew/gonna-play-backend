import { describe, expect, it } from "vitest";
import { buildLoggerConfig, REDACT_PATHS } from "@/config/logger.js";

const STDOUT_FD = 1;

// Своя копия состава (§13): выпавший из src путь роняет сверку, а не проходит незамеченным.
const EXPECTED_REDACT_PATHS = [
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
];

type RedactConfig = {
  redact: { paths: string[]; censor?: unknown; remove?: boolean };
};

const baseCfg = {
  LOG_LEVEL: "info",
  LOG_TRANSPORT: "file",
  LOG_FILE: "logs/app.log",
};

const redactOf = () => (buildLoggerConfig(baseCfg) as unknown as RedactConfig).redact;

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

describe("buildLoggerConfig redaction", () => {
  it("redact.paths совпадает с REDACT_PATHS как множество", () => {
    expect(new Set(redactOf().paths)).toEqual(new Set(REDACT_PATHS));
  });

  it("содержит каждый путь из состава §13", () => {
    const paths = redactOf().paths;

    for (const expected of EXPECTED_REDACT_PATHS) {
      expect(paths).toContain(expected);
    }
    expect(paths).toHaveLength(EXPECTED_REDACT_PATHS.length);
  });

  it.each([
    "err.idToken",
    "err.body",
    "req.body.password",
    "req.headers.authorization",
    "*.authorizationCode",
    "*.hash",
    "*.client_secret",
    "*.refresh_token",
  ])("покрывает %s", (path) => {
    expect(redactOf().paths).toContain(path);
  });

  it("code не редактируется: это числовой статус конверта ошибки", () => {
    expect(redactOf().paths).not.toContain("code");
  });

  it("censor задан непустой строкой, remove не выставлен в true", () => {
    const redact = redactOf();

    expect(typeof redact.censor).toBe("string");
    expect(redact.censor).not.toBe("");
    expect(redact.remove).not.toBe(true);
  });
});
