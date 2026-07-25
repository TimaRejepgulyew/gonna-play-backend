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

Не плагином, а иначе: rate-limit — per-route утилита `src/utils/rateLimit.ts` (preHandler), в первую очередь на входе; ошибки сводятся к единому конверту двумя механизмами — `preSerialization`-хук в `src/app.ts` промотирует `code` возвращённого сервисом конверта в HTTP-статус (доменный путь), а центральный `src/plugins/errorHandler.ts` (`setErrorHandler`/`setNotFoundHandler`) нормализует всё брошенное — валидацию, неизвестный роут, 5xx (thrown-путь). Подробности — в [conventions.md](conventions.md#обработка-ошибок).

Целевые, но ещё не реализованы: `helmet` (пакет установлен, но не регистрируется), версионирование `apiVersion` + разбор User-Agent (префикс `/v1`, force-update, таргетинг флагов), `featureFlags`.

## Данные

Единый клиент Prisma живёт в `src/config/prisma.ts` и подключается плагином `src/plugins/prisma.ts`. PostgreSQL — основное хранилище состояния. Redis используется как второе хранилище: кеш ответов (`src/utils/cache.ts`), refresh-токены (`src/auth/refreshStore.ts`) и rate-limit. Клиент — по той же ленивой схеме, что Prisma (`src/config/redis.ts`, плагин `src/plugins/redis.ts`).

## Логирование

Логгер — pino, встроенный в Fastify через `Fastify({ logger })`. Конфиг собирает фабрика `buildLoggerConfig` в `src/config/logger.ts` (дефолтный экспорт), которая читает три env-переменные из `src/config/env.ts`:

- `LOG_LEVEL` (дефолт `info`) — уровень pino: `trace | debug | info | warn | error | fatal`.
- `LOG_TRANSPORT` (дефолт `file`) — сменяемый транспорт: `file` — встроенный `pino/file` в файл (дефолт), `pretty` — `pino-pretty` в stdout для dev, `stdout` — NDJSON в stdout под сборщик логов. Неизвестное значение молча откатывается к `file`.
- `LOG_FILE` (дефолт `logs/app.log`) — путь файла при `LOG_TRANSPORT=file`; директория создаётся автоматически (`mkdir: true`). Файл под `.gitignore`.

Смена backend-а логов — это смена значения env, кода приложения не касается: рабочие транспорты pino крутятся в worker-thread и не блокируют event loop. Отдельно — синхронный `createBootstrapLogger()` из того же модуля: он пишет через `pino.destination({ sync: true })` и нужен только в catch стартового bootstrap (`src/index.ts`), где `server.log` ещё недоступен, а асинхронный транспорт потерял бы fatal-запись перед `process.exit(1)`.

## Фоновые задачи

Целевое, ещё не реализовано: внутренний планировщик `node-cron` (напоминание за час до матча, закрытие записи по времени, продвижение листа ожидания, отметка не пришедших). В коде планировщика и зависимости `node-cron` пока нет; продвижение листа ожидания сейчас происходит синхронно при выходе участника. Путь роста при нескольких копиях сервиса — очередь на Redis (BullMQ). Задел см. [decisions.md](decisions.md).

## Медиа и статика

Целевое, ещё не реализовано. По плану файлы (фото площадок, аватары) не хранятся в БД — только ключи объектов; загрузка напрямую через presigned URL, чтение через CDN, код на S3-совместимом API (AWS S3 или MinIO). Модуля `storage` в коде пока нет — это TODO среза `venues-media`.
