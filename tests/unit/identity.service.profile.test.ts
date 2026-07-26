// UNIT (§11.1, §9.5.4): импорт профиля при входе через провайдера — признак
// готовности анкеты, нормализация почты и столкновение по уникальной почте.
// Отдельный файл, а не дополнение identity.service.test.ts: тот уже занимает
// 277 строк при пороге 300 (docs/wiki/conventions.md:91).

import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import type AuthRepository from "@/auth/auth.repository.js";
import { AuthService, type TokenSigner } from "@/auth/auth.service.js";
import { AUTH_PROVIDER } from "@/auth/constant.js";
import { IdentityService } from "@/auth/identity.service.js";
import type { IAppleTokenClient } from "@/auth/providers/apple.client.js";
import type { ProviderProfile, VerifierRegistry } from "@/auth/providers/types.js";
import { errorCodes } from "@/constants/index.js";
import type PlayerRepository from "@/player/player.repository.js";
import { type ErrorResponse, Prisma } from "@/types/prisma.js";
import type { UpdateUser } from "@/user/types.js";
import type UserRepository from "@/user/user.repository.js";

import { createFakeAuthRepository, createFakeIdentityRepository } from "./doubles/repositories.js";

const SECRET_KEY = Buffer.alloc(32, 5);
const BIRTH_DATE = "1990-05-01";

const silentLogger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
} as unknown as FastifyBaseLogger;

const googleProfile: ProviderProfile = {
  provider: AUTH_PROVIDER.Google,
  providerUserId: "g-1",
  // Регистр намеренно чужой: почта провайдера приходит как попало.
  email: "Keeper@Example.COM",
  emailVerified: true,
  firstName: "Given",
  avatar: "https://cdn.test/a.png",
};

interface FakeUserRow {
  id: number;
  email?: string | null;
  name?: string | null;
  birthDate?: string | null;
  firstName?: string;
  avatar?: string;
}

/** Отказ уникального индекса `users.email` ровно в том виде, в каком его бросает Prisma. */
const emailTakenError = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.0.0",
    meta: { target: ["email"] },
  });

function createFakeUserRepository() {
  const rows = new Map<number, FakeUserRow>();
  const updates: UpdateUser[] = [];
  let refuseEmail = false;
  return {
    rows,
    updates,
    /** С этого момента любая запись почты отвергается уникальным индексом. */
    refuseEmailWrites() {
      refuseEmail = true;
    },
    async getUser(id: number) {
      const row = rows.get(id);
      return row ? { ...row } : null;
    },
    async updateUser(patch: UpdateUser) {
      updates.push(patch);
      if (refuseEmail && patch.email !== undefined) throw emailTakenError();
      const row = rows.get(patch.id) ?? { id: patch.id };
      rows.set(patch.id, { ...row, ...patch });
      return rows.get(patch.id);
    },
  };
}

const registryOf = (outcome: ProviderProfile | ErrorResponse): VerifierRegistry => {
  const verifier = { isConfigured: () => true, verify: async () => outcome };
  return {
    [AUTH_PROVIDER.Google]: verifier,
    [AUTH_PROVIDER.Apple]: verifier,
    [AUTH_PROVIDER.Telegram]: verifier,
  };
};

describe("IdentityService profile import", () => {
  const identityRepository = createFakeIdentityRepository();
  const authRepository = createFakeAuthRepository();
  let userRepository: ReturnType<typeof createFakeUserRepository>;
  let signed: object[];

  const build = (
    outcome: ProviderProfile | ErrorResponse = googleProfile,
    repository = identityRepository,
  ): IdentityService => {
    const jwt: TokenSigner = {
      sign(payload) {
        signed.push(payload);
        return `token-${signed.length}`;
      },
      verify() {
        throw new Error("verify() не участвует во входе через провайдера");
      },
    };
    const authService = new AuthService(
      authRepository as unknown as AuthRepository,
      {} as UserRepository,
      {} as PlayerRepository,
      jwt,
      silentLogger,
    );
    const appleTokens: IAppleTokenClient = {
      exchange: async () => errorCodes.AUTH_PROVIDER_UNAVAILABLE,
      revoke: async () => true,
    };
    return new IdentityService(
      repository,
      userRepository as unknown as UserRepository,
      authRepository,
      authService,
      registryOf(outcome),
      appleTokens,
      silentLogger,
      SECRET_KEY,
    );
  };

  const seedIdentity = (userId: number) =>
    identityRepository.identities.seed({
      id: 1,
      userId,
      provider: AUTH_PROVIDER.Google,
      providerUserId: googleProfile.providerUserId,
      email: null,
      username: null,
      lastLoginAt: null,
      createdAt: new Date(),
      refreshTokenEncrypted: null,
    });

  beforeEach(() => {
    identityRepository.reset();
    authRepository.reset();
    userRepository = createFakeUserRepository();
    signed = [];
  });

  // §9.5.4: клиент узнаёт о неполной анкете только из этого признака, другого
  // механизма дозаполнения задача не вводит.
  it("reports profile completeness of the account it logs in", async () => {
    userRepository.rows.set(4, { id: 4, email: "known@example.com", birthDate: BIRTH_DATE });
    seedIdentity(4);

    const known = await build().loginWithProvider(AUTH_PROVIDER.Google, {});

    expect(known).toMatchObject({ user: { id: 4, profileComplete: true } });
  });

  it("reports an unfinished profile for an account created by the provider", async () => {
    const fresh = await build().loginWithProvider(AUTH_PROVIDER.Google, {});

    expect(fresh).toMatchObject({ user: { profileComplete: false } });
  });

  // Регистр почты провайдера не должен заводить второй аккаунт: пишем и ищем
  // одинаково, в нижнем регистре.
  it("imports the provider email in lower case", async () => {
    userRepository.rows.set(4, { id: 4, name: "Мой ник" });
    seedIdentity(4);

    await build().loginWithProvider(AUTH_PROVIDER.Google, {});

    expect(userRepository.updates[0]).toMatchObject({ email: "keeper@example.com" });
  });

  // Почта провайдера могла достаться другому аккаунту, пока этот входил:
  // уникальный индекс `users.email` — не повод отвечать пятисоткой на вход.
  it("keeps the login working when the provider email is already taken", async () => {
    userRepository.rows.set(4, { id: 4, name: "Мой ник" });
    userRepository.refuseEmailWrites();
    seedIdentity(4);

    const result = await build().loginWithProvider(AUTH_PROVIDER.Google, {});

    expect(result).toMatchObject({ user: { id: 4 }, accessToken: "token-1" });
    // Первая попытка с почтой отвергнута, вторая довезла остальные поля.
    expect(userRepository.updates).toHaveLength(2);
    expect(userRepository.updates[1]).toEqual({
      id: 4,
      firstName: "Given",
      avatar: googleProfile.avatar,
    });
    expect(result).toMatchObject({ user: { email: undefined } });
  });

  // Занята почта, а не способ входа: ответ обязан говорить именно об этом,
  // иначе человек читает «привязано к другому пользователю» и упирается в тупик.
  it("answers that the email is taken when the account cannot be created", async () => {
    const repository = {
      ...identityRepository,
      createUserWithIdentity: async () => "email_taken" as const,
    };

    const result = await build(googleProfile, repository).loginWithProvider(
      AUTH_PROVIDER.Google,
      {},
    );

    expect(result).toEqual(errorCodes.USER_EMAIL_DUPLICATED);
  });
});
