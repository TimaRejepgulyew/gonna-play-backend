import { FastifyInstance } from "fastify";
import { Logger } from "pino";

import playerRoutes from "./player/player.routes.js";

export default function configureRoutes(
  server: FastifyInstance<any, any, any, Logger, any, any, any, any>
) {
  server.log.info("api/player routes registered");
  server.register(playerRoutes, { prefix: "api/player", logLevel: "debug" });
}
