import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = "v1";
const SECTIONS = 4;
const ENCODING = "base64url";

// Формат значения: v1.<iv>.<tag>.<ciphertext>, всё base64url.
export function encryptSecret(plain: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new Error(`secretBox: key must be ${KEY_BYTES} bytes`);
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString(ENCODING),
    tag.toString(ENCODING),
    ciphertext.toString(ENCODING),
  ].join(".");
}

/** null — значение не расшифровалось: не тот ключ, порча или чужой формат. Не бросает. */
export function decryptSecret(value: string, keys: readonly Buffer[]): string | null {
  const parts = value.split(".");
  if (parts.length !== SECTIONS || parts[0] !== VERSION) return null;

  const iv = Buffer.from(parts[1], ENCODING);
  const tag = Buffer.from(parts[2], ENCODING);
  const ciphertext = Buffer.from(parts[3], ENCODING);
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

  for (const key of keys) {
    if (key.length !== KEY_BYTES) continue;
    try {
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
      /* не тот ключ или значение испорчено — пробуем следующий */
    }
  }

  return null;
}
