import postgres from 'postgres';
import { config } from '@/config/server';

const sql = postgres({
  host: config.POSTGRES_HOST,
  port: config.POSTGRES_PORT,
  database: config.POSTGRES_DB,
  username: config.POSTGRES_USER,
  password: config.POSTGRES_PASSWORD,
  max: 10, // Maximum number of connections
  idle_timeout: 30, // Timeout in seconds
  connect_timeout: 30, // Timeout in seconds
});

export default sql; 