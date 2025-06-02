import { FastifyInstance } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";

const loginSchema = {
  body: Type.Object({
    email: Type.String({ format: "email" }),
    password: Type.String({ minLength: 6 }),
  }),
  response: {
    200: Type.Object({
      user: Type.Object({
        id: Type.String(),
        email: Type.String(),
        name: Type.Optional(Type.String()),
      }),
      token: Type.String(),
    }),
    400: Type.Object({
      error: Type.String(),
    }),
  },
};

const registerSchema = {
  body: Type.Object({
    email: Type.String({ format: "email" }),
    password: Type.String({ minLength: 6 }),
    name: Type.Optional(Type.String()),
  }),
  response: {
    201: Type.Object({
      user: Type.Object({
        id: Type.String(),
        email: Type.String(),
        name: Type.Optional(Type.String()),
      }),
      token: Type.String(),
    }),
    400: Type.Object({
      error: Type.String(),
    }),
  },
};

export async function authRoutes(
  fastify: FastifyInstance<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    TypeBoxTypeProvider
  >
) {
  const server = fastify.withTypeProvider<TypeBoxTypeProvider>();

  server.post("/login", { schema: loginSchema }, () => {});
  server.post("/register", { schema: registerSchema }, () => {});

  server.get(
    "/me",
    {
      preHandler: [server.authenticate],
      schema: {
        response: {
          200: Type.Object({
            user: Type.Object({
              id: Type.String(),
              email: Type.String(),
              name: Type.Optional(Type.String()),
            }),
          }),
        },
      },
    },
    () => {
      return {
        user: {
          id: "1",
          email: "test@test.com",
          name: "Test User",
        },
      };
    }
  );
}
