import { randomBytes, pbkdf2Sync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

import { User } from "./user.model.js";

import type { IUserRepository } from "./user.service.js";
import type { CreateUser, UpdateUser } from "./types.js";

const SALT_LENGTH = 16;
const HASH_ITERATIONS = 100_000;
const HASH_ALGO = "sha256";
const HASH_LENGTH = 64;

function hashPassword(
  password: string,
  salt?: string
): { hash: string; salt: string } {
  const usedSalt = salt || randomBytes(SALT_LENGTH).toString("hex");
  const hash = pbkdf2Sync(
    password,
    usedSalt,
    HASH_ITERATIONS,
    HASH_LENGTH,
    HASH_ALGO
  ).toString("hex");
  return { hash, salt: usedSalt };
}

export default class UserRepository implements IUserRepository {
  constructor(private prisma: PrismaClient) {}

  async getUserList(): Promise<User[]> {
    return (await this.prisma.user.findMany({
      select: {
        password: false,
      },
    })) as unknown as User[];
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return  this.prisma.user.findUnique({
      where: { email },
      select: {
        password: false,
      },
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
          password: hashPassword(user.password).hash,
        },
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
