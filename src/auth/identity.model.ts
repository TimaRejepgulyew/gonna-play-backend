import { Type } from "typebox";

import { authSuccessSchema, errorResponseSchema } from "./auth.model.js";
import { AUTH_PROVIDER } from "./constant.js";

// Пейлоад Telegram Login Widget: плоский объект, подписанный ботом.
// Mini App (initData) не поддерживается — второй схемы тела нет.
export const telegramWidgetSchema = Type.Object({
  id: Type.Union([Type.Integer(), Type.String()]),
  first_name: Type.String(),
  last_name: Type.Optional(Type.String()),
  username: Type.Optional(Type.String()),
  photo_url: Type.Optional(Type.String()),
  auth_date: Type.Union([Type.Integer(), Type.String()]),
  hash: Type.String(),
});

export const googleCredentialSchema = Type.Object({ idToken: Type.String() });

export const appleCredentialSchema = Type.Object({
  identityToken: Type.String(),
  // Одноразовый код: обменивается на refresh-токен, которым отзывается доступ
  // при удалении аккаунта. Обязателен с первого дня.
  authorizationCode: Type.String(),
  // Apple отдаёт имя только при первой авторизации и отдельным объектом.
  user: Type.Optional(
    Type.Object({
      name: Type.Optional(
        Type.Object({
          firstName: Type.Optional(Type.String()),
          lastName: Type.Optional(Type.String()),
        }),
      ),
      email: Type.Optional(Type.String()),
    }),
  ),
  nonce: Type.Optional(Type.String()),
});

// "password" означает «примут поле password», значение перечисления —
// «примут proof с этим provider».
export const linkMethodSchema = Type.Union([Type.Literal("password"), Type.Enum(AUTH_PROVIDER)]);

export const linkRequiredSchema = Type.Object({
  status: Type.Literal("link_required"),
  ticket: Type.String(),
  provider: Type.Enum(AUTH_PROVIDER),
  email: Type.String(),
  methods: Type.Array(linkMethodSchema),
});

export const linkConfirmBodySchema = Type.Object({
  ticket: Type.String(),
  password: Type.Optional(Type.String({ minLength: 6 })),
  proof: Type.Optional(
    Type.Object({
      provider: Type.Enum(AUTH_PROVIDER),
      // Пейлоад того же вида, что тело маршрута входа этим провайдером.
      // Статически не сужается: разбирает его сам верификатор.
      credential: Type.Unknown(),
    }),
  ),
});

export const linkConfirmSchema = {
  body: linkConfirmBodySchema,
  response: {
    200: authSuccessSchema,
    400: errorResponseSchema,
    401: errorResponseSchema,
    503: errorResponseSchema,
  },
};

export const identityListSchema = Type.Object({
  hasPassword: Type.Boolean(),
  identities: Type.Array(
    Type.Object({
      provider: Type.Enum(AUTH_PROVIDER),
      email: Type.Optional(Type.String()),
      username: Type.Optional(Type.String()),
      linkedAt: Type.String(),
      lastLoginAt: Type.Optional(Type.String()),
    }),
  ),
});

const loginResponses = {
  200: authSuccessSchema,
  201: authSuccessSchema,
  202: linkRequiredSchema,
  400: errorResponseSchema,
  401: errorResponseSchema,
  409: errorResponseSchema,
  503: errorResponseSchema,
};

export const googleLoginSchema = {
  body: googleCredentialSchema,
  response: loginResponses,
};

export const appleLoginSchema = {
  body: appleCredentialSchema,
  response: loginResponses,
};

export const telegramLoginSchema = {
  body: telegramWidgetSchema,
  response: loginResponses,
};

// Ответ обоих маршрутов удаления. Три ключа, не два: это успешный ответ, а не
// конверт ошибки. appleAccessRevoked = «не осталось выданного Apple доступа»:
// true, если привязки Apple не было или отзыв прошёл; false — отзыв не удался.
export const accountDeletedSchema = Type.Object({
  status: Type.Literal("success"),
  message: Type.String(),
  appleAccessRevoked: Type.Boolean(),
});
