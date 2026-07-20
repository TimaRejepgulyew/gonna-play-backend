import { rateLimit } from "@/utils/rateLimit.js";
import { LocationController } from "./location.controller.js";
import {
  createLocationSchema,
  locationListQuerySchema,
  updateLocationSchema,
} from "./location.model.js";

import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";

export default async function locationRoutes(
  server: FastifyInstance<any, any, any, Logger, any, any, any, any>
) {
  const locationController = new LocationController(server);

  server.get(
    "/list",
    {
      preHandler: [
        rateLimit({ action: "public-read", windowSeconds: 60, max: 120 }),
      ],
      schema: { querystring: locationListQuerySchema },
    },
    locationController.getLocationList.bind(locationController)
  );

  server.get(
    "/:id",
    locationController.getLocation.bind(locationController)
  );

  server.post(
    "/",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: createLocationSchema },
    },
    locationController.createLocation.bind(locationController)
  );

  server.put(
    "/:id",
    {
      preHandler: [server.authenticate, server.authorize("admin")],
      schema: { body: updateLocationSchema },
    },
    locationController.updateLocation.bind(locationController)
  );

  server.delete(
    "/:id",
    { preHandler: [server.authenticate, server.authorize("admin")] },
    locationController.deleteLocation.bind(locationController)
  );
}
