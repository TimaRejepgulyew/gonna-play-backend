import { Prisma, type PrismaClient } from "@/types/prisma.js";
import { normalizeEmail } from "@/utils/email.js";

import { AUTH_PROVIDER } from "./constant.js";
import type { ProviderProfile } from "./providers/types.js";

// Доступ к таблице `auth_identities` (§9.5.1). Колонка `refreshTokenEncrypted`
// читается ровно из одного места — `getAppleRefreshToken`; ни в одну выборку
// списка привязок она не входит, поэтому все выборки идут явным `select`.

/** Строка привязки без зашифрованного токена: всё, что нужно сервисам и ответу API. */
export interface IdentityRecord {
  id: number;
  userId: number;
  provider: AUTH_PROVIDER;
  providerUserId: string;
  email: string | null;
  username: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}

/** Созданный провайдером аккаунт — ровно те поля, из которых собирается `AuthSuccess`. */
export interface CreatedIdentityUser {
  id: number;
  email: string | null;
  name: string | null;
}

export interface IIdentityRepository {
  findByProvider(provider: AUTH_PROVIDER, providerUserId: string): Promise<IdentityRecord | null>;
  listByUser(userId: number): Promise<IdentityRecord[]>;
  touchLastLogin(identityId: number): Promise<void>;
  /**
   * Пользователь и способ входа одной транзакцией. `null` — пара
   * `(provider, providerUserId)` занята; `"email_taken"` — почту профиля уже
   * носит другой аккаунт, и это другой ответ, а не «привязка занята».
   */
  createUserWithIdentity(
    profile: ProviderProfile,
  ): Promise<{ user: CreatedIdentityUser; identity: IdentityRecord } | null | "email_taken">;
  /**
   * `null` — пара `(provider, providerUserId)` уже занята другим аккаунтом;
   * `"provider_taken"` — у самого пользователя уже есть привязка этого
   * провайдера, и это другой ответ, а не «занято другим».
   */
  link(userId: number, profile: ProviderProfile): Promise<IdentityRecord | null | "provider_taken">;
  /**
   * Отвязка вместе с подсчётом остатка в одной сериализуемой транзакции:
   * `false` — записи не было, `"last_login_method"` — отвязка заперла бы аккаунт.
   */
  unlink(
    userId: number,
    provider: AUTH_PROVIDER,
    hasUsablePassword?: boolean,
  ): Promise<boolean | "last_login_method">;
  saveRefreshToken(identityId: number, refreshTokenEncrypted: string): Promise<void>;
  getAppleRefreshToken(userId: number): Promise<string | null>;
}

const IDENTITY_SELECT = {
  id: true,
  userId: true,
  provider: true,
  providerUserId: true,
  email: true,
  username: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

const identityData = (profile: ProviderProfile) => ({
  provider: profile.provider,
  providerUserId: profile.providerUserId,
  email: normalizeEmail(profile.email),
  username: profile.username ?? null,
  lastLoginAt: new Date(),
});

// Уникальность нарушена: параллельный первый вход тем же внешним аккаунтом
// либо привязка уже занятой пары (§11.5). Наружу это уходит конвертом сервиса,
// а не пятисоткой, поэтому код гасится здесь — общего маппинга в проекте нет.
// Колонки конфликта нужны, потому что ответы разные: столкновение по
// `users.email` — не то же самое, что занятая пара `(provider, providerUserId)`.
// Под драйверным адаптером (`PrismaPg`, src/config/prisma.ts) `meta.target` не
// приходит вовсе: колонки лежат в `meta.driverAdapterError.cause.constraint`, и
// кавычки вокруг camelCase-имён остаются в значении (`"userId"`). `target`
// читается вторым источником — на случай клиента без адаптера.
interface UniqueViolationMeta {
  target?: unknown;
  driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
}

const uniqueViolationColumns = (error: unknown): string[] | null => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null;
  }
  const meta = error.meta as UniqueViolationMeta | undefined;
  const fields = meta?.driverAdapterError?.cause?.constraint?.fields;
  const source = Array.isArray(fields) ? fields : meta?.target;
  return Array.isArray(source) ? source.map((name) => String(name).replaceAll('"', "")) : [];
};

const isUniqueViolation = (error: unknown): boolean => uniqueViolationColumns(error) !== null;

/** Конфликт именно по почте пользователя: единственный уникальный `email` в схеме — у `users`. */
export const isEmailUniqueViolation = (error: unknown): boolean =>
  uniqueViolationColumns(error)?.includes("email") === true;

