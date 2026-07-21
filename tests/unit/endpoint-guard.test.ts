import { afterEach, describe, expect, it } from "vitest";

import { assertTestDatabaseUrl, assertTestRedisEndpoint } from "../helpers/endpoint-guard.js";

// Регрессия на оба гарда из tests/helpers/endpoint-guard.ts. Ни одного
// подключения здесь нет и быть не должно: обе функции читают только
// process.env и переданные аргументы, поэтому проверяются чистой подменой
// окружения. Ловим ровно те дыры, ради которых гарды написаны: URL без
// порта (клиент подставит 5432 — dev-база), нелокальный хост с нетестовым
// именем базы, нелокальный Redis вне контейнерной сети.

const savedDatabaseUrl = process.env.DATABASE_URL;
const savedKeyPrefix = process.env.REDIS_KEY_PREFIX;

// Присваивать undefined нельзя: process.env превратил бы его в строку
// "undefined" и сломал бы интеграционные тесты, читающие те же переменные.
function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("DATABASE_URL", savedDatabaseUrl);
  restore("REDIS_KEY_PREFIX", savedKeyPrefix);
});

describe("assertTestDatabaseUrl", () => {
  // Третья колонка — фрагмент ожидаемого сообщения. Без неё тест зеленел бы от
  // любого исключения, в том числе брошенного не тем правилом, ради которого
  // случай написан: «без порта» обязан падать именно на порту, а не на имени базы.
  it.each([
    ["не задан", undefined, /DATABASE_URL не задан/],
    ["пуст", "", /DATABASE_URL не задан/],
    // Порта нет вовсе — Prisma подставит 5432, то есть dev-базу.
    [
      "без порта на локальном хосте",
      "postgresql://postgres:postgres@localhost/gonna_play_db_test",
      /localhost:5432/,
    ],
    // Локальные чужие стеки: dev на 5432, prod на 5433.
    [
      "на dev-порту",
      "postgresql://postgres:postgres@localhost:5432/gonna_play_db_test",
      /localhost:5432/,
    ],
    [
      "на prod-порту",
      "postgresql://postgres:postgres@127.0.0.1:5433/gonna_play_db_test",
      /127\.0\.0\.1:5433/,
    ],
    // Нелокальный хост порт не проверяет — держит только имя базы.
    [
      "нелокальный хост с нетестовой базой",
      "postgresql://u:p@staging-db.example.com:5432/app",
      /ведёт в базу "app"/,
    ],
    [
      "контейнерный хост с нетестовой базой",
      "postgresql://postgres:postgres@db:5432/gonna_play_db",
      /ведёт в базу "gonna_play_db"/,
    ],
    ["не разбирается как URL", "postgres@@@not-a-url", /не разбирается как URL/],
  ])("бросает: DATABASE_URL %s", (_case, url, expected) => {
    if (url === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = url;

    expect(() => assertTestDatabaseUrl("test")).toThrow(expected);
  });

  it.each([
    // Локальный дефолт из tests/setup/env.ts:12.
    ["локальный тестовый порт", "postgresql://postgres:postgres@localhost:5434/gonna_play_db_test"],
    // Ровно то, что задаёт docker-compose.test.yml сервису backend.
    ["контейнерный db:5432", "postgresql://postgres:postgres@db:5432/gonna_play_db_test"],
  ])("пропускает: %s", (_case, url) => {
    process.env.DATABASE_URL = url;

    expect(() => assertTestDatabaseUrl("test")).not.toThrow();
  });
});

describe("assertTestRedisEndpoint", () => {
  it.each([
    // Локальные чужие инстансы: dev на 6380, посторонний на 6379.
    ["локальный dev-порт", "localhost", "6380", "gptest:", /localhost:6380/],
    ["локальный дефолтный порт", "127.0.0.1", "6379", "gptest:", /127\.0\.0\.1:6379/],
    // Нелокальный хост вне контейнерной сети — FLUSHDB ушёл бы наружу.
    [
      "нелокальный хост",
      "staging-redis.example.com",
      "6379",
      "gptest:",
      /нелокальный хост staging-redis\.example\.com/,
    ],
    // Тестовый порт нелокальному хосту не индульгенция: правило портов к нему
    // неприменимо, ловить обязан именно белый список хостов.
    [
      "нелокальный хост на тестовом порту",
      "staging-redis.example.com",
      "6381",
      "gptest:",
      /нелокальный хост staging-redis\.example\.com/,
    ],
    // Префикс приложения вместо тестового: окружение сконфигурировано не тестом.
    ["дев-префикс ключей", "localhost", "6381", "gp:", /REDIS_KEY_PREFIX="gp:"/],
    ["пустой префикс ключей", "redis", "6379", "", /REDIS_KEY_PREFIX="\(не задан\)"/],
  ])("бросает: %s", (_case, host, port, prefix, expected) => {
    process.env.REDIS_KEY_PREFIX = prefix;

    expect(() => assertTestRedisEndpoint(host, port, "test")).toThrow(expected);
  });

  it.each([
    // Локальный дефолт из tests/setup/env.ts:16.
    ["локальный тестовый порт", "localhost", "6381"],
    // Ровно то, что задаёт docker-compose.test.yml сервису backend.
    ["контейнерный redis:6379", "redis", "6379"],
  ])("пропускает: %s", (_case, host, port) => {
    process.env.REDIS_KEY_PREFIX = "gptest:";

    expect(() => assertTestRedisEndpoint(host, port, "test")).not.toThrow();
  });
});
