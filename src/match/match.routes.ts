import { rateLimit } from "@/utils/rateLimit.js";
import { MatchController } from "./match.controller.js";
import {
  createMatchSchema,
  inviteSchema,
  joinSchema,
  matchListQuerySchema,
  participantsQuerySchema,
  updateMatchSchema,
} from "./match.model.js";

import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";

export default async function matchRoutes(
  server: FastifyInstance<any, any, any, Logger, any, any, any, any>
) {
  const matchController = new MatchController(server);

  // -------- Match resource --------

  server.get(
    "/list",
    {
      preHandler: [
        rateLimit({ action: "match-list", windowSeconds: 60, max: 60 }),
      ],
      schema: { querystring: matchListQuerySchema },
    },
    matchController.listMatches.bind(matchController)
  );

  server.get("/:id", matchController.getMatch.bind(matchController));

  server.post(
    "/",
    { preHandler: [server.authenticate], schema: { body: createMatchSchema } },
    matchController.createMatch.bind(matchController)
  );

  server.put(
    "/:id",
    { preHandler: [server.authenticate], schema: { body: updateMatchSchema } },
    matchController.updateMatch.bind(matchController)
  );

  server.delete(
    "/:id",
    { preHandler: [server.authenticate] },
    matchController.cancelMatch.bind(matchController)
  );

  // -------- Participation --------

  server.get(
    "/:id/participants",
    { schema: { querystring: participantsQuerySchema } },
    matchController.getParticipants.bind(matchController)
  );

  server.post(
    "/:id/invite",
    { preHandler: [server.authenticate], schema: { body: inviteSchema } },
    matchController.invite.bind(matchController)
  );

  server.post(
    "/:id/join",
    { preHandler: [server.authenticate], schema: { body: joinSchema } },
    matchController.join.bind(matchController)
  );

  server.post(
    "/:id/participants/:pid/accept",
    { preHandler: [server.authenticate] },
    matchController.accept.bind(matchController)
  );

  server.post(
    "/:id/participants/:pid/decline",
    { preHandler: [server.authenticate] },
    matchController.decline.bind(matchController)
  );

  server.post(
    "/:id/leave",
    { preHandler: [server.authenticate] },
    matchController.leave.bind(matchController)
  );
}
