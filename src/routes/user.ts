import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { UserService } from '../services/userService';

// Validation schemas
const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  full_name: z.string().optional(),
  phone: z.string().optional(),
  profile_picture: z.string().optional(),
});

interface UpdateUserRequest extends FastifyRequest {
  body: z.infer<typeof updateUserSchema>;
}

const userRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const userService = new UserService(fastify.pg);

  // Update current user
  fastify.put<{ Body: z.infer<typeof updateUserSchema> }>(
    '/me',
    {
      preHandler: [fastify.authenticate],
      schema: {
        body: {
          type: 'object',
          properties: {
            username: { type: 'string', minLength: 3 },
            full_name: { type: 'string' },
            phone: { type: 'string' },
            profile_picture: { type: 'string' },
          },
        },
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
    async (request: UpdateUserRequest, reply: FastifyReply) => {
      try {
        const userId = request.user.id;
        const validatedData = updateUserSchema.parse(request.body);

        const updatedUser = await userService.updateUser(userId, validatedData);

        if (!updatedUser) {
          return reply.status(404).send({
            statusCode: 404,
            error: 'Not Found',
            message: 'User not found',
          });
        }

        reply.send(updatedUser);
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
          message: 'An error occurred while updating the user',
        });
      }
    }
  );
};

export default userRoutes;
