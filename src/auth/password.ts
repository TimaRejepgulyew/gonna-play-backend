import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const SALT_LENGTH = 16;
const HASH_ITERATIONS = 100_000;
const HASH_ALGO = "sha256";
const HASH_LENGTH = 64;

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || randomBytes(SALT_LENGTH).toString("hex");
  const hash = pbkdf2Sync(password, usedSalt, HASH_ITERATIONS, HASH_LENGTH, HASH_ALGO).toString(
    "hex",
  );
  return { hash, salt: usedSalt };
}

// Produces the string persisted in `User.password`: `salt:hash`.
// The schema column is unchanged; the salt is embedded so login can verify.
export function hashToStorage(password: string): string {
  const { hash, salt } = hashPassword(password);
  return `${salt}:${hash}`;
}

// Verifies a plaintext password against a stored `salt:hash` value.
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored?.includes(":")) {
    return false;
  }
  const [salt, hash] = stored.split(":");
  const check = hashPassword(password, salt).hash;
  const checkBuf = Buffer.from(check, "hex");
  const hashBuf = Buffer.from(hash, "hex");
  if (checkBuf.length !== hashBuf.length) {
    return false;
  }
  return timingSafeEqual(checkBuf, hashBuf);
}
