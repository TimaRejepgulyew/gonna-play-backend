import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { Type } from "typebox";
import { rateLimit } from "@/utils/rateLimit.js";
import { FieldController } from "./field.controller.js";
import { createFieldSchema, fieldListQuerySchema, updateFieldSchema } from "./field.model.js";

const idParamsSchema = Type.Object({ id: Type.String() });

export default async function fieldRoutes(fastifyInstance: FastifyInstance) {
  const server = fastifyInstance.withTypeProvider<TypeBoxTypeProvider>();
  const fieldController = new FieldController(fastifyInstance);

  server.get(
    "/list",
    {
      preHandler: [rateLimit({ action: "public-read", windowSeconds: 60, max: 120 })],
      schema: { querystring: fieldListQuerySchema },
    },
    fieldController.getFieldList.bind(fieldController),
  );

  server.get(
    "/:id",
    { schema: { params: idParamsSchema } },
    fieldController.getField.bind(fieldController),
  );

  server.post(
    "/",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: createFieldSchema },
    },
    fieldController.createField.bind(fieldController),
  );

  server.put(
    "/:id",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: updateFieldSchema, params: idParamsSchema },
    },
    fieldController.updateField.bind(fieldController),
  );

  server.delete(
    "/:id",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { params: idParamsSchema },
    },
    fieldController.deleteField.bind(fieldController),
  );
}
