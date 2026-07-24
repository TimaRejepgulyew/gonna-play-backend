import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { RoleController } from "./role.controller.js";
import { assignRoleSchema, createRoleSchema } from "./role.model.js";

const idParamsSchema = Type.Object({ id: Type.String() });

export default async function roleRoutes(fastifyInstance: FastifyInstance) {
  const server = fastifyInstance.withTypeProvider<TypeBoxTypeProvider>();
  const roleController = new RoleController(fastifyInstance);

  server.get(
    "/list",
    { preHandler: [server.authenticate, server.authorize("admin")] },
    roleController.listRoles.bind(roleController),
  );

  server.post(
    "/",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: createRoleSchema },
    },
    roleController.createRole.bind(roleController),
  );

  server.delete(
    "/:id",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { params: idParamsSchema },
    },
    roleController.deleteRole.bind(roleController),
  );

  server.post(
    "/assign",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: assignRoleSchema },
    },
    roleController.assignRole.bind(roleController),
  );

  server.post(
    "/revoke",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: assignRoleSchema },
    },
    roleController.revokeRole.bind(roleController),
  );
}
