// INT: проверка самого хелпера очистки (§11.5). Первый зелёный интеграционный тест —
// на resetDatabase() опирается вся фаза 3, поэтому доказывается не «вызов не упал»,
// а именно полная очистка графа одним вызовом, включая ветку через matches.fieldId →
// fields.id с onDelete: Restrict (prisma/schema.prisma:149).
import { afterAll, describe, expect, it } from "vitest";

import { closePrisma, getPrisma } from "@/config/prisma.js";
import { closeRedis } from "@/config/redis.js";
import { resetDatabase } from "../helpers/db.js";

const prisma = getPrisma();

/** Наполняет полный доменный граф напрямую через Prisma: user → player → location → field → match → participant → rating. */
async function seedFullGraph(): Promise<void> {
  const role = await prisma.role.findFirstOrThrow();

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const user = await prisma.user.create({
    data: {
      email: `db-reset-${suffix}@example.test`,
      password: "hashed",
      birthDate: "1990-01-01",
      userRoles: { create: { roleId: role.id } },
    },
  });

  const rater = await prisma.player.create({
    data: { name: `rater-${suffix}`, userId: user.id },
  });
  const rated = await prisma.player.create({ data: { name: `rated-${suffix}` } });

  const location = await prisma.location.create({
    data: { name: `loc-${suffix}`, city: "Ashgabat" },
  });
  const field = await prisma.field.create({
    data: { locationId: location.id, name: `field-${suffix}`, format: "FIVE" },
  });

  const match = await prisma.match.create({
    data: {
      organizerId: rater.id,
      fieldId: field.id,
      title: `match-${suffix}`,
      startsAt: new Date(),
      format: "FIVE",
      minPlayers: 6,
      maxPlayers: 10,
    },
  });

  // status обязателен и без дефолта (prisma/schema.prisma:170), в отличие от Match.status.
  await prisma.matchParticipant.create({
    data: { matchId: match.id, playerId: rated.id, status: "REGISTERED" },
  });

  await prisma.playerRating.create({
    data: { matchId: match.id, raterId: rater.id, ratedId: rated.id, score: 5 },
  });
}

/** Восемь очищаемых таблиц в порядке TABLES из tests/helpers/db.ts. */
async function countAll(): Promise<Record<string, number>> {
  const [playerRatings, matchParticipants, matches, fields, locations, players, userRoles, users] =
    await Promise.all([
      prisma.playerRating.count(),
      prisma.matchParticipant.count(),
      prisma.match.count(),
      prisma.field.count(),
      prisma.location.count(),
      prisma.player.count(),
      prisma.userRole.count(),
      prisma.user.count(),
    ]);

  return {
    playerRatings,
    matchParticipants,
    matches,
    fields,
    locations,
    players,
    userRoles,
    users,
  };
}

describe("resetDatabase()", () => {
  afterAll(async () => {
    await closeRedis();
    await closePrisma();
  });

  it("каскадно очищает весь доменный граф и не упирается в FK Restrict", async () => {
    // Наполнение — внутри теста, а не в beforeAll: база общая с параллельными
    // сессиями, и чужой resetDatabase() между хуком и телом теста снёс бы граф.
    await seedFullGraph();

    // Наполнение подтверждается фактом: каждая из восьми таблиц непуста.
    const before = await countAll();
    for (const [table, count] of Object.entries(before)) {
      expect(count, `таблица ${table} должна быть непуста до очистки`).toBeGreaterThan(0);
    }

    // Отсутствие исключения ассертится явно, а не выводится из того, что тест не упал.
    // Проверено вручную: стоит выпасть из списка хотя бы одной таблице, ссылающейся на
    // другую (например, TRUNCATE только "fields"), как без CASCADE Postgres отвечает
    // 0A000 «cannot truncate a table referenced in a foreign key constraint».
    await expect(resetDatabase()).resolves.toBeUndefined();

    const after = await countAll();
    expect(after).toEqual({
      playerRatings: 0,
      matchParticipants: 0,
      matches: 0,
      fields: 0,
      locations: 0,
      players: 0,
      userRoles: 0,
      users: 0,
    });

    // roles вне списка очистки: справочник сеется в global-setup и переживает reset (§9.8).
    expect(await prisma.role.count()).toBeGreaterThan(0);
  });
});
