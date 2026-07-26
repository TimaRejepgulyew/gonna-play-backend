// INT-09…INT-14 (§11.2): сквозной путь провайдерского входа, привязки способов
// и удаления аккаунта через настоящее приложение, настоящую базу и настоящий Redis.
//
// Сценарий целиком на Telegram — единственном провайдере, чья проверка не ходит
// в сеть: пейлоад подписывается тут же той же формулой, что и в верификаторе
// (src/auth/providers/telegram.ts). Google и Apple в интеграционный прогон не
// берутся сознательно: им нужна либо сеть, либо подмена реестра верификаторов
// внутри собранного приложения.
import { createHash, createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AppInstance } from "@/app.js";
import { getPrisma } from "@/config/prisma.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import { createActor } from "../helpers/actors.js";

const BOT_TOKEN = "test-bot-token";
const SECONDS = 1000;
const DAY_MS = 86_400_000;

let app: AppInstance;
let destroy: (instance: AppInstance) => Promise<void>;

// TELEGRAM_BOT_TOKEN читается один раз, на импорте src/config/env.ts, а тот уже
// загружен через setupFiles к моменту старта этого файла. Поэтому переменная
// ставится до сборки приложения, а граф модулей поднимается заново: иначе
// верификатор Telegram остался бы ненастроенным и все маршруты отдали бы 503.
// Хелперы теста (актёры, resetDatabase) остаются на прежнем графе — они ходят в
// ту же базу и тот же Redis, поэтому расхождения не создают.
beforeAll(async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  vi.resetModules();
  const helpers = await import("../helpers/app.js");
  destroy = helpers.destroyTestApp;
  app = await helpers.createTestApp();
});

afterAll(async () => {
  await destroy(app);
});

type Widget = Record<string, string | number>;

interface AuthSuccessBody {
  user: { id: number; email?: string; name?: string; playerId?: number };
  accessToken: string;
  refreshToken: string;
}

interface IdentityListBody {
  hasPassword: boolean;
  identities: { provider: string; username?: string }[];
}

/**
 * Подпись Login Widget: ключ HMAC — голый SHA256 от токена бота, данные — все
 * поля кроме hash, отсортированные по алфавиту и склеенные через перевод строки.
 */
function sign(payload: Widget): Widget {
  const dataCheckString = Object.keys(payload)
    .sort()
    .map((key) => `${key}=${payload[key]}`)
    .join("\n");
  const secret = createHash("sha256").update(BOT_TOKEN).digest();
  return { ...payload, hash: createHmac("sha256", secret).update(dataCheckString).digest("hex") };
}

function widget(id: number, extra: Widget = {}): Widget {
  return sign({
    id,
    first_name: "Тимур",
    auth_date: Math.floor(Date.now() / SECONDS),
    ...extra,
  });
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const loginTelegram = (payload: Widget) =>
  app.inject({ method: "POST", url: "/api/auth/telegram", payload });

const listIdentities = (token: string) =>
  app.inject({ method: "GET", url: "/api/auth/identities", headers: bearer(token) });

const linkTelegram = (token: string, payload: Widget) =>
  app.inject({
    method: "POST",
    url: "/api/auth/identities/telegram",
    headers: bearer(token),
    payload,
  });

const unlinkTelegram = (token: string) =>
  app.inject({ method: "DELETE", url: "/api/auth/identities/telegram", headers: bearer(token) });

const refresh = (refreshToken: string) =>
  app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken } });

const envelope = (entry: { code: number; message: string }) => ({
  code: entry.code,
  message: entry.message,
});

describe("POST /api/auth/telegram", () => {
  // INT-09
  it("создаёт аккаунт первым входом, узнаёт его вторым и выдаёт рабочий refresh", async () => {
    const prisma = getPrisma();

    const first = await loginTelegram(widget(1001, { username: "tg_user" }));
    expect(first.statusCode).toBe(201);
    const session = first.json() as AuthSuccessBody;

    const identity = await prisma.authIdentity.findFirstOrThrow();
    expect(identity.userId).toBe(session.user.id);
    // Внешний идентификатор хранится строкой ровно в том виде, в каком его
    // собирает верификатор (src/auth/providers/telegram.ts:57-60).
    expect(identity.providerUserId).toBe("1001");

    const second = await loginTelegram(widget(1001, { username: "tg_user" }));
    expect(second.statusCode).toBe(200);
    expect((second.json() as AuthSuccessBody).user.id).toBe(session.user.id);
    // Ключевой критерий §9.7.2: второго пользователя повторный вход не заводит.
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.authIdentity.count()).toBe(1);

    // Доказательство, что провайдерская ветка действительно закончилась на
    // issueTokens: иначе refresh-jti не попал бы в Redis и ротация не прошла бы.
    const rotated = await refresh(session.refreshToken);
    expect(rotated.statusCode).toBe(200);
  });

  // INT-10
  it("показывает единственную привязку без пароля и не даёт её отвязать", async () => {
    const login = await loginTelegram(widget(1002));
    expect(login.statusCode).toBe(201);
    const session = login.json() as AuthSuccessBody;

    const list = await listIdentities(session.accessToken);
    expect(list.statusCode).toBe(200);
    const body = list.json() as IdentityListBody;
    expect(body.hasPassword).toBe(false);
    expect(body.identities).toHaveLength(1);
    expect(body.identities[0]?.provider).toBe("TELEGRAM");

    // Правило 6: восстановления доступа в проекте нет, поэтому отвязка
    // единственного способа входа оставила бы аккаунт без единой двери.
    const unlink = await unlinkTelegram(session.accessToken);
    expect(unlink.statusCode).toBe(409);
    expect(unlink.json()).toEqual(envelope(appErrorCodes.AUTH_LAST_LOGIN_METHOD));
  });
});

