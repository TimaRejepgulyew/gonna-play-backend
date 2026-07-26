import { createPrivateKey, sign } from "node:crypto";
import env from "@/config/env.js";

const APPLE_AUDIENCE = "https://appleid.apple.com";
// Our choice: the secret is rebuilt on every call, so a long life only widens
// the window of abuse for a leaked value.
const CLIENT_SECRET_TTL_SEC = 300;
// Apple's ceiling on `exp - iat` (six months); kept as an enforced bound so a
// future TTL bump cannot silently cross it.
const APPLE_MAX_SECRET_TTL_SEC = 15_777_000;
const EFFECTIVE_TTL_SEC = Math.min(CLIENT_SECRET_TTL_SEC, APPLE_MAX_SECRET_TTL_SEC);
const MS_PER_SECOND = 1_000;

const b64url = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");

// Apple's client secret is a signed ES256 JWT the application computes itself,
// not a string from configuration. The same value is presented on code exchange
// and on revocation.
export function buildAppleClientSecret(now = Date.now()): string {
  const iat = Math.floor(now / MS_PER_SECOND);
  const header = { alg: "ES256", kid: env.APPLE_KEY_ID, typ: "JWT" };
  const claims = {
    iss: env.APPLE_TEAM_ID,
    iat,
    exp: iat + EFFECTIVE_TTL_SEC,
    aud: APPLE_AUDIENCE,
    sub: env.APPLE_CLIENT_ID,
  };
  const input = `${b64url(header)}.${b64url(claims)}`;
  // dsaEncoding "ieee-p1363" yields the raw r||s JWS requires. Without it Node
  // signs in DER and Apple answers invalid_client.
  const key = createPrivateKey(env.APPLE_PRIVATE_KEY);
  const signature = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return `${input}.${signature.toString("base64url")}`;
}
