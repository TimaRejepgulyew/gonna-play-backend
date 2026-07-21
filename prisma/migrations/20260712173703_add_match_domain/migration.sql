-- ============================================================================
-- MANUAL DRAFT MIGRATION — add_match_domain
-- ----------------------------------------------------------------------------
-- Переводит базу ОТ состояния после `20250608064048_fix_relations`
-- (enums PLAYER_*, таблицы roles/users/user_roles/players)
-- К утверждённой доменной модели матчей: добавляет 5 таблиц
-- (locations, fields, matches, match_participants, player_ratings)
-- и 7 перечислений. Существующие таблицы НЕ меняются — у `players`
-- появляются только виртуальные обратные relation-поля Prisma (без DDL).
--
-- ЭТО РУЧНОЙ ЧЕРНОВИК. К живой базе НЕ применялся. Только добавление
-- (нет DROP / ALTER существующих таблиц), риска для текущих данных нет.
--
-- Пересобран под целевую модель вики (docs/wiki/data-model.md): Match с
-- листом ожидания и полным жизненным циклом (DRAFT→…→FINISHED), поля
-- startsAt/durationMin/minPlayers/skillMin/skillMax/visibility/currency,
-- MatchParticipant с paymentStatus/joinedAt, перечисления MATCH_VISIBILITY,
-- PAYMENT_STATUS и TEAM_SIDE.
--
-- Имена колонок соответствуют полям Prisma-моделей: без `@map` на полях
-- Postgres хранит их в исходном camelCase и требует кавычек ("camelCase").
-- Значения перечислений — это строки из `@map(...)` (lowercase).
-- ============================================================================


-- CreateEnum
CREATE TYPE "MATCH_FORMAT" AS ENUM ('5x5', '7x7', '11x11');

-- CreateEnum
CREATE TYPE "MATCH_STATUS" AS ENUM ('draft', 'open', 'full', 'confirmed', 'in_progress', 'finished', 'cancelled');

-- CreateEnum
CREATE TYPE "MATCH_VISIBILITY" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "PARTICIPANT_STATUS" AS ENUM ('registered', 'waitlisted', 'confirmed', 'checked_in', 'no_show', 'cancelled');

-- CreateEnum
CREATE TYPE "TEAM_SIDE" AS ENUM ('a', 'b');

-- CreateEnum
CREATE TYPE "PAYMENT_STATUS" AS ENUM ('unpaid', 'paid', 'waived');

-- CreateEnum
CREATE TYPE "SURFACE_TYPE" AS ENUM ('natural_grass', 'artificial_grass', 'futsal', 'concrete', 'dirt');

-- CreateTable
CREATE TABLE "locations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "surfaceType" "SURFACE_TYPE",
    "capacity" INTEGER,
    "openingHours" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fields" (
    "id" SERIAL NOT NULL,
    "locationId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "format" "MATCH_FORMAT" NOT NULL,
    "surface" "SURFACE_TYPE",
    "width" DOUBLE PRECISION,
    "length" DOUBLE PRECISION,
    "isIndoor" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" SERIAL NOT NULL,
    "organizerId" INTEGER NOT NULL,
    "fieldId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "format" "MATCH_FORMAT" NOT NULL,
    "minPlayers" INTEGER NOT NULL,
    "maxPlayers" INTEGER NOT NULL,
    "price" DECIMAL(10,2),
    "currency" VARCHAR(3),
    "visibility" "MATCH_VISIBILITY" NOT NULL DEFAULT 'public',
    "status" "MATCH_STATUS" NOT NULL DEFAULT 'draft',
    "skillMin" "PLAYER_LEVEL",
    "skillMax" "PLAYER_LEVEL",
    "description" TEXT,
    "teamsBalancedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_participants" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "position" "PLAYER_POSITION",
    "team" "TEAM_SIDE",
    "status" "PARTICIPANT_STATUS" NOT NULL,
    "paymentStatus" "PAYMENT_STATUS" NOT NULL DEFAULT 'unpaid',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_ratings" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER NOT NULL,
    "raterId" INTEGER NOT NULL,
    "ratedId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "locations_city_idx" ON "locations"("city");

-- CreateIndex
CREATE INDEX "fields_locationId_idx" ON "fields"("locationId");

-- CreateIndex
CREATE INDEX "fields_format_idx" ON "fields"("format");

-- CreateIndex
CREATE INDEX "matches_organizerId_idx" ON "matches"("organizerId");

-- CreateIndex
CREATE INDEX "matches_fieldId_idx" ON "matches"("fieldId");

-- CreateIndex
CREATE INDEX "matches_status_idx" ON "matches"("status");

-- CreateIndex
CREATE INDEX "matches_format_idx" ON "matches"("format");

-- CreateIndex
CREATE INDEX "matches_skillMin_idx" ON "matches"("skillMin");

-- CreateIndex
CREATE INDEX "matches_skillMax_idx" ON "matches"("skillMax");

-- CreateIndex
CREATE INDEX "matches_startsAt_idx" ON "matches"("startsAt");

-- CreateIndex
CREATE INDEX "matches_status_startsAt_idx" ON "matches"("status", "startsAt");

-- CreateIndex
CREATE INDEX "match_participants_playerId_idx" ON "match_participants"("playerId");

-- CreateIndex
CREATE INDEX "match_participants_matchId_status_joinedAt_idx" ON "match_participants"("matchId", "status", "joinedAt");

-- CreateIndex
CREATE UNIQUE INDEX "match_participants_matchId_playerId_key" ON "match_participants"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "player_ratings_ratedId_idx" ON "player_ratings"("ratedId");

-- CreateIndex
CREATE INDEX "player_ratings_raterId_idx" ON "player_ratings"("raterId");

-- CreateIndex
CREATE INDEX "player_ratings_matchId_idx" ON "player_ratings"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "player_ratings_matchId_raterId_ratedId_key" ON "player_ratings"("matchId", "raterId", "ratedId");

-- AddForeignKey
ALTER TABLE "fields" ADD CONSTRAINT "fields_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "fields"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_ratings" ADD CONSTRAINT "player_ratings_ratedId_fkey" FOREIGN KEY ("ratedId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
