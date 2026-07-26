import type { AUTH_PROVIDER } from "@/auth/constant.js";
import type { ErrorResponse } from "@/types/prisma.js";

/** Нормализованный профиль: всё, что удалось вытащить у провайдера. */
export interface ProviderProfile {
  provider: AUTH_PROVIDER;
  /** Стабильный идентификатор у провайдера: Google `sub`, Apple `sub`, Telegram `id`. */
  providerUserId: string;
  email?: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  username?: string;
}

export interface ProviderVerifier {
  /** Возвращает профиль или конверт ошибки — не бросает. */
  verify(credential: unknown): Promise<ProviderProfile | ErrorResponse>;
  /** false, когда секреты провайдера не заданы в env: маршрут отвечает 503. */
  isConfigured(): boolean;
}

/** Реестр из providers/index.ts: ровно по записи на каждое значение перечисления. */
export type VerifierRegistry = Record<AUTH_PROVIDER, ProviderVerifier>;
