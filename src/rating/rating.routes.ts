import { RatingController } from "./rating.controller.js";
import { createRatingSchema } from "./rating.model.js";

import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";

export default async function ratingRoutes(
  server: FastifyInstance<any, any, any, Logger, any, any, any, any>
) {
  const ratingController = new RatingController(server);

  server.post(
    "/",
    { preHandler: [server.authenticate], schema: { body: createRatingSchema } },
    ratingController.createRating.bind(ratingController)
  );

  server.get(
    "/player/:playerId",
    ratingController.getPlayerRatings.bind(ratingController)
  );

  server.get(
    "/match/:matchId",
    { preHandler: [server.authenticate] },
    ratingController.getMatchRatings.bind(ratingController)
  );

  server.delete(
    "/:id",
    { preHandler: [server.authenticate] },
    ratingController.deleteRating.bind(ratingController)
  );
}
