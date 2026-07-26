import type { FastifyInstance } from "fastify";
import AccountService from "@/auth/account.service.js";
import IdentityRepository from "@/auth/identity.repository.js";
import { createAppleTokenClient } from "@/auth/providers/apple.client.js";
import { getPrisma } from "@/config/prisma.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import { getAuthPayload } from "@/plugins/auth.js";
import type { PaginationQuery } from "@/types/pagination.js";
import type { UpdateUser } from "./types.js";
import {
  hasPasswordField,
  hasPrivilegedUserFields,
  USER_PASSWORD_UPDATE_UNSUPPORTED,
} from "./user.model.js";
import UserRepository from "./user.repository.js";
import UserService, { type UserListFilters } from "./user.service.js";

export class UserController {
  private userService: UserService;
  // Админское удаление идёт тем же поведением, что и `DELETE /api/auth/me`:
  // две реализации разошлись бы на отзыве доступа Apple (§9.4.10).
  private accountService: AccountService;

  constructor(_server: FastifyInstance) {
    const prisma = getPrisma();
    const userRepository = new UserRepository(prisma);
    this.userService = new UserService(userRepository, _server.log);
    this.accountService = new AccountService(
      new IdentityRepository(prisma),
      this.userService,
      createAppleTokenClient({ logger: _server.log }),
      _server.log,
    );

    // Гейт на пароль стоит до валидации: обработчику достаётся уже вычищенное
    // тело, поэтому в updateUser поле `password` увидеть невозможно (§9.4.11).
    // Хук инкапсулирован плагином маршрутов пользователя.
    _server.addHook("preValidation", async (req, reply) => {
      if (req.method === "PUT" && hasPasswordField(req.body)) {
        return reply
          .code(USER_PASSWORD_UPDATE_UNSUPPORTED.code)
          .send(USER_PASSWORD_UPDATE_UNSUPPORTED);
      }
    });
  }

  getUserList(req: { query: PaginationQuery & UserListFilters }) {
    const { page, limit, sort, order, city, isActive } = req.query;
    return this.userService.getUserList({ page, limit, sort, order }, { city, isActive });
  }

  getUser(req: { params: { id: string }; user?: unknown }) {
    const id = Number(req.params.id);
    const denied = this.ensureSelfOrAdmin(req, id);
    if (denied) {
      return denied;
    }
    return this.userService.getUser(id);
  }

  updateUser(req: { params: { id: string }; body: Omit<UpdateUser, "id">; user?: unknown }) {
    const id = Number(req.params.id);
    const denied = this.ensureSelfOrAdmin(req, id);
    if (denied) {
      return denied;
    }
    // Владелец правит анкету, но не привилегированные флаги: запрос с ними
    // отклоняется целиком, а не чистится молча (§9.4.11).
    const isAdmin = !!getAuthPayload(req).roles?.includes("admin");
    if (hasPrivilegedUserFields(req.body, isAdmin)) {
      return appErrorCodes.AUTH_FORBIDDEN;
    }
    return this.userService.updateUser({ ...req.body, id });
  }

  deleteUser(req: { params: { id: string } }) {
    return this.accountService.deleteAccount(Number(req.params.id));
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
