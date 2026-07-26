import { hashToStorage } from "@/auth/password.js";
import type { PaginatedResult, PaginationQuery } from "@/types/pagination.js";
import { resolvePagination } from "@/types/pagination.js";
import { Prisma, type PrismaClient } from "@/types/prisma.js";
import { normalizeEmail, normalizeEmailPatch } from "@/utils/email.js";
import type { CreateUser, UpdateUser } from "./types.js";
import type { User } from "./user.model.js";
import type { IUserRepository, UserListFilters } from "./user.service.js";

const USER_SORT_FIELDS = ["createdAt", "updatedAt", "email", "name", "city"];

export default class UserRepository implements IUserRepository {
  constructor(private prisma: PrismaClient) {}

  async getUserList(
    pagination: PaginationQuery = {},
    filters: UserListFilters = {},
  ): Promise<PaginatedResult<User>> {
    const { skip, take, page, limit, orderBy } = resolvePagination(
      pagination,
      USER_SORT_FIELDS,
      "createdAt",
    );

    const where = {
      ...(filters.city ? { city: filters.city } : {}),
      ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        omit: { password: true },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: rows as unknown as User[],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  // Единое правило почты применяется здесь же, на границе репозитория: индекс
  // `users.email` регистрозависим, поэтому искать надо тем же значением, каким
  // пишут `createUser`/`updateUser` и провайдерская половина среза.
  async getUserByEmail(email: string): Promise<User | null> {
    const normalized = normalizeEmail(email);
    if (normalized === null) return null;
    return this.prisma.user.findUnique({
      where: { email: normalized },
      omit: { password: true },
    }) as unknown as User | null;
  }

  async createUser(user: CreateUser): Promise<User | null> {
    const createdUser = await this.prisma.user.create({
      data: {
        birthDate: user.birthDate,
        email: normalizeEmailPatch(user.email),
        firstName: user.firstName,
        lastName: user.lastName,
        gender: user.gender,
        name: user.name,
        phone: user.phone,
        city: user.city,
        country: user.country,
        // Store `salt:hash` so login can verify the password later.
        // Беспарольные аккаунты приходят без пароля — колонка остаётся пустой.
        ...(user.password ? { password: hashToStorage(user.password) } : {}),
      },
      omit: { password: true },
    });
    return createdUser as unknown as User;
  }

  async getUser(id: number): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      omit: { password: true },
    });

    return user as unknown as User | null;
  }

  async updateUser(user: UpdateUser): Promise<User | null> {
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        birthDate: user.birthDate,
        // `undefined` здесь значит «поле не трогаем», поэтому в `null` его
        // превращать нельзя: это стёрло бы почту у обновляемого аккаунта.
        email: normalizeEmailPatch(user.email),
        firstName: user.firstName,
        lastName: user.lastName,
        name: user.name,
        gender: user.gender,
        phone: user.phone,
        avatar: user.avatar,
        city: user.city,
        country: user.country,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
      },
      omit: { password: true },
    });

    return updatedUser as unknown as User | null;
  }

  async deleteUser(id: number): Promise<number | null> {
    try {
      await this.prisma.user.delete({
        where: { id },
        omit: { password: true },
      });
      return id;
    } catch (error) {
      // P2025 — строки нет: отсутствие записи это `null`, а не пятисотая.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }
      throw error;
    }
  }
}
