// Builds the smoke-run collection from the OpenAPI-generated one (решение Р6:
// nothing here is hand-maintained — regenerate with `npm run postman:generate`).
//
// The generated collection documents endpoints in isolation; this script
// rewires the same requests into one runnable scenario: four sessions (admin,
// a freshly registered organizer, seeded player1, a freshly registered second
// player), the full waitlist match lifecycle (create draft → publish →
// join/waitlist → leave-promotion → confirm → check-in → in_progress →
// finished → rate) and a cleanup tail, chaining created ids through collection
// variables. Every request asserts a 2xx so `npm run postman:test` (newman)
// exercises all endpoints; the waitlist and promotion steps add explicit body
// assertions.
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "postman/collections/gonna-play.postman_collection.json";
const OUT = "postman/collections/gonna-play.smoke.postman_collection.json";

const source = JSON.parse(readFileSync(SRC, "utf8"));

// ---- index generated requests by "METHOD /path/{var}" -----------------------
const index = new Map();
(function walk(items) {
  for (const it of items) {
    if (it.item) {
      walk(it.item);
      continue;
    }
    const path = (it.request.url.path ?? [])
      .map((s) => (s.startsWith(":") ? `{${s.slice(1)}}` : s))
      .join("/");
    index.set(`${it.request.method} /${path}`, it);
  }
})(source.item);

const bearer = (varName) => ({
  type: "bearer",
  bearer: [{ key: "token", value: `{{${varName}}}`, type: "string" }],
});

// asserts: [[testName, bodyCheckCode]] — extra pm.test blocks over `d` (the
// parsed response body), used to prove waitlist status and queue promotion.
const testScript = (name, captures = [], asserts = []) => ({
  listen: "test",
  script: {
    type: "text/javascript",
    exec: [
      `pm.test(${JSON.stringify(name + " → 2xx")}, function () {`,
      `  pm.expect(pm.response.code).to.be.within(200, 299);`,
      `});`,
      ...(captures.length || asserts.length
        ? ["var d = pm.response.json();"]
        : []),
      ...captures.map(([v, expr]) => `pm.collectionVariables.set(${JSON.stringify(v)}, ${expr});`),
      ...asserts.flatMap(([n, code]) => [
        `pm.test(${JSON.stringify(n)}, function () {`,
        `  ${code}`,
        `});`,
      ]),
    ],
  },
});

const preScript = (lines) => ({
  listen: "prerequest",
  script: { type: "text/javascript", exec: lines },
});

// step: { key, name, auth: varName|null, code, body?, vars?, captures?, asserts?, pre? }
function makeItem(step) {
  const proto = index.get(step.key);
  if (!proto) throw new Error(`endpoint not found in collection: ${step.key}`);
  const item = JSON.parse(JSON.stringify(proto));

  item.name = step.name;
  item.request.auth = step.auth ? bearer(step.auth) : { type: "noauth" };

  // Optional filters/pagination only — drop the placeholder query values the
  // converter puts in, they do not pass TypeBox validation.
  item.request.url.query = [];
  item.request.url.host = ["{{baseUrl}}"];
  item.request.url.raw = "{{baseUrl}}/" + item.request.url.path.join("/");

  for (const v of item.request.url.variable ?? []) {
    if (step.vars && step.vars[v.key] !== undefined) v.value = step.vars[v.key];
  }

  if (step.body !== undefined) {
    item.request.body = {
      mode: "raw",
      raw: step.body,
      options: { raw: { language: "json" } },
    };
    item.request.header = [{ key: "Content-Type", value: "application/json" }];
  } else {
    delete item.request.body;
    item.request.header = [];
  }

  item.event = [];
  if (step.pre) item.event.push(preScript(step.pre));
  item.event.push(testScript(step.name, step.captures ?? [], step.asserts ?? []));
  item.response = [];
  return item;
}

