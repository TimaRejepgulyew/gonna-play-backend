# Соглашения кода

Выжимка правил, как писать код в стиле проекта. Полный источник с ссылками `path:line` — `.claude/skills/backend-design/references/conventions.md`; при расхождении верь тому файлу и `package.json`.

## ESM

Проект собран как ESM (`"type": "module"`). Два правила, которые легко нарушить:

- Относительные импорты пишутся **с расширением `.js`**, даже для файлов `.ts`: `import PlayerRepository from "./player.repository.js"`.
- Импорты от корня `src/` — через алиас `@/`: `import prisma from "@/config/prisma.js"` (настроен в `tsconfig.json`).

## Модуль на ресурс

Каждый ресурс — папка `src/<resource>/` со слоями. Эталон — `src/player/`, но с оговоркой ниже.

- `<resource>.routes.ts` — регистрирует маршруты, привязывает схемы TypeBox через `{ schema: ... }`.
- `<resource>.controller.ts` — тонкий слой: собирает сервис в конструкторе, перекладывает `req.body` / `req.params` в вызовы сервиса.
- `<resource>.service.ts` — бизнес-логика; здесь объявляются `CreateX`, `UpdateX`, `IXRepository`.
- `<resource>.repository.ts` — доступ к данным только через Prisma, реализует `IXRepository`.
- `<resource>.model.ts` — схемы TypeBox (`createXSchema`, `updateXSchema`) и доменный класс.

**Оговорка про эталон.** `src/player/player.repository.ts` сейчас наполовину сломан: `getPlayer`, `updatePlayer`, `deletePlayer` работают через `Map` в памяти, а не через Prisma. Это **не** образец. Правильный шаблон — метод `createPlayer`, который ходит в `this.prisma`. Любой новый репозиторий пишется целиком на Prisma. Починка `player`-репозитория — отдельный срез [slices/player.md](slices/player.md).

## Регистрация маршрутов

Все модули маршрутов подключаются в `src/router.ts` через `server.register(<resource>Routes, { prefix: "api/<resource>" })`. Новый ресурс — одна строка регистрации там же. С версионированием (Р5) префикс включает `/v1`.

## Обработка ошибок

Доменные коды ошибок — в `src/constants/` (`errorCodes.ts`, реэкспорт через `index.ts`). Инфраструктурные — из `errorCodes` Fastify (`import { errorCodes } from "fastify"`). Сервис либо возвращает объект-ошибку `ErrorResponse` (`src/types/prisma.ts`), либо бросает `errorCodes.FST_ERR_*`. Цель — свести всё в единый `plugins/errorHandler.ts` (см. срез `auth`).

## Prisma: имена

- Модель — PascalCase в единственном числе (`User`, `Match`).
- Таблица — через `@@map("<snake_case_plural>")` (`@@map("matches")`).
- Перечисления — SCREAMING_SNAKE_CASE, значения с `@map("lowercase")` (образец `PLAYER_POSITION`).
- Служебные поля у каждой модели: `id`, `createdAt`, `updatedAt`.
- Связи — явный `@relation`, `onDelete` осознанно (`Cascade` для зависимых, `SetNull` для необязательных).

## Клиент Prisma

Единый клиент — из `src/config/prisma.ts` (импорт `@/config/prisma.js`), плюс плагин `src/plugins/prisma.ts`. Новый код берёт клиент тем же способом, не создаёт свой `new PrismaClient()`.

## Миграции

Миграции — в `prisma/migrations/`, команды обёрнуты в скрипты `package.json` (`prisma:migrate`, `prisma:migrate:create`, `prisma:generate`, `prisma:format`). Файл миграции готовится, но к живой базе **не применяется** автоматически — запуск `prisma migrate` на реальной БД остаётся за человеком.
