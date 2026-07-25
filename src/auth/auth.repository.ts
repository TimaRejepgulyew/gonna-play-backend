import type { PrismaClient } from "@/types/prisma.js";

export interface UserWithSecret {
  id: number;
  email: string;
  name: string | null;
  password: string;
}

export interface IAuthRepository {
  getUserByEmailWithSecret(email: string): Promise<UserWithSecret | null>;
  getRoleNames(userId: number): Promise<string[]>;
  getPlayerIdByUserId(userId: number): Promise<number | undefined>;
}

export default class AuthRepository implements IAuthRepository {
  constructor(private prisma: PrismaClient) {}

  // Unlike UserRepository.getUserByEmail (which drops the password), this
  // returns the stored `salt:hash` so login can verify the credentials.
  async getUserByEmailWithSecret(email: string): Promise<UserWithSecret | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, password: true },
    });
  }

  async getRoleNames(userId: number): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    return rows.map((r) => r.role.name);
  }

  async getPlayerIdByUserId(userId: number): Promise<number | undefined> {
    const player = await this.prisma.player.findUnique({
      where: { userId },
      select: { id: true },
    });
    return player?.id;
  }
}
