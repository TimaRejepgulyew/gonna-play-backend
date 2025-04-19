import fastifyPostgres from '@fastify/postgres';
import dotenv from 'dotenv';
import type { FastifyPluginAsync } from 'fastify';

dotenv.config();

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DB_USER: string;
      DB_PASSWORD: string;
      DB_HOST: string;
      DB_NAME: string;
      DB_PORT?: string;
    }
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const connectionString = `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${
    process.env.DB_HOST
  }:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME}`;

  fastify.register(fastifyPostgres, {
    connectionString,
    // Connection pool settings
    max: 20, // Maximum number of clients the pool should contain
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait for a connection to become available
  });

  // Log when database connection is established
  fastify.addHook('onReady', async () => {
    try {
      const client = await fastify.pg.connect();
      client.release();
      fastify.log.info('Database connection established successfully');
    } catch (err) {
      fastify.log.error('Failed to connect to database', err);
      process.exit(1);
    }
  });
};

export default dbPlugin;
