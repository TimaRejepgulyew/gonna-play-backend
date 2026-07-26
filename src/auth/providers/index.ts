import { AUTH_PROVIDER } from "@/auth/constant.js";
import { createAppleVerifier } from "./apple.js";
import { createGoogleVerifier } from "./google.js";
import { createHttpJwksLoader, createRs256Verifier, type JwksLoader } from "./jwks.js";
import { createTelegramVerifier } from "./telegram.js";
import type { ProviderVerifier, VerifierRegistry } from "./types.js";

export interface VerifierRegistryDeps {
  /** Подменяется в тестах: так JWKS берётся без сети и без подмены глобального `fetch`. */
  jwksLoader?: JwksLoader;
}

export function createVerifierRegistry({
  jwksLoader = createHttpJwksLoader(),
}: VerifierRegistryDeps = {}): VerifierRegistry {
  const rs256 = createRs256Verifier(jwksLoader);
  return {
    [AUTH_PROVIDER.Google]: createGoogleVerifier({ rs256 }),
    [AUTH_PROVIDER.Apple]: createAppleVerifier(rs256),
    [AUTH_PROVIDER.Telegram]: createTelegramVerifier(),
  };
}

const defaultRegistry = createVerifierRegistry();

export function getVerifier(provider: AUTH_PROVIDER): ProviderVerifier {
  return defaultRegistry[provider];
}
