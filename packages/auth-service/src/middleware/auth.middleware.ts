import { FastifyRequest, FastifyReply } from "fastify";

export const authenticate = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    await request.jwtVerify();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    reply.status(401).send({ message: "Authentication failed", error: errorMessage });
  }
};
