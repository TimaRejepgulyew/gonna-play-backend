import { config } from "dotenv";

config({ quiet: true });

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: string | undefined, fallback: boolean): boolean =>
  value === undefined ? fallback : value === "true" || value === "1";

const NODE_ENV = process.env.NODE_ENV || "development";
const DEV_JWT_SECRET = "fallback_secret_key_for_dev_only";
const JWT_SECRET = process.env.JWT_SECRET || DEV_JWT_SECRET;

// Fail-fast: never boot production on the baked-in dev secret. Dev/test keep
// the fallback so local startup is unchanged.
if (NODE_ENV === "production" && JWT_SECRET === DEV_JWT_SECRET) {
  throw new Error("JWT_SECRET must be set to a non-default value when NODE_ENV=production");
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
};
