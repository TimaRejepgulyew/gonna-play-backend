import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastify from 'fastify';
import authPlugin from './plugins/auth';
import dbPlugin from './plugins/db';
import { registerRoutes } from './routes';
import { GameService } from './services/gameService';
import { UserService } from './services/userService';

// Load environment variables
import 'dotenv-safe/config';

// Create Fastify instance
const server = fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Register plugins
async function startServer() {
  try {
    // CORS
    await server.register(cors, {
      origin: process.env.CORS_ORIGIN || true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      credentials: true,
    });

    // Swagger documentation
    await server.register(swagger, {
      openapi: {
        info: {
          title: 'Football Game API',
          description: 'API for managing football games',
          version: '1.0.0',
        },
        servers: [
          {
            url: `http://localhost:${process.env.PORT}`,
            description: 'Development server',
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
    });

    await server.register(swaggerUi, {
      routePrefix: '/documentation',
    });

    // Database
    await server.register(dbPlugin);

    // Authentication
    await server.register(authPlugin);

    // Register routes
    await server.register(registerRoutes);

    // Health check route
    server.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Start the server
    await server.listen({
      port: Number(process.env.PORT) || 3000,
      host: '0.0.0.0',
    });

    console.log(`Server running on port ${process.env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

// Start the server
startServer();
