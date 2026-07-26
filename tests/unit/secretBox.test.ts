import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/utils/secretBox.js";

const key = randomBytes(32);
const previousKey = randomBytes(32);
const plain = "apple-refresh-token-value";

// Портит один символ выбранной секции значения, оставаясь в алфавите base64url.
function corruptSection(value: string, section: number): string {
  const parts = value.split(".");
  const target = parts[section];
  const first = target[0] === "A" ? "B" : "A";
  parts[section] = first + target.slice(1);
  return parts.join(".");
}

describe("secretBox", () => {
  it("decrypts back what it encrypted", () => {
    expect(decryptSecret(encryptSecret(plain, key), [key])).toBe(plain);
  });

  it("produces a value that is neither the plaintext nor stable across calls", () => {
    const first = encryptSecret(plain, key);
    const second = encryptSecret(plain, key);

    expect(first).not.toBe(plain);
    expect(first).not.toContain(plain);
    expect(first).not.toBe(second);
    expect(decryptSecret(second, [key])).toBe(plain);
  });

  it("carries the declared version and section layout", () => {
    const parts = encryptSecret(plain, key).split(".");

    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
  });

  // Ротация ключа: перешифрования данных нет, старое значение обязано читаться
  // списком [новый, прежний] — иначе удаление аккаунта теряет отзыв доступа.
  it("reads a value of the previous key when that key is still in the list", () => {
    const value = encryptSecret(plain, previousKey);

    expect(decryptSecret(value, [key, previousKey])).toBe(plain);
  });

  it("returns null, not a throw, when the previous key is gone", () => {
    const value = encryptSecret(plain, previousKey);

    expect(decryptSecret(value, [key])).toBeNull();
  });

  it.each([
    ["a corrupted ciphertext", 3],
    ["a corrupted tag", 2],
    ["a corrupted iv", 1],
  ])("returns null for %s", (_name, section) => {
    const value = corruptSection(encryptSecret(plain, key), section);

    expect(decryptSecret(value, [key])).toBeNull();
  });

  it.each([
    ["an empty string", ""],
    ["a foreign format", "not-an-encrypted-value"],
    ["an unknown version", `v2.${encryptSecret(plain, key).split(".").slice(1).join(".")}`],
    ["too few sections", "v1.abc.def"],
  ])("returns null for %s", (_name, value) => {
    expect(decryptSecret(value, [key])).toBeNull();
  });

  it("returns null when no keys are offered", () => {
    expect(decryptSecret(encryptSecret(plain, key), [])).toBeNull();
  });
});
