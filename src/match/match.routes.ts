import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance } from "fastify";
import { Type } from "typebox";
import { rateLimit } from "@/utils/rateLimit.js";
import { MatchController } from "./match.controller.js";
import {
  createMatchSchema,
  joinSchema,
  matchListQuerySchema,
  participantsQuerySchema,
  updateMatchSchema,
} from "./match.model.js";

const idParamsSchema = Type.Object({ id: Type.String() });

export default async function matchRoutes(fastifyInstance: FastifyInstance) {
  const server = fastifyInstance.withTypeProvider<TypeBoxTypeProvider>();
  const matchController = new MatchController(fastifyInstance);

  // -------- Match resource --------

  server.get(
    "/list",
    {
      preHandler: [rateLimit({ action: "match-list", windowSeconds: 60, max: 60 })],
      schema: { querystring: matchListQuerySchema },
    },
    matchController.listMatches.bind(matchController),
  );

  server.get(
    "/:id",
    { schema: { params: idParamsSchema } },
    matchController.getMatch.bind(matchController),
  );

  server.post(
    "/",
    { preHandler: [server.authenticate], schema: { body: createMatchSchema } },
    matchController.createMatch.bind(matchController),
  );

  server.patch(
    "/:id",
    {
      preHandler: [server.authenticate],
      schema: { body: updateMatchSchema, params: idParamsSchema },
    },
    matchController.updateMatch.bind(matchController),
  );

  // -------- Status transitions --------

  server.post(
    "/:id/publish",
    { preHandler: [server.authenticate], schema: { params: idParamsSchema } },
    matchController.publish.bind(matchController),
  );

  server.post(
    "/:id/confirm",
    { preHandler: [server.authenticate], schema: { params: idParamsSchema } },
    matchController.confirm.bind(matchController),
  );

  server.post(
    "/:id/cancel",
    { preHandler: [server.authenticate], schema: { params: idParamsSchema } },
    matchController.cancel.bind(matchController),
  );

  // -------- Participation --------

  server.get(
    "/:id/participants",
    {
      schema: {
        querystring: participantsQuerySchema,
        params: idParamsSchema,
      },
    },
    matchController.getParticipants.bind(matchController),
  );

  server.post(
    "/:id/join",
    {
      preHandler: [server.authenticate],
      schema: { body: joinSchema, params: idParamsSchema },
    },
    matchController.join.bind(matchController),
  );

  server.delete(
    "/:id/leave",
    { preHandler: [server.authenticate], schema: { params: idParamsSchema } },
    matchController.leave.bind(matchController),
  );

  server.post(
    "/:id/check-in",
    { preHandler: [server.authenticate], schema: { params: idParamsSchema } },
    matchController.checkIn.bind(matchController),
  );
}
