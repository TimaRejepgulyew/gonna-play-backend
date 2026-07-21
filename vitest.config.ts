import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

// Один и тот же маппинг для обоих проектов: после развязки синглтонов (§9.3.2)
// подменять модуль `@/config/redis.js` резолвером больше не нужно — заглушка
// ставится штатным швом setRedis() в tests/setup/unit-setup.ts (§9.11).
const alias = [{ find: /^@\//, replacement: `${srcDir}/` }];

export default defineConfig({
  test: {
    // Порог покрытия и состав отчёта — §9.13.
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types/**", "src/**/*.model.ts"],
      // ВНИМАНИЕ: порог заведомо занижен и НЕ является целевым.
      // Числа сняты с прогона обоих проектов (unit + integration), где матчевых
      // тестов НЕТ вовсе: матчевый домен вынесен в отложенную Фазу 6, а
      // src/match/match.service.ts — самый крупный файл домена (сейчас 14.89%
      // покрытия строк). Пока отсрочка не снята, эти значения показывают лишь
      // «не стало хуже» и подлежат пересмотру ВВЕРХ сразу после появления
      // матчевых тестов. Не принимать их за цель по качеству покрытия.
      //
      // Факт прогона: stmts 47.25 / branch 81.15 / funcs 41.89 / lines 47.25.
      // Каждое округлено вниз до целого процента — запас на дрожание метрики
      // между прогонами, чтобы порог не ронял прогон на неизменившемся коде.
      // thresholds.autoUpdate намеренно не включён: он переписывает эту
      // конфигурацию во время прогона (§9.13).
      thresholds: {
        lines: 47,
        functions: 41,
        branches: 81,
        statements: 47,
      },
    },
    projects: [
      {
        // Юнит: инфраструктуры нет вовсе, файлы гоняются параллельно.
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          // unit-setup.ts несёт beforeEach setRedis(stub) + __reset() и afterEach
          // на пустоту missingMethods и closeRedis() — §9.11.
          setupFiles: ["tests/setup/env.ts", "tests/setup/unit-setup.ts"],
        },
      },
      {
        // Интеграция: одна общая БД, поэтому строго последовательно.
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup/env.ts", "tests/setup/integration-setup.ts"],
          globalSetup: ["tests/setup/global-setup.ts"],
          // singleFork: true загоняет ВСЕ файлы проекта в один форк, то есть они
          // и так идут строго последовательно — отдельный fileParallelism не нужен.
          // В Vitest 3.2 fileParallelism живёт только в корневом test-конфиге
          // (NonProjectOptions), внутри проекта его указать нельзя; в корень его
          // выносить тоже нельзя — это сериализовало бы и юнит-проект.
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
