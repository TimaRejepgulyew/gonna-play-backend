import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { Type } from "typebox";
import { UserController } from "./user.controller.js";
import { updateUserSchema, userListQuerySchema } from "./user.model.js";

const idParamsSchema = Type.Object({ id: Type.String() });

export default async function userRoutes(fastifyInstance: FastifyInstance) {
  const server = fastifyInstance.withTypeProvider<TypeBoxTypeProvider>();
  const userController = new UserController(fastifyInstance);

  server.get(
    "/list",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { querystring: userListQuerySchema },
    },
    userController.getUserList.bind(userController),
  );

  server.get(
    "/:id",
    { preHandler: [server.authenticate], schema: { params: idParamsSchema } },
    userController.getUser.bind(userController),
  );

  server.put(
    "/:id",
    {
      preHandler: [server.authenticate],
      schema: { body: updateUserSchema, params: idParamsSchema },
    },
    userController.updateUser.bind(userController),
  );

  server.delete(
    "/:id",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { params: idParamsSchema },
    },
    userController.deleteUser.bind(userController),
  );
}
