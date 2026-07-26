import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AccountService, { type IAccountUserService } from "@/auth/account.service.js";
import { AUTH_PROVIDER } from "@/auth/constant.js";
import type { IAppleTokenClient } from "@/auth/providers/apple.client.js";
import { errorCodes } from "@/constants/index.js";
import { encryptSecret } from "@/utils/secretBox.js";
import { createFakeIdentityRepository } from "./doubles/repositories.js";

const USER_ID = 7;
const KEY_BYTES = 32;
const key = Buffer.alloc(KEY_BYTES, 1);

const logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as unknown as FastifyBaseLogger;

// Общий журнал вызовов всех двойников: единственное, чем доказывается жёсткий
// порядок «отзыв Apple → удаление → гашение сессий».
const trace: string[] = [];

const identityRepository = createFakeIdentityRepository(trace);

let revokeOutcome = true;

const appleTokens: IAppleTokenClient = {
  exchange: vi.fn(),
  revoke: vi.fn(async () => {
    trace.push("revoke");
    return revokeOutcome;
  }),
};

let deleteOutcome: Awaited<ReturnType<IAccountUserService["deleteUser"]>> = 1;

const userService: IAccountUserService = {
  deleteUser: vi.fn(async () => {
    trace.push("deleteUser");
    return deleteOutcome;
  }),
};

const revokeSessions = vi.fn(async () => {
  trace.push("revokeAllRefresh");
});

function seedAppleIdentity(refreshTokenEncrypted: string | null): void {
  identityRepository.identities.insert({
    userId: USER_ID,
    provider: AUTH_PROVIDER.Apple,
    providerUserId: "apple-sub",
    email: null,
    username: null,
    lastLoginAt: null,
    createdAt: new Date(),
    refreshTokenEncrypted,
  });
}

function createService(): AccountService {
  return new AccountService(
    identityRepository,
    userService,
    appleTokens,
    logger,
    [key],
    revokeSessions,
  );
}

describe("AccountService.deleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityRepository.reset();
    trace.length = 0;
    revokeOutcome = true;
    deleteOutcome = 1;
  });

  it("does not go out to Apple at all when there is no Apple identity", async () => {
    const result = await createService().deleteAccount(USER_ID);

    expect(appleTokens.revoke).not.toHaveBeenCalled();
    expect(userService.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(revokeSessions).toHaveBeenCalledWith(USER_ID);
    expect(result).toMatchObject({ status: "success", appleAccessRevoked: true });
  });

  it("revokes Apple access before deleting the user", async () => {
    seedAppleIdentity(encryptSecret("apple-refresh", key));

    const result = await createService().deleteAccount(USER_ID);

    expect(vi.mocked(appleTokens.revoke).mock.calls[0]?.[0]).toBe("apple-refresh");
    expect(trace).toEqual(["getAppleRefreshToken", "revoke", "deleteUser", "revokeAllRefresh"]);
    expect(result).toMatchObject({ appleAccessRevoked: true });
  });

  it("deletes the account anyway when Apple refuses the revoke", async () => {
    seedAppleIdentity(encryptSecret("apple-refresh", key));
    revokeOutcome = false;

    const result = await createService().deleteAccount(USER_ID);

    expect(userService.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(revokeSessions).toHaveBeenCalledWith(USER_ID);
    expect(result).toMatchObject({ status: "success", appleAccessRevoked: false });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(logger.error).mock.calls[0]?.[0]).toMatchObject({
      userId: USER_ID,
      provider: AUTH_PROVIDER.Apple,
    });
  });

  it("deletes the account without calling Apple when the stored value does not decrypt", async () => {
    seedAppleIdentity(encryptSecret("apple-refresh", Buffer.alloc(KEY_BYTES, 9)));

    const result = await createService().deleteAccount(USER_ID);

    expect(appleTokens.revoke).not.toHaveBeenCalled();
    expect(userService.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(result).toMatchObject({ status: "success", appleAccessRevoked: false });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  // §11.5: привязка Apple есть, а токена нет (не сохранился по правилу 9) —
  // отзывать нечего, и это не деградация.
  it("treats an Apple identity without a stored token as nothing to revoke", async () => {
    seedAppleIdentity(null);

    const result = await createService().deleteAccount(USER_ID);

    expect(appleTokens.revoke).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "success", appleAccessRevoked: true });
  });

  it("returns the envelope and keeps sessions alive when the user is absent", async () => {
    deleteOutcome = errorCodes.USER_NOT_FOUND;

    const result = await createService().deleteAccount(USER_ID);

    expect(result).toEqual(errorCodes.USER_NOT_FOUND);
    expect(revokeSessions).not.toHaveBeenCalled();
  });
});
