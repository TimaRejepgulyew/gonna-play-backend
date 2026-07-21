import { Type } from "@sinclair/typebox";

import { paginationQuerySchema } from "@/types/pagination.js";

export class User {
  id: number;
  avatar?: string;
  birthDate: string;
  city?: string;
  country?: string;
  email: string;
  gender?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  isTelegramVerified?: boolean;
  name?: string;
  password: string;
  phone?: string;
  telegramId?: string;
  telegramUsername?: string;

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
    this.gender = user.gender;
    this.isActive = user.isActive;
    this.isEmailVerified = user.isEmailVerified;
    this.isPhoneVerified = user.isPhoneVerified;
    this.isTelegramVerified = user.isTelegramVerified;
    this.name = user.name;
    this.password = user.password;
    this.phone = user.phone;
    this.telegramId = user.telegramId;
    this.telegramUsername = user.telegramUsername;
    this.updatedAt = user.updatedAt;
  }
}

export const createUserSchema = Type.Object({
  avatar: Type.Optional(Type.String()),
  birthDate: Type.String(),
  city: Type.Optional(Type.String()),
  country: Type.Optional(Type.String()),
  email: Type.String(),
  firstName: Type.Optional(Type.String()),
  gender: Type.Optional(Type.String()),
  lastName: Type.Optional(Type.String()),
  password: Type.String(),
  phone: Type.String(),
  telegramId: Type.Optional(Type.String()),
  telegramUsername: Type.Optional(Type.String()),
});

export const userListQuerySchema = Type.Composite([
  paginationQuerySchema,
  Type.Object({
    city: Type.Optional(Type.String()),
    isActive: Type.Optional(Type.Boolean()),
  }),
]);

export const updateUserSchema = Type.Object({
  avatar: Type.Optional(Type.String()),
  birthDate: Type.Optional(Type.String()),
  city: Type.Optional(Type.String()),
  country: Type.Optional(Type.String()),
  email: Type.Optional(Type.String()),
  gender: Type.Optional(Type.String()),
  isActive: Type.Optional(Type.Boolean()),
  isEmailVerified: Type.Optional(Type.Boolean()),
  isPhoneVerified: Type.Optional(Type.Boolean()),
  isTelegramVerified: Type.Optional(Type.Boolean()),
  name: Type.Optional(Type.String()),
  password: Type.Optional(Type.String()),
  phone: Type.Optional(Type.String()),
  telegramId: Type.Optional(Type.String()),
  telegramUsername: Type.Optional(Type.String()),
});
