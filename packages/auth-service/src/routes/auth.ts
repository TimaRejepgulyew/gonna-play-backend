import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AuthService } from '@/services/auth'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const registerSchema = loginSchema.extend({
  name: z.string().min(2),
})

export async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService()

  fastify.post('/register', {
    schema: {
      body: registerSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            email: { type: 'string' },
            name: { type: 'string' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { email, password, name } = registerSchema.parse(request.body)
      const user = await authService.register({ email, password, name })
      return reply.status(201).send(user)
    },
  })

  fastify.post('/login', {
    schema: {
      body: loginSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { email, password } = loginSchema.parse(request.body)
      const result = await authService.login({ email, password })
      return reply.send(result)
    },
  })

  fastify.get('/me', {
    onRequest: [fastify.authenticate],
    handler: async (request) => {
      return request.user
    },
  })
} 