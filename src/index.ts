import { buildApp } from "./app.js";
import env from "./config/env.js";
import { createBootstrapLogger } from "./config/logger.js";

const start = async () => {
  try {
    const server = await buildApp();
    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`Server listening on ${env.HOST}:${env.PORT}`);
  } catch (err) {
    createBootstrapLogger().fatal(err);
    process.exit(1);
  }
};

start();
