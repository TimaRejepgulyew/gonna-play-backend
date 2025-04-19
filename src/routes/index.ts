import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import authRoutes from './auth';
import gameRoutes from './game';
import locationRoutes from './location';
import userRoutes from './user';

export const registerRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Register all route groups
  fastify.register(authRoutes, { prefix: '/api/auth' });
  fastify.register(userRoutes, { prefix: '/api/users' });
  fastify.register(gameRoutes, { prefix: '/api/games' });
  fastify.register(locationRoutes, { prefix: '/api/locations' });

  // Add a catch-all route for 404s
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
    });
  });
};

export default registerRoutes;
