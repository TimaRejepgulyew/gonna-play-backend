-- ============================================================================
-- MANUAL DRAFT MIGRATION — add_auth_identity
-- ----------------------------------------------------------------------------
-- Переводит базу ОТ состояния после `20260712173703_add_match_domain`
-- К модели способов входа: заводит перечисление AUTH_PROVIDER и таблицу
-- auth_identities, переносит в неё телеграмные колонки `users`, снимает
-- NOT NULL с password/email/birthDate, добавляет firstName/lastName и
-- удаляет с `users` три телеграмных колонки.
--
-- ЭТО РУЧНОЙ ЧЕРНОВИК. К живой базе НЕ применялся: запуск на проде — за
-- человеком. Перед применением на непустой базе обязательна ручная сверка
-- телеграмных данных (снять счётчик строк с непустым "telegramId" и список
-- дубликатов, после миграции сверить с числом строк auth_identities).
--
-- ПОРЯДОК ШАГОВ ЖЁСТКИЙ. Шаг 3 (перенос данных) обязан отработать РАНЬШЕ
-- шага 6 (снятие колонок): шаг 6 НЕОБРАТИМ ПО ДАННЫМ — после него значения
-- "telegramId"/"telegramUsername"/"isTelegramVerified" в базе не существуют
-- и восстановить их можно только из резервной копии.
--
-- РАЗРЕШЕНИЕ ДУБЛИКАТОВ. Уникальности у источника нет: "users"."telegramId"
-- не уникален, один и тот же телеграмный аккаунт мог быть записан нескольким
-- пользователям. Новый индекс (provider, "providerUserId") уникален, поэтому
-- на каждый "telegramId" переносится ровно одна строка, и правило выбора
-- детерминированное: ВЫИГРЫВАЕТ ПОЛЬЗОВАТЕЛЬ С НАИМЕНЬШИМ "users"."id".
-- Остальные претенденты на тот же "telegramId" привязки не получают и
-- остаются с прежними способами входа. Сортировка ORDER BY "telegramId", id
-- в шаге 3 — не украшение: без неё DISTINCT ON отдаёт произвольную строку и
-- результат на двух копиях базы разойдётся.
--
-- Имена колонок соответствуют полям Prisma-моделей: без `@map` на полях
-- Postgres хранит их в исходном camelCase и требует кавычек ("camelCase").
-- Значения перечислений — это строки из `@map(...)` (lowercase).
-- ============================================================================


-- CreateEnum
CREATE TYPE "AUTH_PROVIDER" AS ENUM ('google', 'apple', 'telegram');

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "provider" "AUTH_PROVIDER" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "refreshTokenEncrypted" TEXT,
    "refreshTokenUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_identities_userId_idx" ON "auth_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_provider_providerUserId_key" ON "auth_identities"("provider", "providerUserId");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration
-- Переносит существующие телеграмные привязки ДО снятия колонок (шаг 6).
-- На пустой базе (тестовый контур) исполняется вхолостую.
INSERT INTO "auth_identities" ("userId", "provider", "providerUserId", "username", "createdAt", "updatedAt")
SELECT DISTINCT ON ("telegramId")
    "id",
    'telegram'::"AUTH_PROVIDER",
    "telegramId",
    "telegramUsername",
    now(),
    now()
FROM "users"
WHERE "telegramId" IS NOT NULL
ORDER BY "telegramId", "id";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL,
                    ALTER COLUMN "email" DROP NOT NULL,
                    ALTER COLUMN "birthDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "firstName" TEXT,
                    ADD COLUMN "lastName" TEXT;

-- AlterTable
-- НЕОБРАТИМО ПО ДАННЫМ. Выполняется последним, после переноса выше.
ALTER TABLE "users" DROP COLUMN "telegramId",
                    DROP COLUMN "telegramUsername",
                    DROP COLUMN "isTelegramVerified";
