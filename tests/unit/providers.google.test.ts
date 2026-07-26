// UNIT (§11.1): проверка клеймов Google ID-токена и сборка профиля.
// Подпись настоящая, но локальная: пара ключей генерируется здесь, JWT собирается
// руками, загрузчик JWKS подставляется фабрикой. Сокетов ни один кейс не открывает.

import { createSign, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { AUTH_PROVIDER } from "@/auth/constant.js";
import { createGoogleVerifier } from "@/auth/providers/google.js";
import { createRs256Verifier, type JwksLoader } from "@/auth/providers/jwks.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";

const KID = "google-kid";
const CLIENT_IDS = ["ios.apps.googleusercontent.com", "web.apps.googleusercontent.com"];
const ISSUER = "https://accounts.google.com";
const SECONDS_PER_HOUR = 3600;

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
const loader: JwksLoader = async () => ({ keys: [jwk] });

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function signIdToken(claims: Record<string, unknown>): string {
  const payload = {
    iss: ISSUER,
    aud: CLIENT_IDS[0],
    exp: nowSec() + SECONDS_PER_HOUR,
    sub: "google-sub-1",
    ...claims,
  };
  const signingInput = `${encodeSegment({ alg: "RS256", kid: KID, typ: "JWT" })}.${encodeSegment(payload)}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  return `${signingInput}.${signature.toString("base64url")}`;
}

function makeVerifier(clientIds: string[] = CLIENT_IDS) {
  return createGoogleVerifier({ rs256: createRs256Verifier(loader), clientIds });
}

describe("google: обязательные проверки клеймов", () => {
  it("отвергает чужой aud", async () => {
    const result = await makeVerifier().verify({
      idToken: signIdToken({ aud: "attacker.apps.googleusercontent.com" }),
    });

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  it("отвергает чужой iss", async () => {
    const result = await makeVerifier().verify({
      idToken: signIdToken({ iss: "https://accounts.evil.test" }),
    });

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  it("отвергает истёкший exp", async () => {
    const result = await makeVerifier().verify({
      idToken: signIdToken({ exp: nowSec() - SECONDS_PER_HOUR }),
    });

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  it("принимает второй iss из списка легальных", async () => {
    const result = await makeVerifier().verify({
      idToken: signIdToken({ iss: "accounts.google.com" }),
    });

    expect(result).toMatchObject({ providerUserId: "google-sub-1" });
  });

  // Прямая фиксация того, что aud сверяется со списком: у мобильного клиента
  // идентификаторы разные для iOS, Android и веба.
  it("принимает aud, совпавший со вторым значением списка", async () => {
    const result = await makeVerifier().verify({ idToken: signIdToken({ aud: CLIENT_IDS[1] }) });

    expect(result).toMatchObject({ providerUserId: "google-sub-1" });
  });

  it("пропускает наружу конверт ошибки проверки подписи", async () => {
    const verifier = createGoogleVerifier({
      rs256: createRs256Verifier(async () => appErrorCodes.AUTH_PROVIDER_UNAVAILABLE),
      clientIds: CLIENT_IDS,
    });

    const result = await verifier.verify({ idToken: signIdToken({}) });

    expect(result).toEqual(appErrorCodes.AUTH_PROVIDER_UNAVAILABLE);
  });

  it("отвергает credential без строкового idToken, не бросая", async () => {
    const verifier = makeVerifier();

    expect(await verifier.verify({})).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
    expect(await verifier.verify(null)).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });
});

describe("google: профиль", () => {
  it("собирает профиль из клеймов валидного токена", async () => {
    const result = await makeVerifier().verify({
      idToken: signIdToken({
        email: "player@example.com",
        email_verified: true,
        given_name: "Ada",
        family_name: "Lovelace",
        picture: "https://lh3.googleusercontent.com/a/photo",
      }),
    });

    expect(result).toEqual({
      provider: AUTH_PROVIDER.Google,
      providerUserId: "google-sub-1",
      email: "player@example.com",
      emailVerified: true,
      firstName: "Ada",
      lastName: "Lovelace",
      avatar: "https://lh3.googleusercontent.com/a/photo",
    });
  });

  // §11.5: слияния по почте не произойдёт ни при каких условиях (правило 2 §9.4.5).
  it("доносит email_verified: false до профиля", async () => {
    const result = await makeVerifier().verify({
      idToken: signIdToken({ email: "player@example.com", email_verified: false }),
    });

    expect(result).toMatchObject({ email: "player@example.com", emailVerified: false });
  });

  it("считает отсутствие клейма email_verified неподтверждённой почтой", async () => {
    const result = await makeVerifier().verify({
      idToken: signIdToken({ email: "player@example.com" }),
    });

    expect(result).toMatchObject({ emailVerified: false });
  });
});

describe("google: настроенность", () => {
  it("не настроен при пустом списке client ID", () => {
    expect(makeVerifier([]).isConfigured()).toBe(false);
    expect(makeVerifier().isConfigured()).toBe(true);
  });
});
