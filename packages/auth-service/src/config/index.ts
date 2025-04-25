import 'dotenv-safe/config'

interface Config {
  port: number
  jwtSecret: string
  corsOrigins: string[]
  database: {
    host: string
    port: number
    user: string
    password: string
    database: string
  }
}

export const config: Config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(','),
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'gonna_play_auth',
  },
} 