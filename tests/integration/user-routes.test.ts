// §11.2: маршруты PUT/DELETE /api/user/:id, у которых до этой задачи не было ни
// одного теста, плюс обходной вход к привилегированным флагам через
// PUT /api/player/:id (вложенный body.user уходит в тот же userRepository.updateUser).
//
// Одно приложение на файл (§9.7): beforeEach из integration-setup чистит базу.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppInstance } from "@/app.js";
import { getPrisma } from "@/config/prisma.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import { USER_PASSWORD_UPDATE_UNSUPPORTED } from "@/user/user.model.js";
import { createActor } from "../helpers/actors.js";
import { createTestApp, destroyTestApp } from "../helpers/app.js";

let app: AppInstance;

function putUser(id: number, token: string, payload: object) {
  return app.inject({
    method: "PUT",
    url: `/api/user/${id}`,
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function deleteUser(id: number, token: string) {
  return app.inject({
    method: "DELETE",
    url: `/api/user/${id}`,
    headers: { authorization: `Bearer ${token}` },
  });
}

function readUser(id: number) {
  return getPrisma().user.findUnique({ where: { id } });
}

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await destroyTestApp(app);
});

describe("PUT /api/user/:id", () => {
  it("пишет обычные поля анкеты владельца", async () => {
    const actor = await createActor(app);

    const res = await putUser(actor.userId, actor.token, {
      city: "Ashgabat",
      birthDate: "1991-02-03",
    });

    expect(res.statusCode).toBe(200);

    // Проверка по базе, а не только по телу ответа: тело могло бы вернуть
    // присланное значение, ничего не записав.
    const stored = await readUser(actor.userId);
    expect(stored?.city).toBe("Ashgabat");
    expect(stored?.birthDate).toBe("1991-02-03");
  });

  // §9.4.11: запрос с паролем отклоняется целиком, а не чистится молча. Отказ
  // даёт полевой гейт на preValidation: умолчание Fastify (removeAdditional)
  // вырезало бы лишний ключ раньше, чем additionalProperties: false откажет.
  it("отклоняет 400 попытку сменить пароль этим маршрутом", async () => {
    const actor = await createActor(app);
    const before = await readUser(actor.userId);

    const res = await putUser(actor.userId, actor.token, { password: "N3wPassw0rd!" });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(USER_PASSWORD_UPDATE_UNSUPPORTED);

    const after = await readUser(actor.userId);
    expect(after?.password).toBe(before?.password);

    // Прежний пароль продолжает пускать в систему — новый не установлен.
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: actor.email, password: "N3wPassw0rd!" },
    });
    expect(login.statusCode).toBe(401);
  });

  it("отклоняет запрос целиком: обычные поля рядом с паролем не применены", async () => {
    const actor = await createActor(app);

    const res = await putUser(actor.userId, actor.token, {
      city: "Mary",
      password: "N3wPassw0rd!",
    });

    expect(res.statusCode).toBe(400);

    const stored = await readUser(actor.userId);
    expect(stored?.city).not.toBe("Mary");
  });

  it("отклоняет 403 попытку владельца проставить себе isEmailVerified", async () => {
    const actor = await createActor(app);

    const res = await putUser(actor.userId, actor.token, { isEmailVerified: true });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(appErrorCodes.AUTH_FORBIDDEN);

    // Ключевая ассерта: запрос отклонён целиком, флаг в базе не изменился.
    const stored = await readUser(actor.userId);
    expect(stored?.isEmailVerified).toBe(false);
  });

  it("пропускает тот же запрос от админа и меняет флаг", async () => {
    const owner = await createActor(app);
    const admin = await createActor(app, { roles: ["admin"] });

    const res = await putUser(owner.userId, admin.token, { isEmailVerified: true });

    expect(res.statusCode).toBe(200);

    const stored = await readUser(owner.userId);
    expect(stored?.isEmailVerified).toBe(true);
  });

  // §11.5: additionalProperties: false пустое тело не запрещает — маршрут обязан
  // ответить 200 и ничего не тронуть.
  it("отвечает 200 на пустое тело и ничего не меняет", async () => {
    const actor = await createActor(app);
    const before = await readUser(actor.userId);

    const res = await putUser(actor.userId, actor.token, {});

    expect(res.statusCode).toBe(200);

    const after = await readUser(actor.userId);
    expect(after?.email).toBe(before?.email);
    expect(after?.name).toBe(before?.name);
    expect(after?.city).toBe(before?.city);
    expect(after?.birthDate).toBe(before?.birthDate);
    expect(after?.isEmailVerified).toBe(before?.isEmailVerified);
    expect(after?.isActive).toBe(before?.isActive);
  });
});

