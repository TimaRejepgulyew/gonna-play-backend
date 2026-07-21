# Доска состояния

Координация параллельной работы. Прежде чем брать срез: убедись, что он «не начат» и его зависимости «готовы», поставь себе статус «в работе», впиши владельца и закоммить это изменение первым.

Статусы: ⬜ не начат · 🟡 в работе · ✅ готов · ⛔ заблокирован.

| Срез | Статус | Владелец | Зависит от | Файл |
|---|---|---|---|---|
| auth | 🟡 | — | — | [slices/auth.md](slices/auth.md) |
| player | ✅ | — | — | [slices/player.md](slices/player.md) |
| matches | 🟡 | — | auth, player | [slices/matches.md](slices/matches.md) |
| teams | ⬜ | — | matches, player | [slices/teams.md](slices/teams.md) |
| notifications | ⬜ | — | auth, matches | [slices/notifications.md](slices/notifications.md) |
| venues-media | 🟡 | — | auth | [slices/venues-media.md](slices/venues-media.md) |
| feature-flags | ⬜ | — | versioning, auth | [slices/feature-flags.md](slices/feature-flags.md) |
| versioning | ⬜ | — | — | [slices/versioning.md](slices/versioning.md) |

## Сводка по частично сделанным срезам (аудит 2026-07-20)

- **auth** — email и пароль, ротация refresh-токенов (Redis, с детекцией повторного использования), декораторы `authenticate`/`authorize` подключены во всех модулях. Не хватает: таблиц `AuthIdentity` и `RefreshToken`, входа через Telegram, argon2id (сейчас PBKDF2), `plugins/errorHandler.ts`, роли `organizer` в сиде.
- **matches** — CRUD, транзакционный лимит мест с переводом в FULL, матрица переходов статусов, инвалидация кеша. Модель приглашений заменена листом ожидания (`WAITLISTED` с транзакционным продвижением при выходе); статусы и поля `Match` приведены к `data-model.md` (расхождение №1 закрыто — см. журнал). Остаток среза (эндпоинты под `/v1`, teams-балансировка) — за срезами versioning и teams.
- **venues-media** — площадки закрыты моделями `Location` + `Field` с полным CRUD (вместо одиночного `Venue` из Р9). Медиа-части нет совсем: ни `VenuePhoto`, ни модуля `storage`, ни presigned-загрузок.
- **teams, notifications** — блокировка снята: поля и статусы матча приведены к `data-model.md` (расхождение №1 закрыто). Оба среза ещё не начаты и ждут готовности `matches`.

## Порядок

Сначала независимые срезы `auth`, `player`, `versioning` — их могут брать три сессии сразу. После `auth` и `player` открывается `matches`; после `matches` — `teams` и `notifications`. `venues-media` зависит только от `auth`. `feature-flags` ждёт `versioning` (таргетинг по версии).

## Журнал

Дописывай сюда одной строкой, когда меняешь статус: дата, срез, что сделано.

- 2026-07-12 — вики создана из принятых решений (каркас: overview, architecture, data-model, decisions, conventions, срезы, эта доска).
- 2026-07-20 — аудит кода против вики: player готов, auth/matches/venues-media частично, остальное не начато. Доска приведена к фактическому состоянию.
- 2026-07-20 — зафиксированы расхождения кода с `data-model.md`, требующие решения до срезов teams и notifications: (1) matches — другие наборы `PARTICIPANT_STATUS`/`MATCH_STATUS`, нет `paymentStatus`, `teamsBalancedAt`, `title`, `minPlayers`; (2) площадки — `Location` + `Field` вместо `Venue` (Р9); (3) рейтинг — модуль `PlayerRating` вместо самооценки (Р1); (4) refresh-токены в Redis вместо таблицы `RefreshToken`, модели `AuthIdentity` нет.
- 2026-07-20 — реализован шаг генерации Postman из Р6 (пункт 5 среза versioning): `@fastify/swagger` отдаёт спецификацию на `GET /docs/json`, `yarn postman:generate` собирает коллекцию и сценарный прогон (`scripts/postman-smoke.mjs`), `yarn postman:test` (newman) прогоняет все 44 эндпоинта — прогон зелёный. Сами `/v1` и разбор User-Agent из среза versioning всё ещё не сделаны.
- 2026-07-20 — matches: расхождение №1 закрыто кодом. Лист ожидания вместо приглашений (`WAITLISTED` + транзакционное продвижение при выходе на `Serializable`), наборы `MATCH_STATUS`/`PARTICIPANT_STATUS`, поля и перечисления `Match` (`title`, `minPlayers`, `visibility`, `skillMin/Max`, `paymentStatus`, `teamsBalancedAt`, `MATCH_VISIBILITY`, `PAYMENT_STATUS`, `TEAM_SIDE`) приведены к `data-model.md`; миграция домена пересобрана. Смоук `yarn postman:test` зелёный (54 запроса, 65 проверок, 0 отказов — лист ожидания и продвижение очереди проверены явно). Блокировка teams/notifications снята. Срез остаётся 🟡: эндпоинты живут под `api/match` до среза versioning, teams-балансировка — за срезом teams.
- 2026-07-20 — тулчейн обновлён и зафиксирован: Node 24 (`.nvmrc`, `engines >=22`), единый yarn classic (`package-lock.json` удалён, Dockerfile на `yarn install --frozen-lockfile`, база `node:24-alpine`), `fastify-jwt@4` мигрирован на `@fastify/jwt@10.2.0` с приведением сигнатур к Fastify 5, fastify 5.10.0/TS 5.9.3 — максимумы мажоров; `yarn install` теперь без `--ignore-engines`.
- 2026-07-21 — поднята тестовая инфраструктура на Vitest (юнит- и интеграционный прогоны, порог покрытия в `test:coverage`). Покрыты вход, игроки, локации и поля. Матчевый домен намеренно отложен: срез `matches` переписывается параллельно, координаты в `src/match/*` смещаются — покрытие возьмётся после стабилизации среза.
