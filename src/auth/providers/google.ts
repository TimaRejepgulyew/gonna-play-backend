import { AUTH_PROVIDER } from "@/auth/constant.js";
import env from "@/config/env.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import type { ErrorResponse } from "@/types/prisma.js";
import { createRs256Verifier, type JwtClaims, type Rs256Verifier } from "./jwks.js";
import type { ProviderProfile, ProviderVerifier } from "./types.js";

// Constant in code, never assembled from user input: SSRF is impossible here by construction.
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
// Both forms are legal in a Google ID token; checking only one breaks part of the tokens.
const ALLOWED_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];
const MS_PER_SECOND = 1_000;

interface GoogleVerifierDeps {
  rs256?: Rs256Verifier;
  clientIds?: string[];
}

function isErrorResponse(value: JwtClaims | ErrorResponse): value is ErrorResponse {
  return typeof (value as ErrorResponse).code === "number";
}

function readIdToken(credential: unknown): string | null {
  if (typeof credential !== "object" || credential === null) {
    return null;
  }
  const { idToken } = credential as { idToken?: unknown };
  return typeof idToken === "string" && idToken.length > 0 ? idToken : null;
}

function isExpired(exp: unknown): boolean {
  const seconds = Number(exp);
  if (!Number.isFinite(seconds)) {
    return true;
  }
  return seconds * MS_PER_SECOND <= Date.now();
}

function optional(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toProfile(claims: JwtClaims, sub: string): ProviderProfile {
  const email = optional(claims.email);
  const firstName = optional(claims.given_name);
  const lastName = optional(claims.family_name);
  const avatar = optional(claims.picture);
  return {
    provider: AUTH_PROVIDER.Google,
    // `sub` and not the email: only `sub` is stable and never reused.
    providerUserId: sub,
    emailVerified: claims.email_verified === true,
    ...(email && { email }),
    ...(firstName && { firstName }),
    ...(lastName && { lastName }),
    ...(avatar && { avatar }),
  };
}

export function createGoogleVerifier({
  rs256 = createRs256Verifier(),
  clientIds = env.GOOGLE_CLIENT_IDS,
}: GoogleVerifierDeps = {}): ProviderVerifier {
  return {
    isConfigured: () => clientIds.length > 0,

    verify: async (credential: unknown): Promise<ProviderProfile | ErrorResponse> => {
      const invalid = appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID;
      const idToken = readIdToken(credential);
      if (idToken === null) {
        return invalid;
      }
      const claims = await rs256.verify(idToken, JWKS_URL);
      if (isErrorResponse(claims)) {
        return claims;
      }
      // All three checks are mandatory: dropping any one turns sign-in into
      // accepting an arbitrary JWT. `aud` is matched against the whole list —
      // the mobile client has a separate client ID per platform.
      if (typeof claims.iss !== "string" || !ALLOWED_ISSUERS.includes(claims.iss)) {
        return invalid;
      }
      if (typeof claims.aud !== "string" || !clientIds.includes(claims.aud)) {
        return invalid;
      }
      if (isExpired(claims.exp)) {
        return invalid;
      }
      const sub = optional(claims.sub);
      return sub === undefined ? invalid : toProfile(claims, sub);
    },
  };
}
