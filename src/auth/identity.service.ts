import type { FastifyBaseLogger } from "fastify";
import type { Static } from "typebox";

import env from "@/config/env.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import type { JwtPayload } from "@/plugins/auth.js";
import type { ErrorResponse } from "@/types/prisma.js";
import type { User } from "@/user/user.model.js";
import type UserRepository from "@/user/user.repository.js";
import { normalizeEmail } from "@/utils/email.js";

import type { IAuthRepository, UserWithSecret } from "./auth.repository.js";
import type { AuthService, AuthSuccess } from "./auth.service.js";
import type { AUTH_PROVIDER } from "./constant.js";
import {
  buildLoginMethods,
  isErrorEnvelope,
  isProfileComplete,
  storeAppleRefreshToken,
} from "./identity.helpers.js";
import type { linkRequiredSchema } from "./identity.model.js";
import {
  type IdentityRecord,
  type IIdentityRepository,
  isEmailUniqueViolation,
} from "./identity.repository.js";
import * as linkTicket from "./linkTicket.js";
import type { IAppleTokenClient } from "./providers/apple.client.js";
import type { ProviderProfile, VerifierRegistry } from "./providers/types.js";

// Анонимная половина способов входа (§9.4.5): всё, что происходит ДО сессии.
// Привязка и отвязка под открытой сессией живут в identityLink.service.ts.

export type LinkRequired = Static<typeof linkRequiredSchema>;

const SECRET_KEY_BYTES = 32;

/** Текущий ключ шифрования сохранённого токена или `null`, если он не задан. */
export function currentSecretKey(): Buffer | null {
  const key = Buffer.from(env.AUTH_SECRET_KEY, "base64");
  return key.length === SECRET_KEY_BYTES ? key : null;
}

type ProfilePatch = Partial<Pick<User, "firstName" | "lastName" | "avatar" | "email" | "name">>;

function providerName(profile: ProviderProfile): string | undefined {
  const full = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  return full.length > 0 ? full : profile.username;
}

// Правило 4: провайдер отдаёт свои данные при каждом входе, поэтому импорт
// заполняет только пустые поля и никогда не затирает правки человека.
function profilePatch(user: User, profile: ProviderProfile): ProfilePatch {
  const patch: ProfilePatch = {};
  if (!user.firstName && profile.firstName) patch.firstName = profile.firstName;
  if (!user.lastName && profile.lastName) patch.lastName = profile.lastName;
  if (!user.avatar && profile.avatar) patch.avatar = profile.avatar;
  if (!user.email && profile.email && profile.emailVerified) {
    patch.email = normalizeEmail(profile.email) ?? undefined;
  }
  if (!user.name) {
    const name = providerName(profile);
    if (name) patch.name = name;
  }
  return patch;
}

export class IdentityService {
  constructor(
    private identityRepository: IIdentityRepository,
    private userRepository: UserRepository,
    private authRepository: IAuthRepository,
    private authService: AuthService,
    private verifiers: VerifierRegistry,
    private appleTokens: IAppleTokenClient,
    private logger: FastifyBaseLogger,
    private secretKey: Buffer | null = currentSecretKey(),
  ) {}

  async loginWithProvider(
    provider: AUTH_PROVIDER,
    credential: unknown,
  ): Promise<AuthSuccess | LinkRequired | ErrorResponse> {
    const verifier = this.verifiers[provider];
    if (!verifier.isConfigured()) return appErrorCodes.AUTH_PROVIDER_NOT_CONFIGURED;

    const profile = await verifier.verify(credential);
    if (isErrorEnvelope(profile)) return profile;

    const known = await this.identityRepository.findByProvider(provider, profile.providerUserId);
    if (known) return this.loginKnown(known, profile, credential);

    const owner = await this.findEmailOwner(profile);
    if (owner) return this.requireLink(owner, profile);

    return this.createAccount(profile, credential);
  }

  // Правило 2: слияние только по верифицированной почте — иначе чужая
  // неподтверждённая почта становится способом захвата аккаунта. Правило 3:
  // Telegram сюда не попадает никогда, почты он не отдаёт ни в одном механизме.
  private async findEmailOwner(profile: ProviderProfile): Promise<UserWithSecret | null> {
    const email = normalizeEmail(profile.email);
    if (!profile.emailVerified || !email) return null;
    return this.authRepository.getUserByEmailWithSecret(email);
  }

