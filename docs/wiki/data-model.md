# Модель данных

Диаграмма: [../diagrams/B-domain.png](../diagrams/B-domain.png)

Это источник правды по модели данных. Реальный `prisma/schema.prisma` пока отстаёт от неё (содержит только `Role`, `User`, `UserRole`, `Player`) — привести схему в соответствие с этим документом предстоит на этапе реализации. Где эта модель расходится с базовым справочником скила — см. [decisions.md](decisions.md); приоритет у этого документа.

Служебные поля есть у каждой модели и ниже не повторяются: `id Int @id @default(autoincrement())`, `createdAt`, `updatedAt`.

## Сущности

### Идентичность и доступ

**User** — учётная запись и личность для входа. Ключевые поля: `email` (уникальный), `password?` (хеш, необязателен для аккаунтов только через Telegram/Apple), `phone?`, `avatar?` (ключ объекта в хранилище), `isEmailVerified`, `isPhoneVerified`, `isTelegramVerified`, плюс профиль (`name?`, `birthDate`, `city?`, `country?`, `gender?`) и `isActive`. Внешние провайдеры входа вынесены в `AuthIdentity`, а не в колонки `User`.

**AuthIdentity** — привязка внешнего провайдера входа к пользователю: `userId`, `provider` (telegram | apple), `providerUid`. `@@unique(provider, providerUid)`. Email с паролем остаётся на `User`, а Telegram и Apple — строки здесь.

**RefreshToken** — refresh-токены для обновления сессии: `userId`, `tokenHash` (уникальный), `expiresAt`, `revokedAt?`. Ротация при каждом использовании.

**Role** — прикладная роль доступа: `name` (уникальный). **UserRole** — связь пользователя и роли: `userId`, `roleId`, `@@unique(userId, roleId)`. Это роли в системе (админ, организатор, игрок), их нельзя путать с позицией игрока на поле.

### Игрок

**Player** — игровой профиль, один-к-одному с `User`: `userId` (уникальный), `level` (`PLAYER_LEVEL`), `position` (`PLAYER_POSITION`, основная позиция), `status` (`PLAYER_STATUS`).

### Площадки и медиа

**Venue** — площадка: `name`, `city?`, `address?`, `latitude?`, `longitude?`, `capacity?`.

**VenuePhoto** — фотографии площадки, много на одну: `venueId`, `key` (объект в хранилище), `sortOrder`.

### Матчи

**Match** — матч: `organizerId` (User), `venueId?`, `title`, `format` (`MATCH_FORMAT`), `startsAt`, `durationMin`, `minPlayers`, `maxPlayers`, `price?` (Decimal), `currency?`, `visibility` (`MATCH_VISIBILITY`), `status` (`MATCH_STATUS`), `skillMin?` / `skillMax?` (`PLAYER_LEVEL`, фильтр по уровню), `description?`, `teamsBalancedAt?`.

**MatchParticipant** — запись игрока на матч: `matchId`, `userId`, `status` (`PARTICIPANT_STATUS`), `team?` (`TEAM_SIDE`, ставит разбивка), `position?` (`PLAYER_POSITION`, позиция на этот матч, может отличаться от профильной), `paymentStatus` (`PAYMENT_STATUS`), `joinedAt`. `@@unique(matchId, userId)`.

### Уведомления

**Notification** — уведомление: `userId`, `type` (`NOTIFICATION_TYPE`), `channel` (`NOTIFICATION_CHANNEL`), `title`, `body?`, `data?` (Json), `status` (`NOTIFICATION_STATUS`), `scheduledFor?`, `sentAt?`.

### Feature flags

**FeatureFlag** — флаг возможности: `key` (уникальный), `description?`, `enabled`, `rolloutPercent`, `platform?`, `minAppVersion?`. Связей с другими сущностями нет; раскатка идёт по проценту и по версии приложения (из User-Agent).

## Связи

- User — Player: один-к-одному.
- User — AuthIdentity: один-ко-многим (несколько провайдеров на пользователя).
- User — RefreshToken: один-ко-многим.
- User — Role: многие-ко-многим через UserRole.
- User — Match: один-ко-многим (как организатор).
- Match — MatchParticipant — User: матч и пользователи многие-ко-многим через MatchParticipant.
- Match — Venue: многие-к-одному.
- Venue — VenuePhoto: один-ко-многим.
- User — Notification: один-ко-многим.

## Перечисления

Именуются в стиле проекта (SCREAMING_SNAKE_CASE, значения с `@map("lowercase")`).

- `PLAYER_LEVEL`: junior, middle, senior, legend — **уже есть** в схеме.
- `PLAYER_POSITION`: goalkeeper, defender, midfielder, forward — **уже есть**.
- `PLAYER_STATUS`: active, inactive — **уже есть**.
- `MATCH_FORMAT`: FIVE, SEVEN, ELEVEN.
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
