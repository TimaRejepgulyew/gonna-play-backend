# Срез: matches

Ядро продукта: матчи и запись игроков на них.

## Границы

Создание и управление матчами, запись и лист ожидания, жизненный цикл статусов, отметка о приходе. Разбивка на команды — отдельный срез [teams](teams.md). Уведомления о событиях матча — срез [notifications](notifications.md).

## Владеет таблицами

- `Match` (organizerId, venueId?, format, startsAt, min/maxPlayers, price?, visibility, status, skillMin/Max?, …)
- `MatchParticipant` (matchId, userId, status, team?, position?, paymentStatus; `@@unique(matchId, userId)`)
- Перечисления: `MATCH_FORMAT`, `MATCH_STATUS`, `MATCH_VISIBILITY`, `PARTICIPANT_STATUS`, `TEAM_SIDE`, `PAYMENT_STATUS`.

## Касается

- `User` — организатор и участник.
- `Player` — уровень и позиция для допуска и последующей разбивки (только чтение).
- `Venue` — `Match.venueId` (только чтение; сам срез площадок — [venues-media](venues-media.md)).

## Эндпоинты (под префиксом `/v1`)

- `POST /v1/matches` — создать (черновик).
- `GET /v1/matches` — список с фильтрами (дата, город, статус, уровень).
- `GET /v1/matches/:id` — детали.
- `PATCH /v1/matches/:id` — изменить (только организатор).
- `POST /v1/matches/:id/publish` · `/confirm` · `/cancel` — переходы статуса.
- `POST /v1/matches/:id/join` — записаться (в состав или в лист ожидания).
- `DELETE /v1/matches/:id/leave` — выйти (освобождает место, продвигает лист ожидания).
- `POST /v1/matches/:id/check-in` — отметка о приходе.
- `GET /v1/matches/:id/participants` — состав.

## Зависит от

`auth` (идентичность и авторизация), `player` (профиль игрока).

## Что сделать

1. Схема `Match`, `MatchParticipant` и перечисления; миграция.
2. `match.service`: создание, изменение, переходы статуса (`DRAFT → OPEN → FULL → CONFIRMED → IN_PROGRESS → FINISHED`, `CANCELLED` почти из любого), проверка права владельца (редактирует и отменяет только организатор).
3. `participant.service`: запись с подсчётом мест **внутри транзакции** (иначе одновременная запись превысит лимит), лист ожидания, продвижение первого из очереди при выходе, отметка о приходе.
4. Репозитории целиком на Prisma, схемы TypeBox, регистрация маршрутов в `src/router.ts` под `/v1`.

## Готово когда

Полный жизненный цикл матча работает; лимит мест соблюдается при одновременной записи; при выходе продвигается лист ожидания; редактировать и отменять может только организатор.

## Статус

⬜ не начат. Обновляй в [../PROGRESS.md](../PROGRESS.md).
