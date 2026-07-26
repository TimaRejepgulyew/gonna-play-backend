// UNIT (§11.1): привязка и отвязка способов входа — IdentityLinkService.
// Отдельный файл, а не дополнение identity.service.test.ts: тот уже занимает
// 242 непустые строки при пороге 300 (docs/wiki/conventions.md:91).
// Тикеты берутся из настоящего linkTicket поверх подменённого Redis
// (tests/setup/unit-setup.ts), верификаторы и клиент Apple — двойники.

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
import { decryptSecret } from "@/utils/secretBox.js";

import { createFakeAuthRepository, createFakeIdentityRepository } from "./doubles/repositories.js";

const SECRET_KEY = Buffer.alloc(32, 5);
const REFRESH_TOKEN = "apple-refresh-token";
const OWNER_ID = 9;
const OWNER_EMAIL = "keeper@example.com";
const PASSWORD = "secret123";
const APPLE_CREDENTIAL = { identityToken: "id-token", authorizationCode: "auth-code" };

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
  firstName: "Given",
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

describe("IdentityLinkService", () => {
  const identityRepository = createFakeIdentityRepository();
  const authRepository = createFakeAuthRepository();
  let userRepository: ReturnType<typeof createFakeUserRepository>;
  let verified: AUTH_PROVIDER[];
  let appleCodes: string[];
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

  const build = (outcome: ProviderProfile | ErrorResponse = telegramProfile) => {
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
      exchange: async (code) => {
        appleCodes.push(code);
        return { refreshToken: REFRESH_TOKEN };
      },
      revoke: async () => true,
    };
    return new IdentityLinkService(
      identityRepository,
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
    userRepository.rows.set(OWNER_ID, { id: OWNER_ID, email: OWNER_EMAIL, name: "Keeper" });
  };

  const seedIdentity = (userId: number, profile: ProviderProfile) =>
    identityRepository.identities.seed({
      id: identityRepository.identities.count() + 1,
      userId,
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      email: profile.email ?? null,
      username: profile.username ?? null,
      lastLoginAt: null,
      createdAt: new Date(),
      refreshTokenEncrypted: null,
    });

  const issueTicket = async (userId = OWNER_ID): Promise<string> => {
    const ticket = await linkTicket.create(userId, googleProfile);
    if (typeof ticket !== "string") throw new Error("тикет не выдан");
    return ticket;
  };

  beforeEach(() => {
    identityRepository.reset();
    authRepository.reset();
    userRepository = createFakeUserRepository();
    verified = [];
    appleCodes = [];
    signed = [];
  });

  it("links the identity and issues tokens when the password matches", async () => {
    seedOwner(hashToStorage(PASSWORD));
    const ticket = await issueTicket();

    const result = await build().confirmLink({ ticket, password: PASSWORD });

    expect(result).toMatchObject({ user: { id: OWNER_ID }, accessToken: "token-1" });
    expect(identityRepository.identities.all()).toMatchObject([
      { userId: OWNER_ID, provider: AUTH_PROVIDER.Google },
    ]);
  });

  it("refuses a wrong password and links nothing", async () => {
    seedOwner(hashToStorage(PASSWORD));
    const ticket = await issueTicket();

    const result = await build().confirmLink({ ticket, password: "wrong-password" });

    expect(result).toEqual(errorCodes.AUTH_INVALID_CREDENTIALS);
    expect(identityRepository.calls.link).toEqual([]);
  });

  // Аккаунт без пароля не заперт: вторым способом владение подтверждает уже
  // привязанный провайдер.
  it("accepts a proof from an already linked provider on a passwordless account", async () => {
    seedOwner(null);
    seedIdentity(OWNER_ID, telegramProfile);
    const ticket = await issueTicket();

    const result = await build().confirmLink({
      ticket,
      proof: { provider: AUTH_PROVIDER.Telegram, credential: {} },
    });

    expect(result).toMatchObject({ user: { id: OWNER_ID }, accessToken: "token-1" });
    expect(identityRepository.identities.all()).toHaveLength(2);
  });

  it("rejects a proof from a provider the ticket owner has not linked, without calling it", async () => {
    seedOwner(null);
    const ticket = await issueTicket();

    const result = await build().confirmLink({
      ticket,
      proof: { provider: AUTH_PROVIDER.Telegram, credential: {} },
    });

    expect(result).toEqual(errorCodes.AUTH_LINK_PROOF_REQUIRED);
    expect(verified).toEqual([]);
  });

  // Чужой валидный токен доказательством владения не является: провайдер тот же,
  // а providerUserId — другого человека.
  it("rejects a valid token that belongs to somebody else", async () => {
    seedOwner(null);
    seedIdentity(OWNER_ID, { ...telegramProfile, providerUserId: "42" });
    const ticket = await issueTicket();

    const result = await build().confirmLink({
      ticket,
      proof: { provider: AUTH_PROVIDER.Telegram, credential: {} },
    });

    expect(result).toEqual(errorCodes.AUTH_LINK_PROOF_REQUIRED);
    expect(identityRepository.calls.link).toEqual([]);
  });

  it("demands exactly one proof — neither both fields nor none", async () => {
    seedOwner(hashToStorage(PASSWORD));
    seedIdentity(OWNER_ID, telegramProfile);
    const service = build();

    const both = await service.confirmLink({
      ticket: await issueTicket(),
      password: PASSWORD,
      proof: { provider: AUTH_PROVIDER.Telegram, credential: {} },
    });
    const none = await service.confirmLink({ ticket: await issueTicket() });

    expect(both).toEqual(errorCodes.AUTH_LINK_PROOF_REQUIRED);
    expect(none).toEqual(errorCodes.AUTH_LINK_PROOF_REQUIRED);
    expect(identityRepository.calls.link).toEqual([]);
  });

  // Правило 8: тикет гасится ДО проверки доказательства, поэтому неудачная
  // попытка не оставляет второй — тикет не стенд для подбора пароля.
  it("burns the ticket before checking the proof, so a failed attempt is the last one", async () => {
    seedOwner(hashToStorage(PASSWORD));
    const service = build();
    const ticket = await issueTicket();

    const first = await service.confirmLink({ ticket, password: "wrong-password" });
    const retry = await service.confirmLink({ ticket, password: PASSWORD });

    expect(first).toEqual(errorCodes.AUTH_INVALID_CREDENTIALS);
    expect(retry).toEqual(errorCodes.AUTH_LINK_TICKET_INVALID);
    expect(identityRepository.calls.link).toEqual([]);
  });

  it("answers with an envelope when the account was deleted while the ticket waited", async () => {
    const ticket = await issueTicket();

    const result = await build().confirmLink({ ticket, password: PASSWORD });

    expect(result).toEqual(errorCodes.AUTH_LINK_TICKET_INVALID);
  });

  it("refuses to unlink the only remaining login method", async () => {
    seedOwner(null);
    seedIdentity(OWNER_ID, telegramProfile);

    const result = await build().unlinkIdentity(OWNER_ID, AUTH_PROVIDER.Telegram);

    expect(result).toEqual(errorCodes.AUTH_LAST_LOGIN_METHOD);
    expect(identityRepository.identities.all()).toHaveLength(1);
  });

  it("unlinks the provider while a usable password remains", async () => {
    seedOwner(hashToStorage(PASSWORD));
    seedIdentity(OWNER_ID, telegramProfile);

    const result = await build().unlinkIdentity(OWNER_ID, AUTH_PROVIDER.Telegram);

    expect(result).toEqual({ hasPassword: true, identities: [] });
    expect(identityRepository.identities.all()).toEqual([]);
  });

  it("refuses to link an identity that already belongs to another account", async () => {
    seedOwner(hashToStorage(PASSWORD));
    seedIdentity(5, telegramProfile);

    const result = await build().linkIdentity(OWNER_ID, AUTH_PROVIDER.Telegram, {});

    expect(result).toEqual(errorCodes.AUTH_IDENTITY_ALREADY_LINKED);
    expect(identityRepository.identities.all()).toHaveLength(1);
  });

  // Правило 9 на второй половине: токен Apple добывается и при привязке из
  // настроек, и сохраняется зашифрованным.
  it("stores the Apple refresh token encrypted when linking from the settings", async () => {
    seedOwner(hashToStorage(PASSWORD));
    const appleProfile: ProviderProfile = {
      provider: AUTH_PROVIDER.Apple,
      providerUserId: "a-1",
      emailVerified: false,
    };

    const result = await build(appleProfile).linkIdentity(
      OWNER_ID,
      AUTH_PROVIDER.Apple,
      APPLE_CREDENTIAL,
    );

    expect(result).toMatchObject({ hasPassword: true });
    expect(appleCodes).toEqual([APPLE_CREDENTIAL.authorizationCode]);
    const [saved] = identityRepository.calls.saveRefreshToken;
    expect(saved[1]).not.toBe(REFRESH_TOKEN);
    expect(decryptSecret(saved[1], [SECRET_KEY])).toBe(REFRESH_TOKEN);
  });
});
