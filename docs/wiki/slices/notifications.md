# Срез: notifications

Уведомления и фоновые задачи вокруг матчей.

## Границы

Хранение уведомлений, отправка через каналы (в приложении, Telegram, email) и планировщик фоновых задач. Своё содержимое событий берёт из матчей.

## Владеет таблицами

- `Notification` (userId, type, channel, title, body?, data?, status, scheduledFor?, sentAt?)
- Перечисления: `NOTIFICATION_TYPE`, `NOTIFICATION_CHANNEL`, `NOTIFICATION_STATUS`.

## Касается

- `User` — получатель; для Telegram-канала нужна привязка Telegram — колонки `telegramId` / `telegramUsername` на `User` (отдельной таблицы `AuthIdentity` нет, см. [auth](auth.md)).
- `Match` / `MatchParticipant` — источники событий (напоминание, заполнение, разбивка, продвижение из листа ожидания, отмена) — чтение.

## Эндпоинты (под префиксом `/v1`)

- `GET /v1/notifications` — список уведомлений пользователя.
- `POST /v1/notifications/:id/read` — пометить прочитанным.

## Зависит от

`auth` (пользователи, привязка Telegram), `matches` (события).

## Что сделать

1. Схема `Notification` и перечисления; миграция.
2. `notification.service.enqueue({userId, type, channel, …})` — пишет строку в статусе `PENDING`; список и пометка прочитанным.
3. Диспетчер: берёт `PENDING`, шлёт через адаптер канала, переводит в `SENT` или `FAILED`.
4. `channels/`: `inApp` (просто строка в БД, читается через API), `telegram` (бот по привязке telegram), `email`.
5. `jobs/scheduler.ts` на `node-cron`: напоминание за час до матча, закрытие записи по времени, продвижение листа ожидания, отметка не пришедших. Замечание: при нескольких копиях сервиса `node-cron` сработает в каждой — путь роста к очереди на Redis зафиксирован в [../decisions.md](../decisions.md) (Р8).

## Готово когда

`enqueue` и диспетчеризация работают; список и пометка прочитанным доступны через API; Telegram-канал доставляет сообщение; задачи планировщика срабатывают.

## Статус

⬜ не начат. Обновляй в [../PROGRESS.md](../PROGRESS.md).
