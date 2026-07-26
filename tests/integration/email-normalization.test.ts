// INT (§11.2): единое правило приведения почты действует в обеих половинах
// среза. Уникальный индекс `users.email` регистрозависим, поэтому разница в
// регистре когда-то заводила человеку второй аккаунт: парольная половина писала
// адрес как пришёл, а провайдерская искала владельца по приведённому значению.
//
// Проверяются оба направления через настоящую базу: сначала аккаунт заводится
// паролем с заглавными буквами и опознаётся входом через провайдера, потом
// наоборот — аккаунт заводит провайдер, а регистрация паролем упирается в него.
import type { FastifyBaseLogger } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AppInstance } from "@/app.js";
import AuthRepository from "@/auth/auth.repository.js";
import type { AuthService } from "@/auth/auth.service.js";
import { AUTH_PROVIDER } from "@/auth/constant.js";
import IdentityRepository from "@/auth/identity.repository.js";
import { IdentityService } from "@/auth/identity.service.js";
import type { IAppleTokenClient } from "@/auth/providers/apple.client.js";
import type { ProviderProfile, VerifierRegistry } from "@/auth/providers/types.js";
import { getPrisma } from "@/config/prisma.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import UserRepository from "@/user/user.repository.js";

import { createTestApp, destroyTestApp } from "../helpers/app.js";

let app: AppInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await destroyTestApp(app);
});

const PASSWORD = "Passw0rd!";

const silentLogger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
} as unknown as FastifyBaseLogger;

const envelope = (entry: { code: number; message: string }) => ({
  code: entry.code,
  message: entry.message,
});

const googleProfile = (email: string, providerUserId = "google-sub-1"): ProviderProfile => ({
  provider: AUTH_PROVIDER.Google,
  providerUserId,
  email,
  emailVerified: true,
  firstName: "Кипер",
  lastName: "Кипер",
});

const registryOf = (profile: ProviderProfile): VerifierRegistry => {
  const verifier = { isConfigured: () => true, verify: async () => profile };
  return {
    [AUTH_PROVIDER.Google]: verifier,
    [AUTH_PROVIDER.Apple]: verifier,
    [AUTH_PROVIDER.Telegram]: verifier,
  };
};

// Сервис собирается на настоящих репозиториях: доказывать надо именно границу
// репозиториев, где живёт приведение почты. Выдача токенов и клиент Apple до
// проверяемой ветки не доходят, поэтому подменены заглушками — если ветка
// «владелец найден» сломается, тест упрётся в счётчик аккаунтов, а не в них.
function buildIdentityService(profile: ProviderProfile): IdentityService {
  const prisma = getPrisma();
  const tokens = { issueTokens: async () => ({ accessToken: "a", refreshToken: "r" }) };
  return new IdentityService(
    new IdentityRepository(prisma),
    new UserRepository(prisma),
    new AuthRepository(prisma),
    tokens as unknown as AuthService,
    registryOf(profile),
    {
      exchange: async () => appErrorCodes.AUTH_PROVIDER_UNAVAILABLE,
    } as unknown as IAppleTokenClient,
    silentLogger,
    null,
  );
}

const register = (email: string) =>
  app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: PASSWORD, name: "Кипер", birthDate: "1990-01-01" },
  });

const login = (email: string) =>
  app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: PASSWORD } });

describe("пароль завёл аккаунт с заглавными буквами", () => {
  it("вход через провайдера с тем же адресом попадает в тот же аккаунт", async () => {
    const prisma = getPrisma();

    const created = await register("Keeper@Example.com");
    expect(created.statusCode).toBe(201);
    const userId = (created.json() as { user: { id: number } }).user.id;

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(stored.email).toBe("keeper@example.com");

    const outcome = await buildIdentityService(
      googleProfile("Keeper@Example.com"),
    ).loginWithProvider(AUTH_PROVIDER.Google, {});

    // Владелец найден: человеку предлагают подтвердить владение, а не заводят
    // ему второй аккаунт на тот же адрес.
    expect(outcome).toMatchObject({ status: "link_required", provider: AUTH_PROVIDER.Google });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.authIdentity.count()).toBe(0);
  });

  it("вход паролем работает при любом регистре введённого адреса", async () => {
    const created = await register("Keeper@Example.com");
    expect(created.statusCode).toBe(201);
    const userId = (created.json() as { user: { id: number } }).user.id;

    const upper = await login("KEEPER@EXAMPLE.COM");
    expect(upper.statusCode).toBe(200);
    expect((upper.json() as { user: { id: number } }).user.id).toBe(userId);

    const lower = await login("keeper@example.com");
    expect(lower.statusCode).toBe(200);
    expect((lower.json() as { user: { id: number } }).user.id).toBe(userId);
  });
});

describe("провайдер завёл аккаунт с заглавными буквами", () => {
  it("регистрация паролем с тем же адресом не заводит второй аккаунт", async () => {
    const prisma = getPrisma();

    const created = await new IdentityRepository(prisma).createUserWithIdentity(
      googleProfile("Owner@Example.com", "google-sub-2"),
    );
    expect(created).not.toBeNull();
    expect(typeof created).not.toBe("string");
    const owner = await prisma.user.findFirstOrThrow();
    expect(owner.email).toBe("owner@example.com");

    const lower = await register("owner@example.com");
    expect(lower.json()).toEqual(envelope(appErrorCodes.USER_EMAIL_DUPLICATED));

    // Зеркальный случай: тот же адрес, набранный заглавными, тоже опознаётся.
    const upper = await register("OWNER@EXAMPLE.COM");
    expect(upper.json()).toEqual(envelope(appErrorCodes.USER_EMAIL_DUPLICATED));

    expect(await prisma.user.count()).toBe(1);
  });
});
