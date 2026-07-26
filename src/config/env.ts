import { config } from "dotenv";

config({ quiet: true });

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value === "true" || value === "1";

// Comma-separated allowlist -> trimmed, non-empty values.
const toList = (value: string | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const NODE_ENV = process.env.NODE_ENV || "development";
const DEV_JWT_SECRET = "fallback_secret_key_for_dev_only";
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;

// Fail-fast: never boot production on the baked-in dev secret. Dev/test keep
// the fallback so local startup is unchanged.
if (NODE_ENV === "production" && JWT_SECRET === DEV_JWT_SECRET) {
  throw new Error("JWT_SECRET must be set to a non-default value when NODE_ENV=production");
}

// Length of an AES-256 key in bytes, after base64 decoding.
const AUTH_SECRET_KEY_BYTES = 32;

const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID || "";
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "";
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || "";
// The .p8 file arrives as a single line with escaped newlines; PEM parsing in
// createPrivateKey rejects it until they are unescaped.
const APPLE_PRIVATE_KEY = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const AUTH_SECRET_KEY = process.env.AUTH_SECRET_KEY || "";
const APPLE_CLIENT_IDS = toList(process.env.APPLE_CLIENT_IDS);

// Fail-fast: a half-configured Apple is worse than an unconfigured one, because
// it looks operational until token exchange or revocation is attempted. Either
// switch counts as "Apple is on" — a verifier configured by APPLE_CLIENT_IDS
// still reaches the exchange path on sign-in. Both guards stay silent while
// Apple is off entirely: then the route answers 503 "provider not configured".
if (APPLE_CLIENT_ID || APPLE_CLIENT_IDS.length > 0) {
  const missing = [
    APPLE_CLIENT_ID ? "" : "APPLE_CLIENT_ID",
    APPLE_TEAM_ID ? "" : "APPLE_TEAM_ID",
    APPLE_KEY_ID ? "" : "APPLE_KEY_ID",
    APPLE_PRIVATE_KEY ? "" : "APPLE_PRIVATE_KEY",
  ].filter((name) => name.length > 0);

  if (missing.length > 0) {
    throw new Error(
      `Apple sign-in is configured (APPLE_CLIENT_ID or APPLE_CLIENT_IDS is set), so Apple client secret signing is expected, but ${missing.join(", ")} ${
        missing.length === 1 ? "is" : "are"
      } empty`,
    );
  }

  const secretKeyBytes = Buffer.from(AUTH_SECRET_KEY, "base64").length;
  if (secretKeyBytes !== AUTH_SECRET_KEY_BYTES) {
    throw new Error(
      `AUTH_SECRET_KEY must be base64 decoding to exactly ${AUTH_SECRET_KEY_BYTES} bytes when Apple is configured, got ${secretKeyBytes}`,
    );
  }
}

export default {
  NODE_ENV,
  PORT: parseInt(process.env.PORT || "3000", 10),
  HOST: process.env.HOST || "localhost",
  JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "24h",

  // --- Redis / cache layer ---
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  // Transparent namespace applied to every Redis key by ioredis.
  REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX || "gp:",

  // --- Auth (refresh tokens / access blacklist) ---
  // Refresh-token lifetime in seconds (default 30 days).
  REFRESH_TOKEN_TTL: toInt(process.env.REFRESH_TOKEN_TTL, 2_592_000),
  // Opt-in stateful revocation of access tokens (see cache-design §5.2).
  ACCESS_BLACKLIST_ENABLED: toBool(process.env.ACCESS_BLACKLIST_ENABLED, false),

  // --- Rate limiting (fixed-window defaults) ---
  RATE_LIMIT_ENABLED: toBool(process.env.RATE_LIMIT_ENABLED, true),
  RATE_LIMIT_WINDOW: toInt(process.env.RATE_LIMIT_WINDOW, 60),
  RATE_LIMIT_MAX: toInt(process.env.RATE_LIMIT_MAX, 120),

  // --- Logging ---
  // pino level: trace | debug | info | warn | error | fatal (default info).
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  // Transport: file (default, pino/file) | pretty (pino-pretty, dev) | stdout (NDJSON to stdout).
  LOG_TRANSPORT: process.env.LOG_TRANSPORT || "file",
  // File path for LOG_TRANSPORT=file; directory is created automatically (mkdir: true).
  LOG_FILE: process.env.LOG_FILE || "logs/app.log",

  // --- Sign-in providers ---
  // Allowed `aud` values of a Google ID token: the mobile client has a separate
  // client ID per platform (iOS, Android, web). Empty = provider not configured.
  GOOGLE_CLIENT_IDS: toList(process.env.GOOGLE_CLIENT_IDS),
  // Allowed `aud` values of an Apple identityToken: native bundle ID and web
  // Services ID. Empty = provider not configured.
  APPLE_CLIENT_IDS,
  // Client identifier for /auth/token and /auth/revoke; also the `sub` of the
  // computed client secret. Native flow — bundle ID, web flow — Services ID.
  APPLE_CLIENT_ID,
  // Web flow only: Apple requires redirect_uri on code exchange. Empty = native.
  APPLE_REDIRECT_URI: process.env.APPLE_REDIRECT_URI || "",
  // `iss` of the Apple client secret, 10 characters.
  APPLE_TEAM_ID,
  // `kid` header of the Apple client secret.
  APPLE_KEY_ID,
  // Contents of the .p8 EC private key in PEM, newlines already unescaped.
  APPLE_PRIVATE_KEY,
  // AES-256-GCM key encrypting the stored Apple refresh token: base64, exactly
  // 32 bytes decoded. Length is verified at startup when Apple is configured.
  AUTH_SECRET_KEY,
  // Previous key kept during rotation: tried on decryption only, when the
  // current one does not fit.
  AUTH_SECRET_KEY_PREVIOUS: process.env.AUTH_SECRET_KEY_PREVIOUS || "",
  // Secret deriving the HMAC key of the Telegram Login Widget.
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  // Lifetime of the identity-link confirmation ticket, seconds.
  AUTH_LINK_TICKET_TTL: toInt(process.env.AUTH_LINK_TICKET_TTL, 600),

  // --- Outgoing HTTP ---
  // Shared timeout of an outgoing request, milliseconds.
  HTTP_TIMEOUT_MS: toInt(process.env.HTTP_TIMEOUT_MS, 5000),
};
