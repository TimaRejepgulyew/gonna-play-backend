import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

export const errorHandler = (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  request.log.error(error)

  if (error instanceof ZodError) {
    return reply.status(400).send({
      status: 'error',
      message: 'Validation error',
      errors: error.errors,
    })
  }

  // Handle JWT authentication errors
  if (error.statusCode === 401) {
    return reply.status(401).send({
      status: 'error',
      message: 'Unauthorized',
    })
  }

  // Handle not found errors
  if (error.statusCode === 404) {
    return reply.status(404).send({
      status: 'error',
      message: 'Not found',
    })
  }

  // Handle all other errors
  return reply.status(error.statusCode || 500).send({
    status: 'error',
    message: error.message || 'Internal server error',
  })
} 