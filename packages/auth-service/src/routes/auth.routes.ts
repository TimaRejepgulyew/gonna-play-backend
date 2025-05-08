// src/routes/auth.routes.ts

import { FastifyInstance } from 'fastify';
import { login, register, refresh } from '../controllers/auth.controller';

const authRoutes = async (fastify: FastifyInstance) => {
  fastify.post('/login', login);
  fastify.post('/register', register);
  fastify.post('/refresh', refresh);
};

export default authRoutes; 