const folders = [
  {
    name: "1 · Авторизация",
    steps: [
      {
        key: "POST /api/auth/register",
        name: "Регистрация организатора (с профилем игрока)",
        auth: null,
        code: 201,
        pre: [`pm.collectionVariables.set("runId", String(Date.now()));`],
        body: `{\n  "email": "smoke+{{runId}}@gonnaplay.com",\n  "password": "Smoke123!",\n  "name": "Smoke Organizer",\n  "birthDate": "1994-04-04",\n  "createPlayer": true,\n  "level": "MIDDLE",\n  "position": "MIDFIELDER"\n}`,
        captures: [
          ["orgToken", "d.accessToken"],
          ["orgRefresh", "d.refreshToken"],
          ["orgUserId", "d.user.id"],
          ["orgPlayerId", "d.user.playerId"],
        ],
      },
      {
        key: "POST /api/auth/register",
        name: "Регистрация второго игрока (лист ожидания)",
        auth: null,
        code: 201,
        body: `{\n  "email": "smoke-p2+{{runId}}@gonnaplay.com",\n  "password": "Smoke123!",\n  "name": "Smoke Player Two",\n  "birthDate": "1996-06-06",\n  "createPlayer": true,\n  "level": "MIDDLE",\n  "position": "FORWARD"\n}`,
        captures: [
          ["p2Token", "d.accessToken"],
          ["p2UserId", "d.user.id"],
          ["p2PlayerId", "d.user.playerId"],
        ],
      },
      {
        key: "POST /api/auth/login",
        name: "Вход администратора",
        auth: null,
        body: `{ "email": "{{adminEmail}}", "password": "{{adminPassword}}" }`,
        captures: [
          ["adminToken", "d.accessToken"],
          ["adminRefresh", "d.refreshToken"],
          ["adminUserId", "d.user.id"],
        ],
      },
      {
        key: "POST /api/auth/login",
        name: "Вход игрока player1 (из сида)",
        auth: null,
        body: `{ "email": "{{p1Email}}", "password": "{{p1Password}}" }`,
        captures: [
          ["p1Token", "d.accessToken"],
          ["p1UserId", "d.user.id"],
          ["p1PlayerId", "d.user.playerId"],
        ],
      },
      { key: "GET /api/auth/me", name: "Профиль текущего пользователя", auth: "adminToken" },
      {
        key: "POST /api/auth/refresh",
        name: "Ротация refresh-токена",
        auth: null,
        body: `{ "refreshToken": "{{adminRefresh}}" }`,
        captures: [
          ["adminToken", "d.accessToken"],
          ["adminRefresh", "d.refreshToken"],
        ],
      },
    ],
  },
  {
    name: "2 · Роли (админ)",
    steps: [
      { key: "GET /api/role/list", name: "Список ролей", auth: "adminToken" },
      {
        key: "POST /api/role/",
        name: "Создание роли",
        auth: "adminToken",
        code: 201,
        body: `{ "name": "smoke_role_{{runId}}" }`,
        captures: [["roleId", "d.id"]],
      },
      {
        key: "POST /api/role/assign",
        name: "Назначение роли организатору",
        auth: "adminToken",
        body: `{ "userId": {{orgUserId}}, "roleId": {{roleId}} }`,
      },
      {
        key: "POST /api/role/revoke",
        name: "Снятие роли с организатора",
        auth: "adminToken",
        body: `{ "userId": {{orgUserId}}, "roleId": {{roleId}} }`,
      },
    ],
  },
  {
    name: "3 · Пользователи",
    steps: [
      { key: "GET /api/user/list", name: "Список пользователей (админ)", auth: "adminToken" },
      { key: "GET /api/user/{id}", name: "Пользователь по id", auth: "adminToken", vars: { id: "{{orgUserId}}" } },
      {
        key: "PUT /api/user/{id}",
        name: "Организатор правит свой профиль",
        auth: "orgToken",
        vars: { id: "{{orgUserId}}" },
        body: `{ "city": "Ashgabat" }`,
      },
    ],
  },
  {
    name: "4 · Игроки",
    steps: [
      {
        key: "POST /api/player/",
        name: "Профиль игрока для администратора",
        auth: "adminToken",
        code: 201,
        body: `{ "name": "Smoke Admin Player", "userId": {{adminUserId}}, "level": "JUNIOR", "position": "GOALKEEPER" }`,
        captures: [["adminPlayerId", "d.id"]],
      },
      { key: "GET /api/player/list", name: "Список игроков", auth: "adminToken" },
      { key: "GET /api/player/{id}", name: "Игрок по id", auth: "adminToken", vars: { id: "{{p1PlayerId}}" } },
      {
        key: "PUT /api/player/{id}",
        name: "Организатор правит своего игрока",
        auth: "orgToken",
        vars: { id: "{{orgPlayerId}}" },
        body: `{ "id": {{orgPlayerId}}, "name": "Smoke Organizer", "level": "SENIOR" }`,
      },
    ],
  },
  {
    name: "5 · Локации (админ)",
    steps: [
      {
        key: "POST /api/location/",
        name: "Создание локации",
        auth: "adminToken",
        code: 201,
        body: `{ "name": "Smoke Arena {{runId}}", "address": "Main St 1", "city": "Ashgabat", "country": "TM" }`,
        captures: [["locationId", "d.id"]],
      },
      {
        key: "POST /api/location/",
        name: "Создание локации (для проверки удаления)",
        auth: "adminToken",
        code: 201,
        body: `{ "name": "Smoke Arena tmp {{runId}}", "address": "Main St 2", "city": "Ashgabat", "country": "TM" }`,
        captures: [["locationId2", "d.id"]],
      },
      { key: "GET /api/location/list", name: "Список локаций (публичный)", auth: null },
      { key: "GET /api/location/{id}", name: "Локация по id (публичный)", auth: null, vars: { id: "{{locationId}}" } },
      {
        key: "PUT /api/location/{id}",
        name: "Обновление локации",
        auth: "adminToken",
        vars: { id: "{{locationId}}" },
        body: `{ "name": "Smoke Arena updated" }`,
      },
    ],
  },
  {
    name: "6 · Поля (админ)",
    steps: [
      {
        key: "POST /api/field/",
        name: "Создание поля",
        auth: "adminToken",
        code: 201,
        body: `{ "name": "Smoke Field", "locationId": {{locationId}}, "format": "SEVEN" }`,
        captures: [["fieldId", "d.id"]],
      },
      {
        key: "POST /api/field/",
        name: "Создание поля (для проверки удаления)",
        auth: "adminToken",
        code: 201,
        body: `{ "name": "Smoke Field tmp", "locationId": {{locationId2}}, "format": "FIVE" }`,
        captures: [["fieldId2", "d.id"]],
      },
      { key: "GET /api/field/list", name: "Список полей (публичный)", auth: null },
      { key: "GET /api/field/{id}", name: "Поле по id (публичный)", auth: null, vars: { id: "{{fieldId}}" } },
      {
        key: "PUT /api/field/{id}",
        name: "Обновление поля",
        auth: "adminToken",
        vars: { id: "{{fieldId}}" },
        body: `{ "name": "Smoke Field updated" }`,
      },
    ],
  },
  {
    name: "7 · Матч: жизненный цикл листа ожидания",
    steps: [
      {
        key: "POST /api/match/",
        name: "Организатор создаёт черновик матча (minPlayers=2, maxPlayers=2)",
        auth: "orgToken",
        code: 201,
        pre: [`pm.collectionVariables.set("futureDate", new Date(Date.now() + 7 * 864e5).toISOString());`],
        body: `{ "fieldId": {{fieldId}}, "title": "Smoke Match {{runId}}", "startsAt": "{{futureDate}}", "format": "SEVEN", "minPlayers": 2, "maxPlayers": 2, "price": 50, "durationMin": 90 }`,
        captures: [["matchId", "d.id"]],
        asserts: [["создан в статусе DRAFT", `pm.expect(d.status).to.equal("DRAFT");`]],
      },
      {
        key: "POST /api/match/{id}/publish",
        name: "Публикация матча (DRAFT → OPEN)",
        auth: "orgToken",
        vars: { id: "{{matchId}}" },
        asserts: [["матч открыт (OPEN)", `pm.expect(d.status).to.equal("OPEN");`]],
      },
      { key: "GET /api/match/list", name: "Список матчей", auth: "orgToken" },
      { key: "GET /api/match/{id}", name: "Карточка матча", auth: "orgToken", vars: { id: "{{matchId}}" } },
      {
        key: "POST /api/match/{id}/join",
        name: "Организатор записывается (REGISTERED)",
        auth: "orgToken",
        vars: { id: "{{matchId}}" },
        body: `{ "position": "MIDFIELDER" }`,
        asserts: [["организатор в составе (REGISTERED)", `pm.expect(d.status).to.equal("REGISTERED");`]],
      },
      {
        key: "POST /api/match/{id}/join",
        name: "Игрок 1 записывается — матч заполняется (REGISTERED, FULL)",
        auth: "p1Token",
        vars: { id: "{{matchId}}" },
        body: `{ "position": "FORWARD" }`,
        asserts: [["игрок 1 в составе (REGISTERED)", `pm.expect(d.status).to.equal("REGISTERED");`]],
      },
      {
        key: "POST /api/match/{id}/join",
        name: "Игрок 2 записывается на заполненный матч — очередь (WAITLISTED)",
        auth: "p2Token",
        vars: { id: "{{matchId}}" },
        body: `{ "position": "GOALKEEPER" }`,
        asserts: [["игрок 2 в очереди (WAITLISTED)", `pm.expect(d.status).to.equal("WAITLISTED");`]],
      },
      {
        key: "DELETE /api/match/{id}/leave",
        name: "Игрок 1 выходит — освобождается место",
        auth: "p1Token",
        vars: { id: "{{matchId}}" },
      },
      {
        key: "GET /api/match/{id}/participants",
        name: "Проверка продвижения очереди после выхода",
        auth: "orgToken",
        vars: { id: "{{matchId}}" },
        asserts: [
          [
            "игрок 2 продвинут из очереди в состав (REGISTERED)",
            `var p2 = d.find(function (x) { return String(x.playerId) === String(pm.collectionVariables.get("p2PlayerId")); }); pm.expect(p2, "участник p2 присутствует").to.exist; pm.expect(p2.status).to.equal("REGISTERED");`,
          ],
        ],
      },
      {
        key: "POST /api/match/{id}/confirm",
        name: "Подтверждение состава (OPEN|FULL → CONFIRMED)",
        auth: "orgToken",
        vars: { id: "{{matchId}}" },
        asserts: [["матч подтверждён (CONFIRMED)", `pm.expect(d.status).to.equal("CONFIRMED");`]],
      },
      {
        key: "POST /api/match/{id}/check-in",
        name: "Игрок 2 отмечается о приходе (CHECKED_IN)",
        auth: "p2Token",
        vars: { id: "{{matchId}}" },
        asserts: [["игрок 2 отмечен (CHECKED_IN)", `pm.expect(d.status).to.equal("CHECKED_IN");`]],
      },
      {
        key: "PATCH /api/match/{id}",
        name: "Старт матча (CONFIRMED → IN_PROGRESS)",
        auth: "orgToken",
        vars: { id: "{{matchId}}" },
        body: `{ "status": "IN_PROGRESS" }`,
        asserts: [["матч идёт (IN_PROGRESS)", `pm.expect(d.status).to.equal("IN_PROGRESS");`]],
      },
      {
        key: "PATCH /api/match/{id}",
        name: "Завершение матча (IN_PROGRESS → FINISHED)",
        auth: "orgToken",
        vars: { id: "{{matchId}}" },
        body: `{ "status": "FINISHED" }`,
        asserts: [["матч завершён (FINISHED)", `pm.expect(d.status).to.equal("FINISHED");`]],
      },
    ],
  },
  {
    name: "8 · Рейтинг",
    steps: [
      {
        key: "POST /api/rating/",
        name: "Организатор оценивает игрока 2",
        auth: "orgToken",
        code: 201,
        body: `{ "matchId": {{matchId}}, "ratedId": {{p2PlayerId}}, "score": 5, "comment": "Отличная игра" }`,
        captures: [["ratingId", "d.id"]],
      },
      { key: "GET /api/rating/player/{playerId}", name: "Рейтинг игрока (публичный)", auth: null, vars: { playerId: "{{p2PlayerId}}" } },
      { key: "GET /api/rating/match/{matchId}", name: "Оценки матча", auth: "orgToken", vars: { matchId: "{{matchId}}" } },
    ],
  },
  {
    name: "9 · Отмена и очистка",
    steps: [
      {
        key: "POST /api/match/",
        name: "Второй матч (для проверки отмены)",
        auth: "orgToken",
        code: 201,
        body: `{ "fieldId": {{fieldId}}, "title": "Smoke Match cancel {{runId}}", "startsAt": "{{futureDate}}", "format": "SEVEN", "minPlayers": 2, "maxPlayers": 4, "price": 0, "durationMin": 60 }`,
        captures: [["matchId2", "d.id"]],
      },
      {
        key: "POST /api/match/{id}/publish",
        name: "Публикация второго матча",
        auth: "orgToken",
        vars: { id: "{{matchId2}}" },
      },
      {
        key: "POST /api/match/{id}/cancel",
        name: "Отмена второго матча (→ CANCELLED)",
        auth: "orgToken",
        vars: { id: "{{matchId2}}" },
        asserts: [["матч отменён (CANCELLED)", `pm.expect(d.status).to.equal("CANCELLED");`]],
      },
      { key: "DELETE /api/rating/{id}", name: "Автор удаляет оценку", auth: "orgToken", vars: { id: "{{ratingId}}" } },
      { key: "DELETE /api/field/{id}", name: "Удаление временного поля", auth: "adminToken", vars: { id: "{{fieldId2}}" } },
      { key: "DELETE /api/location/{id}", name: "Удаление временной локации", auth: "adminToken", vars: { id: "{{locationId2}}" } },
      { key: "DELETE /api/player/{id}", name: "Удаление игрока администратора", auth: "adminToken", vars: { id: "{{adminPlayerId}}" } },
      { key: "DELETE /api/user/{id}", name: "Удаление организатора", auth: "adminToken", vars: { id: "{{orgUserId}}" } },
      { key: "DELETE /api/user/{id}", name: "Удаление второго игрока", auth: "adminToken", vars: { id: "{{p2UserId}}" } },
      { key: "DELETE /api/role/{id}", name: "Удаление роли", auth: "adminToken", vars: { id: "{{roleId}}" } },
      { key: "POST /api/auth/logout", name: "Выход администратора", auth: "adminToken" },
    ],
  },
];

const collection = {
  info: {
    name: "Gonna Play API — smoke run",
    description:
      "Сценарный прогон всех эндпоинтов, собранный скриптом scripts/postman-smoke.mjs из коллекции, сгенерированной из OpenAPI. Не редактировать руками: npm run postman:generate пересобирает и его. Требует dev-базу с сидом (admin@gonnaplay.com, player1@gonnaplay.com).",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "baseUrl", value: "http://localhost:3000" },
    { key: "adminEmail", value: "admin@gonnaplay.com" },
    { key: "adminPassword", value: "Admin123!" },
    { key: "p1Email", value: "player1@gonnaplay.com" },
    { key: "p1Password", value: "Player123!" },
  ],
  item: folders.map((f) => ({ name: f.name, item: f.steps.map(makeItem) })),
};

writeFileSync(OUT, JSON.stringify(collection, null, 2));
const total = folders.reduce((n, f) => n + f.steps.length, 0);
console.log(`smoke collection written: ${OUT} (${total} requests)`);
