import { Type } from "typebox";

import { PLAYER_LEVEL, PLAYER_POSITION } from "@/player/constant.js";

export const authUserSchema = Type.Object({
  id: Type.Integer(),
  // Необязателен: Telegram почты не отдаёт, а Fastify сериализует ответ по
  // схеме — обязательное поле с null вернуло бы 500 на первом же таком входе.
  email: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  playerId: Type.Optional(Type.Integer()),
  // «Есть email и есть birthDate» — сигнал клиенту показать форму дозаполнения.
  profileComplete: Type.Optional(Type.Boolean()),
});

export const authSuccessSchema = Type.Object({
  user: authUserSchema,
  accessToken: Type.String(),
  refreshToken: Type.String(),
});

export const errorResponseSchema = Type.Object({
  code: Type.Integer(),
  message: Type.String(),
});

export const registerSchema = {
  body: Type.Object({
    email: Type.String({ format: "email" }),
    password: Type.String({ minLength: 6 }),
    name: Type.Optional(Type.String()),
    birthDate: Type.String(),
    phone: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
    gender: Type.Optional(Type.String()),
    createPlayer: Type.Optional(Type.Boolean()),
    level: Type.Optional(Type.Enum(PLAYER_LEVEL)),
    position: Type.Optional(Type.Enum(PLAYER_POSITION)),
  }),
  response: { 201: authSuccessSchema, 400: errorResponseSchema },
};

export const loginSchema = {
  body: Type.Object({
    email: Type.String({ format: "email" }),
    password: Type.String({ minLength: 6 }),
  }),
  response: { 200: authSuccessSchema, 400: errorResponseSchema },
};

export const refreshSchema = {
  body: Type.Object({ refreshToken: Type.String() }),
  response: {
    // Rotation issues a fresh refresh token alongside the access token.
    200: Type.Object({
      accessToken: Type.String(),
      refreshToken: Type.String(),
    }),
    401: errorResponseSchema,
  },
};
