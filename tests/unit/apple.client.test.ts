// UNIT (§11.1): сборка client secret и оба запроса к Apple без сети.
// Ключ настоящий, но локальный: пара P-256 генерируется здесь, транспорт
// подменяется штатным швом setHttp(). Ни один кейс не открывает сокет и не
// содержит ни одного значения из реального аккаунта Apple.

import { createVerify, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HttpClient, HttpOutcome, HttpRequest } from "@/utils/http.js";

const CLIENT_ID = "com.example.gonnaplay.test";
const TEAM_ID = "TEAMTEST01";
const KEY_ID = "KEYTEST001";
const REDIRECT_URI = "https://example.test/auth/apple/callback";
const APPLE_MAX_SECRET_TTL_SEC = 15_777_000;
const AUTHORIZATION_CODE = "c-authorization-code";
const REFRESH_TOKEN = "r-refresh-token";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();

// src/config/env.ts снимает process.env один раз, на импорте модуля, а
// setupFiles успевают импортировать его до тела файла. Поэтому значения
// ставятся здесь, а модули берутся сброшенным реестром — иначе Apple остался
// бы ненастроенным, каким его видит общий прогон.
process.env.APPLE_CLIENT_ID = CLIENT_ID;
process.env.APPLE_TEAM_ID = TEAM_ID;
process.env.APPLE_KEY_ID = KEY_ID;
process.env.APPLE_PRIVATE_KEY = privateKeyPem;
process.env.APPLE_REDIRECT_URI = "";
process.env.AUTH_SECRET_KEY = Buffer.alloc(32, 7).toString("base64");

vi.resetModules();

const { buildAppleClientSecret } = await import("@/auth/providers/apple.secret.js");
const { createAppleTokenClient } = await import("@/auth/providers/apple.client.js");
const { setHttp } = await import("@/utils/http.js");
const { errorCodes: appErrorCodes } = await import("@/constants/index.js");

interface LogRecord {
  level: "warn" | "error";
  fields: unknown;
  message: string;
}

function makeLogger(): { records: LogRecord[] } & Record<string, unknown> {
  const records: LogRecord[] = [];
  const record = (level: "warn" | "error") => (fields: unknown, message: string) => {
    records.push({ level, fields, message });
  };
  return { records, warn: record("warn"), error: record("error") };
}

