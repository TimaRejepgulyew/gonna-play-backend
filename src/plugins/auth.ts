import fastifyJwt from '@fastify/jwt';
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { JwtPayload } from '../types';

const authPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
    sign: {
      expiresIn: '7d', // tokens expire in 7 days
    },
  });

  // Decorator to generate tokens
  fastify.decorate('generateToken', (user: JwtPayload) => {
    return fastify.jwt.sign({
      id: user.id,
      email: user.email,
      username: user.username,
    });
  });

  // Authentication function
  const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Invalid token or not authenticated',
      });
    }
  };

  // Register the authenticate function as a decorator
  fastify.decorate('authenticate', authenticate);

  // Add a hook to make the authenticate function available in preHandler
  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.preHandler && Array.isArray(routeOptions.preHandler)) {
      routeOptions.preHandler = routeOptions.preHandler.map((handler) => {
        if (handler === fastify.authenticate) {
          return authenticate;
        }
        return handler;
      });
    }
  });
};

export default fp(authPlugin);
