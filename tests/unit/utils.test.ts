import { describe, expect, it } from "vitest";
import { errorCodes } from "@/constants/index.js";
import { buildMeta, resolvePagination } from "@/types/pagination.js";
import { isErrorShape } from "@/utils/cache.js";
import { normalizeEmail, normalizeEmailPatch } from "@/utils/email.js";

// Смоук резолва: сам факт импорта `@/utils/cache.js` доказывает, что алиас `@/`
// и разрешение `.js` → `.ts` работают — на этом держится вся конфигурация.
describe("isErrorShape", () => {
  it("recognises the { code, message } domain-error shape", () => {
    expect(isErrorShape({ code: 404, message: "not found" })).toBe(true);
  });

  it("rejects a plain entity", () => {
    expect(isErrorShape({ id: 1, name: "field" })).toBe(false);
  });

  // UNIT-09: граница «ровно два ключа» — src/utils/cache.ts:55.
  it.each([
    ["canonical error shape", { code: 404, message: "not found" }, true],
    // Ловушка: третий ключ выводит объект из-под предиката, поэтому
    // preSerialization не подменит статус и доменная ошибка уедет как HTTP 200.
    ["error shape with a third key", { code: 404, message: "not found", data: null }, false],
    ["null", null, false],
    ["a string", "not found", false],
    ["code as a string", { code: "404", message: "not found" }, false],
  ])("%s → %s", (_name, input, expected) => {
    expect(isErrorShape(input)).toBe(expected);
  });

  // G5: the rate-limit body is a catalogue entry, not an inline literal.
  it("RATE_LIMIT_EXCEEDED is a canonical 429 envelope", () => {
    expect(isErrorShape(errorCodes.RATE_LIMIT_EXCEEDED)).toBe(true);
    expect(errorCodes.RATE_LIMIT_EXCEEDED.code).toBe(429);
  });
});

// UNIT-10: клампы и умолчания пагинации — src/types/pagination.ts:53-86.
describe("resolvePagination", () => {
  const allowed = ["createdAt", "name"];

  it("clamps limit above the ceiling down to 100", () => {
    const result = resolvePagination({ limit: 1000 }, allowed, "createdAt");
    expect(result.limit).toBe(100);
    expect(result.take).toBe(100);
  });

  it("silently falls back to the default sort on an unknown field", () => {
    const result = resolvePagination({ sort: "dropTableUsers" }, allowed, "createdAt");
    expect(result.orderBy).toEqual({ createdAt: "desc" });
  });
});

// Единое правило почты обеих половин среза — src/utils/email.ts.
describe("normalizeEmail", () => {
  it.each([
    ["Keeper@Example.com", "keeper@example.com"],
    ["  keeper@example.com  ", "keeper@example.com"],
    ["", null],
    ["   ", null],
    [null, null],
    [undefined, null],
  ])("%s → %s", (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });
});

describe("normalizeEmailPatch", () => {
  // Ловушка обновления: `undefined` значит «поле не трогаем», и превращение его
  // в `null` стёрло бы почту у обновляемого аккаунта.
  it("оставляет undefined как есть", () => {
    expect(normalizeEmailPatch(undefined)).toBeUndefined();
  });

  it("приводит регистр и переводит явную пустоту в null", () => {
    expect(normalizeEmailPatch("Keeper@Example.com")).toBe("keeper@example.com");
    expect(normalizeEmailPatch(null)).toBeNull();
  });
});

describe("buildMeta", () => {
  it("reports totalPages === 1 for an empty result set, not 0", () => {
    expect(buildMeta(1, 20, 0).totalPages).toBe(1);
  });
});
