// In-memory Redis double for the unit project. Installed through the regular
// seam `setRedis(stub)` in tests/setup/unit-setup.ts (§9.11), so no socket is
// ever opened: the slot is taken before lazy creation in `getRedis()` runs.
//
// The method set is dictated by actual call sites, not by guesswork. Line
// numbers below are the post-refactor ones, verified against the code — the
// plan still cites pre-refactor positions:
//   get      src/utils/cache.ts:68, :121
//   set      src/utils/cache.ts:82, src/auth/refreshStore.ts:34, :99
//   del      src/utils/cache.ts:92, src/auth/refreshStore.ts:68, :83, :84
//   incr     src/utils/cache.ts:134, src/utils/rateLimit.ts:32
//   expire   src/utils/rateLimit.ts:34, src/auth/refreshStore.ts:41
//   ttl      src/utils/rateLimit.ts:37
//   exists   src/auth/refreshStore.ts:54, :108
//   sadd     src/auth/refreshStore.ts:40
//   srem     src/auth/refreshStore.ts:69
//   smembers src/auth/refreshStore.ts:81
// The three set commands are what `storeRefresh` calls, so every login-path
// unit test passes through them.

const store = new Map<string, string>();
const sets = new Map<string, Set<string>>();

export interface RedisStub {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ..._rest: unknown[]): Promise<string>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(...args: unknown[]): Promise<number>;
  ttl(...args: unknown[]): Promise<number>;
  exists(key: string): Promise<number>;
  sadd(key: string, member: string): Promise<number>;
  srem(key: string, member: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  flushdb(): Promise<string>;
  quit(): Promise<string>;
  on(...args: unknown[]): RedisStub;
  __reset(): void;
}

const stub: RedisStub = {
  async get(key) {
    return store.get(key) ?? null;
  },
  // Signature with "EX" <ttl> — as in src/utils/cache.ts:82 and
  // src/auth/refreshStore.ts:34. Extra arguments are accepted and ignored.
  async set(key, value, ..._rest) {
    store.set(key, value);
    return "OK";
  },
  // Drops set keys too: revokeAllRefresh (src/auth/refreshStore.ts:84) deletes
  // the jti set by key, and a store-only del would leave it alive.
  async del(...keys) {
    keys.forEach((k) => {
      store.delete(k);
      sets.delete(k);
    });
    return keys.length;
  },
  async incr(key) {
    const next = Number(store.get(key) ?? 0) + 1;
    store.set(key, String(next));
    return next;
  },
  async expire() {
    return 1;
  },
  async ttl() {
    return -1;
  },
  async exists(key) {
    return store.has(key) ? 1 : 0;
  },
  // Refresh-token sets: src/auth/refreshStore.ts:40, :69, :81.
  async sadd(key, member) {
    const set = sets.get(key) ?? new Set<string>();
    set.add(member);
    sets.set(key, set);
    return 1;
  },
  async srem(key, member) {
    return sets.get(key)?.delete(member) ? 1 : 0;
  },
  async smembers(key) {
    return [...(sets.get(key) ?? [])];
  },
  async flushdb() {
    store.clear();
    sets.clear();
    return "OK";
  },
  // No-op: closeRedis() awaits quit() and must not throw on the stub.
  async quit() {
    return "OK";
  },
  // ioredis chains event registration. Returns the proxy, not the raw target,
  // so a chained `.on(...).<unknown>()` still hits the missingMethods trap.
  on() {
    return stubProxy;
  },
  __reset() {
    store.clear();
    sets.clear();
  },
};

/** Unaccounted-for method calls land here; afterEach asserts the list is empty. */
export const missingMethods: string[] = [];

// Recording, not throwing. Every Redis access in src/ sits inside a try with an
// empty catch (src/utils/cache.ts:70-72, :83-85, :93-95, :124-126, :135-137,
// src/utils/rateLimit.ts:46-48, and all six blocks of src/auth/refreshStore.ts).
// A throwing stub would be useless: the exception would land in that same empty
// catch, the helper would return its fallback and the test would go green
// having proved nothing — exactly the failure this double exists to catch.
const stubProxy: RedisStub = new Proxy(stub, {
  get(target, prop, receiver) {
    if (prop in target || typeof prop === "symbol") {
      return Reflect.get(target, prop, receiver);
    }
    missingMethods.push(String(prop));
    return async () => undefined;
  },
});

export default stubProxy;
