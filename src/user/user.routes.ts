import { UserController } from "./user.controller.js";
import { updateUserSchema, userListQuerySchema } from "./user.model.js";

import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";

export default async function userRoutes(
  server: FastifyInstance<any, any, any, Logger, any, any, any, any>
) {
  const userController = new UserController(server);

  server.get(
    "/list",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { querystring: userListQuerySchema },
    },
    userController.getUserList.bind(userController)
  );

  server.get(
    "/:id",
    { preHandler: [server.authenticate] },
    userController.getUser.bind(userController)
  );

  server.put(
    "/:id",
    { preHandler: [server.authenticate], schema: { body: updateUserSchema } },
    userController.updateUser.bind(userController)
  );

  server.delete(
    "/:id",
    { preHandler: [server.authenticate, server.authorize("admin")] },
    userController.deleteUser.bind(userController)
  );
}