// Транспорт отдаёт заготовленные исходы по очереди и запоминает запросы:
// именно на записанных запросах проверяется форма тела.
function stubHttp(...outcomes: HttpOutcome[]): HttpRequest[] {
  const calls: HttpRequest[] = [];
  const client: HttpClient = {
    send: async (request) => {
      calls.push(request);
      const next = outcomes.shift();
      if (next === undefined) throw new Error("stub: незапланированный запрос");
      return next;
    },
  };
  setHttp(client);
  return calls;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("apple client secret", () => {
  it("несёт заголовок ES256 с kid и клеймы из конфигурации", () => {
    const [header, claims] = buildAppleClientSecret().split(".");

    expect(decodeSegment(header)).toMatchObject({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
    expect(decodeSegment(claims)).toMatchObject({
      iss: TEAM_ID,
      aud: "https://appleid.apple.com",
      sub: CLIENT_ID,
    });
  });

  it("живёт положительный срок и не превышает потолок Apple", () => {
    const claims = decodeSegment(buildAppleClientSecret().split(".")[1]);
    const ttl = (claims.exp as number) - (claims.iat as number);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(APPLE_MAX_SECRET_TTL_SEC);
  });

  // Проверяется настоящая криптография: публичный ключ пары, сгенерированной
  // здесь же, и кодировка ieee-p1363. Форма строки ничего не доказала бы —
  // подпись в DER выглядит так же, а Apple отвечает на неё invalid_client.
  it("подписан ключом в кодировке ieee-p1363 и проверяется публичным ключом", () => {
    const secret = buildAppleClientSecret();
    const [header, claims, signature] = secret.split(".");

    const verified = createVerify("sha256")
      .update(`${header}.${claims}`)
      .verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));

    expect(verified).toBe(true);
  });

  it("не проходит проверку тем же ключом в кодировке DER", () => {
    const [header, claims, signature] = buildAppleClientSecret().split(".");

    const asDer = createVerify("sha256")
      .update(`${header}.${claims}`)
      .verify({ key: publicKey, dsaEncoding: "der" }, Buffer.from(signature, "base64url"));

    expect(asDer).toBe(false);
  });
});

describe("apple token client: обмен кода", () => {
  beforeEach(() => {
    process.env.APPLE_REDIRECT_URI = "";
  });

  it("отдаёт refreshToken и ничего сверх него", async () => {
    const calls = stubHttp({
      ok: true,
      status: 200,
      body: JSON.stringify({
        access_token: "a-access-token",
        id_token: "i-id-token",
        expires_in: 3600,
        refresh_token: REFRESH_TOKEN,
        token_type: "Bearer",
      }),
    });

    const result = await createAppleTokenClient().exchange(AUTHORIZATION_CODE);

    expect(result).toEqual({ refreshToken: REFRESH_TOKEN });
    expect(JSON.stringify(result)).not.toContain("a-access-token");
    expect(JSON.stringify(result)).not.toContain("i-id-token");
    expect(calls[0].url).toBe("https://appleid.apple.com/auth/token");
  });

  it("уходит формой с grant_type и без redirect_uri, пока адрес пуст", async () => {
    const calls = stubHttp({
      ok: true,
      status: 200,
      body: JSON.stringify({ refresh_token: REFRESH_TOKEN }),
    });

    await createAppleTokenClient().exchange(AUTHORIZATION_CODE);

    expect(calls[0].method).toBe("POST");
    expect(calls[0].form).toMatchObject({
      client_id: CLIENT_ID,
      code: AUTHORIZATION_CODE,
      grant_type: "authorization_code",
    });
    expect(calls[0].form?.client_secret).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(calls[0].form).not.toHaveProperty("redirect_uri");
  });

  it("подставляет redirect_uri, когда он задан", async () => {
    const calls = stubHttp({
      ok: true,
      status: 200,
      body: JSON.stringify({ refresh_token: REFRESH_TOKEN }),
    });

    await createAppleTokenClient({ redirectUri: REDIRECT_URI }).exchange(AUTHORIZATION_CODE);

    expect(calls[0].form?.redirect_uri).toBe(REDIRECT_URI);
  });

  it("превращает 400 invalid_grant в конверт ошибки и не пишет форму в лог", async () => {
    stubHttp({ ok: true, status: 400, body: JSON.stringify({ error: "invalid_grant" }) });
    const logger = makeLogger();

    const result = await createAppleTokenClient({ logger: logger as never }).exchange(
      AUTHORIZATION_CODE,
    );

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
    expect(logger.records).toHaveLength(1);
    expect(logger.records[0].fields).toEqual({ status: 400, error: "invalid_grant" });
    expect(JSON.stringify(logger.records)).not.toContain(AUTHORIZATION_CODE);
  });

  it("превращает таймаут в конверт ошибки, а не в бросок", async () => {
    stubHttp({ ok: false, failure: "timeout" });

    const result = await createAppleTokenClient().exchange(AUTHORIZATION_CODE);

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_UNAVAILABLE);
  });

  it("считает ответ без refresh_token недоступностью провайдера", async () => {
    stubHttp({ ok: true, status: 200, body: JSON.stringify({ access_token: "a-access-token" }) });

    const result = await createAppleTokenClient().exchange(AUTHORIZATION_CODE);

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_UNAVAILABLE);
  });
});

