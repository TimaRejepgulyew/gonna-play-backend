import { PrismaClient } from "@prisma/client";

import { hashToStorage } from "@/auth/password.js";
import { resolvePagination } from "@/types/pagination.js";
import { User } from "./user.model.js";

import type { IUserRepository, UserListFilters } from "./user.service.js";
import type { CreateUser, UpdateUser } from "./types.js";
import type { PaginatedResult, PaginationQuery } from "@/types/pagination.js";

const USER_SORT_FIELDS = ["createdAt", "updatedAt", "email", "name", "city"];

export default class UserRepository implements IUserRepository {
  constructor(private prisma: PrismaClient) {}

  async getUserList(
    pagination: PaginationQuery = {},
    filters: UserListFilters = {}
  ): Promise<PaginatedResult<User>> {
    const { skip, take, page, limit, orderBy } = resolvePagination(
      pagination,
      USER_SORT_FIELDS,
      "createdAt"
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

  async getUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
      omit: { password: true },
    }) as unknown as User | null;
  }

  async createUser(user: CreateUser): Promise<User | null> {
    try {
      const createdUser = await this.prisma.user.create({
        data: {
          birthDate: user.birthDate,
          email: user.email,
          gender: user.gender,
          name: user.name,
          phone: user.phone,
          city: user.city,
          country: user.country,
          // Store `salt:hash` so login can verify the password later.
          password: hashToStorage(user.password),
        },
        omit: { password: true },
      });
      return createdUser as unknown as User;
    } catch (error) {
      console.log("error", error);
      throw error;
    }
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
        email: user.email,
        name: user.name,
        gender: user.gender,
        phone: user.phone,
        telegramId: user.telegramId,
        telegramUsername: user.telegramUsername,
        avatar: user.avatar,
        city: user.city,
        country: user.country,
        isActive: user.isActive,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        isTelegramVerified: user.isTelegramVerified,
      },
      omit: { password: true },
    });

    return updatedUser as unknown as User | null;
  }

  async deleteUser(id: number): Promise<number | null> {
    const deletedUser = await this.prisma.user.delete({
      where: { id },
      omit: { password: true },
    });

    if (!deletedUser) {
      return null;
    }

    return id;
  }
}
