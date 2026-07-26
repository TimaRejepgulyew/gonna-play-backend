import type { FastifyInstance } from "fastify";
import { getPrisma } from "@/config/prisma.js";
import PlayerRepository from "@/player/player.repository.js";
import { getAuthPayload } from "@/plugins/auth.js";
import UserRepository from "@/user/user.repository.js";
import UserService from "@/user/user.service.js";
import AccountService from "./account.service.js";
import AuthRepository from "./auth.repository.js";
import {
  AuthService,
  type LoginInput,
  type RegisterInput,
  type TokenSigner,
} from "./auth.service.js";
import type { AUTH_PROVIDER } from "./constant.js";
import IdentityRepository, { type IIdentityRepository } from "./identity.repository.js";
import { IdentityService } from "./identity.service.js";
import { type ConfirmLinkInput, IdentityLinkService } from "./identityLink.service.js";
import { createAppleTokenClient } from "./providers/apple.client.js";
import { createVerifierRegistry } from "./providers/index.js";

export class AuthController {
  private authService: AuthService;
  private accountService: AccountService;
  private identityLinkService: IdentityLinkService;
  private identityRepository: IIdentityRepository;
  private identityServiceFor: (repository: IIdentityRepository) => IdentityService;

  constructor(server: FastifyInstance) {
    const prisma = getPrisma();
    const authRepository = new AuthRepository(prisma);
    const userRepository = new UserRepository(prisma);
    const playerRepository = new PlayerRepository(prisma);
    const authService = new AuthService(
      authRepository,
      userRepository,
      playerRepository,
      server.jwt as TokenSigner,
      server.log,
    );
    this.authService = authService;

    const identityRepository = new IdentityRepository(prisma);
    const appleTokens = createAppleTokenClient({ logger: server.log });
    const verifiers = createVerifierRegistry();
    this.identityRepository = identityRepository;
    this.accountService = new AccountService(
      identityRepository,
      new UserService(userRepository, server.log),
      appleTokens,
      server.log,
    );
    this.identityLinkService = new IdentityLinkService(
      identityRepository,
      userRepository,
      authRepository,
      authService,
      verifiers,
      appleTokens,
      server.log,
    );
    this.identityServiceFor = (repository) =>
      new IdentityService(
        repository,
        userRepository,
        authRepository,
        authService,
        verifiers,
        appleTokens,
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

  /**
   * `AuthSuccess` одинаков и для входа в существующий аккаунт, и для только что
   * созданного, а маршруту нужен 201 ровно на создание. Признак снимается на
   * один запрос: репозиторий оборачивается, создающий метод перехватывается,
   * служба собирается заново — общему объекту флаг не принадлежит.
   */
  async loginWithProvider(provider: AUTH_PROVIDER, credential: unknown) {
    let created = false;
    const base = this.identityRepository;
    const repository: IIdentityRepository = {
      findByProvider: (p, providerUserId) => base.findByProvider(p, providerUserId),
      listByUser: (userId) => base.listByUser(userId),
      touchLastLogin: (identityId) => base.touchLastLogin(identityId),
      link: (userId, profile) => base.link(userId, profile),
      unlink: (userId, p) => base.unlink(userId, p),
      saveRefreshToken: (identityId, token) => base.saveRefreshToken(identityId, token),
      getAppleRefreshToken: (userId) => base.getAppleRefreshToken(userId),
      createUserWithIdentity: async (profile) => {
        const outcome = await base.createUserWithIdentity(profile);
        created = outcome !== null;
        return outcome;
      },
    };

    const result = await this.identityServiceFor(repository).loginWithProvider(
      provider,
      credential,
    );
    return { result, created };
  }

  confirmLink(req: { body: ConfirmLinkInput }) {
    return this.identityLinkService.confirmLink(req.body);
  }

  listIdentities(req: { user?: unknown }) {
    return this.identityLinkService.listIdentities(getAuthPayload(req).sub);
  }

  linkIdentity(req: { user?: unknown; body: unknown }, provider: AUTH_PROVIDER) {
    return this.identityLinkService.linkIdentity(getAuthPayload(req).sub, provider, req.body);
  }

  unlinkIdentity(req: { user?: unknown }, provider: AUTH_PROVIDER) {
    return this.identityLinkService.unlinkIdentity(getAuthPayload(req).sub, provider);
  }

  // Параметров нет намеренно: удаляемый берётся из payload.sub, чужой аккаунт
  // этим маршрутом не достать.
  deleteAccount(req: { user?: unknown }) {
    return this.accountService.deleteAccount(getAuthPayload(req).sub);
  }
}
