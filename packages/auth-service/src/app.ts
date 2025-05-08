// src/app.ts

import fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";

import authRoutes from "./routes/auth.routes";
import { authenticate } from "./middleware/auth.middleware";
import { serverConfig, corsConfig, jwtConfig } from "./config";

// Create Fastify app instance
export const app = fastify({
  logger: true, // Enable logger for better development experience
});

// Register plugins
app.register(cors, corsConfig);
app.register(jwt, { secret: jwtConfig.secret });

// Register authentication routes
app.register(authRoutes, { prefix: "/auth" });

// Example of a protected route
app.get(
  "/protected",
  { 
    preValidation: [authenticate] // Use preValidation instead of preHandler
  },
  async (request) => {
    // Access authenticated user information from request.user
    return { message: "This is a protected route", user: request.user };
  }
);

export const startServer = async () => {
  try {
    await app.listen({ 
      port: serverConfig.port, 
      host: serverConfig.host 
    });
    console.log(`Auth service listening on ${serverConfig.host}:${serverConfig.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}
