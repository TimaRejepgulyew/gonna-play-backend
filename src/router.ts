import type { FastifyInstance } from "fastify";

import authRoutes from "./auth/auth.routes.js";
import fieldRoutes from "./field/field.routes.js";
import locationRoutes from "./location/location.routes.js";
import matchRoutes from "./match/match.routes.js";
import playerRoutes from "./player/player.routes.js";
import ratingRoutes from "./rating/rating.routes.js";
import roleRoutes from "./role/role.routes.js";
import userRoutes from "./user/user.routes.js";

export default function configureRoutes(server: FastifyInstance) {
  server.register(authRoutes, { prefix: "api/auth" });
  server.register(userRoutes, { prefix: "api/user" });
  server.register(playerRoutes, { prefix: "api/player", logLevel: "debug" });
  server.register(locationRoutes, { prefix: "api/location" });
  server.register(fieldRoutes, { prefix: "api/field" });
  server.register(matchRoutes, { prefix: "api/match" });
  server.register(ratingRoutes, { prefix: "api/rating" });
  server.register(roleRoutes, { prefix: "api/role" });

  server.log.info("api routes registered");
}
