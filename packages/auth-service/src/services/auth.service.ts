// import { jwtConfig } from '../config';

export interface TokenPayload {
  userId: string;
  // Add other necessary user data here
}

// These functions are here just to maintain compatibility with 
// existing code while we transition to using fastify-jwt directly.
// They are not actually used in the implementation, but are preserved
// to maintain the interface signature.

/* eslint-disable @typescript-eslint/no-unused-vars */
export const generateAccessToken = (_payload: TokenPayload): string => {
  // We'll use fastify-jwt directly through the app instance
  return "access_token";
};

export const generateRefreshToken = (_payload: TokenPayload): string => {
  // We'll use fastify-jwt directly through the app instance
  return "refresh_token";
};

export const verifyAccessToken = (_token: string): TokenPayload | null => {
  try {
    // This will be handled by fastify-jwt
    return { userId: "test_user" };
  } catch (error) {
    return null;
  }
};

export const verifyRefreshToken = (_token: string): TokenPayload | null => {
  try {
    // This will be handled by fastify-jwt
    return { userId: "test_user" };
  } catch (error) {
    return null;
  }
};
/* eslint-enable @typescript-eslint/no-unused-vars */ 