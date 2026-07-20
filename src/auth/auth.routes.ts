import { rateLimit } from "@/utils/rateLimit.js";
import { isErrorShape } from "@/utils/cache.js";
import { AuthController } from "./auth.controller.js";
import { loginSchema, refreshSchema, registerSchema } from "./auth.model.js";

import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";

// Best-effort extraction of the login email for a per-account brute-force
// counter (cache-design.md §6). Undefined -> that counter is skipped.
const loginEmail = (req: { body?: unknown }): string | undefined => {
  const body = req.body as { email?: string } | undefined;
  return body?.email ? `email:${body.email.toLowerCase()}` : undefined;
};

export default async function authRoutes(
  server: FastifyInstance<any, any, any, Logger, any, any, any, any>
) {
  const authController = new AuthController(server);

  server.post(
    "/register",
    {
      preHandler: [
        rateLimit({ action: "register", windowSeconds: 3600, max: 5 }),
      ],
      schema: registerSchema,
    },
    async (req, reply) => {
      const result = await authController.register(req);
      // Documented 201 on success; the preSerialization hook promotes the
      // error `code` for the failure paths.
      if (!isErrorShape(result)) {
        reply.code(201);
      }
      return result;
    }
  );

  server.post(
    "/login",
    {
      // Two counters: by IP (spray) and by email (targeted brute force).
      preHandler: [
        rateLimit({ action: "login", windowSeconds: 900, max: 10 }),
        rateLimit({
          action: "login",
          windowSeconds: 900,
          max: 10,
          identifier: loginEmail,
        }),
      ],
      schema: loginSchema,
    },
    authController.login.bind(authController)
  );

  server.post(
    "/refresh",
    {
      preHandler: [
        rateLimit({ action: "refresh", windowSeconds: 900, max: 30 }),
      ],
      schema: refreshSchema,
    },
    authController.refresh.bind(authController)
  );

  server.get(
    "/me",
    { preHandler: [server.authenticate] },
    authController.me.bind(authController)
  );

  server.post(
    "/logout",
    { preHandler: [server.authenticate] },
    authController.logout.bind(authController)
  );
}
