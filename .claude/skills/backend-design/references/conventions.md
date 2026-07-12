# Соглашения проекта

Этот справочник — источник правды о том, как устроен бэкенд `gonna-play-backend`. И оркестратор, и три агента-специалиста читают его перед работой, чтобы проектировать и писать код в стиле проекта, а не по общим шаблонам. Каждое утверждение по возможности несёт ссылку `path:line`, чтобы её можно было перепроверить.

## Стек

Приложение построено на Fastify 5 в режиме ESM на TypeScript. Данные — PostgreSQL через Prisma 6 (`@prisma/client`). Схемы запросов и ответов описываются на TypeBox (`@sinclair/typebox`) и подключаются через `@fastify/type-provider-typebox`. Авторизация — `fastify-jwt`. Логирование — `pino` с `pino-pretty`. Документация API — `@fastify/swagger`. Плюс `@fastify/cors`, `@fastify/helmet`, `@fastify/cookie`. Кеш на Redis (`@fastify/redis`) в проекте пока не подключён — его закладывает стратег кеша.

Ключевые версии и зависимости всегда сверяй с `package.json` — он источник правды, а не этот текст.

## Правила модулей ESM

Проект собран как ESM (`"type": "module"` в `package.json`). Из этого следуют два жёстких правила, которые легко нарушить:

- Относительные импорты пишутся **с расширением `.js`**, даже для файлов `.ts`. Например: `import PlayerRepository from "./player.repository.js"`.
- Для импортов от корня `src/` используется алиас `@/`. Например: `import prisma from "@/config/prisma.js"`. Алиас настроен в `tsconfig.json`.

## Модульный паттерн (одна папка на ресурс)

Каждый ресурс живёт в своей папке `src/<resource>/` и раскладывается на слои. Эталон — модуль `src/player/`, но с важной оговоркой ниже.

- `<resource>.routes.ts` — регистрирует маршруты на переданном `FastifyInstance`, привязывает TypeBox-схемы через `{ schema: ... }` и связывает пути с методами контроллера. Образец: `src/player/player.routes.ts`.
- `<resource>.controller.ts` — тонкий слой. В конструкторе собирает сервис с его репозиториями, а методы лишь перекладывают `req.body`/`req.params` в вызовы сервиса. Образец: `src/player/player.controller.ts`.
- `<resource>.service.ts` — бизнес-логика. Здесь же объявляются интерфейсы слоя: `CreateX`, `UpdateX` и `IXRepository`. Образец: `src/player/player.service.ts`.
- `<resource>.repository.ts` — доступ к данным через Prisma, реализует `IXRepository`. Образец частично — `src/player/player.repository.ts`.
- `<resource>.model.ts` — TypeBox-схемы (`createXSchema`, `updateXSchema`) и класс-модель домена. Образец: `src/player/player.model.ts`.

**Оговорка про эталон.** `src/player/player.repository.ts` сейчас наполовину сломан: методы `getPlayer`, `updatePlayer`, `deletePlayer` работают через `Map` в памяти (`playerTable`), а не через Prisma. Это **не** образец — правильный шаблон репозитория показывает метод `createPlayer` (`src/player/player.repository.ts:26`), который ходит в `this.prisma`. Любой новый репозиторий пишется целиком на Prisma, никаких `Map` в памяти.

## Регистрация маршрутов

Все модули маршрутов подключаются централизованно в `src/router.ts` через `server.register(<resource>Routes, { prefix: "api/<resource>" })`. Новый ресурс добавляется одной строкой регистрации там же. Образец: `src/router.ts:10`.

## Обработка ошибок

Коды ошибок домена лежат в `src/constants/` (`src/constants/errorCodes.ts`, реэкспорт через `src/constants/index.ts`). Инфраструктурные ошибки берутся из `errorCodes` самого Fastify (`import { errorCodes } from "fastify"`). Сервис либо возвращает объект-ошибку типа `ErrorResponse` (`src/types/prisma.ts`), либо бросает `errorCodes.FST_ERR_*`. Смотри, как это сделано в `src/player/player.service.ts`.

## Конфигурация и клиент Prisma

Конфигурация приложения — в `src/config/` (`prisma.ts`, `logger.ts`, `env.ts`). Единый клиент Prisma экспортируется из `src/config/prisma.ts` и импортируется как `@/config/prisma.js`. Есть и плагин `src/plugins/prisma.ts`, который вешает клиент на инстанс Fastify. Новый код берёт клиент тем же способом, что и существующие репозитории, а не создаёт свой `new PrismaClient()`.

## Соглашения об именах Prisma

- Модель — PascalCase в единственном числе (`User`, `Player`, `Match`).
- Имя таблицы задаётся через `@@map("<snake_case_plural>")` (`@@map("users")`, `@@map("user_roles")`).
- Перечисления — SCREAMING_SNAKE_CASE, значения тоже, с `@map("lowercase")` на каждое значение. Образец: `PLAYER_POSITION` в `prisma/schema.prisma:87`.
- Служебные поля есть у каждой модели: `id Int @id @default(autoincrement())`, `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`.
- Связи оформляются явно с `@relation`, а поведение при удалении задаётся `onDelete` осознанно (`Cascade` для зависимых, `SetNull` для необязательных ссылок). Образцы: `prisma/schema.prisma:57`, `prisma/schema.prisma:75`.

## Миграции и сиды

Миграции живут в `prisma/migrations/`. Команды обёрнуты в скрипты `package.json` (`prisma:migrate`, `prisma:migrate:create`, `prisma:migrate:deploy`, `prisma:generate`, `prisma:format`). Сиды — `prisma/seeds/seed.ts`, запускаются `yarn prisma:db:seed`. Агент готовит файл миграции и формат схемы, но **не применяет** миграцию к живой базе сам — запуск `prisma migrate` на реальной БД остаётся за человеком.

## Кеш на Redis (целевое состояние)

Redis пока не подключён, стратег кеша вводит его с нуля. Целевой способ подключения — плагин `@fastify/redis` (поверх `ioredis`), зарегистрированный рядом с прочими плагинами и доступный как `server.redis`. Ключи именуются по единой схеме `<домен>:<сущность>:<идентификатор>` (например `match:list:city:42`, `player:rating:17`). Каждый закешированный ключ имеет осмысленный TTL и явные триггеры инвалидации, привязанные к мутациям соответствующего ресурса. Подробности — в документе плана кеша, который пишет стратег.
