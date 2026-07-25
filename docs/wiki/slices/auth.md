# Срез: auth

Фундамент, от которого зависят почти все остальные срезы. Вход, токены, авторизация и сквозная обработка ошибок.

## Границы

Регистрация и вход по email с паролем, вход через Telegram (Apple — задел на будущее), выдача и ротация токенов, декораторы авторизации, единый обработчик ошибок, валидация окружения. Профили игроков (`Player`) — не здесь, это срез [player](player.md).

## Владеет данными

- Refresh-токены — в **Redis** (`src/auth/refreshStore.ts`), с ротацией и детекцией повторного использования. Таблицы `RefreshToken` нет и не заводим (Р2, пересмотр 2026-07-23).
- Провайдеры входа — колонками на `User` (`telegramId`, `telegramUsername`, `isTelegramVerified`). Отдельной таблицы `AuthIdentity` нет; заводим её только под второй внешний провайдер (Apple).
- Сиды ролей `Role` / `UserRole`. Сейчас сид создаёт `admin` / `user` / `player` (`prisma/seeds/seed.ts`); решение Р2 подразумевает роль `organizer` — расхождение имени роли нужно разрешить (переименовать сид или решение).

## Касается

- `User` — создание при регистрации, чтение при входе. `password` в схеме обязательный (`String`); необязательным его делаем, только когда появится вход без пароля (Telegram/Apple как единственный способ).

## Эндпоинты

Сейчас под префиксом `api/auth` (перенос под `/v1` — за срезом [versioning](versioning.md)):

- `POST /api/auth/register` — регистрация; возвращает 201. Тело шире email+пароль: `birthDate` (обязательный), `phone?`, `city?`, `country?`, `gender?`, флаг `createPlayer` с `level?`/`position?` (может сразу создать `Player`).
- `POST /api/auth/login` — вход по email + паролю.
- `POST /api/auth/refresh` — обмен refresh-токена на новую пару (ротация).
- `POST /api/auth/logout` — отзыв refresh-токена.
- `GET /api/auth/me` — текущий пользователь (за `authenticate`).
- `POST /api/auth/telegram` — вход через Telegram. **Ещё не реализован** (маршрута нет).

## Зависит от

Ничего. Брать можно сразу.

Уже сделано: декораторы `authenticate` / `authorize(...roles)` (`src/plugins/auth.ts`), обработчики register/login/refresh/logout/me (`src/auth/auth.service.ts`), выпуск и ротация refresh в Redis с детекцией повторного использования, guard в `env.ts` против дефолтного JWT-секрета в продакшене, rate-limit на входе (register 5/час, login 10/15мин, refresh 30/15мин).

Остаётся сделать:

1. Хеширование пароля — перевести с текущего PBKDF2 (`src/auth/password.ts`) на argon2id.
2. `token.service`: сверить срок жизни access-JWT — сейчас дефолт 24 часа (`src/config/env.ts`), решение Р2 предполагает короткий (~15 мин); привести к согласованному значению.
3. ✅ **Сделано.** `plugins/errorHandler.ts`: центральный `setErrorHandler`/`setNotFoundHandler` (`src/plugins/errorHandler.ts`, зарегистрирован в `buildApp`) нормализует любой thrown-путь к конверту `{ code, message }`. Доменный `preSerialization`-хук в `src/app.ts` остался как есть и обслуживает return-as-value; user-модуль и `auth.service` больше не бросают встроенные ошибки Fastify.
4. `env.ts`: убрать сам запасной секрет JWT (`DEV_JWT_SECRET`), а не только запрет на него в продакшене.
5. Вход через Telegram: маршрут `POST /api/auth/telegram` (проверка подписи данных секретом бота, find-or-create по колонкам `telegramId` на `User`).
6. Разрешить имя роли: сид создаёт `user`, решение Р2 говорит `organizer`.
8. `POST /v1/auth/reset-password`: установки нового пароля по одноразовому токену нет — вместе с п. 7 снят экран `ResetPassword`.
9. `POST /v1/auth/verify-email`: подтверждения email нет, `User.isEmailVerified` выставить некому — снят экран `ConfirmEmail`.
10. ✅ **Сделано** (побочно закрыт п. 3). Дефект: при нарушении схемы тела наружу уходил HTTP 500 вместо 400 — Fastify клал строковый `FST_ERR_VALIDATION` в `code: Type.Integer()` (`src/auth/auth.model.ts:19`), и сериализация падала с `FST_ERR_FAILED_ERROR_SERIALIZATION`. Центральный `errorHandler` отдаёт числовой `code: statusCode`, который проходит `errorResponseSchema`, — валидация тела теперь корректно отвечает 400.
11. `User.password` — дефект безопасности: `GET /api/player/:id` отдаёт хеш пароля. Подробности и остальные затронутые маршруты — в срезе [player](player.md), пункт 1.

## Готово когда

Можно зарегистрироваться, войти, обновить и отозвать токены (сделано); `GET /api/auth/me` отдаёт текущего пользователя (сделано); защищённый маршрут отклоняет запрос без токена, `authorize` пускает только нужные роли (сделано); единый обработчик ошибок реализован (сделано); хеширование argon2id, вход через Telegram, сброс/подтверждение пароля — **остаётся**.

## Статус

🟡 в работе: ядро входа и токенов работает, единый `errorHandler` реализован (закрыты пункты 3 и 10); остаются argon2id, Telegram, сброс и подтверждение email и дефект из пункта 11. Обновляй в [../PROGRESS.md](../PROGRESS.md).