  private async requireLink(
    owner: UserWithSecret,
    profile: ProviderProfile,
  ): Promise<LinkRequired | ErrorResponse> {
    const ticket = await linkTicket.create(owner.id, profile);
    if (typeof ticket !== "string") return ticket;

    const identities = await this.identityRepository.listByUser(owner.id);
    return {
      status: "link_required",
      ticket,
      provider: profile.provider,
      email: profile.email ?? "",
      methods: buildLoginMethods(identities, owner.password),
    };
  }

  private async loginKnown(
    identity: IdentityRecord,
    profile: ProviderProfile,
    credential: unknown,
  ): Promise<AuthSuccess | ErrorResponse> {
    const user = await this.userRepository.getUser(identity.userId);
    if (!user) return appErrorCodes.USER_NOT_FOUND;

    await this.identityRepository.touchLastLogin(identity.id);
    const patch = await this.importProfile(user, profilePatch(user, profile));
    await this.storeAppleToken(profile.provider, identity.id, credential);

    const [roles, playerId] = await Promise.all([
      this.authRepository.getRoleNames(user.id),
      this.authRepository.getPlayerIdByUserId(user.id),
    ]);
    return this.success({ ...user, ...patch }, roles, playerId);
  }

  /**
   * Импорт полей профиля не должен ронять вход: почта провайдера могла за это
   * время достаться другому аккаунту, а уникальный индекс `users.email` — не
   * повод отвечать пятисоткой. Тогда пишется всё остальное, кроме почты.
   */
  private async importProfile(user: User, patch: ProfilePatch): Promise<ProfilePatch> {
    if (Object.keys(patch).length === 0) return patch;
    try {
      await this.userRepository.updateUser({ id: user.id, ...patch });
      return patch;
    } catch (error) {
      if (patch.email === undefined || !isEmailUniqueViolation(error)) throw error;
      this.logger.warn({ userId: user.id }, "provider email is taken, imported without it");
      const { email: _taken, ...rest } = patch;
      return this.importProfile(user, rest);
    }
  }

  private async createAccount(
    profile: ProviderProfile,
    credential: unknown,
  ): Promise<AuthSuccess | ErrorResponse> {
    const created = await this.identityRepository.createUserWithIdentity(profile);
    // Почта профиля уже принадлежит другому аккаунту — ответ по существу, а не
    // «этот способ входа занят»: занята почта, и человеку надо сказать именно это.
    if (created === "email_taken") return appErrorCodes.USER_EMAIL_DUPLICATED;
    if (!created) {
      // Уникальный индекс занят: параллельный первый вход тем же внешним
      // аккаунтом успел раньше — входим по его записи, а не отвечаем 500.
      const raced = await this.identityRepository.findByProvider(
        profile.provider,
        profile.providerUserId,
      );
      if (!raced) return appErrorCodes.AUTH_IDENTITY_ALREADY_LINKED;
      return this.loginKnown(raced, profile, credential);
    }

    // Репозиторий оставляет `User.name` пустым, а `Player.name` обязателен:
    // фолбэк «имя провайдера → username → Player #id» строится здесь (§9.4.9).
    const name = providerName(profile) ?? `Player #${created.user.id}`;
    await this.userRepository.updateUser({ id: created.user.id, name });
    await this.storeAppleToken(profile.provider, created.identity.id, credential);

    return this.success({ id: created.user.id, email: created.user.email, name }, []);
  }

  // Правило 9 живёт в identity.helpers.ts: вход и привязка различаются только
  // текстом сообщения, а ветка одна на оба сервиса.
  private storeAppleToken(
    provider: AUTH_PROVIDER,
    identityId: number,
    credential: unknown,
  ): Promise<void> {
    return storeAppleRefreshToken(
      {
        identityRepository: this.identityRepository,
        appleTokens: this.appleTokens,
        logger: this.logger,
        secretKey: this.secretKey,
      },
      provider,
      identityId,
      credential,
      "apple refresh token not stored, login continues",
    );
  }

  // Правило 7: любая успешная ветка заканчивается на issueTokens, иначе
  // refresh-jti не попадёт в Redis и ротация не заработает.
  private async success(
    user: { id: number; email?: string | null; name?: string | null; birthDate?: string | null },
    roles: string[],
    playerId?: number,
  ): Promise<AuthSuccess> {
    const payload: JwtPayload = { sub: user.id, email: user.email ?? null, roles, playerId };
    return {
      user: {
        id: user.id,
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        playerId,
        profileComplete: isProfileComplete(user),
      },
      ...(await this.authService.issueTokens(payload)),
    };
  }
}
