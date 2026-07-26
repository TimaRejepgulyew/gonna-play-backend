# Модель данных

Диаграмма: [../diagrams/B-domain.png](../diagrams/B-domain.png)

Это источник правды по модели данных. Реализованная часть схемы (`Role`, `User`, `AuthIdentity`, `UserRole`, `Player`, `Location`, `Field`, `Match`, `MatchParticipant` и все перечисления, кроме `NOTIFICATION_*`) приведена к этому документу; `Notification` и `FeatureFlag` — целевые, в схеме их пока нет (ждут своих срезов). Где модель расходится с базовым справочником скила — см. [decisions.md](decisions.md); приоритет у этого документа.

> В схеме сейчас есть таблица `player_ratings` (`PlayerRating`), которой в этой модели нет намеренно: оценки после матча отклонены решением Р1, код с ними — отклонение к удалению (см. [decisions.md](decisions.md) и [PROGRESS.md](PROGRESS.md)).

Служебные поля есть у каждой модели и ниже не повторяются: `id Int @id @default(autoincrement())`, `createdAt`, `updatedAt`.

## Сущности

### Идентичность и доступ

**User** — учётная запись и личность для входа. Ключевые поля: `email?` (уникальный), `password?` (хеш), `phone?`, `avatar?` (строка; в перспективе — ключ объекта в хранилище), `isEmailVerified`, `isPhoneVerified`, плюс профиль (`name?`, `firstName?`, `lastName?`, `birthDate?`, `city?`, `country?`, `gender?`) и `isActive`.

Три поля стали необязательными вместе с приходом входа через провайдеров: `password` — потому что аккаунт может быть создан провайдером и пароля у него не будет вовсе; `email` — потому что Telegram почту не отдаёт ни в одном механизме (Postgres допускает сколько угодно `NULL` в уникальном индексе, поиск по почте от этого не меняется); `birthDate` — потому что даты рождения не отдаёт ни один провайдер, а вход не должен упираться в дозаполнение профиля. `firstName` / `lastName` — новые колонки: раньше эта пара была объявлена в схемах запроса, но колонок под неё не существовало и значения молча терялись на запись. Телеграмных колонок (`telegramId`, `telegramUsername`, `isTelegramVerified`) на `User` больше нет — привязка переехала в `AuthIdentity`, а «телеграм подтверждён» стало производным: привязка существует ⇒ подтверждён. Провайдеры входа хранятся отдельной таблицей `AuthIdentity`, а не колонками на `User` (Р2, пересмотр 2026-07-26).

**AuthIdentity** — способ входа, привязанный к учётной записи: `userId`, `provider` (`AUTH_PROVIDER`), `providerUserId` (идентификатор человека на стороне провайдера — `sub` у Google и Apple, `id` у Telegram; хранится строкой), `email?` и `username?` (что провайдер отдал о нём на момент входа), `lastLoginAt?`. Уникальность — `@@unique(provider, providerUserId)`: один и тот же аккаунт провайдера нельзя привязать к двум пользователям, и именно этого инварианта не было у прежней колонки `telegramId`. Второй уникальный индекс — `@@unique(userId, provider)`: у одного пользователя может быть несколько записей, но **ровно по одной на провайдера**, и это обеспечено базой, а не только проверкой в сервисе. Проверка `IdentityLinkService` читает список привязок до вставки, поэтому две одновременные привязки одного провайдера проходили бы её обе; дубликат же означал бы, что отвязка снесёт обе записи разом, а выбор долгоживущего refresh-токена Apple станет произвольным. Отказ индекса гасится в `IdentityRepository.link` и уходит тем же конвертом `AUTH_PROVIDER_ALREADY_LINKED`, что и проверка. Плюс индекс по `userId` — по нему собирается список способов входа пользователя. Связь с `User` — `onDelete: Cascade`: способ входа без пользователя бессмыслен.

Пара колонок `refreshTokenEncrypted?` / `refreshTokenUpdatedAt?` заполняется **только для `APPLE`**. В первой лежит **шифртекст**, а не токен: долгоживущий refresh-токен Apple, зашифрованный AES-256-GCM, в формате `v1.<iv>.<tag>.<ciphertext>` (ключ — `AUTH_SECRET_KEY`, см. [decisions.md](decisions.md) Р11). Открытым текстом там не лежит ничего. Нужен он ровно для одного: App Store требует, чтобы приложение со входом через Apple при удалении аккаунта отзывало выданный доступ, а для отзыва нужен тот самый токен. Вторая колонка — когда шифртекст последний раз обновлялся. Утрата ключа шифрования — деградация, а не поломка: значение перестаёт расшифровываться, удаление аккаунта продолжает работать, отзыв просто не выполняется.

**Хранение сессий (не таблицы БД).** Refresh-токены **нашего** приложения живут в **Redis** (`src/auth/refreshStore.ts`), таблицы `RefreshToken` нет и не планируется. Не путать их с `AuthIdentity.refreshTokenEncrypted`: там лежит токен *провайдера*, выданный нам Apple, и он к нашим сессиям отношения не имеет. Провайдеры входа, в отличие от сессий, — уже таблица (`AuthIdentity`), а не задел на будущее.

**WebAuthnCredential — набросок, в схеме её нет.** Passkeys приняты как направление следующей задачи ([decisions.md](decisions.md) Р10), и хранение под них примыкает ровно к `AuthIdentity`: пользователь получает ещё один тип способа входа, а не отдельный механизм. Ожидаемая форма: `userId`, `credentialId` (уникальный), `publicKey`, `signCount`, `transports`, `aaguid?`, `deviceLabel?`, `backedUp`, `lastUsedAt?`. Пока таблица не заведена, полагаться на неё нельзя.

**Что происходит с данными при удалении пользователя.** Каскадом уходят `AuthIdentity` (вместе с шифртекстом токена Apple) и `UserRole`; refresh-сессии гасятся в Redis отдельным шагом. Остаётся жить `Player`: `players.userId` обнуляется (`onDelete: SetNull`), сама строка с именем игрока сохраняется, а вместе с ней — организованные матчи, участия, лист ожидания и рейтинги. Это осознанный выбор: удаление учётной записи не разрушает историю матчей. Отсюда прямое следствие — **полной очистки персональных данных удаление аккаунта не делает**, требование вида «удалите все мои данные» им не закрыто и остаётся отдельной работой.

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
- User — AuthIdentity: один-ко-многим (`Cascade`), по записи на каждый привязанный способ входа.
- User — Role: многие-ко-многим через UserRole.
- Player — Match: один-ко-многим (как организатор, связь `MatchOrganizer`).
- Match — MatchParticipant — Player: матч и игроки многие-ко-многим через MatchParticipant.
- Location — Field: один-ко-многим.
- Match — Field: многие-к-одному (`Match.fieldId`, `onDelete: Restrict`).
- User — Notification: один-ко-многим (целевая связь, `Notification` ещё не в схеме).

## Перечисления

Именуются в стиле проекта (SCREAMING_SNAKE_CASE, значения с `@map("lowercase")`).

- `AUTH_PROVIDER`: GOOGLE, APPLE, TELEGRAM (значения в БД `google`, `apple`, `telegram`) — **уже есть** в схеме. В рантайме доступно рукописное зеркало `src/auth/constant.ts`: генерируемое перечисление реэкспортируется только как тип.
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
