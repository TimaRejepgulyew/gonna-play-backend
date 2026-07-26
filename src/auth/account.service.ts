import type { FastifyBaseLogger } from "fastify";

import env from "@/config/env.js";
import type { ErrorResponse } from "@/types/prisma.js";
import { decryptSecret } from "@/utils/secretBox.js";
import { AUTH_PROVIDER } from "./constant.js";
import type { IIdentityRepository } from "./identity.repository.js";
import type { IAppleTokenClient } from "./providers/apple.client.js";
import { revokeAllRefresh } from "./refreshStore.js";

/** Ровно то, что удаление аккаунта берёт от user-модуля (`src/user/user.service.ts:86-93`). */
export interface IAccountUserService {
  deleteUser(id: number): Promise<number | ErrorResponse>;
}

export interface AccountDeleted {
  status: "success";
  message: string;
  appleAccessRevoked: boolean;
}

const DELETED_MESSAGE = "Account deleted";

/** Текущий ключ и, если задан, прежний — порядок попыток расшифровки (§9.6.7). */
function secretKeysFromEnv(): Buffer[] {
  return [env.AUTH_SECRET_KEY, env.AUTH_SECRET_KEY_PREVIOUS]
    .filter((value) => value.length > 0)
    .map((value) => Buffer.from(value, "base64"));
}

/**
 * Удаление аккаунта одним поведением для обоих входов — `DELETE /api/auth/me` и
 * админского `DELETE /api/user/:id` (§9.4.10). Порядок шагов не переставляется:
 * `AuthIdentity` уходит каскадом вместе с `User`, поэтому после удаления взять
 * токен уже неоткуда, а гасить сессии до успешного удаления не за что.
 */
export default class AccountService {
  constructor(
    private identityRepository: IIdentityRepository,
    private userService: IAccountUserService,
    private appleTokens: IAppleTokenClient,
    private logger: FastifyBaseLogger,
    private secretKeys: readonly Buffer[] = secretKeysFromEnv(),
    private revokeSessions: (userId: number) => Promise<void> = revokeAllRefresh,
  ) {}

  async deleteAccount(userId: number): Promise<AccountDeleted | ErrorResponse> {
    const appleAccessRevoked = await this.revokeAppleAccess(userId);

    // Число — id удалённой строки; всё остальное конверт ошибки (`USER_NOT_FOUND`),
    // и тогда шаг гашения сессий не выполняется.
    const deleted = await this.userService.deleteUser(userId);
    if (typeof deleted !== "number") return deleted;

    // Best-effort по построению: ошибка Redis проглатывается внутри
    // (`src/auth/refreshStore.ts:78-80`), поэтому лежащий Redis не мешает удалению.
    await this.revokeSessions(userId);

    return { status: "success", message: DELETED_MESSAGE, appleAccessRevoked };
  }

  /**
   * Отзывать нечего (привязки Apple нет либо токен не сохранён) — наружу не
   * ходим вовсе и считаем доступ отозванным. Неудача отзыва удаление не
   * запирает: она пишется в лог уровнем `error` ровно один раз и уезжает
   * клиенту признаком `appleAccessRevoked: false`.
   */
  private async revokeAppleAccess(userId: number): Promise<boolean> {
    const stored = await this.identityRepository.getAppleRefreshToken(userId);
    if (stored === null) return true;

    const token = decryptSecret(stored, this.secretKeys);
    if (token === null) {
      this.failed(userId, "decrypt failed");
      return false;
    }

    const revoked = await this.appleTokens.revoke(token);
    if (!revoked) this.failed(userId, "revoke rejected");
    return revoked;
  }

  private failed(userId: number, reason: string): void {
    this.logger.error(
      { userId, provider: AUTH_PROVIDER.Apple, reason },
      "apple access revoke failed",
    );
  }
}
