# Срез: auth

Фундамент, от которого зависят почти все остальные срезы. Вход, токены, авторизация и сквозная обработка ошибок.

## Границы

Регистрация и вход по email с паролем, вход через Telegram (Apple — задел на будущее), выдача и ротация токенов, декораторы авторизации, единый обработчик ошибок, валидация окружения. Профили игроков (`Player`) — не здесь, это срез [player](player.md).

## Владеет таблицами

- `AuthIdentity` (provider, providerUid, userId; `@@unique(provider, providerUid)`)
- `RefreshToken` (userId, tokenHash unique, expiresAt, revokedAt?)
- Сиды ролей `Role` / `UserRole`: admin, organizer, player.

## Касается

- `User` — создание при регистрации, чтение при входе; `password` делается необязательным (для аккаунтов только через Telegram/Apple).

## Эндпоинты (под префиксом `/v1`)

- `POST /v1/auth/register` — регистрация по email + паролю.
- `POST /v1/auth/login` — вход по email + паролю.
- `POST /v1/auth/telegram` — вход через Telegram (проверка подписи данных секретом бота, find-or-create по `AuthIdentity`).
- `POST /v1/auth/refresh` — обмен refresh-токена на новую пару (ротация).
- `POST /v1/auth/logout` — отзыв refresh-токена.
- `GET /v1/auth/me` — текущий пользователь (за `authenticate`).

## Зависит от

Ничего. Брать можно сразу.

## Что сделать

1. Схема `AuthIdentity`, `RefreshToken`; `User.password` → необязательный; миграция.
2. `plugins/auth.ts`: декоратор `authenticate` (проверяет access-JWT, кладёт пользователя в запрос) и фабрика `authorize(...roles)` по `UserRole`. Сейчас `src/routes/auth.ts` ссылается на `server.authenticate`, но декоратор нигде не объявлен — объявить.
3. Реализовать пустые обработчики входа (сейчас `login`/`register` в `src/routes/auth.ts` ничего не возвращают). Хеширование пароля — argon2id.
4. `token.service`: подпись access-JWT (~15 мин), выпуск и ротация refresh (хеш в `RefreshToken`, ~30 дней).
5. `plugins/errorHandler.ts`: единый перевод доменных ошибок в HTTP-коды и устойчивый код ошибки.
6. `env.ts`: валидация переменных при старте, без запасного секрета JWT в продакшене (сейчас есть небезопасный fallback).
7. Сид ролей admin/organizer/player.

## Готово когда

Можно зарегистрироваться, войти, обновить и отозвать токены; `GET /v1/auth/me` отдаёт текущего пользователя; защищённый маршрут отклоняет запрос без токена; `authorize` пускает только нужные роли; ошибки идут через единый обработчик.

## Статус

⬜ не начат. Обновляй в [../PROGRESS.md](../PROGRESS.md).
