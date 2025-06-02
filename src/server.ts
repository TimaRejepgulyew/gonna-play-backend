import Fastify from "fastify";
import loggerConfig from "./config/logger.js";

const server = Fastify({
  logger: loggerConfig,
});

export default server;
