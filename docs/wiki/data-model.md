# Модель данных

Диаграмма: [../diagrams/B-domain.png](../diagrams/B-domain.png)

Это источник правды по модели данных. Реализованная часть схемы (`Role`, `User`, `UserRole`, `Player`, `Location`, `Field`, `Match`, `MatchParticipant` и все перечисления, кроме `NOTIFICATION_*`) приведена к этому документу; `Notification` и `FeatureFlag` — целевые, в схеме их пока нет (ждут своих срезов). Где модель расходится с базовым справочником скила — см. [decisions.md](decisions.md); приоритет у этого документа.

> В схеме сейчас есть таблица `player_ratings` (`PlayerRating`), которой в этой модели нет намеренно: оценки после матча отклонены решением Р1, код с ними — отклонение к удалению (см. [decisions.md](decisions.md) и [PROGRESS.md](PROGRESS.md)).

Служебные поля есть у каждой модели и ниже не повторяются: `id Int @id @default(autoincrement())`, `createdAt`, `updatedAt`.

## Сущности

### Идентичность и доступ

**User** — учётная запись и личность для входа. Ключевые поля: `email` (уникальный), `password` (хеш, обязательный), `phone?`, `avatar?` (строка; в перспективе — ключ объекта в хранилище), `isEmailVerified`, `isPhoneVerified`, `isTelegramVerified`, привязка Telegram колонками `telegramId?` / `telegramUsername?`, плюс профиль (`name?`, `birthDate`, `city?`, `country?`, `gender?`) и `isActive`. Провайдеры входа хранятся колонками на `User`, а не в отдельной таблице (Р2, пересмотр 2026-07-23).

**Хранение сессий и провайдеров (не таблицы БД).** Refresh-токены живут в **Redis** (`src/auth/refreshStore.ts`), таблицы `RefreshToken` нет. Отдельной таблицы `AuthIdentity` тоже нет — Telegram привязан колонками на `User`. `AuthIdentity` — задел на будущее под второй внешний провайдер (Apple), см. [decisions.md](decisions.md) Р2.

**Role** — прикладная роль доступа: `name` (уникальный). **UserRole** — связь пользователя и роли: `userId`, `roleId`, `@@unique(userId, roleId)`. Это роли в системе (админ, организатор, игрок), их нельзя путать с позицией игрока на поле.

### Игрок

**Player** — игровой профиль, один-к-одному с `User`: `name` (обязательный), `userId?` (уникальный, `SetNull` при удалении пользователя), `level?` (`PLAYER_LEVEL`), `position?` (`PLAYER_POSITION`, основная позиция), `status?` (`PLAYER_STATUS`, по умолчанию `ACTIVE`). Организатор и участник матча ссылаются на `Player`, а не на `User`.

### Площадки

**Location** — комплекс площадки: `name`, `city` (обязательный, индекс), `address?`, `country?`, `latitude?`, `longitude?`, `surfaceType?` (`SURFACE_TYPE`, покрытие по умолчанию), `capacity?`, `openingHours?`.

**Field** — конкретное поле внутри комплекса, много на одну `Location`: `locationId`, `name`, `format` (`MATCH_FORMAT`), `surface?` (`SURFACE_TYPE`), `width?`, `length?`, `isIndoor` (по умолчанию `false`). Матч ссылается именно на `Field`.

> Медиа (фото площадок, аватары в хранилище) в схеме пока нет — это TODO среза `venues-media`. `VenuePhoto` и модуль `storage` ещё не заведены.

### Матчи

**Match** — матч: `organizerId` (Player), `fieldId` (Field), `title`, `format` (`MATCH_FORMAT`), `startsAt`, `durationMin` (по умолчанию 60), `minPlayers`, `maxPlayers`, `price?` (Decimal 10,2), `currency?` (varchar 3), `visibility` (`MATCH_VISIBILITY`, по умолчанию `PUBLIC`), `status` (`MATCH_STATUS`, по умолчанию `DRAFT`), `skillMin?` / `skillMax?` (`PLAYER_LEVEL`, фильтр по уровню), `description?`, `teamsBalancedAt?`.

**MatchParticipant** — запись игрока на матч: `matchId`, `playerId`, `status` (`PARTICIPANT_STATUS`), `team?` (`TEAM_SIDE`, ставит разбивка), `position?` (`PLAYER_POSITION`, позиция на этот матч, может отличаться от профильной), `paymentStatus` (`PAYMENT_STATUS`, по умолчанию `UNPAID`), `joinedAt`. `@@unique(matchId, playerId)`.

### Уведомления

**Notification** — уведомление: `userId`, `type` (`NOTIFICATION_TYPE`), `channel` (`NOTIFICATION_CHANNEL`), `title`, `body?`, `data?` (Json), `status` (`NOTIFICATION_STATUS`), `scheduledFor?`, `sentAt?`.

### Feature flags

**FeatureFlag** — флаг возможности: `key` (уникальный), `description?`, `enabled`, `rolloutPercent`, `platform?`, `minAppVersion?`. Связей с другими сущностями нет; раскатка идёт по проценту и по версии приложения (из User-Agent).

## Связи

- User — Player: один-к-одному (`Player.userId` необязателен, `SetNull`).
- User — Role: многие-ко-многим через UserRole.
- Player — Match: один-ко-многим (как организатор, связь `MatchOrganizer`).
- Match — MatchParticipant — Player: матч и игроки многие-ко-многим через MatchParticipant.
- Location — Field: один-ко-многим.
- Match — Field: многие-к-одному (`Match.fieldId`, `onDelete: Restrict`).
- User — Notification: один-ко-многим (целевая связь, `Notification` ещё не в схеме).

## Перечисления

Именуются в стиле проекта (SCREAMING_SNAKE_CASE, значения с `@map("lowercase")`).

- `PLAYER_LEVEL`: junior, middle, senior, legend — **уже есть** в схеме.
- `PLAYER_POSITION`: goalkeeper, defender, midfielder, forward — **уже есть**.
- `PLAYER_STATUS`: active, inactive — **уже есть**.
- `MATCH_FORMAT`: FIVE, SEVEN, ELEVEN (значения в БД `5x5`, `7x7`, `11x11`).
- `SURFACE_TYPE`: natural_grass, artificial_grass, futsal, concrete, dirt.
- `MATCH_STATUS`: DRAFT, OPEN, FULL, CONFIRMED, IN_PROGRESS, FINISHED, CANCELLED.
- `MATCH_VISIBILITY`: PUBLIC, PRIVATE.
- `PARTICIPANT_STATUS`: REGISTERED, WAITLISTED, CONFIRMED, CHECKED_IN, NO_SHOW, CANCELLED.
- `TEAM_SIDE`: A, B.
- `PAYMENT_STATUS`: UNPAID, PAID, WAIVED.
- `NOTIFICATION_TYPE`: MATCH_REMINDER, MATCH_FILLED, TEAMS_ASSIGNED, WAITLIST_PROMOTED, MATCH_CANCELLED, INVITE.
- `NOTIFICATION_CHANNEL`: IN_APP, TELEGRAM, EMAIL.
- `NOTIFICATION_STATUS`: PENDING, SENT, FAILED, READ.

## Жизненный цикл матча

`DRAFT → OPEN → FULL → CONFIRMED → IN_PROGRESS → FINISHED`, с ветвью `CANCELLED` почти из любого статуса. Запись открыта в статусе `OPEN`; при заполнении мест игрок попадает в `WAITLISTED`, при освобождении места первый из очереди продвигается в состав транзакцией. Подсчёт мест идёт внутри транзакции, чтобы одновременная запись не превысила лимит.
