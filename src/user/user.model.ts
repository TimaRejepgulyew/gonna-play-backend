import { Composite, Type } from "typebox";

import { paginationQuerySchema } from "@/types/pagination.js";

export class User {
  id: number;
  avatar?: string;
  birthDate?: string | null;
  city?: string;
  country?: string;
  email?: string | null;
  firstName?: string;
  gender?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  lastName?: string;
  name?: string;
  password?: string | null;
  phone?: string;

  createdAt: Date;
  updatedAt: Date;

  constructor(user: User) {
    this.id = user.id;
    this.avatar = user.avatar;
    this.birthDate = user.birthDate;
    this.city = user.city;
    this.country = user.country;
    this.createdAt = user.createdAt;
    this.email = user.email;
    this.firstName = user.firstName;
    this.gender = user.gender;
    this.isActive = user.isActive;
    this.isEmailVerified = user.isEmailVerified;
    this.isPhoneVerified = user.isPhoneVerified;
    this.lastName = user.lastName;
    this.name = user.name;
    this.password = user.password;
    this.phone = user.phone;
    this.updatedAt = user.updatedAt;
  }
}

export const createUserSchema = Type.Object({
  avatar: Type.Optional(Type.String()),
  birthDate: Type.Optional(Type.String()),
  city: Type.Optional(Type.String()),
  country: Type.Optional(Type.String()),
  email: Type.Optional(Type.String()),
  firstName: Type.Optional(Type.String()),
  gender: Type.Optional(Type.String()),
  lastName: Type.Optional(Type.String()),
  password: Type.Optional(Type.String()),
  phone: Type.String(),
});

export const userListQuerySchema = Composite(
  paginationQuerySchema,
  Type.Object({
    city: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.Boolean()),
  }),
);

// `password` здесь нет намеренно: смена пароля — отдельный поток со своими
// требованиями. Молчаливую потерю закрывает не схема, а полевой гейт
// `hasPasswordField` в контроллерах — он отвечает 400 (§9.4.11).
export const updateUserSchema = Type.Object(
  {
    avatar: Type.Optional(Type.String()),
    birthDate: Type.Optional(Type.String()),
    city: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
    email: Type.Optional(Type.String()),
    gender: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.Boolean()),
    isEmailVerified: Type.Optional(Type.Boolean()),
    isPhoneVerified: Type.Optional(Type.Boolean()),
    name: Type.Optional(Type.String()),
    phone: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

// Отказ на попытку сменить пароль обновлением анкеты. Кода в общем каталоге нет
// намеренно: правка ограничена радиусом задачи.
export const USER_PASSWORD_UPDATE_UNSUPPORTED = {
  code: 400,
  message: "Password change is not supported by this route",
};

// Гейт смотрит на исходное тело запроса: умолчание Fastify (removeAdditional)
// вырезает лишние ключи до того, как additionalProperties: false успеет отказать,
// поэтому проверять `password` нужно на preValidation, а не в обработчике.
export const hasPasswordField = (body: unknown): boolean =>
  !!body && typeof body === "object" && "password" in body;

// Флаги, которые владелец аккаунта себе не выставляет: только админ.
export const PRIVILEGED_USER_FIELDS = ["isActive", "isEmailVerified", "isPhoneVerified"] as const;

export const hasPrivilegedUserFields = (body: object | undefined, isAdmin: boolean): boolean =>
  !isAdmin && !!body && PRIVILEGED_USER_FIELDS.some((field) => field in body);
