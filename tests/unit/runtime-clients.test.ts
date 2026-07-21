// UNIT-15 (§11.1): контракт клиентов после развязки синглтонов (§9.3.2).
// Этот файл проверяет шов, на котором держится подмена клиентов во всех
// остальных юнит-тестах: слот занимается через setRedis(), ленивое создание не
// срабатывает, закрытие освобождает слот. Ни один кейс не открывает реальный
// TCP- или DB-сокет.
//
// Везде toBe, а не toEqual: проверяется тождество ссылок. Структурное равенство
// здесь ничего не доказало бы — два разных клиента структурно одинаковы.

import type { Redis } from "ioredis";
import { describe, expect, it } from "vitest";

import { closePrisma, getPrisma } from "@/config/prisma.js";
import { closeRedis, getRedis, setRedis } from "@/config/redis.js";

// Минимальная заглушка: слоту достаточно объекта с quit(), потому что afterEach
// unit-setup.ts зовёт closeRedis(), а тот зовёт quit() на том, что лежит в слоте.
function makeStub(tag: string): Redis {
  return {
    tag,
    quit: async () => "OK",
  } as unknown as Redis;
}

describe("runtime clients: redis slot", () => {
  it("после setRedis(stub) getRedis() отдаёт тождественно ту же заглушку", () => {
    const stubA = makeStub("A");
    setRedis(stubA);

    // Тождество и есть доказательство, что ленивое создание не сработало:
    // будь слот пуст, getRedis() создал бы настоящий ioredis-клиент и открыл
    // сокет. Проверять голым getRedis() поэтому нельзя (§11.1).
    expect(getRedis()).toBe(stubA);
  });

  it("при занятом слоте два вызова подряд дают один и тот же объект", () => {
    const stubA = makeStub("A");
    setRedis(stubA);

    const first = getRedis();
    const second = getRedis();

    expect(first).toBe(second);
    expect(second).toBe(stubA);
  });

  it("closeRedis() освобождает слот: следующая заглушка занимает его заново", async () => {
    const stubA = makeStub("A");
    setRedis(stubA);
    expect(getRedis()).toBe(stubA);

    await closeRedis();

    // После освобождения слота ставим ВТОРУЮ заглушку, а не зовём голый
    // getRedis(): в юнит-проекте пустой слот означал бы ленивое создание
    // настоящего клиента и реальный сокет. Смена идентичности A → B и есть
    // доказательство, что слот был освобождён.
    const stubB = makeStub("B");
    setRedis(stubB);

    expect(getRedis()).toBe(stubB);
    expect(getRedis()).not.toBe(stubA);
  });
});

describe("runtime clients: prisma slot", () => {
  // Обращения к БД нет: new PrismaClient() соединение не открывает, а
  // $disconnect() на несоединённом клиенте безопасен (§11.1).
  it("getPrisma() идемпотентен, а после closePrisma() отдаёт новый экземпляр", async () => {
    const first = getPrisma();
    expect(getPrisma()).toBe(first);

    await closePrisma();

    const second = getPrisma();
    expect(second).not.toBe(first);
    expect(getPrisma()).toBe(second);

    // Не оставляем живой клиент за собой.
    await closePrisma();
  });
});
