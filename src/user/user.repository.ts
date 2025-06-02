import { PrismaClient } from "@prisma/client";
import { User } from "./user.model.js";

import type {
  CreateUser,
  IUserRepository,
  UpdateUser,
} from "./user.service.js";
import { hash } from "node:crypto";

const userTable = new Map<number, User>();

export default class UserRepository implements IUserRepository {
  constructor(private prisma: PrismaClient) {}

  async getUserList(): Promise<User[]> {
    return (await this.prisma.user.findMany({
      select: {
        password: false,
      },
    })) as unknown as User[];
  }

  async createUser(user: CreateUser): Promise<User | null> {
    const createdUser = await this.prisma.user.create({
      data: {
        birthDate: user.birthDate,
        email: user.email,
        password: await hash(user.password, "sha256"),
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
      select: {
        password: false,
      },
    });

    return createdUser as unknown as User;
  }

  async getUser(id: number): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        password: false,
      },
    });

    return user as unknown as User | null;
  }

  async updateUser(user: UpdateUser): Promise<User | null> {
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        birthDate: user.birthDate,
        email: user.email,
        password: await hash(user.password, "sha256"),
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
      select: {
        password: false,
      },
    });

    return updatedUser as unknown as User | null;
  }

  async deleteUser(id: number): Promise<number | null> {
    const deletedUser = await this.prisma.user.delete({
      where: { id },
      select: {
        password: false,
      },
    });

    if (!deletedUser) {
      return null;
    }

    return id;
  }
}
