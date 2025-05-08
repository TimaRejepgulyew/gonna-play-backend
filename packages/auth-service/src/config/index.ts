import { config as dotenvConfig } from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenvConfig({ path: path.resolve(process.cwd(), '../../.env') });

// Server configuration
export const serverConfig = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV !== 'production',
};

// JWT configuration
export const jwtConfig = {
  secret: process.env.JWT_SECRET || 'supersecretkey',
  expiresIn: process.env.JWT_EXPIRES_IN || '1d',
};

// CORS configuration
export const corsConfig = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || true,
  credentials: true,
};

// Export all configurations as a single object
export const config = {
  server: serverConfig,
  jwt: jwtConfig,
  cors: corsConfig,
};

export default config; 