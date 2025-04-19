import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UserService } from '../services/userService';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(3).optional(),
  full_name: z.string().optional(),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

interface RegisterRequest extends FastifyRequest {
  body: z.infer<typeof registerSchema>;
}

interface LoginRequest extends FastifyRequest {
  body: z.infer<typeof loginSchema>;
}

const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const userService = new UserService(fastify.pg);

  // Register a new user
  fastify.post<{ Body: z.infer<typeof registerSchema> }>(
    '/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            username: { type: 'string', minLength: 3 },
            full_name: { type: 'string' },
            phone: { type: 'string' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              email: { type: 'string' },
              username: { type: 'string' },
              full_name: { type: 'string' },
              phone: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' },
              token: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: RegisterRequest, reply: FastifyReply) => {
      try {
        // Validate request body
        const validatedData = registerSchema.parse(request.body);

        // Check if user already exists
        const existingUser = await userService.findUserByEmail(validatedData.email);
        if (existingUser) {
          return reply.status(409).send({
            statusCode: 409,
            error: 'Conflict',
            message: 'User with this email already exists',
          });
        }

        // Create user
        const user = await userService.createUser({
          email: validatedData.email,
          password: validatedData.password,
          username: validatedData.username,
          full_name: validatedData.full_name,
          phone: validatedData.phone,
        });

        // Generate token
        const token = fastify.generateToken(user);

        reply.status(201).send({
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          phone: user.phone,
          created_at: user.created_at,
          token,
        });
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.errors,
          });
          return;
        }

        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while registering the user',
        });
      }
    }
  );

  // Login
  fastify.post<{ Body: z.infer<typeof loginSchema> }>(
    '/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              email: { type: 'string' },
              username: { type: 'string' },
              token: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: LoginRequest, reply: FastifyReply) => {
      try {
        // Validate request body
        const validatedData = loginSchema.parse(request.body);

        // Validate credentials
        const user = await userService.validateCredentials(
          validatedData.email,
          validatedData.password
        );

        if (!user) {
          return reply.status(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Invalid email or password',
          });
        }

        // Generate token
        const token = fastify.generateToken(user);

        reply.send({
          id: user.id,
          email: user.email,
          username: user.username,
          token,
        });
      } catch (err) {
        if (err instanceof z.ZodError) {
          reply.status(400).send({
            statusCode: 400,
            error: 'Bad Request',
            message: err.errors,
          });
          return;
        }

        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while logging in',
        });
      }
    }
  );

  // Get current user
  fastify.get(
    '/me',
    {
      preHandler: [fastify.authenticate],
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              email: { type: 'string' },
              username: { type: 'string' },
              full_name: { type: 'string' },
              phone: { type: 'string' },
              profile_picture: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user.id;
        const user = await userService.findUserById(userId);

        if (!user) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'User not found',
          });
        }

        reply.send(user);
      } catch (err) {
        fastify.log.error(err);
        reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An error occurred while fetching user data',
        });
      }
    }
  );
};

export default authRoutes;
