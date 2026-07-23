# Рантайм-архитектура

Диаграмма: [../diagrams/A-architecture.png](../diagrams/A-architecture.png)

## Поток запроса

Запрос проходит по слоям сверху вниз: клиент (мобильное приложение или Telegram) обращается к HTTP-слою Fastify, там срабатывают сквозные плагины, дальше запрос попадает в модуль ресурса, внутри модуля идёт по цепочке контроллер → сервис → репозиторий, а репозиторий через Prisma ходит в PostgreSQL. Ответ возвращается тем же путём обратно.

Сжато весь путь: `клиент → Fastify (плагины) → controller → service → repository → Prisma → PostgreSQL`.

## Слои модуля

Каждый модуль ресурса состоит из четырёх слоёв, у каждого одна ответственность:

- **Controller** — разбирает запрос, привязывает схему TypeBox, переводит результат сервиса в HTTP. Тонкий слой.
- **Service** — бизнес-правила и оркестрация репозиториев. Здесь же объявляются интерфейсы `CreateX`, `UpdateX`, `IXRepository`.
- **Repository** — только доступ к данным через Prisma, реализует `IXRepository`. Никаких `Map` в памяти.
- **Model** — схемы TypeBox (`createXSchema`, `updateXSchema`) и доменный класс.

Подробнее и с образцами — в [conventions.md](conventions.md).

## Сквозные плагины (HTTP-слой Fastify)

Что реально регистрируется в `buildApp()` (`src/app.ts`):

- `cors` — CORS;
- `auth (JWT)` — декоратор `authenticate` (проверка access-токена) и фабрика `authorize(...roles)` по ролям (`src/plugins/auth.ts`);
- `prisma` — клиент Prisma на инстансе Fastify (`src/plugins/prisma.ts`);
- `redis` — клиент Redis на инстансе Fastify (`src/plugins/redis.ts`);
- `swagger` — спецификация OpenAPI на `GET /docs/json` (UI не подключён), из неё генерируется Postman.

Не плагином, а иначе: rate-limit — per-route утилита `src/utils/rateLimit.ts` (preHandler), в первую очередь на входе; перевод ошибок в HTTP-код — инлайновый `preSerialization`-хук в `src/app.ts`, а не отдельный `errorHandler`.

Целевые, но ещё не реализованы: `helmet` (пакет установлен, но не регистрируется), версионирование `apiVersion` + разбор User-Agent (префикс `/v1`, force-update, таргетинг флагов), `featureFlags`, единый `plugins/errorHandler.ts`.

## Данные

Единый клиент Prisma живёт в `src/config/prisma.ts` и подключается плагином `src/plugins/prisma.ts`. PostgreSQL — основное хранилище состояния. Redis используется как второе хранилище: кеш ответов (`src/utils/cache.ts`), refresh-токены (`src/auth/refreshStore.ts`) и rate-limit. Клиент — по той же ленивой схеме, что Prisma (`src/config/redis.ts`, плагин `src/plugins/redis.ts`).

## Фоновые задачи

Целевое, ещё не реализовано: внутренний планировщик `node-cron` (напоминание за час до матча, закрытие записи по времени, продвижение листа ожидания, отметка не пришедших). В коде планировщика и зависимости `node-cron` пока нет; продвижение листа ожидания сейчас происходит синхронно при выходе участника. Путь роста при нескольких копиях сервиса — очередь на Redis (BullMQ). Задел см. [decisions.md](decisions.md).

## Медиа и статика

Целевое, ещё не реализовано. По плану файлы (фото площадок, аватары) не хранятся в БД — только ключи объектов; загрузка напрямую через presigned URL, чтение через CDN, код на S3-совместимом API (AWS S3 или MinIO). Модуля `storage` в коде пока нет — это TODO среза `venues-media`.
