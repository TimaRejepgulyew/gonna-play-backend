import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "@/types/prisma.js";

// Decorators added by `src/plugins/auth.ts` and `src/plugins/prisma.ts`. Kept in
// a .d.ts so skipLibCheck tolerates the FastifyInstance declaration-merge in this
// project's type setup (@fastify/jwt augments FastifyInstance too via its own
// module declaration).
declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (...roles: string[]) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
