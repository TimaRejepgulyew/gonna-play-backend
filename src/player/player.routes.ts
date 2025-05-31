import { PlayerController } from "./player.controller.js";
import { createPlayerSchema, updatePlayerSchema } from "./player.model.js";

import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";

export default async function playerRoutes(
  server: FastifyInstance<any, any, any, Logger, any, any, any, any>
) {
  const playerController = new PlayerController(server);

  server.delete("/:id", playerController.deletePlayer.bind(playerController));

  server.get("/:id", playerController.getPlayer.bind(playerController));

  server.get("/list", playerController.getPlayerList.bind(playerController));

  server.post(
    "/",
    { schema: createPlayerSchema },
    playerController.createPlayer.bind(playerController)
  );

  server.put(
    "/:id",
    { schema: updatePlayerSchema },
    playerController.updatePlayer.bind(playerController)
  );
}
