import type { FastifyReply, FastifyRequest } from "fastify";

// Decorators added by `src/plugins/auth.ts`. Kept in a .d.ts so skipLibCheck
// tolerates the FastifyInstance declaration-merge in this project's type setup
// (the legacy @types/fastify-jwt package augments FastifyInstance too).
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (
      ...roles: string[]
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
