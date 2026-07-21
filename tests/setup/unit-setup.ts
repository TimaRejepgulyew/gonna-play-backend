// Per-file hooks of the unit project, wired through `setupFiles` of the unit
// project in vitest.config.ts (§9.4) so they apply to every unit file instead of
// being duplicated by hand.

import { afterEach, beforeEach, expect } from "vitest";
import type { Redis } from "ioredis";

import { closeRedis, setRedis } from "@/config/redis.js";

import stub, { missingMethods } from "../unit/doubles/redis.stub.js";

beforeEach(() => {
  // Seam from §9.3.2: the stub takes the slot before the first getRedis() in
  // src/ runs, so no socket is ever opened by the unit project.
  // Cast is unavoidable: setRedis() takes the full ioredis class, the stub
  // implements only the commands src/ calls. §9.11's "the seam is type-checked"
  // does not hold — any cast here disables that check entirely.
  setRedis(stub as unknown as Redis);
  // Without __reset() cache contents leak between cases: getOrSet
  // (src/utils/cache.ts) reads through cacheGet, and a value left over from the
  // previous test would stand in for the loader's result.
  stub.__reset();
  missingMethods.length = 0;
});

afterEach(async () => {
  // An empty list is the only proof the stub covered every call: the fail-open
  // empty catches in the cache and rate limiter would otherwise swallow a miss
  // silently and let the test go green having proved nothing.
  expect(missingMethods).toEqual([]);
  await closeRedis(); // frees the slot; quit() on the stub is a no-op
});
