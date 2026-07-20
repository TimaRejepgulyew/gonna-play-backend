import { rateLimit } from "@/utils/rateLimit.js";
import { FieldController } from "./field.controller.js";
import {
  createFieldSchema,
  fieldListQuerySchema,
  updateFieldSchema,
} from "./field.model.js";

import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";

export default async function fieldRoutes(
  server: FastifyInstance<any, any, any, Logger, any, any, any, any>
) {
  const fieldController = new FieldController(server);

  server.get(
    "/list",
    {
      preHandler: [
        rateLimit({ action: "public-read", windowSeconds: 60, max: 120 }),
      ],
      schema: { querystring: fieldListQuerySchema },
    },
    fieldController.getFieldList.bind(fieldController)
  );

  server.get("/:id", fieldController.getField.bind(fieldController));

  server.post(
    "/",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: createFieldSchema },
    },
    fieldController.createField.bind(fieldController)
  );

  server.put(
    "/:id",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: updateFieldSchema },
    },
    fieldController.updateField.bind(fieldController)
  );

  server.delete(
    "/:id",
    { preHandler: [server.authenticate, server.authorize("admin")] },
    fieldController.deleteField.bind(fieldController)
  );
}
