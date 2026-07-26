import { AUTH_PROVIDER } from "@/auth/constant.js";
import env from "@/config/env.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import type { ErrorResponse } from "@/types/prisma.js";
import { createRs256Verifier, type JwtClaims, type Rs256Verifier } from "./jwks.js";
import type { ProviderProfile, ProviderVerifier } from "./types.js";

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_ISSUER = "https://appleid.apple.com";
const MS_PER_SECOND = 1_000;
// The name is unsigned client input, so it is trimmed and capped before storage.
const NAME_MAX_LENGTH = 100;
const CONTROL_CHARS = /[\p{Cc}\p{Cf}]/gu;

interface AppleCredential {
  identityToken?: unknown;
  user?: { name?: { firstName?: unknown; lastName?: unknown } };
  nonce?: unknown;
}

// Apple documents a deviation from OIDC: email_verified and is_private_email
// arrive either as a boolean or as a string. Anything else means "not verified".
function appleBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function sanitizeName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(CONTROL_CHARS, " ").trim().slice(0, NAME_MAX_LENGTH);
  return cleaned.length > 0 ? cleaned : undefined;
}

function claimsValid(claims: JwtClaims, clientIds: string[], nonce: unknown): boolean {
  if (claims.iss !== APPLE_ISSUER) return false;
  if (typeof claims.aud !== "string" || !clientIds.includes(claims.aud)) return false;
  if (typeof claims.exp !== "number" || claims.exp * MS_PER_SECOND <= Date.now()) return false;
  if (typeof claims.sub !== "string" || claims.sub.length === 0) return false;
  if (nonce !== undefined && claims.nonce !== nonce) return false;
  return true;
}

function toProfile(claims: JwtClaims, credential: AppleCredential): ProviderProfile {
  const email = typeof claims.email === "string" ? claims.email : undefined;
  const firstName = sanitizeName(credential.user?.name?.firstName);
  const lastName = sanitizeName(credential.user?.name?.lastName);
  return {
    provider: AUTH_PROVIDER.Apple,
    // Identity is the `sub` alone: email may be absent (School/Business accounts).
    providerUserId: claims.sub as string,
    emailVerified: appleBoolean(claims.email_verified),
    ...(email && { email }),
    ...(firstName && { firstName }),
    ...(lastName && { lastName }),
    // No avatar ever: Apple returns no photo in any flow or scope.
  };
}

export function createAppleVerifier(
  rs256: Rs256Verifier = createRs256Verifier(),
  clientIds: string[] = env.APPLE_CLIENT_IDS,
): ProviderVerifier {
  return {
    isConfigured: () => clientIds.length > 0,

    verify: async (credential: unknown): Promise<ProviderProfile | ErrorResponse> => {
      if (typeof credential !== "object" || credential === null) {
        return appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID;
      }
      const body = credential as AppleCredential;
      if (typeof body.identityToken !== "string") {
        return appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID;
      }
      const claims = await rs256.verify(body.identityToken, APPLE_JWKS_URL);
      if (typeof (claims as ErrorResponse).code === "number") return claims as ErrorResponse;
      if (!claimsValid(claims as JwtClaims, clientIds, body.nonce)) {
        return appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID;
      }
      // The name arrives only on the very first authorization, in the request
      // body rather than the JWT, and there is no way to ask for it again.
      return toProfile(claims as JwtClaims, body);
    },
  };
}
