import { randomUUID } from "node:crypto";
import type { AppInstance } from "@/app.js";
import { hashToStorage } from "@/auth/password.js";
import { getPrisma } from "@/config/prisma.js";

export interface Actor {
  userId: number;
  playerId?: number;
  email: string;
  password: string;
  token: string;
}

export interface CreateActorOptions {
  roles?: string[];
  withPlayer?: boolean;
  email?: string;
  password?: string;
  name?: string;
}

// >= 6 символов — loginSchema, src/auth/auth.model.ts:43.
const DEFAULT_PASSWORD = "Passw0rd!";

async function login(
  app: AppInstance,
  email: string,
  password: string,
): Promise<{ accessToken: string; playerId?: number }> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email, password },
  });

  if (res.statusCode !== 200) {
    throw new Error(`Login failed for ${email}: ${res.statusCode} ${res.payload}`);
  }

  const body = res.json() as {
    user: { playerId?: number };
    accessToken: string;
  };
  return { accessToken: body.accessToken, playerId: body.user.playerId };
}

/**
 * Создаёт пользователя (+ роли, + профиль игрока) напрямую в БД, затем логинится
 * по HTTP, чтобы токен уже содержал роли и playerId.
 *
 * Ловушка, ради которой хелпер существует: playerId и роли зашиты в токен на
 * момент выдачи — AuthService.login собирает payload из ролей и playerId,
 * прочитанных при логине (src/auth/auth.service.ts:173-183), и подписывает его
 * (:82-86). Поэтому логин идёт строго последним шагом. Если тест меняет роли или
 * создаёт игрока уже после выдачи токена, нужен relogin().
 *
 * Через register() фикстуры не идут: он всегда подписывает roles: []
 * (src/auth/auth.service.ts:149) независимо от того, что лежит в БД.
 *
 * Ни один актор не берётся из сида: TRUNCATE в beforeEach сносит users и
 * user_roles, а global-setup сеет только справочник ролей.
 */
export async function createActor(app: AppInstance, opts: CreateActorOptions = {}): Promise<Actor> {
  // Клиент берётся в момент вызова, а не на импорте модуля: после closePrisma()
  // слот освобождается, и следующий вызов получит свежий клиент.
  const prisma = getPrisma();

  const email = opts.email ?? `actor-${randomUUID()}@test.local`;
  const password = opts.password ?? DEFAULT_PASSWORD;
  const name = opts.name ?? "Test Actor";

  const user = await prisma.user.create({
    data: {
      email,
      // Формат хранения salt:hash — src/auth/password.ts:25. Открытым текстом
      // писать нельзя: verifyPassword (:31) не пропустил бы логин.
      password: hashToStorage(password),
      name,
      birthDate: "1990-01-01", // обязательное поле, prisma/schema.prisma:25
    },
  });

  for (const roleName of opts.roles ?? []) {
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: roleName },
    });
    await prisma.userRole.create({
      data: { userId: user.id, roleId: role.id },
    });
  }

  if (opts.withPlayer) {
    await prisma.player.create({ data: { name, userId: user.id } });
  }

  // Логин ПОСЛЕ ролей и профиля — иначе токен их не увидит.
  const { accessToken, playerId } = await login(app, email, password);

  return { userId: user.id, playerId, email, password, token: accessToken };
}

/**
 * Перевыпускает токен после изменения ролей или создания профиля игрока.
 * Пользователя не пересоздаёт — только повторный HTTP-логин теми же учётными
 * данными, чтобы новый payload увидел актуальные роли и playerId.
 */
export async function relogin(app: AppInstance, actor: Actor): Promise<string> {
  const { accessToken } = await login(app, actor.email, actor.password);
  return accessToken;
}
