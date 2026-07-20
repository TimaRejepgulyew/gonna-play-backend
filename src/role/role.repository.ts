import { PrismaClient } from "@prisma/client";

import Role from "./role.model.js";

import type { IRoleRepository } from "./role.service.js";

export default class RoleRepository implements IRoleRepository {
  constructor(private prisma: PrismaClient) {}

  async listRoles(): Promise<Role[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: "asc" },
    });
    return roles as unknown as Role[];
  }

  async createRole(name: string): Promise<Role> {
    const created = await this.prisma.role.create({ data: { name } });
    return created as unknown as Role;
  }

  async findRoleById(id: number): Promise<Role | null> {
    return this.prisma.role.findUnique({ where: { id } }) as unknown as Promise<
      Role | null
    >;
  }

  async deleteRole(id: number): Promise<void> {
    await this.prisma.role.delete({ where: { id } });
  }

  async userExists(id: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    return !!user;
  }

  async assignRole(userId: number, roleId: number): Promise<void> {
    await this.prisma.userRole.create({ data: { userId, roleId } });
  }

  async revokeRole(userId: number, roleId: number): Promise<number> {
    const result = await this.prisma.userRole.deleteMany({
      where: { userId, roleId },
    });
    return result.count;
  }
}
