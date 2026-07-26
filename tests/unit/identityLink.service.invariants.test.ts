// UNIT (§11.1): инварианты привязки и отвязки — одна запись на провайдера у
// пользователя (docs/wiki/data-model.md, AuthIdentity), согласованность подсчёта остатка с
// удалением и признак готовности анкеты в успешном ответе (§9.5.4).
// Отдельный файл, а не дополнение identityLink.service.test.ts: тот уже
// занимает 329 строк при пороге 300 (docs/wiki/conventions.md:91).

import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import type AuthRepository from "@/auth/auth.repository.js";
import { AuthService, type TokenSigner } from "@/auth/auth.service.js";
import { AUTH_PROVIDER } from "@/auth/constant.js";
import { IdentityLinkService } from "@/auth/identityLink.service.js";
import * as linkTicket from "@/auth/linkTicket.js";
import { hashToStorage } from "@/auth/password.js";
import type { IAppleTokenClient } from "@/auth/providers/apple.client.js";
import type { ProviderProfile, VerifierRegistry } from "@/auth/providers/types.js";
import { errorCodes } from "@/constants/index.js";
import type PlayerRepository from "@/player/player.repository.js";
import type { ErrorResponse } from "@/types/prisma.js";
import type UserRepository from "@/user/user.repository.js";

import { createFakeAuthRepository, createFakeIdentityRepository } from "./doubles/repositories.js";

const SECRET_KEY = Buffer.alloc(32, 5);
const OWNER_ID = 9;
const OWNER_EMAIL = "keeper@example.com";
const PASSWORD = "secret123";
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
  email: OWNER_EMAIL,
  emailVerified: true,
};

const telegramProfile: ProviderProfile = {
  provider: AUTH_PROVIDER.Telegram,
  providerUserId: "77",
  emailVerified: false,
  username: "vanya",
};

interface FakeUserRow {
  id: number;
  email?: string | null;
  name?: string | null;
  birthDate?: string | null;
}

function createFakeUserRepository() {
  const rows = new Map<number, FakeUserRow>();
  return {
    rows,
    async getUser(id: number) {
      const row = rows.get(id);
      return row ? { ...row } : null;
    },
  };
}

