import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { Type } from "typebox";
import { RatingController } from "./rating.controller.js";
import { createRatingSchema } from "./rating.model.js";

const idParamsSchema = Type.Object({ id: Type.String() });
const playerIdParamsSchema = Type.Object({ playerId: Type.String() });
const matchIdParamsSchema = Type.Object({ matchId: Type.String() });

export default async function ratingRoutes(fastifyInstance: FastifyInstance) {
  const server = fastifyInstance.withTypeProvider<TypeBoxTypeProvider>();
  const ratingController = new RatingController(fastifyInstance);

  server.post(
    "/",
    { preHandler: [server.authenticate], schema: { body: createRatingSchema } },
    ratingController.createRating.bind(ratingController),
  );

  server.get(
    "/player/:playerId",
    { schema: { params: playerIdParamsSchema } },
    ratingController.getPlayerRatings.bind(ratingController),
  );

  server.get(
    "/match/:matchId",
    { preHandler: [server.authenticate], schema: { params: matchIdParamsSchema } },
    ratingController.getMatchRatings.bind(ratingController),
  );

  server.delete(
    "/:id",
    { preHandler: [server.authenticate], schema: { params: idParamsSchema } },
    ratingController.deleteRating.bind(ratingController),
  );
}
