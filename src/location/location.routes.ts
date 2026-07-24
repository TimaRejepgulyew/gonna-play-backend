import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { rateLimit } from "@/utils/rateLimit.js";
import { LocationController } from "./location.controller.js";
import {
  createLocationSchema,
  locationListQuerySchema,
  updateLocationSchema,
} from "./location.model.js";

const idParamsSchema = Type.Object({ id: Type.String() });

export default async function locationRoutes(fastifyInstance: FastifyInstance) {
  const server = fastifyInstance.withTypeProvider<TypeBoxTypeProvider>();
  const locationController = new LocationController(fastifyInstance);

  server.get(
    "/list",
    {
      preHandler: [rateLimit({ action: "public-read", windowSeconds: 60, max: 120 })],
      schema: { querystring: locationListQuerySchema },
    },
    locationController.getLocationList.bind(locationController),
  );

  server.get(
    "/:id",
    { schema: { params: idParamsSchema } },
    locationController.getLocation.bind(locationController),
  );

  server.post(
    "/",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: createLocationSchema },
    },
    locationController.createLocation.bind(locationController),
  );

  server.put(
    "/:id",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: updateLocationSchema, params: idParamsSchema },
    },
    locationController.updateLocation.bind(locationController),
  );

  server.delete(
    "/:id",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { params: idParamsSchema },
    },
    locationController.deleteLocation.bind(locationController),
  );
}
