import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  request.log.error(error);

  if (error instanceof ZodError) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Validation Error',
      message: error.errors,
    });
  }

  // Handle JWT verification errors
  if (error.statusCode === 401) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid token or missing authentication',
    });
  }

  // Handle not found errors
  if (error.statusCode === 404) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: error.message || 'Resource not found',
    });
  }

  // Handle duplicate key errors from PostgreSQL
  if (error.message?.includes('duplicate key')) {
    return reply.status(409).send({
      statusCode: 409,
      error: 'Conflict',
      message: 'Resource already exists',
    });
  }

  // Default error
  reply.status(error.statusCode || 500).send({
    statusCode: error.statusCode || 500,
    error: error.name || 'Internal Server Error',
    message: error.message || 'An unexpected error occurred',
  });
} 