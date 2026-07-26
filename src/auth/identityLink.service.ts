import type { FastifyBaseLogger } from "fastify";
import type { Static } from "typebox";

import { errorCodes as appErrorCodes } from "@/constants/index.js";
import type { JwtPayload } from "@/plugins/auth.js";
import type { ErrorResponse } from "@/types/prisma.js";
import type UserRepository from "@/user/user.repository.js";

import type { IAuthRepository, UserWithSecret } from "./auth.repository.js";
import type { AuthService, AuthSuccess } from "./auth.service.js";
import type { AUTH_PROVIDER } from "./constant.js";
import {
  countRemainingLoginMethods,
  isErrorEnvelope,
  isPasswordUsable,
  isProfileComplete,
  storeAppleRefreshToken,
} from "./identity.helpers.js";
import type { identityListSchema, linkConfirmBodySchema } from "./identity.model.js";
import type { IdentityRecord, IIdentityRepository } from "./identity.repository.js";
import { currentSecretKey } from "./identity.service.js";
import * as linkTicket from "./linkTicket.js";
import { verifyPassword } from "./password.js";
import type { IAppleTokenClient } from "./providers/apple.client.js";
import type { ProviderProfile, VerifierRegistry } from "./providers/types.js";

// Половина под сессией и по тикету (§9.4.5): userId здесь известен всегда.
// Анонимный вход через провайдера живёт в identity.service.ts.

export type IdentityList = Static<typeof identityListSchema>;
export type ConfirmLinkInput = Static<typeof linkConfirmBodySchema>;

type Proof = NonNullable<ConfirmLinkInput["proof"]>;

/** Владелец вместе с датой рождения: из неё и почты считается `profileComplete` (§9.5.4). */
type Owner = UserWithSecret & { birthDate: string | null };

export class IdentityLinkService {
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

  /**
   * Правило 8: тикет гасится ДО разбора доказательства — одна попытка на тикет,
   * иначе он превращается в стенд для подбора пароля.
   */
  async confirmLink(input: ConfirmLinkInput): Promise<AuthSuccess | ErrorResponse> {
    const payload = await linkTicket.consume(input.ticket);
    if (isErrorEnvelope(payload)) return payload;

    // Владельца могли удалить, пока тикет висел (§11.5): тогда подтверждать
    // нечего, и ответом идёт конверт, а не падение.
    const owner = await this.owner(payload.userId);
    if (!owner) return appErrorCodes.AUTH_LINK_TICKET_INVALID;

    const refused = await this.proveOwnership(owner, input);
    if (refused) return refused;

    if (await this.hasProvider(owner.id, payload.profile.provider)) {
      return appErrorCodes.AUTH_PROVIDER_ALREADY_LINKED;
    }

    const linked = await this.identityRepository.link(owner.id, payload.profile);
    if (linked === "provider_taken") return appErrorCodes.AUTH_PROVIDER_ALREADY_LINKED;
    if (!linked) return appErrorCodes.AUTH_IDENTITY_ALREADY_LINKED;
    return this.success(owner);
  }

  async listIdentities(userId: number): Promise<IdentityList | ErrorResponse> {
    const owner = await this.owner(userId);
    if (!owner) return appErrorCodes.USER_NOT_FOUND;
    return this.list(owner);
  }

  async linkIdentity(
    userId: number,
    provider: AUTH_PROVIDER,
    credential: unknown,
  ): Promise<IdentityList | ErrorResponse> {
    const owner = await this.owner(userId);
    if (!owner) return appErrorCodes.USER_NOT_FOUND;

    // Инвариант «одна запись на провайдера у пользователя»: второй аккаунт того
    // же провайдера снялся бы отвязкой разом с первым, а выбор токена Apple стал
    // бы произвольным. Проверка до верификатора — она не требует сети; гонку
    // закрывает уникальный индекс ("userId", provider), а не она.
    if (await this.hasProvider(userId, provider)) {
      return appErrorCodes.AUTH_PROVIDER_ALREADY_LINKED;
    }

    const profile = await this.verify(provider, credential);
    if (isErrorEnvelope(profile)) return profile;

    // Правило 1: один способ — один аккаунт. Занятая пара уходит 409; ветки
    // «это ты, входи» здесь нет, она есть только на маршруте входа.
    const linked = await this.identityRepository.link(userId, profile);
    // Параллельная привязка того же провайдера успела раньше: отказ индекса —
    // та же причина, что у проверки выше, и тот же ответ.
    if (linked === "provider_taken") return appErrorCodes.AUTH_PROVIDER_ALREADY_LINKED;
    if (!linked) return appErrorCodes.AUTH_IDENTITY_ALREADY_LINKED;

    await this.storeAppleToken(profile.provider, linked.id, credential);
    return this.list(owner);
  }

