import type { FastifyInstance } from "fastify";
import { getPrisma } from "@/config/prisma.js";
import PlayerRepository from "@/player/player.repository.js";
import { getAuthPayload } from "@/plugins/auth.js";
import UserRepository from "@/user/user.repository.js";
import AuthRepository from "./auth.repository.js";
import {
  AuthService,
  type LoginInput,
  type RegisterInput,
  type TokenSigner,
} from "./auth.service.js";

export class AuthController {
  private authService: AuthService;

  constructor(server: FastifyInstance) {
    const prisma = getPrisma();
    const authRepository = new AuthRepository(prisma);
    const userRepository = new UserRepository(prisma);
    const playerRepository = new PlayerRepository(prisma);
    this.authService = new AuthService(
      authRepository,
      userRepository,
      playerRepository,
      server.jwt as TokenSigner,
      server.log,
    );
  }

  register(req: { body: RegisterInput }) {
    return this.authService.register(req.body);
  }

  login(req: { body: LoginInput }) {
    return this.authService.login(req.body);
  }

  refresh(req: { body: { refreshToken: string } }) {
    return this.authService.refresh(req.body.refreshToken);
  }

  me(req: { user?: unknown }) {
    return this.authService.me(getAuthPayload(req).sub);
  }

  logout(req: { user?: unknown }) {
    return this.authService.logout(getAuthPayload(req));
  }
}
