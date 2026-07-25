// INT-04 (§11.2): создание профиля игрока по HTTP, токен-ловушка с устаревшими
// claims и работающая TypeBox-валидация тела.
//
// Про валидацию: ранняя редакция документа задачи утверждала, что схема передана в
// игнорируемой Fastify форме и 400 не возникает. Посылка опровергнута прямым чтением
// кода — src/player/player.routes.ts:38 объявляет `schema: { body: createPlayerSchema }`,
// то есть валидация работает, и тест ассертит 400 по факту (NG2).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppInstance } from "@/app.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import { isErrorShape } from "@/utils/cache.js";
import { createActor, relogin } from "../helpers/actors.js";
import { createTestApp, destroyTestApp } from "../helpers/app.js";

let app: AppInstance;

/**
 * Тело матча, валидное по createMatchSchema (src/match/match.model.ts:61-75).
 * Валидность важна: невалидное тело дало бы 400 от TypeBox раньше, чем сервис успел
 * бы дойти до проверки playerId, и тест про токен-ловушку ничего бы не доказал.
 * fieldId заведомо несуществующий — проверка профиля в createMatch (src/match/
 * match.service.ts:269-271) стоит ДО поиска поля (:272-275), поэтому до relogin
 * ответ определяется профилем, а после — уже доменной ошибкой поля.
 */
const MATCH_BODY = {
  fieldId: 999_999,
  title: "Token trap match",
  startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  format: "FIVE",
  minPlayers: 6,
  maxPlayers: 10,
};

function postMatch(token: string) {
  return app.inject({
    method: "POST",
    url: "/api/match/",
    headers: { authorization: `Bearer ${token}` },
    payload: MATCH_BODY,
  });
}

describe("INT-04: POST /api/player/", () => {
  // Одно приложение на файл (§9.7, §12): база чистится beforeEach из
  // tests/setup/integration-setup.ts, приложение переживает все тесты файла.
  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await destroyTestApp(app);
  });

  it("создаёт профиль игрока и привязывает его к вызывающему пользователю", async () => {
    const actor = await createActor(app);
    expect(actor.playerId).toBeUndefined();

    const res = await app.inject({
      method: "POST",
      url: "/api/player/",
      headers: { authorization: `Bearer ${actor.token}` },
      payload: { name: "Created Player" },
    });

    expect([200, 201]).toContain(res.statusCode);

    const body = res.json() as { id: number; name: string; userId: number };
    expect(body.id).toBeTypeOf("number");
    expect(body.name).toBe("Created Player");
    // userId проставляет контроллер из payload токена (src/player/player.controller.ts:52-54),
    // а не тело запроса — профиль обязан принадлежать вызывающему.
    expect(body.userId).toBe(actor.userId);
  });

  it("оставляет старый токен без playerId, пока не выпущен новый через relogin()", async () => {
    const actor = await createActor(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/player/",
      headers: { authorization: `Bearer ${actor.token}` },
      payload: { name: "Trap Player" },
    });
    expect([200, 201]).toContain(createRes.statusCode);

    // Раунд 1: профиль в БД уже есть, но выданный ранее токен всё ещё несёт
    // playerId: undefined — claims фиксируются в момент подписи (src/auth/auth.service.ts:173-183).
    const beforeRelogin = await postMatch(actor.token);
    expect(beforeRelogin.statusCode).toBe(403);
    expect(beforeRelogin.json()).toEqual(appErrorCodes.PLAYER_PROFILE_REQUIRED);

    // Раунд 2: перевыпуск токена тем же пользователем — новый payload видит профиль.
    const freshToken = await relogin(app, actor);
    const afterRelogin = await postMatch(freshToken);

    // Критерий — именно отсутствие профильного отказа. Дальше запрос упирается в
    // несуществующее поле, и это ожидаемо: гейт профиля пройден.
    expect(afterRelogin.statusCode).not.toBe(403);
    expect(afterRelogin.json()).not.toEqual(appErrorCodes.PLAYER_PROFILE_REQUIRED);
    expect(afterRelogin.json()).toEqual(appErrorCodes.FIELD_NOT_FOUND);
  });

  it("отвечает 400 от валидатора на тело без обязательного name", async () => {
    const actor = await createActor(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/player/",
      headers: { authorization: `Bearer ${actor.token}` },
      payload: { level: "AMATEUR" },
    });

    expect(res.statusCode).toBe(400);

    // appErrorHandler normalises the TypeBox/ajv validation error to a single
    // { code, message } envelope: numeric code === HTTP status, validator message passed through.
    const body = res.json() as {
      code: number;
      message: string;
    };
    expect(Object.keys(body).sort()).toEqual(["code", "message"]);
    expect(isErrorShape(body)).toBe(true);
    expect(body.code).toBe(400);
    expect(body.message).toContain("name");
  });

  // §11.5 «Не-ASCII ввод»: кириллица проходит цепочку TypeBox → Prisma → PostgreSQL
  // и читается обратно отдельным запросом. Сравнение через toBe, а не toContain:
  // побайтовое совпадение — единственное, что отличает сохранную кодировку от
  // искажённой (двойное декодирование дало бы строку, всё ещё «похожую» на исходную).
  it("сохраняет кириллическое имя игрока без искажения на round-trip", async () => {
    const actor = await createActor(app);
    const cyrillicName = "Игрок Ёжик Щукин";

    const createRes = await app.inject({
      method: "POST",
      url: "/api/player/",
      headers: { authorization: `Bearer ${actor.token}` },
      payload: { name: cyrillicName },
    });
    expect([200, 201]).toContain(createRes.statusCode);

    const created = createRes.json() as { id: number; name: string };
    expect(created.name).toBe(cyrillicName);

    const readRes = await app.inject({
      method: "GET",
      url: `/api/player/${created.id}`,
      headers: { authorization: `Bearer ${actor.token}` },
    });
    expect(readRes.statusCode).toBe(200);

    const read = readRes.json() as { id: number; name: string };
    expect(read.id).toBe(created.id);
    expect(read.name).toBe(cyrillicName);
    expect(read.name.length).toBe(cyrillicName.length);
  });
});
