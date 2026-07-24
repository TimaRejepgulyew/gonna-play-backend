import { Prisma } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import type { ErrorResponse } from "@/types/prisma.js";
import type Role from "./role.model.js";

export interface AssignRoleInput {
  userId: number;
  roleId: number;
}

export interface IRoleRepository {
  listRoles(): Promise<Role[]>;
  createRole(name: string): Promise<Role>;
  findRoleById(id: number): Promise<Role | null>;
  deleteRole(id: number): Promise<void>;
  userExists(id: number): Promise<boolean>;
  assignRole(userId: number, roleId: number): Promise<void>;
  revokeRole(userId: number, roleId: number): Promise<number>;
}

export class RoleService {
  constructor(
    private roleRepository: IRoleRepository,
    private logger: FastifyBaseLogger,
  ) {}

  listRoles(): Promise<Role[]> {
    return this.roleRepository.listRoles();
  }

  async createRole(name: string): Promise<Role | ErrorResponse> {
    try {
      return await this.roleRepository.createRole(name);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return appErrorCodes.ROLE_NAME_DUPLICATED;
      }
      this.logger.error(error);
      throw error;
    }
  }

  async deleteRole(id: number): Promise<{ status: string } | ErrorResponse> {
    const role = await this.roleRepository.findRoleById(id);
    if (!role) {
      return appErrorCodes.ROLE_NOT_FOUND;
    }
    await this.roleRepository.deleteRole(id);
    return { status: "success" };
  }

  async assignRole(input: AssignRoleInput): Promise<{ status: string } | ErrorResponse> {
    const [role, userExists] = await Promise.all([
      this.roleRepository.findRoleById(input.roleId),
      this.roleRepository.userExists(input.userId),
    ]);
    if (!role) {
      return appErrorCodes.ROLE_NOT_FOUND;
    }
    if (!userExists) {
      return appErrorCodes.USER_NOT_FOUND;
    }
    try {
      await this.roleRepository.assignRole(input.userId, input.roleId);
      return { status: "success" };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return appErrorCodes.ROLE_ALREADY_ASSIGNED;
      }
      this.logger.error(error);
      throw error;
    }
  }

  async revokeRole(input: AssignRoleInput): Promise<{ status: string } | ErrorResponse> {
    const removed = await this.roleRepository.revokeRole(input.userId, input.roleId);
    if (!removed) {
      return appErrorCodes.ROLE_NOT_FOUND;
    }
    return { status: "success" };
  }
}
