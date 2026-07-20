import { RoleController } from "./role.controller.js";
import { assignRoleSchema, createRoleSchema } from "./role.model.js";

import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";

export default async function roleRoutes(
  server: FastifyInstance<any, any, any, Logger, any, any, any, any>
) {
  const roleController = new RoleController(server);

  server.get(
    "/list",
    { preHandler: [server.authenticate, server.authorize("admin")] },
    roleController.listRoles.bind(roleController)
  );

  server.post(
    "/",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: createRoleSchema },
    },
    roleController.createRole.bind(roleController)
  );

  server.delete(
    "/:id",
    { preHandler: [server.authenticate, server.authorize("admin")] },
    roleController.deleteRole.bind(roleController)
  );

  server.post(
    "/assign",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: assignRoleSchema },
    },
    roleController.assignRole.bind(roleController)
  );

  server.post(
    "/revoke",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: assignRoleSchema },
    },
    roleController.revokeRole.bind(roleController)
  );
}
