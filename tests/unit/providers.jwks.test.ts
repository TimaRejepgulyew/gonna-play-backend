// UNIT (§11.1): проверка RS256 и поведение кеша ключей без сети.
// Ключи настоящие, но локальные: пара генерируется здесь, JWT собирается руками,
// загрузчик JWKS подставляется фабрикой. Ни один кейс не открывает сокет.

import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createRs256Verifier, type JwksLoader, type JwksSet } from "@/auth/providers/jwks.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";

const JWKS_URL = "https://example.test/keys";
const KID = "kid-primary";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signJwt(payload: object, header: object = { alg: "RS256", kid: KID, typ: "JWT" }): string {
  const signingInput = `${encodeSegment(header)}.${encodeSegment(payload)}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

// Загрузчик с собственным счётчиком: тесты кеша ассертят именно число вызовов.
function makeLoader(set: JwksSet = { keys: [jwk] }): JwksLoader & { calls: string[] } {
  const calls: string[] = [];
  const loader = async (url: string) => {
    calls.push(url);
    return set;
  };
  return Object.assign(loader, { calls });
}

describe("jwks: проверка подписи", () => {
  it("принимает валидный токен и отдаёт клеймы", async () => {
    const verifier = createRs256Verifier(makeLoader());

    const result = await verifier.verify(signJwt({ sub: "user-1", email: "a@b.c" }), JWKS_URL);

    expect(result).toEqual({ sub: "user-1", email: "a@b.c" });
  });

  it("отвергает токен с подменённым пейлоадом", async () => {
    const verifier = createRs256Verifier(makeLoader());
    const [header, , signature] = signJwt({ sub: "user-1" }).split(".");
    const forged = `${header}.${encodeSegment({ sub: "attacker" })}.${signature}`;

    const result = await verifier.verify(forged, JWKS_URL);

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  // Алгоритм берётся из собственного allowlist: доверять заголовку нельзя, иначе
  // alg: none и HS256 на публичном ключе как секрете проходят проверку.
  it("отвергает токен с alg: none в заголовке", async () => {
    const verifier = createRs256Verifier(makeLoader());
    const header = encodeSegment({ alg: "none", kid: KID });
    const payload = encodeSegment({ sub: "attacker" });

    const result = await verifier.verify(`${header}.${payload}.`, JWKS_URL);

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  it("отвергает токен, у которого подпись RS256, а заголовок объявляет HS256", async () => {
    const verifier = createRs256Verifier(makeLoader());
    const token = signJwt({ sub: "user-1" }, { alg: "HS256", kid: KID, typ: "JWT" });

    const result = await verifier.verify(token, JWKS_URL);

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  it("отвергает токен не из трёх сегментов и мусор вне алфавита base64url", async () => {
    const verifier = createRs256Verifier(makeLoader());

    expect(await verifier.verify("a.b", JWKS_URL)).toEqual(
      appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID,
    );
    expect(await verifier.verify("a.b.c.d", JWKS_URL)).toEqual(
      appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID,
    );
    expect(await verifier.verify("a b.c!.d", JWKS_URL)).toEqual(
      appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID,
    );
  });
});

describe("jwks: кеш ключей", () => {
  it("в пределах TTL загрузчика не дёргает", async () => {
    const loader = makeLoader();
    const verifier = createRs256Verifier(loader);
    const token = signJwt({ sub: "user-1" });

    await verifier.verify(token, JWKS_URL);
    await verifier.verify(token, JWKS_URL);

    expect(loader.calls).toEqual([JWKS_URL]);
  });

  it("на неизвестный kid делает ровно один перезапрос, второй промах даёт ошибку", async () => {
    const loader = makeLoader();
    const verifier = createRs256Verifier(loader);

    await verifier.verify(signJwt({ sub: "user-1" }), JWKS_URL);
    const result = await verifier.verify(
      signJwt({ sub: "user-1" }, { alg: "RS256", kid: "kid-rotated", typ: "JWT" }),
      JWKS_URL,
    );

    expect(loader.calls).toHaveLength(2);
    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  it("не кеширует неудачу: следующий вызов пробует загрузить снова", async () => {
    const calls: string[] = [];
    const loader: JwksLoader = async (url) => {
      calls.push(url);
      return appErrorCodes.AUTH_PROVIDER_UNAVAILABLE;
    };
    const verifier = createRs256Verifier(loader);
    const token = signJwt({ sub: "user-1" });

    await verifier.verify(token, JWKS_URL);
    await verifier.verify(token, JWKS_URL);

    expect(calls).toHaveLength(2);
  });
});

describe("jwks: недоступность провайдера", () => {
  it("превращает бросок загрузчика в AUTH_PROVIDER_UNAVAILABLE, а не в исключение", async () => {
    const verifier = createRs256Verifier(async () => {
      throw Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    });

    const result = await verifier.verify(signJwt({ sub: "user-1" }), JWKS_URL);

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_UNAVAILABLE);
  });

  it("пропускает конверт ошибки загрузчика наружу как есть", async () => {
    const verifier = createRs256Verifier(async () => appErrorCodes.AUTH_PROVIDER_UNAVAILABLE);

    const result = await verifier.verify(signJwt({ sub: "user-1" }), JWKS_URL);

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_UNAVAILABLE);
  });
});
