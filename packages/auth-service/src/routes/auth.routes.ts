import { FastifyInstance } from 'fastify';
import { AuthController } from '@/controllers/auth.controller';
import { registerUserSchema, loginUserSchema, refreshTokenSchema } from '@/schemas/user.schema';

export async function authRoutes(fastify: FastifyInstance) {
  const authController = new AuthController();

  fastify.post(
    '/register',
    {
      schema: registerUserSchema,
    },
    authController.register.bind(authController)
  );

  fastify.post(
    '/login',
    {
      schema: loginUserSchema,
    },
    authController.login.bind(authController)
  );

  fastify.post(
    '/refresh',
    {
      schema: refreshTokenSchema,
    },
    authController.refreshToken.bind(authController)
  );

  fastify.post(
    '/logout',
    {
      onRequest: [fastify.authenticate],
    },
    authController.logout.bind(authController)
  );
} 