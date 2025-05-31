import { FastifyInstance } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

export async function gamesRoutes(
  fastify: FastifyInstance<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    TypeBoxTypeProvider
  >
) {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  server.get("/games", async (request, reply) => {
    return reply.status(200).send({ message: "Hello World" });
  });

  server.get("/games/:id", async (request, reply) => {
    return reply.status(200).send({ message: "Hello World" });
  });
}
