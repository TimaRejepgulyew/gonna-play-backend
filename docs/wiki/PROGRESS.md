# Доска состояния

Координация параллельной работы. Прежде чем брать срез: убедись, что он «не начат» и его зависимости «готовы», поставь себе статус «в работе», впиши владельца и закоммить это изменение первым.

Статусы: ⬜ не начат · 🟡 в работе · ✅ готов · ⛔ заблокирован.

| Срез | Статус | Владелец | Зависит от | Файл |
|---|---|---|---|---|
| auth | 🟡 | — | — | [slices/auth.md](slices/auth.md) |
| player | ✅ | — | — | [slices/player.md](slices/player.md) |
| matches | 🟡 | — | auth, player | [slices/matches.md](slices/matches.md) |
| teams | ⛔ | — | matches, player | [slices/teams.md](slices/teams.md) |
| notifications | ⛔ | — | auth, matches | [slices/notifications.md](slices/notifications.md) |
| venues-media | 🟡 | — | auth | [slices/venues-media.md](slices/venues-media.md) |
| feature-flags | ⬜ | — | versioning, auth | [slices/feature-flags.md](slices/feature-flags.md) |
| versioning | ⬜ | — | — | [slices/versioning.md](slices/versioning.md) |

## Сводка по частично сделанным срезам (аудит 2026-07-20)

- **auth** — email и пароль, ротация refresh-токенов (Redis, с детекцией повторного использования), декораторы `authenticate`/`authorize` подключены во всех модулях. Не хватает: таблиц `AuthIdentity` и `RefreshToken`, входа через Telegram, argon2id (сейчас PBKDF2), `plugins/errorHandler.ts`, роли `organizer` в сиде.
- **matches** — CRUD, транзакционный лимит мест с переводом в FULL, матрица переходов статусов, инвалидация кеша. Реализована модель приглашений (`INVITED`/`REQUESTED`/`DECLINED`) вместо листа ожидания из доки; статусы и поля `Match` расходятся с `data-model.md` (см. журнал).
- **venues-media** — площадки закрыты моделями `Location` + `Field` с полным CRUD (вместо одиночного `Venue` из Р9). Медиа-части нет совсем: ни `VenuePhoto`, ни модуля `storage`, ни presigned-загрузок.
- **teams, notifications** — помечены ⛔: строятся поверх полей и статусов матча, которых в текущей схеме нет; сначала нужно разрешить расхождения кода с `data-model.md`.

## Порядок

Сначала независимые срезы `auth`, `player`, `versioning` — их могут брать три сессии сразу. После `auth` и `player` открывается `matches`; после `matches` — `teams` и `notifications`. `venues-media` зависит только от `auth`. `feature-flags` ждёт `versioning` (таргетинг по версии).

## Журнал

Дописывай сюда одной строкой, когда меняешь статус: дата, срез, что сделано.

- 2026-07-12 — вики создана из принятых решений (каркас: overview, architecture, data-model, decisions, conventions, срезы, эта доска).
- 2026-07-20 — аудит кода против вики: player готов, auth/matches/venues-media частично, остальное не начато. Доска приведена к фактическому состоянию.
- 2026-07-20 — зафиксированы расхождения кода с `data-model.md`, требующие решения до срезов teams и notifications: (1) matches — приглашения вместо листа ожидания, другие наборы `PARTICIPANT_STATUS`/`MATCH_STATUS`, нет `paymentStatus`, `teamsBalancedAt`, `title`, `minPlayers`; (2) площадки — `Location` + `Field` вместо `Venue` (Р9); (3) рейтинг — модуль `PlayerRating` вместо самооценки (Р1); (4) refresh-токены в Redis вместо таблицы `RefreshToken`, модели `AuthIdentity` нет.
