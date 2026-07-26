// UNIT (§11.1): ветвление входа через провайдера — IdentityService.
// Сеть и Prisma не участвуют: верификатор, клиент Apple и репозитории — двойники,
// Redis подменён глобально (tests/setup/unit-setup.ts), TokenSigner рукописный.

import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";

import type AuthRepository from "@/auth/auth.repository.js";
import { AuthService, type TokenSigner } from "@/auth/auth.service.js";
import { AUTH_PROVIDER } from "@/auth/constant.js";
import { IdentityService } from "@/auth/identity.service.js";
import type { IAppleTokenClient } from "@/auth/providers/apple.client.js";
import type {
  ProviderProfile,
  ProviderVerifier,
  VerifierRegistry,
} from "@/auth/providers/types.js";
import { errorCodes } from "@/constants/index.js";
import type PlayerRepository from "@/player/player.repository.js";
import type { ErrorResponse } from "@/types/prisma.js";
import type { UpdateUser } from "@/user/types.js";
import type UserRepository from "@/user/user.repository.js";
import { decryptSecret } from "@/utils/secretBox.js";

import { createFakeAuthRepository, createFakeIdentityRepository } from "./doubles/repositories.js";

const SECRET_KEY = Buffer.alloc(32, 5);
const REFRESH_TOKEN = "apple-refresh-token";
const APPLE_CREDENTIAL = { identityToken: "id-token", authorizationCode: "auth-code" };

const silentLogger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
} as unknown as FastifyBaseLogger;

interface FakeUserRow {
  id: number;
  email?: string | null;
  name?: string | null;
  firstName?: string;
  lastName?: string;
  avatar?: string;
}

function createFakeUserRepository() {
  const rows = new Map<number, FakeUserRow>();
  const updates: UpdateUser[] = [];
  return {
    rows,
    updates,
    async getUser(id: number) {
      const row = rows.get(id);
      return row ? { ...row } : null;
    },
    async updateUser(patch: UpdateUser) {
      updates.push(patch);
      const row = rows.get(patch.id) ?? { id: patch.id };
      rows.set(patch.id, { ...row, ...patch });
      return rows.get(patch.id);
    },
  };
}

function registryOf(outcome: ProviderProfile | ErrorResponse, configured = true): VerifierRegistry {
  const verifier: ProviderVerifier = {
    isConfigured: () => configured,
    verify: async () => outcome,
  };
  return {
    [AUTH_PROVIDER.Google]: verifier,
    [AUTH_PROVIDER.Apple]: verifier,
    [AUTH_PROVIDER.Telegram]: verifier,
  };
}

const telegramProfile: ProviderProfile = {
  provider: AUTH_PROVIDER.Telegram,
  providerUserId: "77",
  emailVerified: false,
  firstName: "Иван",
  lastName: "Петров",
  username: "vanya",
};

const googleProfile: ProviderProfile = {
  provider: AUTH_PROVIDER.Google,
  providerUserId: "g-1",
  email: "Keeper@Example.COM",
  emailVerified: true,
  firstName: "Given",
  avatar: "https://cdn.test/a.png",
};

const appleProfile: ProviderProfile = {
  provider: AUTH_PROVIDER.Apple,
  providerUserId: "a-1",
  emailVerified: false,
  firstName: "Tim",
};

