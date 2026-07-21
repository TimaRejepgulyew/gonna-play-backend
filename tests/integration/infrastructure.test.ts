// INT-22 и INT-25 (§11.2): живость инфраструктуры и единственность клиента Prisma.
//
// INT-22 стоит ПЕРВЫМ в файле сознательно. Все помощники поверх Redis работают
// fail-open: лимитер пропускает запрос (src/utils/rateLimit.ts:45-47), хранилище
// refresh молчит (src/auth/refreshStore.ts:103-105), кеш отдаёт промах
// (src/utils/cache.ts:70). При лежащем Redis набор остался бы зелёным, ничего на
// самом деле не проверив, поэтому связность доказывается прямым PING до всего
// остального — упасть должен именно этот тест, а не последующие.
import { afterAll, describe, expect, it } from "vitest";

import type { AppInstance } from "@/app.js";
import { closePrisma, getPrisma } from "@/config/prisma.js";
import { closeRedis, getRedis } from "@/config/redis.js";
import { createTestApp, destroyTestApp } from "../helpers/app.js";

describe("инфраструктура тестового набора", () => {
  let app: AppInstance | null = null;

  afterAll(async () => {
    if (app !== null) await destroyTestApp(app);
    await closeRedis();
    await closePrisma();
  });

  it("INT-22: тестовый Redis поднят и отвечает PONG", async () => {
    const redis = getRedis();

    // Адрес ассертится до PING: на этой машине на 6379 слушает посторонний Redis,
    // поэтому тест, обошедший tests/setup/env.ts, молча получил бы PONG не оттуда.
    // Литерал порта здесь не годится: локальный прогон идёт на localhost:6381
    // (tests/setup/env.ts:15), а контейнерный — на redis:6379 (docker-compose.test.yml),
    // поэтому ожидание берётся из самого окружения прогона.
    const configured = process.env.REDIS_URL;
    expect(configured, "REDIS_URL не задан — tests/setup/env.ts не отработал").toBeDefined();

    const expected = new URL(String(configured));
    expect(redis.options.host).toBe(expected.hostname);
    expect(String(redis.options.port)).toBe(expected.port || "6379");

    // Дев-инстанс (6380) не должен попадать в прогон ни при каких условиях:
    // resetDatabase() зовёт flushdb(), который игнорирует keyPrefix (§9.8).
    expect(String(redis.options.port)).not.toBe("6380");

    // enableOfflineQueue: false (src/config/redis.ts:20) — при лежащем Redis
    // команда отклоняется сразу, а не висит до таймаута теста.
    await expect(redis.ping()).resolves.toBe("PONG");
  });

  it("INT-25: приложение держит ровно один клиент Prisma, а close() освобождает слот", async () => {
    const first = await createTestApp();
    app = first;

    // Наличие декоратора проверяется до сравнения объектов сознательно: провалившийся
    // toBe отдаёт PrismaClient в diff, а тот — рекурсивный proxy, на котором сериализатор
    // vitest уходит в «Maximum call stack size exceeded» вместо внятного сообщения.
    expect(first.hasDecorator("prisma")).toBe(true);

    // toBe, а не toEqual: доказывается тождество объектов. toEqual прошёл бы и на
    // двух разных пулах с одинаковой структурой — то есть ровно на том, что тест
    // призван исключить. Декорированный экземпляр и тот, через который ходят
    // репозитории и resetDatabase(), обязаны быть одним объектом.
    expect(first.prisma).toBe(getPrisma());

    // Повторная сборка — единственное сознательное исключение из правила «одно
    // приложение на файл» (§9.7): здесь оно не нарушается, а проверяется.
    // Компиляция развязки синглтонов ничего не доказывает; доказывает то, что
    // второе приложение вообще поднимается — значит closePrisma()/closeRedis()
    // в onClose-хуках плагинов реально освободили слоты, а не оставили в них
    // мёртвые клиенты.
    await destroyTestApp(first);
    app = null;

    const second = await createTestApp();
    app = second;

    expect(second.prisma).toBe(getPrisma());
    expect(second.prisma).not.toBe(first.prisma);

    const response = await second.inject({ method: "GET", url: "/ping" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: "pong" });
  });
});
