// INT-01…INT-03 (§11.2): логин админа, неразличимость ошибок логина и отказ
// приватного роута без токена. Одно приложение на файл (§9.7, §12): beforeAll
// строит его один раз, beforeEach из integration-setup чистит базу перед каждым тестом.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppInstance } from "@/app.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import type { JwtPayload } from "@/plugins/auth.js";
import { createActor } from "../helpers/actors.js";
import { createTestApp, destroyTestApp } from "../helpers/app.js";

let app: AppInstance;

/** Читает payload JWT без проверки подписи: тесту нужны только claims. */
function decodeJwtPayload(token: string): JwtPayload {
  const segment = token.split(".")[1];
  if (!segment) throw new Error(`Not a JWT: ${token}`);
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as JwtPayload;
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await destroyTestApp(app);
});

describe("POST /api/auth/login", () => {
  // INT-01
  it("возвращает 200, тело по authSuccessSchema и токен с ролью admin", async () => {
    // Роли создаются до логина — иначе payload их не увидит (см. actors.ts).
    const actor = await createActor(app, { roles: ["admin"] });

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: actor.email, password: actor.password },
    });

    expect(res.statusCode).toBe(200);

    // Форма тела — authSuccessSchema (src/auth/auth.model.ts:12-16).
    const body = res.json() as {
      user: { id: number; email: string; name?: string; playerId?: number };
      accessToken: string;
      refreshToken: string;
    };
    expect(body.user.id).toBe(actor.userId);
    expect(body.user.email).toBe(actor.email);
    expect(typeof body.accessToken).toBe("string");
    expect(typeof body.refreshToken).toBe("string");

    // Ключевая ассерта задачи: роль реально попала в подписанный payload,
    // то есть createActor выдал её ДО логина, а не после.
    const payload = decodeJwtPayload(body.accessToken);
    expect(payload.sub).toBe(actor.userId);
    expect(payload.email).toBe(actor.email);
    expect(payload.roles).toContain("admin");
  });

  // INT-02
  it("отвечает одинаковым телом на неизвестный email и на неверный пароль", async () => {
    const actor = await createActor(app);

    const unknownEmail = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@test.local", password: actor.password },
    });

    const wrongPassword = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: actor.email, password: "WrongPassw0rd!" },
    });

    // Неразличимость: сервис возвращает один и тот же код на обе ветки
    // (src/auth/auth.service.ts:169-171), иначе логин становится оракулом
    // существования учётной записи.
    const expected = {
      code: appErrorCodes.AUTH_INVALID_CREDENTIALS.code,
      message: appErrorCodes.AUTH_INVALID_CREDENTIALS.message,
    };

    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.json()).toEqual(expected);
    expect(wrongPassword.json()).toEqual(expected);
  });
});

describe("приватный роут без токена", () => {
  // INT-03
  it("POST /api/match/ без заголовка Authorization даёт 401 AUTH_TOKEN_INVALID", async () => {
    // Тело валидное намеренно: validation в Fastify идёт ДО preHandler, и с
    // невалидным телом ответ пришёл бы 400 от TypeBox, а не от декоратора
    // authenticate (src/plugins/auth.ts:39-68), который здесь и проверяется.
    // Матчевый роут взят лишь как удобная приватная точка.
    const res = await app.inject({
      method: "POST",
      url: "/api/match/",
      payload: {
        fieldId: 1,
        title: "no-auth probe",
        startsAt: new Date(Date.now() + 86_400_000).toISOString(),
        format: "FIVE",
        minPlayers: 6,
        maxPlayers: 10,
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      code: appErrorCodes.AUTH_TOKEN_INVALID.code,
      message: appErrorCodes.AUTH_TOKEN_INVALID.message,
    });
  });
});
