import { getPrisma } from "@/config/prisma.js";
import { getRedis } from "@/config/redis.js";
import { assertTestDatabaseUrl, assertTestRedisEndpoint } from "./endpoint-guard.js";

// Имена — физические (@@map в prisma/schema.prisma), не имена моделей.
// `roles` намеренно НЕ очищается: справочник сеется один раз в global-setup
// и переживает все тесты, что упрощает создание админа (§9.8).
// Пользователей сид НЕ переживает: TRUNCATE сносит users и user_roles,
// поэтому каждый актор создаётся тестом через createActor() (§9.10).
const TABLES = [
  "player_ratings", // prisma/schema.prisma:205
  "match_participants", // prisma/schema.prisma:183
  "matches", // prisma/schema.prisma:161
  "fields", // prisma/schema.prisma:123
  "locations", // prisma/schema.prisma:102
  "players", // prisma/schema.prisma:81
  "user_roles", // prisma/schema.prisma:61
  "users", // prisma/schema.prisma:46
] as const;

// Один оператор вместо покомандного удаления: быстрее и не зависит от порядка
// имён внутри списка. CASCADE обязателен — без него TRUNCATE упрётся в
// matches.fieldId → fields.id с onDelete: Restrict (prisma/schema.prisma:149),
// единственную некаскадную связь, способную заблокировать удаление.
// RESTART IDENTITY делает идентификаторы предсказуемыми в каждом тесте.
const TRUNCATE_SQL = `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`;

export async function resetDatabase(): Promise<void> {
  // Гард обязателен: TRUNCATE и FLUSHDB разрушительны, а DATABASE_URL в
  // src/config/env.ts не валидируется вовсе — Prisma читает его напрямую,
  // поэтому опечатка молча укажет на dev-базу (§13).
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `resetDatabase() допустим только при NODE_ENV=test, получено: ${String(process.env.NODE_ENV)}`,
    );
  }

  // Второй гард — по адресу подключения (tests/helpers/endpoint-guard.ts).
  // Одного NODE_ENV мало: он говорит лишь о режиме процесса, но не о том, к
  // какой базе процесс подключён. На этой машине одновременно живут dev-база
  // (5432), прод-база (5433), dev-Redis (6380) и посторонний Redis (6379);
  // ошибка в одном символе URL направила бы TRUNCATE/FLUSHDB в любой из них,
  // а ошибка была бы необратимой.
  assertTestDatabaseUrl("resetDatabase()");

  // Для Redis проверяется не переменная, а разрешённые опции самого клиента —
  // именно по ним уйдёт FLUSHDB.
  const redis = getRedis();
  assertTestRedisEndpoint(
    String(redis.options.host),
    String(redis.options.port),
    "resetDatabase()",
  );

  // getPrisma() отдаёт тот же клиент, которым пользуется приложение (§9.3.2),
  // поэтому очистка и запросы тестов идут через одно соединение.
  await getPrisma().$executeRawUnsafe(TRUNCATE_SQL);

  // Без сброса Redis записи прошлого теста коллидируют с id, выданными заново
  // после RESTART IDENTITY: версионирование кеша (src/utils/cache.ts:127-133)
  // от этого не спасает — ключи и id повторяются.
  //
  // ВАЖНО: REDIS_URL тестов обязан указывать на ОТДЕЛЬНЫЙ инстанс Redis.
  // Изоляции по префиксу здесь недостаточно и полагаться на неё нельзя:
  // keyPrefix ioredis (src/config/redis.ts:14) на FLUSHDB не влияет вовсе —
  // команда сносит всю логическую базу целиком, включая ключи с чужими
  // префиксами. REDIS_KEY_PREFIX=gptest: служит лишь читаемости при отладке.
  // Единственная реальная защита — раздельные инстансы: тестовый Redis
  // публикуется на 6381, dev остаётся на 6380 (docker-compose.dev.yml:25).
  await redis.flushdb();
}
