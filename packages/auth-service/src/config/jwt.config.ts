// src/config/jwt.config.ts
import { jwtConfig } from '.';

export const JWT_SECRET = jwtConfig.secret;
export const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'your_refresh_token_secret';
export const ACCESS_TOKEN_EXPIRY = jwtConfig.expiresIn;
export const REFRESH_TOKEN_EXPIRY = '7d'; // Example: 7 days 