describe("привязка способа входа под сессией", () => {
  // INT-11
  it("привязывает telegram парольному актёру и позволяет отвязать обратно", async () => {
    const actor = await createActor(app);

    const link = await linkTelegram(actor.token, widget(2002));
    expect(link.statusCode).toBe(200);
    const linked = link.json() as IdentityListBody;
    expect(linked.hasPassword).toBe(true);
    expect(linked.identities).toHaveLength(1);

    // Пароль остаётся вторым способом входа, поэтому отвязка проходит.
    const unlink = await unlinkTelegram(actor.token);
    expect(unlink.statusCode).toBe(200);
    expect((unlink.json() as IdentityListBody).identities).toHaveLength(0);
  });

  // INT-12
  it("отдаёт 409 на попытку привязать тот же внешний аккаунт второму пользователю", async () => {
    const owner = await createActor(app);
    const stranger = await createActor(app);

    expect((await linkTelegram(owner.token, widget(2003))).statusCode).toBe(200);

    // Правило 1: один способ — один аккаунт. Ветки «это ты, входи» на маршруте
    // привязки нет, занятая пара уходит конвертом 409.
    const taken = await linkTelegram(stranger.token, widget(2003));
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toEqual(envelope(appErrorCodes.AUTH_IDENTITY_ALREADY_LINKED));
  });
});

describe("DELETE /api/auth/me", () => {
  // INT-13
  it("без токена отвечает 401", async () => {
    const res = await app.inject({ method: "DELETE", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(envelope(appErrorCodes.AUTH_TOKEN_INVALID));
  });

  // INT-13
  it("удаляет провайдерский аккаунт, гасит сессии и наружу не ходит", async () => {
    const prisma = getPrisma();
    const login = await loginTelegram(widget(3003));
    expect(login.statusCode).toBe(201);
    const session = login.json() as AuthSuccessBody;

    const res = await app.inject({
      method: "DELETE",
      url: "/api/auth/me",
      headers: bearer(session.accessToken),
    });
    expect(res.statusCode).toBe(200);
    // Привязки Apple нет — отзывать нечего, признак true без единого запроса наружу.
    expect(res.json()).toEqual({
      status: "success",
      message: "Account deleted",
      appleAccessRevoked: true,
    });

    expect(await prisma.user.count()).toBe(0);
    // Каскад по AuthIdentity.userId: строка способа входа уходит вместе с User.
    expect(await prisma.authIdentity.count()).toBe(0);

    // Доказательство, что revokeAllRefresh действительно вызван: прежний
    // refresh-токен был выдан до удаления и до этого места не расходовался.
    const rotated = await refresh(session.refreshToken);
    expect(rotated.statusCode).toBe(401);
    expect(rotated.json()).toEqual(envelope(appErrorCodes.AUTH_TOKEN_INVALID));
  });

  // INT-14 (§11.5): фиксация нынешнего контракта, а не пожелание. Полная очистка
  // игрока и его матчей была бы осознанной сменой поведения (NG13), и тогда этот
  // тест обязан упасть, а не промолчать.
  it("оставляет игрока и его матчи, обнуляя players.user_id", async () => {
    const prisma = getPrisma();
    const actor = await createActor(app, { withPlayer: true });
    const playerId = actor.playerId as number;

    const location = await prisma.location.create({ data: { name: "Арена", city: "Ашхабад" } });
    const field = await prisma.field.create({
      data: { locationId: location.id, name: "Поле 1", format: "FIVE" },
    });
    const match = await prisma.match.create({
      data: {
        organizerId: playerId,
        fieldId: field.id,
        title: "Матч удаляемого организатора",
        startsAt: new Date(Date.now() + DAY_MS),
        format: "FIVE",
        minPlayers: 6,
        maxPlayers: 10,
      },
    });

    const res = await app.inject({
      method: "DELETE",
      url: "/api/auth/me",
      headers: bearer(actor.token),
    });
    expect(res.statusCode).toBe(200);

    expect(await prisma.user.findUnique({ where: { id: actor.userId } })).toBeNull();
    // onDelete: SetNull на Player.userId — строка игрока переживает владельца.
    const survivor = await prisma.player.findUniqueOrThrow({ where: { id: playerId } });
    expect(survivor.userId).toBeNull();
    expect(await prisma.match.findUnique({ where: { id: match.id } })).not.toBeNull();
  });
});

describe("регрессия парольных маршрутов", () => {
  // INT-09…INT-14 не должны стоить прежнего поведения входа и регистрации.
  it("login и register отвечают как раньше", async () => {
    const actor = await createActor(app);

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: actor.email, password: actor.password },
    });
    expect(login.statusCode).toBe(200);
    expect((login.json() as AuthSuccessBody).user.id).toBe(actor.userId);

    const register = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: {
        email: `reg-${randomUUID()}@test.local`,
        password: "Passw0rd!",
        name: "Новичок",
        birthDate: "1995-05-05",
      },
    });
    expect(register.statusCode).toBe(201);
    expect(typeof (register.json() as AuthSuccessBody).accessToken).toBe("string");
  });
});
