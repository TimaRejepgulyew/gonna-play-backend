// Control case for the whole unit project (§11.5, Task 3.6).
//
// Every Redis access in src/ sits inside a try with an empty catch
// (src/utils/cache.ts:70-72, :83-85, :93-95, :124-126, :135-137). So a unit test
// that goes through getOrSet/bumpVersion goes green even when the double is
// broken: the helper swallows the failure and returns its fallback. Without the
// missingMethods trap of tests/unit/doubles/redis.stub.ts none of those tests
// prove anything.
//
// This file proves the trap actually reddens the suite: it runs the cache layer
// against a deliberately incomplete stub and asserts both that the helper stays
// silent (the hazard) and that missingMethods records the miss (the guard), then
// asserts that the very assertion afterEach performs fails on that list.

import { afterEach, describe, expect, it } from "vitest";
import type { Redis } from "ioredis";

import { getOrSet } from "@/utils/cache.js";
import { setRedis } from "@/config/redis.js";

import stub, { missingMethods } from "./doubles/redis.stub.js";

// A stub built exactly like the real one but with `get` left out. It records
// into the same missingMethods array, so the guard under test is the real one.
function createStubWithoutGet(): Redis {
  const target = {
    async set() {
      return "OK";
    },
    async quit() {
      return "OK";
    },
  };

  return new Proxy(target, {
    get(t, prop, receiver) {
      if (prop in t || typeof prop === "symbol") {
        return Reflect.get(t, prop, receiver);
      }
      missingMethods.push(String(prop));
      return async () => undefined;
    },
  }) as unknown as Redis;
}

// Each case leaves the standard stub in the slot and the list empty, so the
// global afterEach of tests/setup/unit-setup.ts still sees a clean state.
afterEach(() => {
  setRedis(stub as unknown as Redis);
  missingMethods.length = 0;
});

describe("redis stub contract", () => {
  it("records an unaccounted-for method instead of throwing", async () => {
    const unaccounted = (stub as unknown as Record<string, () => Promise<unknown>>)
      .hgetall;

    await expect(unaccounted()).resolves.toBeUndefined();
    expect(missingMethods).toEqual(["hgetall"]);
  });

  it("reddens the suite when the stub is missing a method the cache calls", async () => {
    setRedis(createStubWithoutGet());

    // The hazard: cacheGet's empty catch turns the missing `get` into a plain
    // cache miss, so getOrSet returns the loader value and nothing looks wrong.
    const value = await getOrSet("match:detail:1", 60, async () => ({ id: 1 }));
    expect(value).toEqual({ id: 1 });

    // The guard: the miss was recorded even though no error surfaced.
    expect(missingMethods).toContain("get");

    // And the assertion afterEach runs on that list does fail — which is what
    // makes the incomplete stub red rather than silently green.
    expect(() => expect(missingMethods).toEqual([])).toThrow();
  });

  it("stays green with the full stub in place", async () => {
    const value = await getOrSet("match:detail:2", 60, async () => ({ id: 2 }));
    expect(value).toEqual({ id: 2 });

    // Second read is served from the stub's store — `get` and `set` both worked.
    const cached = await getOrSet("match:detail:2", 60, async () => ({ id: 99 }));
    expect(cached).toEqual({ id: 2 });

    expect(missingMethods).toEqual([]);
  });
});
