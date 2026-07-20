import { PlayerController } from "./player.controller.js";
import {
  createPlayerSchema,
  playerListQuerySchema,
  updatePlayerSchema,
} from "./player.model.js";

import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";

export default async function playerRoutes(
  server: FastifyInstance<any, any, any, Logger, any, any, any, any>
) {
  const playerController = new PlayerController(server);

  server.get(
    "/list",
    {
      preHandler: [server.authenticate],
      schema: { querystring: playerListQuerySchema },
    },
    playerController.getPlayerList.bind(playerController)
  );

  server.get(
    "/:id",
    { preHandler: [server.authenticate] },
    playerController.getPlayer.bind(playerController)
  );

  server.post(
    "/",
    { preHandler: [server.authenticate], schema: createPlayerSchema },
    playerController.createPlayer.bind(playerController)
  );

  server.put(
    "/:id",
    { preHandler: [server.authenticate], schema: updatePlayerSchema },
    playerController.updatePlayer.bind(playerController)
  );

  server.delete(
    "/:id",
    { preHandler: [server.authenticate, server.authorize("admin")] },
    playerController.deletePlayer.bind(playerController)
  );
}
