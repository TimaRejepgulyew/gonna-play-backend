import { describe, expect, it } from "vitest";

import { hashToStorage, verifyPassword } from "@/auth/password.js";

// UNIT-13: круговой прогон PBKDF2 без моков — src/auth/password.ts:8-43.
// Доказывает совместимость алгоритма самого с собой: фикстуры акторов хешируют
// пароль этим же кодом, значит логин через verifyPassword пройдёт.
describe("password hashing round trip", () => {
  const password = "S3cret-pass!";

  it("verifies a password against its own stored hash", () => {
    expect(verifyPassword(password, hashToStorage(password))).toBe(true);
  });

  it("returns false for a wrong password instead of throwing", () => {
    const stored = hashToStorage(password);
    expect(() => verifyPassword("wrong-password", stored)).not.toThrow();
    expect(verifyPassword("wrong-password", stored)).toBe(false);
  });

  // Формат хранения — `salt:hash` (src/auth/password.ts:25-28): без разделителя
  // verifyPassword уходит в ранний false (:32-34) и логин ломается молча.
  it("stores the value in the `salt:hash` form", () => {
    const stored = hashToStorage(password);
    expect(stored).toContain(":");
    const [salt, hash] = stored.split(":");
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });

  // Соль случайна (randomBytes, :12), поэтому два хеша одного пароля различны,
  // и оба обязаны верифицироваться.
  it("produces a distinct stored value per call, both verifiable", () => {
    const first = hashToStorage(password);
    const second = hashToStorage(password);
    expect(first).not.toBe(second);
    expect(verifyPassword(password, first)).toBe(true);
    expect(verifyPassword(password, second)).toBe(true);
  });

  it.each([
    ["empty string", ""],
    ["value without a separator", "nosaltnohash"],
  ])("returns false for a malformed stored value (%s)", (_name, stored) => {
    expect(verifyPassword(password, stored)).toBe(false);
  });

  // Беспарольный аккаунт (провайдерский вход): `User.password` теперь nullable,
  // и login зовёт verifyPassword с null. Ранний guard (:25-27) обязан отсечь
  // до split/pbkdf2Sync, иначе вход провайдерского пользователя даёт 500.
  it("returns false for a null stored value instead of throwing", () => {
    expect(() => verifyPassword(password, null)).not.toThrow();
    expect(verifyPassword(password, null)).toBe(false);
  });
});