describe("apple token client: отзыв доступа", () => {
  it("считает 200 с пустым телом успехом и шлёт token_type_hint формой", async () => {
    const calls = stubHttp({ ok: true, status: 200, body: "" });

    const revoked = await createAppleTokenClient().revoke(REFRESH_TOKEN);

    expect(revoked).toBe(true);
    expect(calls[0].url).toBe("https://appleid.apple.com/auth/revoke");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].form).toMatchObject({
      client_id: CLIENT_ID,
      token: REFRESH_TOKEN,
      token_type_hint: "refresh_token",
    });
    // Формой, а не JSON: у транспорта тело JSON не выражается вовсе, поэтому
    // доказательством служит заполненный form и отсутствие иного поля тела.
    expect(Object.keys(calls[0])).not.toContain("body");
  });

  it("на 400 отдаёт false и пишет ошибку без токена в полях", async () => {
    stubHttp({ ok: true, status: 400, body: JSON.stringify({ error: "invalid_client" }) });
    const logger = makeLogger();

    const revoked = await createAppleTokenClient({ logger: logger as never }).revoke(REFRESH_TOKEN);

    expect(revoked).toBe(false);
    expect(logger.records).toEqual([
      {
        level: "error",
        fields: { status: 400, error: "invalid_client" },
        message: expect.any(String),
      },
    ]);
    expect(JSON.stringify(logger.records)).not.toContain(REFRESH_TOKEN);
  });

  it("на таймаут отдаёт false, а не бросает", async () => {
    stubHttp({ ok: false, failure: "timeout" });

    await expect(createAppleTokenClient().revoke(REFRESH_TOKEN)).resolves.toBe(false);
  });
});

// Пустой или испорченный APPLE_PRIVATE_KEY роняет createPrivateKey внутри
// сборки секрета. Интерфейс обещает возврат, а не бросок, поэтому обе операции
// обязаны отдать штатный отказ и в сеть не пойти вовсе.
describe("apple token client: сборка секрета сорвалась", () => {
  const throwing = (): string => {
    throw new Error("no key: secret-material-marker");
  };

  it("обмен кода отдаёт недоступность провайдера и не шлёт запрос", async () => {
    const calls = stubHttp();
    const logger = makeLogger();

    const result = await createAppleTokenClient({
      logger: logger as never,
      buildClientSecret: throwing,
    }).exchange(AUTHORIZATION_CODE);

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_UNAVAILABLE);
    expect(calls).toHaveLength(0);
    expect(logger.records).toHaveLength(1);
    expect(logger.records[0].level).toBe("error");
    // Сообщение криптографии способно нести обрывки ключа — в поля оно не идёт.
    expect(JSON.stringify(logger.records)).not.toContain("secret-material-marker");
  });

  it("отзыв доступа отдаёт false, а не бросает, и не шлёт запрос", async () => {
    const calls = stubHttp();
    const logger = makeLogger();

    const revoked = await createAppleTokenClient({
      logger: logger as never,
      buildClientSecret: throwing,
    }).revoke(REFRESH_TOKEN);

    expect(revoked).toBe(false);
    expect(calls).toHaveLength(0);
    expect(logger.records).toHaveLength(1);
    expect(JSON.stringify(logger.records)).not.toContain("secret-material-marker");
  });
});

// src/config/env.ts читает process.env один раз, на импорте, поэтому гвард
// проверяется повторным импортом на сброшенном реестре модулей.
describe("apple: гвард настроенности при старте", () => {
  async function importEnvWith(overrides: Record<string, string>): Promise<void> {
    const saved = Object.keys(overrides).map((key): [string, string | undefined] => [
      key,
      process.env[key],
    ]);
    Object.assign(process.env, overrides);
    vi.resetModules();
    try {
      await import("@/config/env.js");
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      vi.resetModules();
    }
  }

  it("роняет старт, когда задан только APPLE_CLIENT_IDS без ключей Apple", async () => {
    await expect(
      importEnvWith({ APPLE_CLIENT_ID: "", APPLE_CLIENT_IDS: CLIENT_ID, APPLE_PRIVATE_KEY: "" }),
    ).rejects.toThrow(/APPLE_CLIENT_ID, APPLE_PRIVATE_KEY/);
  });

  it("стартует, когда APPLE_CLIENT_IDS задан вместе с полным набором ключей", async () => {
    await expect(importEnvWith({ APPLE_CLIENT_IDS: CLIENT_ID })).resolves.toBeUndefined();
  });
});

describe("apple token client: транспорт", () => {
  it("не зовёт fetch напрямую ни в одной строке файла", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../src/auth/providers/apple.client.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toMatch(/\bfetch\s*\(/);
  });
});
