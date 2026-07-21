// tests/setup/env.ts — грузится первым в setupFiles обоих проектов,
// до первого импорта чего-либо из src/: src/config/env.ts:3 вызывает
// dotenv.config() на импорте модуля, и обязательных переменных нет —
// у всех есть дефолты (src/config/env.ts:25-47).
process.env.NODE_ENV ??= "test";
process.env.JWT_SECRET ??= "test_secret_change_me";
// Логин бьёт по двум счётчикам (IP и email) с лимитом 10/900с — src/auth/auth.routes.ts:44-52.
// Набор логинится многократно, поэтому лимитер выключается принудительно.
process.env.RATE_LIMIT_ENABLED = "false";
process.env.REDIS_KEY_PREFIX ??= "gptest:";
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@localhost:5434/gonna_play_db_test";
// Порт 6381, а НЕ 6380: dev-Redis уже опубликован на 6380 (docker-compose.dev.yml:25).
// flushdb() в resetDatabase() (§9.8) снёс бы dev-базу. Тот же приём, что и с PostgreSQL,
// уведённым на 5434: 5432 занят dev-базой (docker-compose.dev.yml:34), 5433 — prod-базой.
process.env.REDIS_URL ??= "redis://localhost:6381";
