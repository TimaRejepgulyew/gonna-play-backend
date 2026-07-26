import type { FastifyBaseLogger } from "fastify";

import env from "@/config/env.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import type { ErrorResponse } from "@/types/prisma.js";
import { getHttp } from "@/utils/http.js";
import { buildAppleClientSecret } from "./apple.secret.js";

const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const HTTP_OK = 200;

export interface IAppleTokenClient {
  /** POST /auth/token, grant_type=authorization_code. Возврат, а не бросок. */
  exchange(authorizationCode: string): Promise<{ refreshToken: string } | ErrorResponse>;
  /** POST /auth/revoke, token_type_hint=refresh_token. true = доступ отозван. */
  revoke(refreshToken: string): Promise<boolean>;
}

export interface AppleTokenClientOptions {
  logger?: FastifyBaseLogger;
  clientId?: string;
  /** Пустой адрес — нативный поток: redirect_uri не подставляется вовсе. */
  redirectUri?: string;
  buildClientSecret?: () => string;
}

interface Failure {
  status?: number;
  error?: string;
}

function parseBody(body: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// В лог уходят только status и error ответа: тела запросов к Apple не
// логируются вовсе, на этом держится безопасность code и refresh-токена.
function toFailure(status: number, body: string): Failure {
  const error = parseBody(body)?.error;
  return { status, error: typeof error === "string" ? error : undefined };
}

export function createAppleTokenClient(options: AppleTokenClientOptions = {}): IAppleTokenClient {
  const clientId = options.clientId ?? env.APPLE_CLIENT_ID;
  const redirectUri = options.redirectUri ?? env.APPLE_REDIRECT_URI;
  const clientSecret = options.buildClientSecret ?? buildAppleClientSecret;
  const logger = options.logger;

  // Сборка секрета — подпись ключом из конфигурации, и на пустом или испорченном
  // ключе createPrivateKey бросает. Интерфейс обещает возврат, а не бросок,
  // поэтому неудача здесь становится обычным отказом. Причина в поля не идёт:
  // сообщение криптографии способно нести обрывки ключа.
  function baseForm(): Record<string, string> | null {
    try {
      return { client_id: clientId, client_secret: clientSecret() };
    } catch {
      return null;
    }
  }

  async function exchange(
    authorizationCode: string,
  ): Promise<{ refreshToken: string } | ErrorResponse> {
    const base = baseForm();
    if (base === null) {
      logger?.error({ reason: "client secret build failed" }, "apple code exchange failed");
      return appErrorCodes.AUTH_PROVIDER_UNAVAILABLE;
    }

    const form: Record<string, string> = {
      ...base,
      code: authorizationCode,
      grant_type: "authorization_code",
    };
    if (redirectUri.length > 0) form.redirect_uri = redirectUri;

    const outcome = await getHttp().send({ url: APPLE_TOKEN_URL, method: "POST", form });
    if (!outcome.ok) {
      logger?.warn({ failure: outcome.failure }, "apple code exchange failed");
      return appErrorCodes.AUTH_PROVIDER_UNAVAILABLE;
    }
    if (outcome.status !== HTTP_OK) {
      logger?.warn(toFailure(outcome.status, outcome.body), "apple code exchange failed");
      // Отказ Apple по коду — просроченный или уже использованный code, а не
      // наш сбой: 401, чтобы вызывающий отличал его от недоступности.
      return appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID;
    }

    // Берётся только refresh_token: access_token и id_token отбрасываются
    // здесь же и никуда не попадают.
    const refreshToken = parseBody(outcome.body)?.refresh_token;
    if (typeof refreshToken !== "string" || refreshToken.length === 0) {
      logger?.warn({ status: outcome.status }, "apple code exchange returned no refresh token");
      return appErrorCodes.AUTH_PROVIDER_UNAVAILABLE;
    }
    return { refreshToken };
  }

  // Успех — 200 с пустым телом; по RFC 7009 повторный отзыв недействительного
  // токена тоже даёт 200, а 400 означает проблему аутентификации клиента.
  async function revoke(refreshToken: string): Promise<boolean> {
    const base = baseForm();
    if (base === null) {
      logger?.error({ reason: "client secret build failed" }, "apple access revoke failed");
      return false;
    }

    const form: Record<string, string> = {
      ...base,
      token: refreshToken,
      token_type_hint: "refresh_token",
    };

    const outcome = await getHttp().send({ url: APPLE_REVOKE_URL, method: "POST", form });
    if (!outcome.ok) {
      logger?.error({ failure: outcome.failure }, "apple access revoke failed");
      return false;
    }
    if (outcome.status !== HTTP_OK) {
      logger?.error(toFailure(outcome.status, outcome.body), "apple access revoke failed");
      return false;
    }
    return true;
  }

  return { exchange, revoke };
}
