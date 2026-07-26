import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { AUTH_PROVIDER } from "@/auth/constant.js";
import env from "@/config/env.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import type { ErrorResponse } from "@/types/prisma.js";
import type { ProviderProfile, ProviderVerifier } from "./types.js";

// Our choice, not a protocol requirement: Telegram only suggests checking
// `auth_date` without naming a number. The payload arrives right after an
// interactive login, so a wider window would only help a replayed capture.
const FRESHNESS_WINDOW_SEC = 900;
const MS_PER_SECOND = 1_000;

const HASH_FIELD = "hash";

type WidgetPayload = Record<string, unknown>;

// Algorithm from the archived core.telegram.org/widgets/login-legacy page: every
// field except `hash`, sorted alphabetically, joined as `key=value` by newlines.
function buildDataCheckString(payload: WidgetPayload): string {
  return Object.keys(payload)
    .filter((key) => key !== HASH_FIELD)
    .sort()
    .map((key) => `${key}=${String(payload[key])}`)
    .join("\n");
}

function isFresh(authDate: unknown): boolean {
  const seconds = Number(authDate);
  if (!Number.isFinite(seconds)) {
    return false;
  }
  return Math.floor(Date.now() / MS_PER_SECOND) - seconds <= FRESHNESS_WINDOW_SEC;
}

// Both sides are hex strings compared as raw bytes: lengths are checked first
// because timingSafeEqual throws on buffers of different size.
function signatureMatches(expected: string, received: string): boolean {
  const expectedBuf = Buffer.from(expected, "utf8");
  const receivedBuf = Buffer.from(received, "utf8");
  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, receivedBuf);
}

function optional(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toProfile(payload: WidgetPayload): ProviderProfile {
  const firstName = optional(payload.first_name);
  const lastName = optional(payload.last_name);
  const username = optional(payload.username);
  const avatar = optional(payload.photo_url);
  return {
    provider: AUTH_PROVIDER.Telegram,
    // Stringified exactly once, here: migrated values must share this format.
    providerUserId: String(payload.id),
    // Telegram never returns an email, in any flow.
    emailVerified: false,
    ...(firstName && { firstName }),
    ...(lastName && { lastName }),
    ...(username && { username }),
    ...(avatar && { avatar }),
  };
}

export function createTelegramVerifier(botToken = env.TELEGRAM_BOT_TOKEN): ProviderVerifier {
  return {
    isConfigured: () => botToken.length > 0,

    verify: async (credential: unknown): Promise<ProviderProfile | ErrorResponse> => {
      if (typeof credential !== "object" || credential === null) {
        return appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID;
      }
      const payload = credential as WidgetPayload;
      const received = payload[HASH_FIELD];
      if (typeof received !== "string" || payload.id === undefined) {
        return appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID;
      }
      // Login Widget secret: a bare SHA256 of the bot token, no HMAC over it.
      const secret = createHash("sha256").update(botToken).digest();
      const expected = createHmac("sha256", secret)
        .update(buildDataCheckString(payload))
        .digest("hex");
      if (!signatureMatches(expected, received)) {
        return appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID;
      }
      if (!isFresh(payload.auth_date)) {
        return appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID;
      }
      return toProfile(payload);
    },
  };
}