describe("IdentityLinkService invariants", () => {
  const identityRepository = createFakeIdentityRepository();
  const authRepository = createFakeAuthRepository();
  let userRepository: ReturnType<typeof createFakeUserRepository>;
  let verified: AUTH_PROVIDER[];
  let signed: object[];

  const registryOf = (outcome: ProviderProfile | ErrorResponse): VerifierRegistry => {
    const make = (provider: AUTH_PROVIDER) => ({
      isConfigured: () => true,
      verify: async () => {
        verified.push(provider);
        return outcome;
      },
    });
    return {
      [AUTH_PROVIDER.Google]: make(AUTH_PROVIDER.Google),
      [AUTH_PROVIDER.Apple]: make(AUTH_PROVIDER.Apple),
      [AUTH_PROVIDER.Telegram]: make(AUTH_PROVIDER.Telegram),
    };
  };

  const build = (
    outcome: ProviderProfile | ErrorResponse = telegramProfile,
    repository = identityRepository,
  ) => {
    const jwt: TokenSigner = {
      sign(payload) {
        signed.push(payload);
        return `token-${signed.length}`;
      },
      verify() {
        throw new Error("verify() не участвует в привязке способов входа");
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
    return new IdentityLinkService(
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

  const seedOwner = (password: string | null) => {
    authRepository.users.seed({
      id: OWNER_ID,
      email: OWNER_EMAIL,
      name: "Keeper",
      password,
      roles: [],
    });
    userRepository.rows.set(OWNER_ID, {
      id: OWNER_ID,
      email: OWNER_EMAIL,
      name: "Keeper",
      birthDate: BIRTH_DATE,
    });
  };

  const seedIdentity = (profile: ProviderProfile) =>
    identityRepository.identities.seed({
      id: identityRepository.identities.count() + 1,
      userId: OWNER_ID,
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      email: profile.email ?? null,
      username: profile.username ?? null,
      lastLoginAt: null,
      createdAt: new Date(),
      refreshTokenEncrypted: null,
    });

  const issueTicket = async (): Promise<string> => {
    const ticket = await linkTicket.create(OWNER_ID, googleProfile);
    if (typeof ticket !== "string") throw new Error("тикет не выдан");
    return ticket;
  };

  beforeEach(() => {
    identityRepository.reset();
    authRepository.reset();
    userRepository = createFakeUserRepository();
    verified = [];
    signed = [];
  });

  // §9.5.4: успешный ответ привязки — такой же вход, и признак анкеты в нём тот же.
  it("reports profile completeness in the link response", async () => {
    seedOwner(hashToStorage(PASSWORD));
    const ticket = await issueTicket();

    const result = await build().confirmLink({ ticket, password: PASSWORD });

    expect(result).toMatchObject({ user: { id: OWNER_ID, profileComplete: true } });
  });

  // Второй аккаунт того же провайдера снялся бы отвязкой разом с первым, а выбор
  // токена Apple стал бы произвольным.
  it("refuses a second identity of a provider the account already has", async () => {
    seedOwner(hashToStorage(PASSWORD));
    seedIdentity(telegramProfile);

    const result = await build({ ...telegramProfile, providerUserId: "78" }).linkIdentity(
      OWNER_ID,
      AUTH_PROVIDER.Telegram,
      {},
    );

    expect(result).toEqual(errorCodes.AUTH_PROVIDER_ALREADY_LINKED);
    expect(identityRepository.identities.all()).toHaveLength(1);
    // Провайдера, который всё равно не будет привязан, к сети не пускаем.
    expect(verified).toEqual([]);
  });

  it("refuses the same second identity when it arrives by ticket", async () => {
    seedOwner(hashToStorage(PASSWORD));
    seedIdentity({ ...googleProfile, providerUserId: "g-2" });
    const ticket = await issueTicket();

    const result = await build().confirmLink({ ticket, password: PASSWORD });

    expect(result).toEqual(errorCodes.AUTH_PROVIDER_ALREADY_LINKED);
    expect(identityRepository.calls.link).toEqual([]);
  });

  // Гонка двух привязок одного провайдера: проверка сервиса читает список ДО
  // вставки и обе пропускает, поэтому последнее слово — за уникальным индексом
  // ("userId", provider). Его отказ обязан доехать тем же конвертом, а не
  // пятисоткой.
  it("honours the unique index when a concurrent link took the provider", async () => {
    seedOwner(hashToStorage(PASSWORD));
    const repository = {
      ...identityRepository,
      link: async () => "provider_taken" as const,
    };

    const result = await build(telegramProfile, repository).linkIdentity(
      OWNER_ID,
      AUTH_PROVIDER.Telegram,
      {},
    );

    expect(result).toEqual(errorCodes.AUTH_PROVIDER_ALREADY_LINKED);
  });

  it("honours the unique index on the ticket branch too", async () => {
    seedOwner(hashToStorage(PASSWORD));
    const repository = {
      ...identityRepository,
      link: async () => "provider_taken" as const,
    };
    const ticket = await issueTicket();

    const result = await build(googleProfile, repository).confirmLink({
      ticket,
      password: PASSWORD,
    });

    expect(result).toEqual(errorCodes.AUTH_PROVIDER_ALREADY_LINKED);
  });

  // Гонка двух отвязок: последнее слово за репозиторием, который считает остаток
  // и удаляет одной транзакцией. Его отказ обязан доехать до ответа.
  it("honours the repository verdict when a concurrent unlink took the last method", async () => {
    seedOwner(null);
    seedIdentity(telegramProfile);
    seedIdentity(googleProfile);
    const unlinkArgs: unknown[][] = [];
    const repository = {
      ...identityRepository,
      unlink: async (...args: unknown[]) => {
        unlinkArgs.push(args);
        return "last_login_method" as const;
      },
    };

    const result = await build(telegramProfile, repository).unlinkIdentity(
      OWNER_ID,
      AUTH_PROVIDER.Telegram,
    );

    expect(result).toEqual(errorCodes.AUTH_LAST_LOGIN_METHOD);
    // Пригодность пароля считает сервис, остаток привязок — транзакция.
    expect(unlinkArgs).toEqual([[OWNER_ID, AUTH_PROVIDER.Telegram, false]]);
  });
});