// Инвариант «одна запись на провайдера у пользователя» держит уникальный индекс
// ("userId", provider): проверка в сервисе идёт до вставки и двух одновременных
// привязок не останавливает. Отказ базы гасится здесь и уходит тем же конвертом,
// что и проверка, — иначе гонка отвечала бы пятисоткой.
const isUserProviderUniqueViolation = (error: unknown): boolean =>
  uniqueViolationColumns(error)?.includes("userId") === true;

export default class IdentityRepository implements IIdentityRepository {
  constructor(private prisma: PrismaClient) {}

  async findByProvider(
    provider: AUTH_PROVIDER,
    providerUserId: string,
  ): Promise<IdentityRecord | null> {
    const row = await this.prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
      select: IDENTITY_SELECT,
    });
    return row as IdentityRecord | null;
  }

  async listByUser(userId: number): Promise<IdentityRecord[]> {
    const rows = await this.prisma.authIdentity.findMany({
      where: { userId },
      select: IDENTITY_SELECT,
      orderBy: { createdAt: "asc" },
    });
    return rows as IdentityRecord[];
  }

  async touchLastLogin(identityId: number): Promise<void> {
    await this.prisma.authIdentity.update({
      where: { id: identityId },
      data: { lastLoginAt: new Date() },
    });
  }

  async createUserWithIdentity(
    profile: ProviderProfile,
  ): Promise<{ user: CreatedIdentityUser; identity: IdentityRecord } | null | "email_taken"> {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: normalizeEmail(profile.email),
          firstName: profile.firstName ?? null,
          lastName: profile.lastName ?? null,
          avatar: profile.avatar ?? null,
          identities: { create: identityData(profile) },
        },
        select: {
          id: true,
          email: true,
          name: true,
          identities: { select: IDENTITY_SELECT },
        },
      });
      const identity = user.identities[0] as IdentityRecord;
      return { user: { id: user.id, email: user.email, name: user.name }, identity };
    } catch (error) {
      if (isEmailUniqueViolation(error)) return "email_taken";
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  async link(
    userId: number,
    profile: ProviderProfile,
  ): Promise<IdentityRecord | null | "provider_taken"> {
    try {
      const row = await this.prisma.authIdentity.create({
        data: { userId, ...identityData(profile) },
        select: IDENTITY_SELECT,
      });
      return row as IdentityRecord;
    } catch (error) {
      if (isUserProviderUniqueViolation(error)) return "provider_taken";
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  // Сериализуемая транзакция с одним повтором на конфликт записи (P2034) —
  // тот же приём, что в src/match/match-participant.repository.ts:44.
  private async runSerializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const run = () =>
      this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    try {
      return await run();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
        return run();
      }
      throw error;
    }
  }

  // Остаток способов входа считается внутри той же транзакции, что и удаление:
  // две параллельные отвязки разных провайдеров иначе прошли бы проверку каждая
  // и оставили бы аккаунт без единой двери — восстановления доступа в проекте
  // нет ни в каком виде (правило 6).
  async unlink(
    userId: number,
    provider: AUTH_PROVIDER,
    hasUsablePassword = false,
  ): Promise<boolean | "last_login_method"> {
    return this.runSerializable(async (tx) => {
      const rows = await tx.authIdentity.findMany({
        where: { userId },
        select: { provider: true },
      });
      const doomed = rows.filter((row) => row.provider === provider).length;
      if (doomed === 0) return false;
      if (rows.length - doomed + (hasUsablePassword ? 1 : 0) === 0) return "last_login_method";

      const result = await tx.authIdentity.deleteMany({ where: { userId, provider } });
      return result.count > 0;
    });
  }

  async saveRefreshToken(identityId: number, refreshTokenEncrypted: string): Promise<void> {
    await this.prisma.authIdentity.update({
      where: { id: identityId },
      data: { refreshTokenEncrypted, refreshTokenUpdatedAt: new Date() },
    });
  }

  // Единственное чтение зашифрованного токена во всём приложении: отзыв доступа
  // Apple при удалении аккаунта (§9.4.10).
  async getAppleRefreshToken(userId: number): Promise<string | null> {
    const row = await this.prisma.authIdentity.findFirst({
      where: { userId, provider: AUTH_PROVIDER.Apple },
      select: { refreshTokenEncrypted: true },
    });
    return row?.refreshTokenEncrypted ?? null;
  }
}
