import cors from "@fastify/cors";

import configureRoutes from "./router.js";
import env from "./config/env.js";
import prismaPlugin from "./plugins/prisma.js";
import server from "./server.js";

server.register(cors, {
  origin: true,
  credentials: true,
});

server.register(prismaPlugin);

configureRoutes(server);

server.get("/ping", (_req, reply) => {
  reply.send({ message: "pong" });
});

const start = async () => {
  try {
    await server.listen({ port: env.PORT, host: env.HOST });
    server.log.info(`Server listening on ${env.HOST}:${env.PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
