import type { FastifyBaseLogger } from "fastify";

import { AUTH_PROVIDER } from "@/auth/constant.js";
import type { ErrorResponse } from "@/types/prisma.js";
import { encryptSecret } from "@/utils/secretBox.js";

/** "password" — примут поле `password`; значение перечисления — примут `proof` с этим провайдером. */
export type LinkMethod = "password" | AUTH_PROVIDER;

/** Достаточная для расчётов часть записи `AuthIdentity`. */
export interface LinkedIdentity {
  provider: AUTH_PROVIDER;
}

/**
 * Пригодность пароля — формат `salt:hash`, а не непустота поля:
 * ровно то, что проверяет guard в `verifyPassword` (src/auth/password.ts:25).
 */
export function isPasswordUsable(storedPassword: string | null | undefined): boolean {
  return storedPassword?.includes(":") === true;
}

/** Способы, которыми владелец аккаунта может подтвердить владение при привязке. */
export function buildLoginMethods(
  identities: readonly LinkedIdentity[],
  storedPassword: string | null | undefined,
): LinkMethod[] {
  const methods: LinkMethod[] = isPasswordUsable(storedPassword) ? ["password"] : [];
  for (const identity of identities) {
    if (!methods.includes(identity.provider)) {
      methods.push(identity.provider);
    }
  }
  return methods;
}

/** Сколько способов входа останется, если отвязать `unlinkedProvider`. Ноль — отвязка запрещена. */
export function countRemainingLoginMethods(
  identities: readonly LinkedIdentity[],
  unlinkedProvider: AUTH_PROVIDER,
  storedPassword: string | null | undefined,
): number {
  const remaining = identities.filter((identity) => identity.provider !== unlinkedProvider).length;
  return remaining + (isPasswordUsable(storedPassword) ? 1 : 0);
}

/** Конверт ошибки от полезного значения отличает единственный признак — числовой `code`. */
export const isErrorEnvelope = (value: object): value is ErrorResponse =>
  typeof (value as ErrorResponse).code === "number";

/** Признак готовности профиля (§9.5.4): «есть почта и есть дата рождения». */
export function isProfileComplete(user: {
  email?: string | null;
  birthDate?: string | null;
}): boolean {
  return Boolean(user.email && user.birthDate);
}

/** Одноразовый код авторизации Apple из тела запроса; `null` — его там нет. */
export function readAuthorizationCode(credential: unknown): string | null {
  if (typeof credential !== "object" || credential === null) return null;
  const { authorizationCode } = credential as { authorizationCode?: unknown };
  return typeof authorizationCode === "string" && authorizationCode.length > 0
    ? authorizationCode
    : null;
}

/** Ровно то, что ветке сохранения токена нужно от репозитория и клиента Apple. */
export interface AppleTokenDeps {
  identityRepository: { saveRefreshToken(identityId: number, encrypted: string): Promise<void> };
  appleTokens: { exchange(code: string): Promise<{ refreshToken: string } | ErrorResponse> };
  logger: FastifyBaseLogger;
  secretKey: Buffer | null;
}

/**
 * Правило 9: токен Apple добывается и при входе, и при привязке из настроек, и
 * ни там, ни там не блокирует операцию — отказ обмена уходит в лог, а токен
 * дозаполнится следующим входом. `authorizationCode` в лог не попадает ни при
 * какой ветке. Вход и привязка различаются только текстом сообщения, поэтому
 * ветка живёт здесь одна на оба сервиса.
 */
export async function storeAppleRefreshToken(
  deps: AppleTokenDeps,
  provider: AUTH_PROVIDER,
  identityId: number,
  credential: unknown,
  failureMessage: string,
): Promise<void> {
  if (provider !== AUTH_PROVIDER.Apple) return;
  const code = readAuthorizationCode(credential);
  if (code === null || deps.secretKey === null) return;

  const exchanged = await deps.appleTokens.exchange(code);
  if (isErrorEnvelope(exchanged)) {
    deps.logger.warn({ identityId, provider }, failureMessage);
    return;
  }
  await deps.identityRepository.saveRefreshToken(
    identityId,
    encryptSecret(exchanged.refreshToken, deps.secretKey),
  );
}
