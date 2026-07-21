import { getPrisma } from "@/config/prisma.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import { getAuthPayload } from "@/plugins/auth.js";
import UserRepository from "./user.repository.js";
import UserService, { UserListFilters } from "./user.service.js";

import type { FastifyInstance } from "fastify";
import type { PaginationQuery } from "@/types/pagination.js";
import type { UpdateUser } from "./types.js";

export class UserController {
  private userService: UserService;

  constructor(
    _server: FastifyInstance
  ) {
    const prisma = getPrisma();
    const userRepository = new UserRepository(prisma);
    this.userService = new UserService(userRepository);
  }

  getUserList(req: { query: PaginationQuery & UserListFilters }) {
    const { page, limit, sort, order, city, isActive } = req.query;
    return this.userService.getUserList(
      { page, limit, sort, order },
      { city, isActive }
    );
  }

  getUser(req: { params: { id: string }; user?: unknown }) {
    const id = Number(req.params.id);
    const denied = this.ensureSelfOrAdmin(req, id);
    if (denied) {
      return denied;
    }
    return this.userService.getUser(id);
  }

  updateUser(req: {
    params: { id: string };
    body: Omit<UpdateUser, "id">;
    user?: unknown;
  }) {
    const id = Number(req.params.id);
    const denied = this.ensureSelfOrAdmin(req, id);
    if (denied) {
      return denied;
    }
    return this.userService.updateUser({ ...req.body, id });
  }

  async deleteUser(req: { params: { id: string } }) {
    await this.userService.deleteUser(Number(req.params.id));
    return {
      status: "success",
      message: "User deleted successfully",
    };
  }

  // Owner guard: only the account owner or an admin may proceed.
  private ensureSelfOrAdmin(req: { user?: unknown }, id: number) {
    const payload = getAuthPayload(req);
    if (payload.sub !== id && !payload.roles?.includes("admin")) {
      return appErrorCodes.AUTH_FORBIDDEN;
    }
    return null;
  }
}
