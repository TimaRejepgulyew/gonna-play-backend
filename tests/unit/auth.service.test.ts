import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it } from "vitest";
import type AuthRepository from "@/auth/auth.repository.js";
import type { TokenSigner } from "@/auth/auth.service.js";
import { AuthService } from "@/auth/auth.service.js";
import { hashToStorage } from "@/auth/password.js";
import { errorCodes } from "@/constants/index.js";
import type PlayerRepository from "@/player/player.repository.js";
import type UserRepository from "@/user/user.repository.js";

import { createFakeAuthRepository } from "./doubles/repositories.js";

// UNIT-12: неизвестный email и неверный пароль обязаны быть неразличимы для
// вызывающего — иначе разница в ответе превращает форму логина в оракул
// существования учётки. Ветка — src/auth/auth.service.ts:169-171.
//
// Доменная ошибка здесь **возвращается**, а не бросается: сигнатура
// `Promise<AuthSuccess | ErrorResponse>`, статус проставляет хук
// preSerialization. Поэтому ассертим возвращённое значение, не исключение.

const PASSWORD = "correct-horse-battery";
const EMAIL = "keeper@example.com";
const BIRTH_DATE = "1990-05-01";

// login дочитывает профиль ради `profileComplete`: `UserWithSecret` даты
// рождения не несёт. Двойник отдаёт ровно то, что читает эта ветка.
function createFakeUserRepository() {
  const rows = new Map<number, { id: number; email?: string | null; birthDate?: string | null }>();
  return {
    rows,
    async getUser(id: number) {
      return rows.get(id) ?? null;
    },
  };
}

// Логгер сервису нужен только в ветках register (:107, :126); в login он не
// вызывается ни разу, поэтому пустых методов достаточно.
const silentLogger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
} as unknown as FastifyBaseLogger;

describe("AuthService.login", () => {
  const authRepository = createFakeAuthRepository();
  let userRepository: ReturnType<typeof createFakeUserRepository>;
  let signed: object[];
  let service: AuthService;

  beforeEach(() => {
    authRepository.reset();
    userRepository = createFakeUserRepository();
    signed = [];
    const jwt: TokenSigner = {
      sign(payload) {
        signed.push(payload);
        return `token-${signed.length}`;
      },
      verify() {
        throw new Error("verify() is not part of the login path");
      },
    };
    service = new AuthService(
      authRepository as unknown as AuthRepository,
      userRepository as unknown as UserRepository,
      {} as PlayerRepository,
      jwt,
      silentLogger,
    );
    authRepository.users.seed({
      id: 7,
      email: EMAIL,
      name: "Keeper",
      // Хешируем тем же кодом, что и продакшен, — иначе verifyPassword
      // отвергал бы даже верный пароль и «успешный» кейс ничего не доказывал.
      password: hashToStorage(PASSWORD),
      roles: ["user"],
      playerId: 42,
    });
    userRepository.rows.set(7, { id: 7, email: EMAIL, birthDate: BIRTH_DATE });
  });

  it("returns 401 for an unknown email instead of throwing", async () => {
    const result = await service.login({
      email: "nobody@example.com",
      password: PASSWORD,
    });

    expect(result).toEqual(errorCodes.AUTH_INVALID_CREDENTIALS);
    expect(result).toMatchObject({ code: 401 });
  });

  it("returns 401 for a known email with the wrong password", async () => {
    const result = await service.login({
      email: EMAIL,
      password: "not-the-password",
    });

    expect(result).toEqual(errorCodes.AUTH_INVALID_CREDENTIALS);
    expect(result).toMatchObject({ code: 401 });
  });

  // Ядро UNIT-12: сравниваем тела целиком через toEqual, а не только коды —
  // проверяемое свойство именно в неразличимости двух отказов.
  it("gives byte-identical bodies for an unknown email and a wrong password", async () => {
    const unknownEmail = await service.login({
      email: "nobody@example.com",
      password: PASSWORD,
    });
    const wrongPassword = await service.login({
      email: EMAIL,
      password: "not-the-password",
    });

    expect(unknownEmail).toEqual(wrongPassword);
  });

  // Отказ обязан наступать до запросов ролей и игрока: иначе разница в
  // количестве обращений к БД делает две ветки различимыми по времени ответа.
  it("short-circuits before reading roles or the player id", async () => {
    await service.login({ email: EMAIL, password: "not-the-password" });

    expect(authRepository.calls.getRoleNames).toEqual([]);
    expect(authRepository.calls.getPlayerIdByUserId).toEqual([]);
    expect(signed).toEqual([]);
  });

  // Беспарольный аккаунт (создан провайдером): `User.password` nullable, и
  // парольный вход по нему обязан отвечать тем же 401, а не падать в 500.
  it("returns 401 for a passwordless account without touching roles or the player id", async () => {
    authRepository.users.seed({
      id: 8,
      email: "provider-only@example.com",
      name: "Provider Only",
      password: null,
      roles: ["user"],
    });

    const result = await service.login({
      email: "provider-only@example.com",
      password: PASSWORD,
    });

    expect(result).toEqual(errorCodes.AUTH_INVALID_CREDENTIALS);
    expect(authRepository.calls.getRoleNames).toEqual([]);
    expect(authRepository.calls.getPlayerIdByUserId).toEqual([]);
    expect(signed).toEqual([]);
  });

  // Контрольный кейс: без него зелёные отказы выше могли бы объясняться просто
  // сломанной подменой репозитория. Заодно проводит прогон через issueTokens →
  // storeRefresh (src/auth/refreshStore.ts:32-45), то есть через set/sadd/expire
  // заглушки Redis — при неполной заглушке afterEach покраснеет на
  // missingMethods.
  it("issues a token pair for the correct credentials", async () => {
    const result = await service.login({ email: EMAIL, password: PASSWORD });

    expect(result).not.toMatchObject({ code: 401 });
    expect(result).toMatchObject({
      user: { id: 7, email: EMAIL, name: "Keeper", playerId: 42, profileComplete: true },
      accessToken: "token-1",
      refreshToken: "token-2",
    });
    expect(signed).toHaveLength(2);
  });

  // §9.5.4: признак — «есть почта и есть дата рождения». Пустая дата рождения
  // обязана доехать до клиента как `profileComplete: false`, иначе единственный
  // механизм дозаполнения анкеты молчит.
  it("reports an unfinished profile when the birth date is missing", async () => {
    userRepository.rows.set(7, { id: 7, email: EMAIL, birthDate: null });

    const result = await service.login({ email: EMAIL, password: PASSWORD });

    expect(result).toMatchObject({ user: { profileComplete: false } });
  });
});
