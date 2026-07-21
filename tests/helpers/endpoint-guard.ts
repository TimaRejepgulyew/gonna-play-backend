// Единственный источник правды о том, к какой базе и какому Redis тестам
// вообще разрешено подключаться. Модуль общий: его вызывает и resetDatabase()
// (tests/helpers/db.ts), и global-setup (tests/setup/global-setup.ts) — второй
// пишет в базу раньше первого (upsert справочника ролей), поэтому проверять
// адрес только перед TRUNCATE поздно.

// Хосты, означающие «машина разработчика»: по ним ловятся чужие локальные
// стеки на нетестовых портах. Внутри docker-compose.test.yml адреса другие
// (`db`, `redis`), и порт там всегда штатный, поэтому проверка портов их не
// касается — за нелокальные хосты отвечает проверка имени базы ниже.
const LOCAL_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "0:0:0:0:0:0:0:1",
  "[0:0:0:0:0:0:0:1]",
  "0.0.0.0",
  "host.docker.internal",
]);

// Суффикс имени тестовой базы. Проверяется для ЛЮБОГО хоста без исключений:
// белый список портов ловит только локальные адреса, а DATABASE_URL приходит
// из оболочки (tests/setup/env.ts:11 присваивает через ??=, внешняя переменная
// побеждает) — без этой проверки staging-db.example.com:5432/app прошёл бы,
// и TRUNCATE CASCADE ушёл бы в удалённую базу. Ограничение ничего не ломает:
// и контейнерный URL, и локальный дефолт указывают на gonna_play_db_test.
const TEST_DB_NAME_SUFFIX = "_test";

// Порты по умолчанию: URL вида postgresql://user:pass@localhost/db порта не
// содержит вовсе, а клиент подставит стандартный — то есть попадёт в dev-базу.
// Без этой подстановки пустая строка не совпала бы ни с чем и проверка бы
// молча пропустила такой адрес.
const DEFAULT_POSTGRES_PORT = "5432";

// Аналог TEST_DB_NAME_SUFFIX для Redis. Имени базы у Redis нет — логическая
// база это номер (0 по умолчанию и в тестовом, и в dev-стеке), так что по
// номеру тестовый инстанс от чужого не отличить. Отличает его пространство
// ключей: tests/setup/env.ts:10 задаёт REDIS_KEY_PREFIX=gptest:, тогда как
// приложение по умолчанию живёт с "gp:" (src/config/env.ts:35). Префикс не
// защищает от FLUSHDB (команда сносит базу целиком, см. tests/helpers/db.ts:63-69),
// но служит тем же, чем суффикс _test у PostgreSQL: явным заявлением, что
// процесс сконфигурирован тестовым окружением, а не чужим.
const TEST_REDIS_PREFIX_MARKER = "test";

// Список хостов Redis, которым разрешено быть нелокальными. Ровно одно имя —
// имя сервиса из docker-compose.test.yml (`redis`), под которым тестовый Redis
// виден изнутри контейнерной сети. Белый список, а не «пропускать всё
// нелокальное»: REDIS_URL приходит из оболочки, и без него redis://
// staging-redis.example.com:6379 прошёл бы, а FLUSHDB ушёл бы в удалённый
// инстанс. Проверка портов такой адрес не ловит — она применима только к
// локальным хостам.
const ALLOWED_NON_LOCAL_REDIS_HOSTS = new Set(["redis"]);

// Белый список, а не чёрный: перечислить все чужие порты невозможно — дев-стек
// может быть опубликован на любом. Разрешён ровно один порт, тестовый.
// TEST_DB_PORT/TEST_REDIS_PORT — те же переменные, которыми docker-compose.test.yml
// (строки 33, 47) переопределяет публикуемые порты, так что настройка остаётся согласованной.
const expectedDbPort = (): string => process.env.TEST_DB_PORT ?? "5434";
const expectedRedisPort = (): string => process.env.TEST_REDIS_PORT ?? "6381";

function assertLocalPortIsTest(
  host: string,
  port: string,
  expectedPort: string,
  what: string,
  caller: string,
): void {
  if (LOCAL_HOSTS.has(host) && port !== expectedPort) {
    throw new Error(
      `${caller} отказано: ${what} указывает на ${host}:${port}, а на этой машине тестовым является только ${host}:${expectedPort}. ` +
        "Любой другой локальный порт — чужой стек (dev на 5432/6380, prod на 5433). " +
        "Тестовые порты: 5434 (PostgreSQL), 6381 (Redis) — см. docker-compose.test.yml и tests/setup/env.ts.",
    );
  }
}

/**
 * Проверяет, что DATABASE_URL ведёт в тестовую базу. Бросает ДО любого
 * обращения к базе — и разрушительного, и записывающего.
 */
export function assertTestDatabaseUrl(caller: string): void {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === "") {
    // Пустой DATABASE_URL не безобиден: Prisma подхватит значение из .env,
    // то есть из настроек разработки. tests/setup/env.ts задаёт его явно.
    throw new Error(`${caller} отказано: DATABASE_URL не задан — Prisma взяла бы адрес из .env.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(`${caller} отказано: DATABASE_URL не разбирается как URL.`);
  }

  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!databaseName.endsWith(TEST_DB_NAME_SUFFIX)) {
    throw new Error(
      `${caller} отказано: DATABASE_URL ведёт в базу "${databaseName || "(имя не указано)"}" на хосте ${parsed.hostname}, ` +
        `а тестам разрешены только базы с именем на «${TEST_DB_NAME_SUFFIX}» (штатная — gonna_play_db_test). ` +
        "Проверка порта отсекает лишь локальные адреса, поэтому имя базы проверяется у любого хоста.",
    );
  }

  assertLocalPortIsTest(
    parsed.hostname,
    parsed.port === "" ? DEFAULT_POSTGRES_PORT : parsed.port,
    expectedDbPort(),
    "DATABASE_URL",
    caller,
  );
}

/**
 * Проверяет адрес уже сконфигурированного клиента Redis — именно по нему уйдёт
 * FLUSHDB. Порт здесь всегда заполнен: ioredis подставил свой дефолт при разборе URL.
 */
export function assertTestRedisEndpoint(host: string, port: string, caller: string): void {
  const keyPrefix = process.env.REDIS_KEY_PREFIX ?? "";
  if (!keyPrefix.includes(TEST_REDIS_PREFIX_MARKER)) {
    throw new Error(
      `${caller} отказано: REDIS_KEY_PREFIX="${keyPrefix || "(не задан)"}" не выглядит тестовым — ` +
        `в нём нет «${TEST_REDIS_PREFIX_MARKER}» (штатный тестовый префикс — gptest:, см. tests/setup/env.ts). ` +
        "Проверяется у любого хоста: это аналог суффикса _test у DATABASE_URL — признак того, " +
        "что процесс сконфигурирован тестовым окружением, а не dev-овским (gp:).",
    );
  }

  if (!LOCAL_HOSTS.has(host) && !ALLOWED_NON_LOCAL_REDIS_HOSTS.has(host)) {
    throw new Error(
      `${caller} отказано: REDIS_URL указывает на нелокальный хост ${host}:${port}, ` +
        `а из нелокальных разрешён только «${[...ALLOWED_NON_LOCAL_REDIS_HOSTS].join(", ")}» — ` +
        "имя сервиса тестового Redis из docker-compose.test.yml. " +
        "FLUSHDB сносит логическую базу целиком, поэтому уходить он вправе только в тестовый инстанс.",
    );
  }

  assertLocalPortIsTest(host, port, expectedRedisPort(), "REDIS_URL", caller);
}
