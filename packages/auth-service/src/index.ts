import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '@/config/server';
import { authRoutes } from '@/routes/auth.routes';
import authPlugin from '@/plugins/auth';
import { errorHandler } from '@/middleware/error-handler';

const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport: {
      target: 'pino-pretty',
    },
  },
});

// Register plugins
fastify.register(cors, {
  origin: config.CORS_ORIGIN,
  credentials: true,
});

fastify.register(swagger, {
  swagger: {
    info: {
      title: 'Authentication API',
      description: 'API for user authentication',
      version: '1.0.0',
    },
    host: `${config.HOST}:${config.PORT}`,
    schemes: ['http'],
    consumes: ['application/json'],
    produces: ['application/json'],
    securityDefinitions: {
      bearerAuth: {
        type: 'apiKey',
        name: 'Authorization',
        in: 'header',
      },
    },
  },
});

fastify.register(swaggerUi, {
  routePrefix: '/documentation',
});

// Register auth plugin
fastify.register(authPlugin);

// Register routes
fastify.register(authRoutes, { prefix: '/api/auth' });

// Register error handler
fastify.setErrorHandler(errorHandler);

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: parseInt(config.PORT), host: config.HOST });
    fastify.log.info(`Server is running on ${config.HOST}:${config.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start(); 