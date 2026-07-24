import { createHash } from "node:crypto";

import { getRedis } from "@/config/redis.js";

// Read-through cache helper over the ioredis singleton. Every operation is
// fail-open: a Redis error is swallowed and the caller falls back to its
// loader (i.e. Postgres), so an unavailable Redis degrades to "no cache"
// rather than a failed request. See cache-design.md §2.3 / §4.

// TTLs (seconds) per key class — cache-design.md §3.
export const CACHE_TTL = {
  MATCH_LIST: 30,
  MATCH_DETAIL: 60,
  MATCH_PARTICIPANTS: 30,
  FIELD_SCHEDULE: 60,
  FIELD_LIST: 300,
  FIELD_DETAIL: 300,
  LOCATION_LIST: 600,
  LOCATION_DETAIL: 600,
  PLAYER_RATING: 300,
  PLAYER_LEADERBOARD: 300,
  PLAYER_DETAIL: 120,
  PLAYER_LIST: 60,
} as const;

// Single-entity key builders (direct DEL invalidation) — cache-design.md §4.
export const cacheKeys = {
  matchDetail: (id: number) => `match:detail:${id}`,
  fieldDetail: (id: number) => `field:detail:${id}`,
  locationDetail: (id: number) => `location:detail:${id}`,
  playerDetail: (id: number) => `player:detail:${id}`,
  playerRating: (playerId: number) => `player:rating:${playerId}`,
};

// Per-match participants form several keys (filtered by status); they share a
// dedicated version counter so one INCR invalidates all of a match's variants.
export const participantsClass = (matchId: number) => `match:participants:${matchId}`;

// Per-field schedule version class (cache-design.md §4).
export const fieldScheduleClass = (fieldId: number) => `field:schedule:${fieldId}`;

// Domain-error guard: readers return an entity or an ErrorResponse
// (`{ code, message }`). Single source of truth for the "error shape"
// heuristic, shared by the cache layer and the HTTP status hook.
type MaybeError = { code?: unknown; message?: unknown } | null | undefined;
export function isErrorShape(value: unknown): boolean {
  const v = value as MaybeError;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.code === "number" &&
    typeof v.message === "string" &&
    Object.keys(v).length === 2
  );
}

// Never cache the error shape (nor null/undefined).
export function isCacheable(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return !isErrorShape(value);
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null; // fail-open
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    /* fail-open */
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const redis = getRedis();
    await redis.del(...keys);
  } catch {
    /* fail-open */
  }
}

// Read-through: return the cached value, otherwise run `loader`, cache the
// result (only when cacheable — successful, non-error, non-null) and return it.
export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const value = await loader();
  if (isCacheable(value)) {
    await cacheSet(key, value, ttlSeconds);
  }
  return value;
}

// --- Versioned list/aggregate classes (cache-design.md §4) ---

// Current version counter for a key class (0 when unset or Redis is down).
async function currentVersion(cls: string): Promise<number> {
  try {
    const redis = getRedis();
    const raw = await redis.get(`ver:${cls}`);
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0; // fail-open: a stable version 0 still yields a usable key
  }
}

// O(1) invalidation of an entire list/aggregate class: bump its version so all
// previously written `<cls>:g{N}:...` keys are orphaned and expire via TTL.
export async function bumpVersion(cls: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.incr(`ver:${cls}`);
  } catch {
    /* fail-open */
  }
}

// Deterministic serialization of list filters: undefined/null/"" dropped,
// keys sorted lexicographically, then hashed to a fixed-length digest so the
// key stays bounded regardless of the number of filters (cache-design.md §3.1).
export function canonicalizeFilters(filters: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of Object.keys(filters).sort()) {
    const value = filters[key];
    if (value === undefined || value === null || value === "") continue;
    parts.push(`${key}=${String(value)}`);
  }
  const canonical = parts.join("|");
  return createHash("sha1").update(canonical).digest("hex").slice(0, 16);
}

// Builds a versioned list key: `<cls>:g{N}:{digest}`.
export async function listKey(cls: string, filters: Record<string, unknown>): Promise<string> {
  const version = await currentVersion(cls);
  return `${cls}:g${version}:${canonicalizeFilters(filters)}`;
}

// Convenience read-through for versioned list classes.
export async function getOrSetList<T>(
  cls: string,
  filters: Record<string, unknown>,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const key = await listKey(cls, filters);
  return getOrSet(key, ttlSeconds, loader);
}