describe("PUT /api/player/:id", () => {
  // Обходной вход к тем же флагам: без гейта в updatePlayer владелец проставил бы
  // себе isEmailVerified вложенным объектом user, минуя маршрут /api/user.
  it("отклоняет 403 вложенный user.isEmailVerified от владельца профиля", async () => {
    const actor = await createActor(app, { withPlayer: true });
    expect(actor.playerId).toBeTypeOf("number");

    const res = await app.inject({
      method: "PUT",
      url: `/api/player/${actor.playerId}`,
      headers: { authorization: `Bearer ${actor.token}` },
      payload: { name: "Renamed", user: { isEmailVerified: true } },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(appErrorCodes.AUTH_FORBIDDEN);

    const stored = await readUser(actor.userId);
    expect(stored?.isEmailVerified).toBe(false);
    // Отклоняется весь запрос: обычные поля тоже не применены.
    const player = await getPrisma().player.findUnique({ where: { id: actor.playerId } });
    expect(player?.name).not.toBe("Renamed");
  });

  // Тот же обходной вход для пароля: вложенный user.password уходил бы в
  // userRepository.updateUser и терялся молча под успешный ответ.
  it("отклоняет 400 вложенный user.password", async () => {
    const actor = await createActor(app, { withPlayer: true });
    const before = await readUser(actor.userId);

    const res = await app.inject({
      method: "PUT",
      url: `/api/player/${actor.playerId}`,
      headers: { authorization: `Bearer ${actor.token}` },
      payload: { name: "Renamed", user: { password: "N3wPassw0rd!" } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual(USER_PASSWORD_UPDATE_UNSUPPORTED);

    const after = await readUser(actor.userId);
    expect(after?.password).toBe(before?.password);

    const player = await getPrisma().player.findUnique({ where: { id: actor.playerId } });
    expect(player?.name).not.toBe("Renamed");
  });
});

describe("DELETE /api/user/:id", () => {
  it("отвечает 403 не-админу", async () => {
    const actor = await createActor(app);

    const res = await deleteUser(actor.userId, actor.token);

    expect(res.statusCode).toBe(403);
    expect(await readUser(actor.userId)).not.toBeNull();
  });

  // Раньше несуществующий id давал 500: удаление шло в Prisma без проверки.
  it("отвечает 404 админу на несуществующем id", async () => {
    const admin = await createActor(app, { roles: ["admin"] });

    const res = await deleteUser(999_999, admin.token);

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(appErrorCodes.USER_NOT_FOUND);
  });

  it("удаляет пользователя по запросу админа", async () => {
    const owner = await createActor(app);
    const admin = await createActor(app, { roles: ["admin"] });

    const res = await deleteUser(owner.userId, admin.token);

    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; appleAccessRevoked: boolean };
    expect(body.status).toBe("success");
    // Привязки Apple нет — отзывать нечего, наружу не ходили.
    expect(body.appleAccessRevoked).toBe(true);

    expect(await readUser(owner.userId)).toBeNull();
  });

  // §11.5: клиент повторил запрос — второй ответ обязан быть 404, а не 500 и не
  // повторное «успешно удалено».
  it("отвечает 404 на второе удаление тем же токеном", async () => {
    const owner = await createActor(app);
    const admin = await createActor(app, { roles: ["admin"] });

    const first = await deleteUser(owner.userId, admin.token);
    expect(first.statusCode).toBe(200);

    const second = await deleteUser(owner.userId, admin.token);
    expect(second.statusCode).toBe(404);
    expect(second.json()).toEqual(appErrorCodes.USER_NOT_FOUND);
  });
});
