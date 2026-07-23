# Срез: player

Небольшой независимый срез: привести модуль игрока к соглашениям и починить репозиторий.

## Границы

Игровой профиль (уровень, позиция, статус), CRUD. Модель `Player` и перечисления уже есть в схеме. Вход и роли — не здесь (срез [auth](auth.md)).

## Владеет таблицами

- `Player` (`name` обязательный, `userId?` unique, `level?`, `position?`, `status?` по умолчанию `ACTIVE`).

## Касается

- `User` — чтение при связывании профиля.

## Эндпоинты

Маршруты в `src/player/player.routes.ts`, сейчас под префиксом `api/player` (перенос под `/v1` — за срезом [versioning](versioning.md)):

- `GET /api/player/list`, `GET /api/player/:id`, `POST /api/player`, `PUT /api/player/:id`, `DELETE /api/player/:id` (`DELETE` под `authorize("admin")`).

## Зависит от

Ничего. Основная работа сделана.

## Что сделать

1. **Дефект безопасности (в первую очередь):** `getPlayer`, `getPlayerList`, `updatePlayer` подмешивают аккаунт как `include: { user: true }` без `select`/`omit` (`src/player/player.repository.ts:47, 78-81, 111`), из-за чего `GET /api/player/:id`, `GET /api/player/list` и `PUT /api/player/:id` отдают наружу `user.password` (хеш), `telegramId` и прочие поля аккаунта. Закрыть `omit: { password: true }` (как уже сделано в `src/user/user.repository.ts`) либо response-схемой, срезающей лишние поля.
2. Перенос маршрутов под `/v1` — вместе со срезом `versioning`.
3. Свести обработку ошибок к единому виду — после появления `errorHandler` из среза `auth`.

## Готово когда

Репозиторий целиком на Prisma (сделано), CRUD работает против реальной базы (сделано), ответы не содержат хеш пароля и лишних полей аккаунта (**остаётся сделать**).

## Статус

🟡 в основном готов: репозиторий на Prisma, CRUD работает; остаётся закрыть утечку полей аккаунта. Обновляй в [../PROGRESS.md](../PROGRESS.md).
