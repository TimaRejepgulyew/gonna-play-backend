// INT-05…INT-08 (§11.2): создание локации админом и не-админом, создание поля с
// валидным и с несуществующим locationId.
//
// Это покрытие пользовательского требования «добавление нового поля и локации»,
// поэтому центральный сценарий — локация, затем поле внутри неё: порядок построения
// графа жёсткий (§9.10), обе операции требуют админского токена.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppInstance } from "@/app.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import { createActor } from "../helpers/actors.js";
import { createTestApp, destroyTestApp } from "../helpers/app.js";

let app: AppInstance;

interface LocationBody {
  id: number;
  name: string;
  city: string;
  address?: string;
  surfaceType?: string;
  capacity?: number;
  fields?: { id: number; name: string; format: string }[];
}

interface FieldBody {
  id: number;
  locationId: number;
  name: string;
  format: string;
  isIndoor: boolean;
}

// Роль администратора — строковый литерал "admin": именно его ждёт
// server.authorize("admin") на POST /api/location/ и POST /api/field/
// (src/location/location.routes.ts:39-46, src/field/field.routes.ts:39-46).
// Роли зашиты в токен на момент выдачи, поэтому createActor логинится последним
// шагом и токен уже несёт "admin" (tests/helpers/actors.ts:103-104).
function adminActor() {
  return createActor(app, { roles: ["admin"] });
}

function postLocation(token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/api/location/",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

function getLocation(id: number) {
  return app.inject({ method: "GET", url: `/api/location/${id}` });
}

function postField(token: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/api/field/",
    headers: { authorization: `Bearer ${token}` },
    payload,
  });
}

/** Создаёт локацию админским токеном и возвращает её id. Падает, если создание не прошло. */
async function createLocationOrThrow(
  token: string,
  payload: Record<string, unknown>,
): Promise<number> {
  const res = await postLocation(token, payload);
  if (![200, 201].includes(res.statusCode)) {
    throw new Error(`Location create failed: ${res.statusCode} ${res.payload}`);
  }
  return (res.json() as LocationBody).id;
}

describe("INT-05…INT-08: локации и поля", () => {
  // Одно приложение на файл (§9.7, §12); база чистится beforeEach из
  // tests/setup/integration-setup.ts, поэтому админ создаётся в каждом тесте заново.
  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await destroyTestApp(app);
  });

  it("INT-05: админ создаёт локацию, GET /:id возвращает те же данные", async () => {
    const admin = await adminActor();

    const payload = {
      name: "Central Arena",
      city: "Ashgabat",
      address: "10 Garassyzlyk",
      surfaceType: "ARTIFICIAL_GRASS",
      capacity: 120,
    };

    const createRes = await postLocation(admin.token, payload);
    expect([200, 201]).toContain(createRes.statusCode);

    const created = createRes.json() as LocationBody;
    expect(created.id).toBeTypeOf("number");
    expect(created.name).toBe(payload.name);

    // Round-trip: чтение отдельным запросом доказывает персистентность, а не только
    // код ответа на запись.
    const readRes = await getLocation(created.id);
    expect(readRes.statusCode).toBe(200);

    const read = readRes.json() as LocationBody;
    expect(read.id).toBe(created.id);
    expect(read.name).toBe(payload.name);
    expect(read.city).toBe(payload.city);
    expect(read.address).toBe(payload.address);
    expect(read.surfaceType).toBe(payload.surfaceType);
    expect(read.capacity).toBe(payload.capacity);
  });

  it("INT-06: актор без роли admin получает 403 AUTH_FORBIDDEN на создании локации", async () => {
    // Актор без ролей: authorize("admin") (src/plugins/auth.ts:71-82) отсекает запрос
    // на декораторе, до сервиса — поэтому ответ именно 403, а не доменная ошибка.
    const plain = await createActor(app);

    const res = await postLocation(plain.token, {
      name: "Forbidden Arena",
      city: "Ashgabat",
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual(appErrorCodes.AUTH_FORBIDDEN);
  });

  it("INT-07: админ создаёт поле в существующей локации, format сохраняется", async () => {
    const admin = await adminActor();

    const locationId = await createLocationOrThrow(admin.token, {
      name: "Arena With Field",
      city: "Ashgabat",
    });

    // MATCH_FORMAT — FIVE/SEVEN/ELEVEN (src/constants/enums.ts:7-11); членов вида
    // FIVE_V_FIVE не существует.
    const fieldPayload = {
      locationId,
      name: "Field A",
      format: "SEVEN",
      surface: "FUTSAL",
      isIndoor: true,
    };

    const createRes = await postField(admin.token, fieldPayload);
    expect([200, 201]).toContain(createRes.statusCode);

    const field = createRes.json() as FieldBody;
    expect(field.id).toBeTypeOf("number");
    expect(field.locationId).toBe(locationId);
    expect(field.name).toBe(fieldPayload.name);
    expect(field.format).toBe(fieldPayload.format);
    expect(field.isIndoor).toBe(true);

    // Поле реально привязано к локации: детальное чтение локации включает fields
    // (src/location/location.repository.ts:55-60), а createField сбрасывает её кеш
    // (src/field/field.service.ts:88-92).
    const readRes = await getLocation(locationId);
    expect(readRes.statusCode).toBe(200);

    const read = readRes.json() as LocationBody;
    expect(read.fields?.map((f) => f.id)).toContain(field.id);
  });

  it("INT-08: поле с несуществующим locationId даёт 404 LOCATION_NOT_FOUND", async () => {
    const admin = await adminActor();

    // locationExists() возвращает false → сервис отдаёт LOCATION_NOT_FOUND
    // (src/field/field.service.ts:85-89), а preSerialization (src/app.ts:33-38)
    // переводит его в HTTP-код 404. Важно, что это не 400 от валидатора: тело
    // схеме соответствует, locationId — целое число.
    const res = await postField(admin.token, {
      locationId: 999_999,
      name: "Orphan Field",
      format: "FIVE",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual(appErrorCodes.LOCATION_NOT_FOUND);
  });

  // §11.5 «Не-ASCII ввод»: кириллица проходит цепочку TypeBox → Prisma → PostgreSQL
  // и читается обратно отдельным запросом. Сравнение через toBe: побайтовое совпадение —
  // единственное, что отличает сохранную кодировку от искажённой.
  it("сохраняет кириллические название и адрес локации без искажения на round-trip", async () => {
    const admin = await adminActor();

    const payload = {
      name: "Стадион «Ёлочка»",
      city: "Ашхабад",
      address: "ул. Гарашсызлык, д. 10, стр. 2",
    };

    const createRes = await postLocation(admin.token, payload);
    expect([200, 201]).toContain(createRes.statusCode);

    const created = createRes.json() as LocationBody;
    expect(created.name).toBe(payload.name);

    const readRes = await getLocation(created.id);
    expect(readRes.statusCode).toBe(200);

    const read = readRes.json() as LocationBody;
    expect(read.id).toBe(created.id);
    expect(read.name).toBe(payload.name);
    expect(read.city).toBe(payload.city);
    expect(read.address).toBe(payload.address);
    expect(read.name.length).toBe(payload.name.length);
  });
});
