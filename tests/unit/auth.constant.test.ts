import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUTH_PROVIDER } from "@/auth/constant.js";

const schemaPath = fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url));

// Рукописное перечисление и схема Prisma — два независимых источника, §11.5.
function readSchemaProviders(): string[] {
  const schema = readFileSync(schemaPath, "utf8");
  const block = /enum\s+AUTH_PROVIDER\s*\{([^}]*)\}/.exec(schema);

  if (!block) {
    throw new Error(`enum AUTH_PROVIDER не найден в ${schemaPath}: перечисление сверять не с чем`);
  }

  // Значение может нести атрибуты (`GOOGLE @map("google")`) — берётся имя.
  return block[1]
    .split("\n")
    .map((line) => /^\s*([A-Za-z_]\w*)/.exec(line.replace(/\/\/.*$/, "")))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => match[1]);
}

describe("AUTH_PROVIDER сверяется с prisma/schema.prisma", () => {
  it("множество значений совпадает со схемой", () => {
    const fromSchema = readSchemaProviders();
    const fromCode = Object.values(AUTH_PROVIDER);

    expect([...fromCode].sort()).toEqual([...fromSchema].sort());
  });

  it("каждое значение схемы присутствует в рукописном перечислении", () => {
    const fromCode = new Set<string>(Object.values(AUTH_PROVIDER));

    for (const value of readSchemaProviders()) {
      expect(fromCode.has(value)).toBe(true);
    }
  });

  it("лишних значений сверх схемы в рукописном перечислении нет", () => {
    const fromSchema = new Set(readSchemaProviders());

    for (const value of Object.values(AUTH_PROVIDER)) {
      expect(fromSchema.has(value)).toBe(true);
    }
  });
});
