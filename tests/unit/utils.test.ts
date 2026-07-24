import { describe, expect, it } from "vitest";
import { buildMeta, resolvePagination } from "@/types/pagination.js";
import { isErrorShape } from "@/utils/cache.js";

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

describe("buildMeta", () => {
  it("reports totalPages === 1 for an empty result set, not 0", () => {
    expect(buildMeta(1, 20, 0).totalPages).toBe(1);
  });
});
