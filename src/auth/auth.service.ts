import { randomUUID } from "node:crypto";

import { errorCodes } from "fastify";

import env from "@/config/env.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import UserRepository from "@/user/user.repository.js";
import PlayerRepository from "@/player/player.repository.js";
import { PLAYER_LEVEL, PLAYER_POSITION } from "@/player/constant.js";
import { verifyPassword } from "./password.js";
import AuthRepository from "./auth.repository.js";
import {
  storeRefresh,
  checkRefresh,
  revokeRefresh,
  revokeAllRefresh,
  blacklistAccess,
} from "./refreshStore.js";

import type { Logger } from "pino";
import type { ErrorResponse } from "@/types/prisma.js";
import type { CreateUser, UpdateUser } from "@/user/types.js";
import type { CreatePlayer } from "@/player/player.service.js";
import type { JwtPayload } from "@/plugins/auth.js";

// Minimal contract over fastify-jwt's signer, decoupled from the ambient
// jwt typing (which is skewed by legacy @types/fastify-jwt in this project).
export interface TokenSigner {
  sign(payload: object, options?: { expiresIn?: string | number }): string;
  verify<T>(token: string): T;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
  birthDate: string;
  phone?: string;
  city?: string;
  country?: string;
  gender?: string;
  createPlayer?: boolean;
  level?: PLAYER_LEVEL;
  position?: PLAYER_POSITION;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthUser {
  id: number;
  email: string;
  name?: string;
  playerId?: number;
}

export interface AuthSuccess {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private authRepository: AuthRepository,
    private userRepository: UserRepository,
    private playerRepository: PlayerRepository,
    private jwt: TokenSigner,
    private logger: Logger
  ) {}

  // Signs an access + refresh pair, each with its own `jti`. The refresh jti is
  // the identity tracked in Redis for rotation/revocation.
  private buildTokens(payload: JwtPayload): {
    accessToken: string;
    refreshToken: string;
    refreshJti: string;
  } {
    const refreshJti = randomUUID();
    const accessToken = this.jwt.sign({
      ...payload,
      type: "access",
      jti: randomUUID(),
    });
    const refreshToken = this.jwt.sign(
      { ...payload, type: "refresh", jti: refreshJti },
      { expiresIn: env.REFRESH_TOKEN_TTL }
    );
    return { accessToken, refreshToken, refreshJti };
  }

  // Signs a pair and records the refresh token as active in Redis (best-effort;
  // a down Redis still returns usable tokens — cache-design.md §5.1).
  private async issueTokens(
    payload: JwtPayload
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const { accessToken, refreshToken, refreshJti } = this.buildTokens(payload);
    await storeRefresh(payload.sub, refreshJti, env.REFRESH_TOKEN_TTL);
    return { accessToken, refreshToken };
  }

  async register(input: RegisterInput): Promise<AuthSuccess | ErrorResponse> {
    const duplicate = await this.userRepository.getUserByEmail(input.email);
    if (duplicate) {
      this.logger.error(`User with email ${input.email} already exists`);
      return appErrorCodes.USER_EMAIL_DUPLICATED;
    }

    const createUserInput: CreateUser = {
      email: input.email,
      password: input.password,
      name: input.name,
      birthDate: input.birthDate,
      phone: input.phone,
      city: input.city,
      country: input.country,
      gender: input.gender,
    } as CreateUser;

    let user;
    try {
      user = await this.userRepository.createUser(createUserInput);
    } catch (error) {
      this.logger.error(error);
      throw errorCodes.FST_ERR_CTP_INVALID_HANDLER();
    }

    if (!user) {
      return appErrorCodes.USER_NOT_CREATED;
    }

    let playerId: number | undefined;
    if (input.createPlayer) {
      const createdPlayer = await this.playerRepository.createPlayer({
        name: input.name || input.email,
        userId: user.id,
        level: input.level,
        position: input.position,
        user: user as unknown as UpdateUser,
      } as CreatePlayer);
      playerId = createdPlayer?.id;
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: [],
      playerId,
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        playerId,
      },
      ...(await this.issueTokens(payload)),
    };
  }

  async login(input: LoginInput): Promise<AuthSuccess | ErrorResponse> {
    const user = await this.authRepository.getUserByEmailWithSecret(
      input.email
    );

    if (!user || !verifyPassword(input.password, user.password)) {
      return appErrorCodes.AUTH_INVALID_CREDENTIALS;
    }

    const [roles, playerId] = await Promise.all([
      this.authRepository.getRoleNames(user.id),
      this.authRepository.getPlayerIdByUserId(user.id),
    ]);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles,
      playerId,
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
        playerId,
      },
      ...(await this.issueTokens(payload)),
    };
  }

  // Rotating refresh: verify signature, confirm the jti is still active in
  // Redis, then swap it for a fresh pair. A valid signature whose jti is gone
  // means the token was already rotated/revoked (reuse) -> hard logout.
  async refresh(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string } | ErrorResponse> {
    let decoded: JwtPayload;
    try {
      decoded = this.jwt.verify<JwtPayload>(refreshToken);
    } catch {
      return appErrorCodes.AUTH_TOKEN_INVALID;
    }

    if (decoded.type !== "refresh" || !decoded.jti) {
      return appErrorCodes.AUTH_TOKEN_INVALID;
    }

    const state = await checkRefresh(decoded.sub, decoded.jti);
    if (state === "missing") {
      // Reuse of a consumed/revoked token: revoke every session for safety.
      await revokeAllRefresh(decoded.sub);
      return appErrorCodes.AUTH_TOKEN_INVALID;
    }
    // state === "valid": consume the old jti. state === "unavailable" (Redis
    // down): fail-open and still rotate so login/refresh keeps working.
    if (state === "valid") {
      await revokeRefresh(decoded.sub, decoded.jti);
    }

    // Re-read roles so a refreshed access token reflects current RBAC state.
    const [roles, playerId] = await Promise.all([
      this.authRepository.getRoleNames(decoded.sub),
      this.authRepository.getPlayerIdByUserId(decoded.sub),
    ]);

    const payload: JwtPayload = {
      sub: decoded.sub,
      email: decoded.email,
      roles,
      playerId,
    };

    return this.issueTokens(payload);
  }

  async me(userId: number): Promise<AuthUser | ErrorResponse> {
    const user = await this.userRepository.getUser(userId);
    if (!user) {
      return appErrorCodes.USER_NOT_FOUND;
    }
    const playerId = await this.authRepository.getPlayerIdByUserId(userId);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      playerId,
    };
  }

  // Logout: revoke every refresh token for the user (log out all sessions) and,
  // when enabled, blacklist the current access token for its remaining life.
  async logout(payload: JwtPayload): Promise<{ status: string }> {
    await revokeAllRefresh(payload.sub);

    if (env.ACCESS_BLACKLIST_ENABLED && payload.jti) {
      const remaining = payload.exp
        ? payload.exp - Math.floor(Date.now() / 1000)
        : 0;
      await blacklistAccess(payload.jti, remaining);
    }

    return { status: "success" };
  }
}
