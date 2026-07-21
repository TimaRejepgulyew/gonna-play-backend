// globalSetup интеграционного проекта: один раз на прогон (vitest.config.ts).
//
// globalSetup исполняется ДО и ОТДЕЛЬНО от setupFiles, поэтому tests/setup/env.ts
// импортируется здесь явно — иначе DATABASE_URL остался бы неопределённым и Prisma
// ушла бы в окружение разработчика (5432/5433), а не в тестовое (5434).
import "./env.js";

import { closePrisma, getPrisma } from "@/config/prisma.js";
import { assertTestDatabaseUrl } from "../helpers/endpoint-guard.js";

// Схему НЕ создаём здесь: провижининг — внешняя команда `npm run test:setup`
// (§9.9, §10.3 шаг 2), а в контейнере — `npx prisma migrate deploy` в команде
// сервиса backend (docker-compose.test.yml). Здесь только проверка готовности:
// два владельца одной миграционной цепочки разошлись бы при параллельном прогоне,
// а падение с внятным сообщением дешевле молчаливой попытки мигрировать.
const REQUIRED_TABLES = [
  "roles",
  "users",
  "user_roles",
  "players",
  "locations",
  "fields",
  "matches",
  "match_participants",
  "player_ratings",
] as const;

const SEEDED_ROLES = ["admin", "user", "player"] as const;

export async function setup(): Promise<void> {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      `global-setup: NODE_ENV="${process.env.NODE_ENV}", ожидается "test". ` +
        "Прогон против нетестовой базы прерван.",
    );
  }

  // Адрес проверяется здесь, а не только перед resetDatabase(): global-setup —
  // первый код прогона, который трогает базу, и он в неё пишет (upsert ролей ниже).
  // При промахе в DATABASE_URL роли ушли бы в dev-базу раньше, чем гард
  // resetDatabase() получил бы шанс отказать.
  assertTestDatabaseUrl("global-setup");

  const prisma = getPrisma();

  const present = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
  `;
  const names = new Set(present.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((table) => !names.has(table));

  if (missing.length > 0) {
    await closePrisma();
    throw new Error(
      `global-setup: в тестовой базе нет таблиц: ${missing.join(", ")}. ` +
        "Схема не применена — выполните `npm run test:setup` " +
        "(DATABASE_URL должен указывать на тестовую базу, порт 5434).",
    );
  }

  // upsert, а не create: справочник переживает resetDatabase() (§9.8), и повторный
  // прогон без пересоздания базы не должен падать на уникальности Role.name.
  for (const name of SEEDED_ROLES) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
}

export async function teardown(): Promise<void> {
  await closePrisma();
}