describe("IdentityService.loginWithProvider", () => {
  const identityRepository = createFakeIdentityRepository();
  const authRepository = createFakeAuthRepository();
  let userRepository: ReturnType<typeof createFakeUserRepository>;
  let appleCodes: string[];
  let appleOutcome: { refreshToken: string } | ErrorResponse;
  let signed: object[];

  const build = (outcome: ProviderProfile | ErrorResponse, configured = true): IdentityService => {
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
      exchange: async (code) => {
        appleCodes.push(code);
        return appleOutcome;
      },
      revoke: async () => true,
    };
    return new IdentityService(
      identityRepository,
      userRepository as unknown as UserRepository,
      authRepository,
      authService,
      registryOf(outcome, configured),
      appleTokens,
      silentLogger,
      SECRET_KEY,
    );
  };

  beforeEach(() => {
    identityRepository.reset();
    authRepository.reset();
    userRepository = createFakeUserRepository();
    appleCodes = [];
    appleOutcome = { refreshToken: REFRESH_TOKEN };
    signed = [];
  });

  it("logs a known identity in without creating a second account", async () => {
    userRepository.rows.set(4, { id: 4, email: "known@example.com", name: "Known" });
    identityRepository.identities.seed({
      id: 1,
      userId: 4,
      provider: AUTH_PROVIDER.Telegram,
      providerUserId: telegramProfile.providerUserId,
      email: null,
      username: "vanya",
      lastLoginAt: null,
      createdAt: new Date(),
      refreshTokenEncrypted: null,
    });

    const result = await build(telegramProfile).loginWithProvider(AUTH_PROVIDER.Telegram, {});

    expect(result).toMatchObject({ user: { id: 4 }, accessToken: "token-1" });
    expect(identityRepository.calls.createUserWithIdentity).toEqual([]);
    expect(identityRepository.calls.touchLastLogin).toEqual([1]);
  });

  // Telegram почты не отдаёт вовсе, поэтому ветка слияния сюда не заходит никогда.
  it("creates an account with the identity when nothing matches", async () => {
    const result = await build(telegramProfile).loginWithProvider(AUTH_PROVIDER.Telegram, {});

    expect(result).toMatchObject({ user: { name: "Иван Петров" }, refreshToken: "token-2" });
    expect(identityRepository.calls.createUserWithIdentity).toHaveLength(1);
    expect(identityRepository.identities.all()).toHaveLength(1);
  });

  it("asks to confirm ownership when a verified email already has an account", async () => {
    authRepository.users.seed({
      id: 9,
      email: "keeper@example.com",
      name: "Keeper",
      password: "salt:hash",
      roles: [],
    });

    const result = await build(googleProfile).loginWithProvider(AUTH_PROVIDER.Google, {});

    expect(result).toMatchObject({ status: "link_required", methods: ["password"] });
    expect((result as { ticket: string }).ticket.length).toBeGreaterThan(0);
    expect(identityRepository.calls.link).toEqual([]);
    expect(identityRepository.calls.createUserWithIdentity).toEqual([]);
    expect(signed).toEqual([]);
  });

  it("never merges on an unverified email — a new account is created instead", async () => {
    authRepository.users.seed({
      id: 9,
      email: "keeper@example.com",
      name: "Keeper",
      password: "salt:hash",
      roles: [],
    });

    const result = await build({ ...googleProfile, emailVerified: false }).loginWithProvider(
      AUTH_PROVIDER.Google,
      {},
    );

    expect(result).not.toMatchObject({ status: "link_required" });
    expect(identityRepository.calls.createUserWithIdentity).toHaveLength(1);
  });

  it("fills only the empty profile fields of an existing account", async () => {
    userRepository.rows.set(4, {
      id: 4,
      email: "mine@example.com",
      name: "Мой ник",
      firstName: "Моё",
      avatar: undefined,
    });
    identityRepository.identities.seed({
      id: 1,
      userId: 4,
      provider: AUTH_PROVIDER.Google,
      providerUserId: googleProfile.providerUserId,
      email: null,
      username: null,
      lastLoginAt: null,
      createdAt: new Date(),
      refreshTokenEncrypted: null,
    });

    await build(googleProfile).loginWithProvider(AUTH_PROVIDER.Google, {});

    expect(userRepository.updates).toEqual([{ id: 4, avatar: googleProfile.avatar }]);
  });

  it("stores the Apple refresh token encrypted, exchanging the code exactly once", async () => {
    const result = await build(appleProfile).loginWithProvider(
      AUTH_PROVIDER.Apple,
      APPLE_CREDENTIAL,
    );

    expect(appleCodes).toEqual([APPLE_CREDENTIAL.authorizationCode]);
    const [saved] = identityRepository.calls.saveRefreshToken;
    expect(saved[1]).not.toBe(REFRESH_TOKEN);
    expect(decryptSecret(saved[1], [SECRET_KEY])).toBe(REFRESH_TOKEN);
    expect(result).toMatchObject({ accessToken: "token-1" });
  });

  it("keeps the login working when the Apple exchange fails", async () => {
    appleOutcome = errorCodes.AUTH_PROVIDER_UNAVAILABLE;

    const result = await build(appleProfile).loginWithProvider(
      AUTH_PROVIDER.Apple,
      APPLE_CREDENTIAL,
    );

    expect(result).toMatchObject({ accessToken: "token-1", refreshToken: "token-2" });
    expect(identityRepository.calls.saveRefreshToken).toEqual([]);
  });

  it("answers 503 while the provider is not configured", async () => {
    const result = await build(googleProfile, false).loginWithProvider(AUTH_PROVIDER.Google, {});

    expect(result).toEqual(errorCodes.AUTH_PROVIDER_NOT_CONFIGURED);
  });
});
