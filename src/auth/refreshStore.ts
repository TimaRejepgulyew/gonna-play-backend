import redis from "@/config/redis.js";

// Redis-backed refresh-token state (cache-design.md §5). Access tokens stay
// stateless JWTs; refresh tokens carry a `jti` whose active record lives here:
//   auth:refresh:{userId}:{jti}   -> metadata, TTL = REFRESH_TOKEN_TTL
//   auth:refresh:user:{userId}    -> Set of active jti (mass revoke / rotation)
//   auth:blacklist:{jti}          -> optional access-token revocation marker
//
// Writes are best-effort (a down Redis must not break login). Reads used for
// security decisions return an explicit "unavailable" state so the caller can
// choose a fail-open branch instead of silently treating it as "missing".

const refreshKey = (userId: number, jti: string) =>
  `auth:refresh:${userId}:${jti}`;
const userSetKey = (userId: number) => `auth:refresh:user:${userId}`;
const blacklistKey = (jti: string) => `auth:blacklist:${jti}`;

export type RefreshCheck = "valid" | "missing" | "unavailable";

export interface RefreshMeta {
  userAgent?: string;
  ip?: string;
}

// Persist a freshly issued refresh token (login/register/rotation).
export async function storeRefresh(
  userId: number,
  jti: string,
  ttlSeconds: number,
  meta: RefreshMeta = {}
): Promise<void> {
  try {
    await redis.set(
      refreshKey(userId, jti),
      JSON.stringify({ createdAt: Date.now(), ...meta }),
      "EX",
      ttlSeconds
    );
    await redis.sadd(userSetKey(userId), jti);
    await redis.expire(userSetKey(userId), ttlSeconds);
  } catch {
    /* best-effort: token still issued, degrades to stateless behaviour */
  }
}

// Presence check used for rotation / reuse detection.
export async function checkRefresh(
  userId: number,
  jti: string
): Promise<RefreshCheck> {
  try {
    const exists = await redis.exists(refreshKey(userId, jti));
    return exists === 1 ? "valid" : "missing";
  } catch {
    return "unavailable";
  }
}

// Revoke a single refresh token (rotation consumes the old jti; logout).
export async function revokeRefresh(
  userId: number,
  jti: string
): Promise<void> {
  try {
    await redis.del(refreshKey(userId, jti));
    await redis.srem(userSetKey(userId), jti);
  } catch {
    /* best-effort */
  }
}

// Revoke every active refresh token for a user ("logout everywhere" /
// hard logout on detected refresh-token reuse).
export async function revokeAllRefresh(userId: number): Promise<void> {
  try {
    const setKey = userSetKey(userId);
    const jtis = await redis.smembers(setKey);
    const keys = jtis.map((jti) => refreshKey(userId, jti));
    if (keys.length > 0) await redis.del(...keys);
    await redis.del(setKey);
  } catch {
    /* best-effort */
  }
}

// --- Optional access-token blacklist (cache-design.md §5.2) ---

export async function blacklistAccess(
  jti: string,
  ttlSeconds: number
): Promise<void> {
  if (ttlSeconds <= 0) return;
  try {
    await redis.set(blacklistKey(jti), "1", "EX", ttlSeconds);
  } catch {
    /* best-effort */
  }
}

export async function isAccessBlacklisted(jti: string): Promise<boolean> {
  try {
    return (await redis.exists(blacklistKey(jti))) === 1;
  } catch {
    return false; // fail-open: never lock users out because Redis is down
  }
}
