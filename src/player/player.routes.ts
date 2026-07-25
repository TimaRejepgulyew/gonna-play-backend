import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { Type } from "typebox";
import { PlayerController } from "./player.controller.js";
import { createPlayerSchema, playerListQuerySchema, updatePlayerSchema } from "./player.model.js";

const idParamsSchema = Type.Object({ id: Type.String() });

export default async function playerRoutes(fastifyInstance: FastifyInstance) {
  const server = fastifyInstance.withTypeProvider<TypeBoxTypeProvider>();
  const playerController = new PlayerController(fastifyInstance);

  server.get(
    "/list",
    {
      preHandler: [server.authenticate],
      schema: { querystring: playerListQuerySchema },
    },
    playerController.getPlayerList.bind(playerController),
  );

  server.get(
    "/:id",
    { preHandler: [server.authenticate], schema: { params: idParamsSchema } },
    playerController.getPlayer.bind(playerController),
  );

  server.post(
    "/",
    { preHandler: [server.authenticate], schema: { body: createPlayerSchema } },
    playerController.createPlayer.bind(playerController),
  );

  server.put(
    "/:id",
    {
      preHandler: [server.authenticate],
      schema: { body: updatePlayerSchema, params: idParamsSchema },
    },
    playerController.updatePlayer.bind(playerController),
  );

  server.delete(
    "/:id",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { params: idParamsSchema },
    },
    playerController.deletePlayer.bind(playerController),
  );
}
