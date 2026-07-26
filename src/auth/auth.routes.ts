import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import type { FastifyInstance, FastifyReply } from "fastify";
import { Type } from "typebox";
import { isErrorShape } from "@/utils/cache.js";
import { rateLimit } from "@/utils/rateLimit.js";
import { AuthController } from "./auth.controller.js";
import { errorResponseSchema, loginSchema, refreshSchema, registerSchema } from "./auth.model.js";
import { AUTH_PROVIDER } from "./constant.js";
import {
  accountDeletedSchema,
  appleLoginSchema,
  googleLoginSchema,
  identityListSchema,
  linkConfirmSchema,
  telegramLoginSchema,
} from "./identity.model.js";

// Best-effort extraction of the login email for a per-account brute-force
// counter (cache-design.md §6). Undefined -> that counter is skipped.
const loginEmail = (req: { body?: unknown }): string | undefined => {
  const body = req.body as { email?: string } | undefined;
  return body?.email ? `email:${body.email.toLowerCase()}` : undefined;
};

const typed = (instance: FastifyInstance) => instance.withTypeProvider<TypeBoxTypeProvider>();
type TypedServer = ReturnType<typeof typed>;

// У провайдерских маршрутов счётчик ровно один — по IP. Экстрактор вроде
// `loginEmail` сюда не вешается намеренно: тела с `email` у них нет, счётчик
// устроен fail-open и молча исчез бы, оставив видимость второй защиты.
const providerLoginLimit = () =>
  rateLimit({ action: "provider-login", windowSeconds: 900, max: 10 });

const providerParamsSchema = Type.Object({
  provider: Type.Union([Type.Literal("google"), Type.Literal("apple"), Type.Literal("telegram")]),
});

const toProvider = (value: string): AUTH_PROVIDER => value.toUpperCase() as AUTH_PROVIDER;

const identitiesSchema = {
  response: { 200: identityListSchema, 401: errorResponseSchema },
};

const linkIdentitySchema = {
  params: providerParamsSchema,
  response: {
    200: identityListSchema,
    401: errorResponseSchema,
    409: errorResponseSchema,
    503: errorResponseSchema,
  },
};

const unlinkIdentitySchema = {
  params: providerParamsSchema,
  response: {
    200: identityListSchema,
    401: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
  },
};

const deleteAccountSchema = {
  response: {
    200: accountDeletedSchema,
    401: errorResponseSchema,
    404: errorResponseSchema,
  },
};

// 201 на созданный аккаунт и 202 на «требуется подтверждение» — тем же приёмом,
// что и 201 у регистрации: статус трогается только на не-ошибочной ветке.
const providerLogin =
  (controller: AuthController, provider: AUTH_PROVIDER) =>
  async (req: { body: unknown }, reply: FastifyReply) => {
    const { result, created } = await controller.loginWithProvider(provider, req.body);
    if (isErrorShape(result)) {
      return result;
    }
    if ("status" in result) {
      reply.code(202);
    } else if (created) {
      reply.code(201);
    }
    return result;
  };

function registerProviderRoutes(server: TypedServer, controller: AuthController) {
  server.post(
    "/google",
    { preHandler: [providerLoginLimit()], schema: googleLoginSchema },
    providerLogin(controller, AUTH_PROVIDER.Google),
  );

  server.post(
    "/apple",
    { preHandler: [providerLoginLimit()], schema: appleLoginSchema },
    providerLogin(controller, AUTH_PROVIDER.Apple),
  );

  server.post(
    "/telegram",
    { preHandler: [providerLoginLimit()], schema: telegramLoginSchema },
    providerLogin(controller, AUTH_PROVIDER.Telegram),
  );

  server.post(
    "/link/confirm",
    { schema: linkConfirmSchema },
    controller.confirmLink.bind(controller),
  );
}

function registerIdentityRoutes(server: TypedServer, controller: AuthController) {
  server.get(
    "/identities",
    { preHandler: [server.authenticate], schema: identitiesSchema },
    controller.listIdentities.bind(controller),
  );

  server.post(
    "/identities/:provider",
    { preHandler: [server.authenticate], schema: linkIdentitySchema },
    (req) => controller.linkIdentity(req, toProvider(req.params.provider)),
  );

  server.delete(
    "/identities/:provider",
    { preHandler: [server.authenticate], schema: unlinkIdentitySchema },
    (req) => controller.unlinkIdentity(req, toProvider(req.params.provider)),
  );
}

export default async function authRoutes(fastifyInstance: FastifyInstance) {
  const server = typed(fastifyInstance);
  const authController = new AuthController(fastifyInstance);

  server.post(
    "/register",
    {
      preHandler: [rateLimit({ action: "register", windowSeconds: 3600, max: 5 })],
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
    },
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
    authController.login.bind(authController),
  );

  server.post(
    "/refresh",
    {
      preHandler: [rateLimit({ action: "refresh", windowSeconds: 900, max: 30 })],
      schema: refreshSchema,
    },
    authController.refresh.bind(authController),
  );

  server.get("/me", { preHandler: [server.authenticate] }, authController.me.bind(authController));

  // Рядом с GET /me и под тем же единственным preHandler: параметров нет вовсе.
  server.delete(
    "/me",
    { preHandler: [server.authenticate], schema: deleteAccountSchema },
    authController.deleteAccount.bind(authController),
  );

  server.post(
    "/logout",
    { preHandler: [server.authenticate] },
    authController.logout.bind(authController),
  );

  registerProviderRoutes(server, authController);
  registerIdentityRoutes(server, authController);
}
