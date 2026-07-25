// §11.2: end-to-end { code, message } envelope contract through the real app.
// One app per file (like tests/integration/auth.test.ts): beforeAll builds it once,
// integration-setup's beforeEach resets the DB before each test.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppInstance } from "@/app.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";
import { createActor } from "../helpers/actors.js";
import { createTestApp, destroyTestApp } from "../helpers/app.js";

let app: AppInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await destroyTestApp(app);
});

describe("сквозной контракт конверта ошибок", () => {
  // Regression for docs/wiki/slices/auth.md:46: an invalid login body used to 500 via
  // FST_ERR_FAILED_ERROR_SERIALIZATION; the central appErrorHandler now returns 400.
  it("POST /api/auth/login с невалидным телом → 400 и двухключевой конверт с числовым code", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      // email is malformed and password is below minLength: 6 — TypeBox validation fails.
      payload: { email: "not-an-email", password: "123" },
    });

    expect(res.statusCode).toBe(400);

    const body = res.json() as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["code", "message"]);
    expect(body.code).toBe(400);
    expect(typeof body.message).toBe("string");
  });

  // appNotFoundHandler: an unknown route returns the catalogue envelope instead of Fastify's default.
  it("запрос на несуществующий путь → 404 ROUTE_NOT_FOUND", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/this-route-does-not-exist",
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      code: appErrorCodes.ROUTE_NOT_FOUND.code,
      message: appErrorCodes.ROUTE_NOT_FOUND.message,
    });
  });

  // G6 regression for the domain return-as-value path: the preSerialization hook is
  // untouched, so the AUTH_INVALID_CREDENTIALS envelope still ships with status from code.
  it("логин с неверным паролем → AUTH_INVALID_CREDENTIALS без изменений", async () => {
    const actor = await createActor(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: actor.email, password: "WrongPassw0rd!" },
    });

    expect(res.statusCode).toBe(appErrorCodes.AUTH_INVALID_CREDENTIALS.code);
    expect(res.json()).toEqual({
      code: appErrorCodes.AUTH_INVALID_CREDENTIALS.code,
      message: appErrorCodes.AUTH_INVALID_CREDENTIALS.message,
    });
  });
});
