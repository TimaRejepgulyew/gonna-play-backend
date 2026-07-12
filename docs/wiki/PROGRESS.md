# Доска состояния

Координация параллельной работы. Прежде чем брать срез: убедись, что он «не начат» и его зависимости «готовы», поставь себе статус «в работе», впиши владельца и закоммить это изменение первым.

Статусы: ⬜ не начат · 🟡 в работе · ✅ готов · ⛔ заблокирован.

| Срез | Статус | Владелец | Зависит от | Файл |
|---|---|---|---|---|
| auth | ⬜ | — | — | [slices/auth.md](slices/auth.md) |
| player | ⬜ | — | — | [slices/player.md](slices/player.md) |
| matches | ⬜ | — | auth, player | [slices/matches.md](slices/matches.md) |
| teams | ⬜ | — | matches, player | [slices/teams.md](slices/teams.md) |
| notifications | ⬜ | — | auth, matches | [slices/notifications.md](slices/notifications.md) |
| venues-media | ⬜ | — | auth | [slices/venues-media.md](slices/venues-media.md) |
| feature-flags | ⬜ | — | versioning, auth | [slices/feature-flags.md](slices/feature-flags.md) |
| versioning | ⬜ | — | — | [slices/versioning.md](slices/versioning.md) |

## Порядок

Сначала независимые срезы `auth`, `player`, `versioning` — их могут брать три сессии сразу. После `auth` и `player` открывается `matches`; после `matches` — `teams` и `notifications`. `venues-media` зависит только от `auth`. `feature-flags` ждёт `versioning` (таргетинг по версии).

## Журнал

Дописывай сюда одной строкой, когда меняешь статус: дата, срез, что сделано.

- 2026-07-12 — вики создана из принятых решений (каркас: overview, architecture, data-model, decisions, conventions, срезы, эта доска).