  async unlinkIdentity(
    userId: number,
    provider: AUTH_PROVIDER,
  ): Promise<IdentityList | ErrorResponse> {
    const owner = await this.owner(userId);
    if (!owner) return appErrorCodes.USER_NOT_FOUND;

    const identities = await this.identityRepository.listByUser(userId);
    if (!identities.some((row) => row.provider === provider)) {
      return appErrorCodes.AUTH_IDENTITY_NOT_FOUND;
    }

    // Правило 6: восстановления доступа в проекте нет ни в каком виде, поэтому
    // отвязка последнего способа оставила бы аккаунт без единой двери. Здесь
    // проверка нужна ради точного ответа, а окончательное слово — за
    // репозиторием: он считает остаток и удаляет одной транзакцией, поэтому две
    // параллельные отвязки не пройдут обе.
    if (countRemainingLoginMethods(identities, provider, owner.password) === 0) {
      return appErrorCodes.AUTH_LAST_LOGIN_METHOD;
    }

    const removed = await this.identityRepository.unlink(
      userId,
      provider,
      isPasswordUsable(owner.password),
    );
    if (removed === "last_login_method") return appErrorCodes.AUTH_LAST_LOGIN_METHOD;
    if (!removed) return appErrorCodes.AUTH_IDENTITY_NOT_FOUND;
    return this.list(owner);
  }

  /** Есть ли у пользователя привязка этого провайдера. */
  private async hasProvider(userId: number, provider: AUTH_PROVIDER): Promise<boolean> {
    const identities = await this.identityRepository.listByUser(userId);
    return identities.some((row) => row.provider === provider);
  }

  /** Конверт ошибки, если владение не доказано; `null` — доказано. */
  private async proveOwnership(
    owner: Owner,
    input: ConfirmLinkInput,
  ): Promise<ErrorResponse | null> {
    // Ровно одно доказательство: оба поля сразу или ни одного — 400.
    if ((input.password === undefined) === (input.proof === undefined)) {
      return appErrorCodes.AUTH_LINK_PROOF_REQUIRED;
    }
    if (input.password !== undefined) {
      return verifyPassword(input.password, owner.password)
        ? null
        : appErrorCodes.AUTH_INVALID_CREDENTIALS;
    }
    return this.proveByProvider(owner.id, input.proof as Proof);
  }

  /**
   * Чужой валидный токен доказательством владения не является: провайдер обязан
   * быть среди привязок владельца тикета, а `providerUserId` — совпасть с его
   * записью. Провайдера, которого у владельца нет, к сети не пускаем вовсе.
   */
  private async proveByProvider(userId: number, proof: Proof): Promise<ErrorResponse | null> {
    const identities = await this.identityRepository.listByUser(userId);
    const own = identities.find((row) => row.provider === proof.provider);
    if (!own) return appErrorCodes.AUTH_LINK_PROOF_REQUIRED;

    const profile = await this.verify(proof.provider, proof.credential);
    if (isErrorEnvelope(profile)) return profile;
    return profile.providerUserId === own.providerUserId
      ? null
      : appErrorCodes.AUTH_LINK_PROOF_REQUIRED;
  }

  private async verify(
    provider: AUTH_PROVIDER,
    credential: unknown,
  ): Promise<ProviderProfile | ErrorResponse> {
    const verifier = this.verifiers[provider];
    if (!verifier.isConfigured()) return appErrorCodes.AUTH_PROVIDER_NOT_CONFIGURED;
    return verifier.verify(credential);
  }

  /**
   * Владелец вместе с хешем пароля: `getUser` его отбрасывает (`omit`), а входа
   * по id в `IAuthRepository` нет — хеш добирается вторым запросом по почте.
   * Аккаунт без почты пароля иметь не может: регистрация её требует.
   */
  private async owner(userId: number): Promise<Owner | null> {
    const user = await this.userRepository.getUser(userId);
    if (!user) return null;
    const secret = user.email
      ? await this.authRepository.getUserByEmailWithSecret(user.email)
      : null;
    return {
      id: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      birthDate: user.birthDate ?? null,
      password: secret?.id === userId ? secret.password : null,
    };
  }

  private async list(owner: Owner): Promise<IdentityList> {
    const identities = await this.identityRepository.listByUser(owner.id);
    return {
      hasPassword: isPasswordUsable(owner.password),
      identities: identities.map(toListItem),
    };
  }

  // Правило 9, вторая половина: токен Apple приходит и при привязке из
  // настроек. Сама ветка — общая с входом, в identity.helpers.ts.
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
      "apple refresh token not stored, link continues",
    );
  }

  // Правило 7: успешная ветка заканчивается на issueTokens, иначе refresh-jti
  // не попадёт в Redis и ротация не заработает.
  private async success(owner: Owner): Promise<AuthSuccess> {
    const [roles, playerId] = await Promise.all([
      this.authRepository.getRoleNames(owner.id),
      this.authRepository.getPlayerIdByUserId(owner.id),
    ]);
    const payload: JwtPayload = { sub: owner.id, email: owner.email, roles, playerId };
    return {
      user: {
        id: owner.id,
        email: owner.email ?? undefined,
        name: owner.name ?? undefined,
        playerId,
        profileComplete: isProfileComplete(owner),
      },
      ...(await this.authService.issueTokens(payload)),
    };
  }
}

function toListItem(row: IdentityRecord): IdentityList["identities"][number] {
  return {
    provider: row.provider,
    email: row.email ?? undefined,
    username: row.username ?? undefined,
    linkedAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString(),
  };
}
