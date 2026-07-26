import { createPublicKey, createVerify, type JsonWebKey } from "node:crypto";

import { errorCodes as appErrorCodes } from "@/constants/index.js";
import type { ErrorResponse } from "@/types/prisma.js";
import { getHttp } from "@/utils/http.js";

const JWKS_TTL_MS = 3_600_000;
const JWKS_TIMEOUT_MS = 3_000;
const HTTP_OK = 200;
const JWT_SEGMENTS = 3;
const SEGMENT_PATTERN = /^[A-Za-z0-9_-]*$/;
// Алгоритм берётся отсюда, а не из заголовка токена: доверять в заголовке можно
// только kid, иначе подменённый alg (none, HS256 на публичном ключе) обходит подпись.
const ALLOWED_ALGS = ["RS256"];
const VERIFY_ALGORITHM = "RSA-SHA256";

export type JwksKey = Record<string, unknown>;

/** maxAgeMs — Cache-Control ответа JWKS, если загрузчик его знает; иначе JWKS_TTL_MS. */
export interface JwksSet {
  keys: JwksKey[];
  maxAgeMs?: number;
}

export type JwksLoader = (url: string) => Promise<JwksSet | ErrorResponse>;

export type JwtClaims = Record<string, unknown>;

interface KeyLookup {
  key?: JwksKey;
  error?: ErrorResponse;
}

export interface Rs256Verifier {
  verify(token: string, jwksUrl: string): Promise<JwtClaims | ErrorResponse>;
}

function isErrorResponse(value: JwksSet | ErrorResponse): value is ErrorResponse {
  return typeof (value as ErrorResponse).code === "number";
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Buffer.from(..., "base64url") лоялен к мусору, поэтому форма сегментов
// проверяется до декодирования — splitToken.
function decodeSegment(segment: string): Record<string, unknown> | null {
  return parseJson(Buffer.from(segment, "base64url").toString("utf8"));
}

function parseKeys(body: string): JwksKey[] | null {
  const keys = parseJson(body)?.keys;
  if (!Array.isArray(keys)) return null;
  return keys as JwksKey[];
}

/** Загрузчик по умолчанию: общий транспорт §9.6.0, свой fetch здесь не заводится. */
export function createHttpJwksLoader(): JwksLoader {
  return async (url) => {
    const outcome = await getHttp().send({ url, timeoutMs: JWKS_TIMEOUT_MS });
    if (!outcome.ok || outcome.status !== HTTP_OK) {
      return appErrorCodes.AUTH_PROVIDER_UNAVAILABLE;
    }
    const keys = parseKeys(outcome.body);
    if (keys === null) return appErrorCodes.AUTH_PROVIDER_UNAVAILABLE;
    return { keys };
  };
}

function splitToken(token: string): [string, string, string] | null {
  const parts = token.split(".");
  if (parts.length !== JWT_SEGMENTS) return null;
  if (!parts.every((part) => SEGMENT_PATTERN.test(part))) return null;
  if (parts[0].length === 0 || parts[1].length === 0 || parts[2].length === 0) return null;
  return [parts[0], parts[1], parts[2]];
}

function verifySignature(jwk: JwksKey, signingInput: string, signature: string): boolean {
  try {
    const key = createPublicKey({ key: jwk as JsonWebKey, format: "jwk" });
    return createVerify(VERIFY_ALGORITHM)
      .update(signingInput)
      .verify(key, Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

export function createRs256Verifier(loader: JwksLoader = createHttpJwksLoader()): Rs256Verifier {
  const cache = new Map<string, { keys: JwksKey[]; expiresAt: number }>();

  async function load(url: string): Promise<JwksSet | ErrorResponse> {
    let result: JwksSet | ErrorResponse;
    try {
      result = await loader(url);
    } catch {
      return appErrorCodes.AUTH_PROVIDER_UNAVAILABLE;
    }
    if (isErrorResponse(result)) return result;
    const ttl =
      result.maxAgeMs !== undefined && result.maxAgeMs > 0 ? result.maxAgeMs : JWKS_TTL_MS;
    cache.set(url, { keys: result.keys, expiresAt: Date.now() + ttl });
    return result;
  }

  // Неизвестный kid — ровно один принудительный перезапрос: ключи могли отротироваться.
  async function resolveKey(url: string, kid: string): Promise<KeyLookup> {
    const cached = cache.get(url);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      const hit = cached.keys.find((key) => key.kid === kid);
      if (hit !== undefined) return { key: hit };
    }
    const loaded = await load(url);
    if (isErrorResponse(loaded)) return { error: loaded };
    return { key: loaded.keys.find((key) => key.kid === kid) };
  }

  async function verify(token: string, jwksUrl: string): Promise<JwtClaims | ErrorResponse> {
    const invalid = appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID;
    const segments = splitToken(token);
    if (segments === null) return invalid;

    const header = decodeSegment(segments[0]);
    const kid = header?.kid;
    if (typeof kid !== "string" || !ALLOWED_ALGS.includes(header?.alg as string)) return invalid;

    const lookup = await resolveKey(jwksUrl, kid);
    if (lookup.error !== undefined) return lookup.error;
    if (lookup.key === undefined) return invalid;

    if (!verifySignature(lookup.key, `${segments[0]}.${segments[1]}`, segments[2])) return invalid;
    return decodeSegment(segments[1]) ?? invalid;
  }

  return { verify };
}
