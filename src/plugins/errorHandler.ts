import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { errorCodes as appErrorCodes } from "../constants/index.js";
import type { ErrorResponse } from "../types/prisma.js";
import { isErrorShape } from "../utils/cache.js";

const HTTP_INTERNAL_ERROR = 500;

/** Central thrown-path handler: any throw → { code, message } envelope. */
export function appErrorHandler(
  error: FastifyError | ErrorResponse,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (isErrorShape(error)) {
    const envelope = error as ErrorResponse;
    return reply.code(envelope.code).send(envelope);
  }

  const fastifyError = error as FastifyError;
  const statusCode = fastifyError.statusCode ?? HTTP_INTERNAL_ERROR;

  if (statusCode < HTTP_INTERNAL_ERROR) {
    request.log.warn({ err: fastifyError }, "request error");
    return reply.code(statusCode).send({ code: statusCode, message: fastifyError.message });
  }

  // 5xx/unknown: details to the log only, generic catalogue envelope outward (never leak internals).
  request.log.error({ err: fastifyError }, "unhandled error");
  return reply
    .code(appErrorCodes.INTERNAL_SERVER_ERROR.code)
    .send(appErrorCodes.INTERNAL_SERVER_ERROR);
}

/** Unknown route → same envelope instead of Fastify's default 404. */
export function appNotFoundHandler(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.code(appErrorCodes.ROUTE_NOT_FOUND.code).send(appErrorCodes.ROUTE_NOT_FOUND);
}
