import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTURE_DIR = join(REPO_ROOT, "tests/unit/fixtures/guardrails");
const FIXTURE_CONFIG_NAME = "guardrails.biome.jsonc";
const BIOME_BIN = join(REPO_ROOT, "node_modules/.bin/biome");
const PLUGIN_DIR_NAME = "biome";

type BiomeDiagnostic = {
  category: string;
  message: string;
  severity: string;
  path: string;
  line: number;
  column: number;
};

type BiomeRun = {
  exitCode: number;
  stdout: string;
  stderr: string;
  diagnostics: BiomeDiagnostic[];
  /**
   * Текст ошибки загрузки конфига или плагина, если Biome вообще не дошёл до
   * проверки файлов. Отличает «конфиг или плагин не найден» от «найден, но
   * диагностик нет»: при ошибке загрузки Biome пишет в stderr и оставляет
   * stdout пустым, поэтому разбор JSON проваливается.
   */
  loadError: string | null;
  /** Корень временного дерева, в котором прогонялся Biome. */
  root: string;
};

/**
 * Собирает строку сообщения диагностики: у части диагностик Biome отдаёт
 * message строкой, у части — массивом элементов разметки.
 */
function flattenMessage(message: unknown): string {
  if (typeof message === "string") {
    return message;
  }
  if (Array.isArray(message)) {
    return message.map(flattenMessage).join("");
  }
  if (message && typeof message === "object") {
    const record = message as Record<string, unknown>;
    if ("content" in record) {
      return flattenMessage(record.content);
    }
    if ("elements" in record) {
      return flattenMessage(record.elements);
    }
  }
  return "";
}

/**
 * Убирает из jsonc только строки-комментарии целиком. Полноценный разбор jsonc
 * здесь не нужен и не заводится сознательно: файл единственный и свой,
 * комментарии в нём пишутся отдельными строками.
 */
function stripLineComments(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

/**
 * Материализует фикстур-конфиг во временном корне.
 *
 * Почему конфиг переписывается, а не копируется как есть: `extends` в нём
 * записан путём относительно tests/unit/fixtures/guardrails/, а во временном
 * дереве этот путь никуда не ведёт. Абсолютный путь до корневого biome.json
 * подставляется здесь, чтобы сам файл в репозитории оставался валидным
 * конфигом и читался на месте.
 */
function materializeConfig(root: string): string {
  const sourcePath = join(FIXTURE_DIR, FIXTURE_CONFIG_NAME);
  const raw = readFileSync(sourcePath, "utf8");
  const parsed = JSON.parse(stripLineComments(raw)) as {
    extends?: string[];
    [key: string]: unknown;
  };

  if (Array.isArray(parsed.extends)) {
    parsed.extends = parsed.extends.map((entry) =>
      isAbsolute(entry) ? entry : resolve(FIXTURE_DIR, entry),
    );
  }

  const targetPath = join(root, FIXTURE_CONFIG_NAME);
  writeFileSync(targetPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return targetPath;
}

/**
 * Запускает настоящий бинарь Biome на дереве фикстур.
 *
 * Дерево фикстур копируется во временный каталог ВНЕ репозитория, и это не
 * удобство, а необходимость: глобы `overrides[].includes` сопоставляются с
 * путём относительно корня проекта, а корнем Biome считает каталог с корневым
 * biome.json, даже когда конфиг задан через --config-path. Оставленные на
 * месте фикстуры сопоставлялись бы как tests/unit/fixtures/guardrails/src/...,
 * то есть блоки вида `src/*​/*.repository.ts` не отобрали бы их вовсе.
 *
 * @param targets путь или пути внутри дерева фикстур, относительно
 *   tests/unit/fixtures/guardrails/
 * @param options подкоманда, автоправка и управление жизнью временного корня
 */
type RunOptions = {
  /** Подкоманда Biome: `ci` — режим гейта, `check` — по умолчанию. */
  command?: "check" | "ci";
  /** Применить автоправку (`--write`); осмысленно только с `check`. */
  write?: boolean;
  /** Прогнать в уже подготовленном временном корне вместо нового. */
  root?: string;
  /** Не удалять временный корень: следующий прогон пойдёт в нём же. */
  keepRoot?: boolean;
};

function runBiome(targets: string | string[], options: RunOptions = {}): BiomeRun {
  const targetList = Array.isArray(targets) ? targets : [targets];
  const { command = "check", write = false, keepRoot = false } = options;
  const root = options.root ?? mkdtempSync(join(tmpdir(), "guardrails-"));

  try {
    if (!options.root) {
      cpSync(FIXTURE_DIR, root, { recursive: true });
    }
    const configPath = materializeConfig(root);

    // Плагины корневого конфига резолвятся относительно каталога конфига, то
    // есть относительно временного корня. Зеркалим каталог плагинов, чтобы
    // после Task 2.11 путь ./biome/plugins/*.grit продолжал резолвиться.
    const pluginDir = join(REPO_ROOT, PLUGIN_DIR_NAME);
    if (existsSync(pluginDir)) {
      cpSync(pluginDir, join(root, PLUGIN_DIR_NAME), { recursive: true });
    }

    const result = spawnSync(
      BIOME_BIN,
      [
        command,
        ...(write ? ["--write"] : []),
        "--config-path",
        configPath,
        "--colors=off",
        "--reporter=json",
        ...targetList.map((target) => join(root, target)),
      ],
      { cwd: root, encoding: "utf8", shell: false },
    );

    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";

    let diagnostics: BiomeDiagnostic[] = [];
    let loadError: string | null = null;

    try {
      const report = JSON.parse(stdout) as {
        diagnostics?: Array<Record<string, unknown>>;
      };
      diagnostics = (report.diagnostics ?? []).map((raw) => {
        const location = (raw.location ?? {}) as Record<string, unknown>;
        const start = (location.start ?? {}) as Record<string, unknown>;
        return {
          category: String(raw.category ?? ""),
          message: flattenMessage(raw.message),
          severity: String(raw.severity ?? ""),
          path: String(location.path ?? ""),
          line: Number(start.line ?? 0),
          column: Number(start.column ?? 0),
        };
      });
    } catch {
      // Пустой или неразбираемый stdout означает, что Biome не дошёл до
      // проверки файлов: конфиг или плагин не загрузился. Текст лежит в stderr.
      loadError = stderr.trim() || "biome produced no JSON report";
    }

    return {
      exitCode: result.status ?? 1,
      stdout,
      stderr,
      diagnostics,
      loadError,
      root,
    };
  } finally {
    if (!keepRoot) {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

const RESTRICTED_IMPORTS = "lint/style/noRestrictedImports";

/** Диагностики noRestrictedImports по конкретной фикстуре дерева. */
function restrictedOn(run: BiomeRun, fixture: string): BiomeDiagnostic[] {
  return run.diagnostics.filter(
    (diagnostic) => diagnostic.category === RESTRICTED_IMPORTS && diagnostic.path.endsWith(fixture),
  );
}

describe("guardrails harness", () => {
  it("прогоняет настоящий Biome на чистой фикстуре: конфиг и плагин найдены, диагностик нет", () => {
    const run = runBiome("src/sample/clean.ts");

    // Порядок утверждений существенен: сперва «загрузилось», потом «молчит».
    // Без первой проверки тишина ничего не доказывала бы — ровно так выглядит
    // ненайденный конфиг или плагин.
    expect(run.loadError).toBeNull();
    expect(run.diagnostics).toEqual([]);
    expect(run.exitCode).toBe(0);
  });

  it("отличает ненайденный конфиг от отсутствия диагностик", () => {
    const run = spawnSync(
      BIOME_BIN,
      [
        "check",
        "--config-path",
        join(FIXTURE_DIR, "no-such-config.jsonc"),
        "--colors=off",
        "--reporter=json",
        join(FIXTURE_DIR, "src/sample/clean.ts"),
      ],
      { cwd: REPO_ROOT, encoding: "utf8", shell: false },
    );

    expect(run.status).not.toBe(0);
    expect(run.stdout ?? "").toBe("");
    expect(run.stderr ?? "").toContain("configuration");
  });
});

/**
 * Фикстуры иерархии импортов. Пути внутри дерева фикстур подобраны так, чтобы
 * относительно временного корня они буквально совпадали с глобами блоков
 * overrides: src/*​/*.repository.ts, src/*​/*.service.ts, src/utils/** и так
 * далее. Прогон идёт только через runBiome — прямой вызов Biome по пути внутри
 * репозитория дал бы ложный зелёный, потому что overrides[].includes меряются
 * от корня проекта.
 */
const HIERARCHY_FIXTURES = {
  relativeCross: "src/relative/relative.model.ts",
  generatedAccess: "src/genaccess/genaccess.repository.ts",
  serviceErrorCodes: "src/svc/svc.service.ts",
  serviceTypeOnly: "src/svc/typeonly.service.ts",
  repositoryImportsController: "src/repolayer/repolayer.repository.ts",
  controllerImportsController: "src/ctllayer/ctllayer.controller.ts",
  aliasFromCommonLayer: "src/utils/alias-probe.ts",
} as const;

const LAYERLESS_FIXTURES = [
  "src/layerless/constant.ts",
  "src/layerless/password.ts",
  "src/layerless/refreshStore.ts",
  "src/layerless/types.ts",
];

describe("guardrails: иерархия импортов", () => {
  it("U1: относительный кросс-модульный импорт даёт диагностику", () => {
    const run = runBiome(HIERARCHY_FIXTURES.relativeCross);

    expect(run.loadError).toBeNull();
    const found = restrictedOn(run, HIERARCHY_FIXTURES.relativeCross);
    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(2);
  });

  it("U2: обращение к сгенерированному клиенту даёт диагностику", () => {
    const run = runBiome(HIERARCHY_FIXTURES.generatedAccess);

    expect(run.loadError).toBeNull();
    const found = restrictedOn(run, HIERARCHY_FIXTURES.generatedAccess);
    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(2);
  });

  it("P1 внутри service-файла: рантайм-импорт errorCodes красный, типовой импорт чистый", () => {
    // Позитив и негатив прогоняются вместе намеренно: «ноль диагностик на
    // типовом импорте» ничего не доказывает, пока в том же прогоне не сработал
    // позитив — при выключенном правиле молчат оба.
    const run = runBiome([
      HIERARCHY_FIXTURES.serviceErrorCodes,
      HIERARCHY_FIXTURES.serviceTypeOnly,
    ]);

    expect(run.loadError).toBeNull();

    const positive = restrictedOn(run, HIERARCHY_FIXTURES.serviceErrorCodes);
    expect(positive).toHaveLength(1);
    // Текст message сверяется, а не только имя правила: без него диагностика
    // неотличима от случайного совпадения с U1 или U2.
    expect(positive[0]?.message).toContain("@/constants/errorCodes.js");
    expect(positive[0]?.message).toContain("docs/wiki/conventions.md:34");

    expect(restrictedOn(run, HIERARCHY_FIXTURES.serviceTypeOnly)).toEqual([]);
  });

  it("иерархия слоёв: репозиторий с импортом контроллера красный, контроллер с тем же импортом чистый", () => {
    const run = runBiome([
      HIERARCHY_FIXTURES.repositoryImportsController,
      HIERARCHY_FIXTURES.controllerImportsController,
    ]);

    expect(run.loadError).toBeNull();

    const positive = restrictedOn(run, HIERARCHY_FIXTURES.repositoryImportsController);
    expect(positive).toHaveLength(1);
    expect(positive[0]?.line).toBe(2);

    expect(restrictedOn(run, HIERARCHY_FIXTURES.controllerImportsController)).toEqual([]);
  });

  it("алиасная форма запрета: общий низ с импортом домена даёт диагностику", () => {
    const run = runBiome(HIERARCHY_FIXTURES.aliasFromCommonLayer);

    expect(run.loadError).toBeNull();
    const found = restrictedOn(run, HIERARCHY_FIXTURES.aliasFromCommonLayer);
    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(2);
  });

  it("покрытие блоками: беслойные файлы домена получают U1 через базовый блок B0", () => {
    const run = runBiome(LAYERLESS_FIXTURES);

    expect(run.loadError).toBeNull();

    const uncovered = LAYERLESS_FIXTURES.filter(
      (fixture) => restrictedOn(run, fixture).length === 0,
    );
    // Сообщение называет конкретный непокрытый файл: это отличает «B0 нет
    // вовсе» от «B0 есть, но стоит не первым и перебит послойным блоком».
    expect(uncovered, `не покрыты базовым блоком B0: ${uncovered.join(", ") || "-"}`).toEqual([]);
  });

  it("фикстуры не дают посторонних диагностик, кроме проверяемого правила", () => {
    const run = runBiome([...Object.values(HIERARCHY_FIXTURES), ...LAYERLESS_FIXTURES]);

    expect(run.loadError).toBeNull();

    const foreign = run.diagnostics.filter(
      (diagnostic) => diagnostic.category !== RESTRICTED_IMPORTS,
    );
    expect(foreign.map((diagnostic) => `${diagnostic.path}: ${diagnostic.category}`)).toEqual([]);
  });
});

/**
 * Опознание конкретного запрета по тексту сообщения. Одной категории
 * `noRestrictedImports` мало: все три запрета приходят под ней, и без разбора
 * сообщения диагностика U1 сошла бы за пропавшую P1.
 */
const RULE_MESSAGE: Record<"U1" | "U2" | "P1", string> = {
  U1: "через алиас @/",
  U2: "getPrisma()",
  P1: "@/constants/errorCodes.js",
};

/**
 * Матрица «блок overrides × запрет». Семь блоков B0–B6 дословно повторяют один
 * и тот же набор U1 + U2 + P1, потому что опции правила в overrides замещаются,
 * а не сливаются. Пропажа одной строки в одном блоке снимает защиту ровно на
 * одном слое и больше нигде — поймать это можно только пофайловой матрицей.
 *
 * Путь каждой фикстуры подобран так, чтобы ПОСЛЕДНИМ совпавшим блоком был
 * именно проверяемый: применяются опции последнего совпадения, поэтому,
 * например, src/b3cov/u1.service.ts доказывает набор B3, а не B0.
 *
 * B5 — единственный блок без U2: src/config/prisma.ts и src/types/prisma.ts и
 * есть легальные точки доступа к сгенерированному клиенту. Он же исчерпывает
 * свои два пути, поэтому обе его фикстуры лежат по этим самым путям.
 */
const BLOCK_COVERAGE: Record<string, Partial<Record<"U1" | "U2" | "P1", string>>> = {
  B0: {
    U1: "src/b0cov/u1.ts",
    U2: "src/b0cov/u2.ts",
    P1: "src/b0cov/p1.ts",
  },
  B1: {
    U1: "src/b1cov/u1.model.ts",
    U2: "src/b1cov/u2.model.ts",
    P1: "src/b1cov/p1.model.ts",
  },
  B2: {
    U1: "src/b2cov/u1.repository.ts",
    U2: "src/b2cov/u2.repository.ts",
    P1: "src/b2cov/p1.repository.ts",
  },
  B3: {
    U1: "src/b3cov/u1.service.ts",
    U2: "src/b3cov/u2.service.ts",
    P1: "src/b3cov/p1.service.ts",
  },
  B4: {
    U1: "src/utils/b4-u1.ts",
    U2: "src/utils/b4-u2.ts",
    P1: "src/utils/b4-p1.ts",
  },
  B5: {
    U1: "src/config/prisma.ts",
    P1: "src/types/prisma.ts",
  },
  B6: {
    U1: "src/b6cov/u1.controller.ts",
    U2: "src/b6cov/u2.controller.ts",
    P1: "src/b6cov/p1.controller.ts",
  },
};

const COVERAGE_CASES = Object.entries(BLOCK_COVERAGE).flatMap(([block, rules]) =>
  Object.entries(rules).map(([rule, fixture]) => ({
    block,
    rule: rule as "U1" | "U2" | "P1",
    fixture: fixture as string,
  })),
);

describe("guardrails: покрытие блоков overrides запретами U1/U2/P1", () => {
  it("каждый блок B0–B6 держит свой набор запретов", () => {
    // Один прогон на всю матрицу, а не двадцать один: прогон копирует дерево
    // фикстур и поднимает Biome заново, а фикстуры друг на друга не влияют.
    const run = runBiome(COVERAGE_CASES.map(({ fixture }) => fixture));

    expect(run.loadError).toBeNull();

    const failures = COVERAGE_CASES.flatMap(({ block, rule, fixture }) => {
      const found = restrictedOn(run, fixture);
      if (found.length !== 1) {
        return [`${block}/${rule} (${fixture}): диагностик ${found.length}, ожидалась 1`];
      }
      const message = found[0]?.message ?? "";
      return message.includes(RULE_MESSAGE[rule])
        ? []
        : [`${block}/${rule} (${fixture}): сработал другой запрет — ${message}`];
    });
    expect(failures, `потеряно покрытие: ${failures.join("; ") || "-"}`).toEqual([]);
  });

  it("фикстуры покрытия не дают посторонних диагностик", () => {
    const run = runBiome(COVERAGE_CASES.map(({ fixture }) => fixture));

    expect(run.loadError).toBeNull();

    const foreign = run.diagnostics.filter(
      (diagnostic) => diagnostic.category !== RESTRICTED_IMPORTS,
    );
    expect(foreign.map((diagnostic) => `${diagnostic.path}: ${diagnostic.category}`)).toEqual([]);
  });
});

/**
 * Послабление `"noRestrictedImports": "warn"` для src/player/player.service.ts
 * (`biome.json:436-443`) записано голой строкой степени и опирается на то, что
 * такая форма наследует набор паттернов последнего совпавшего блока (B3).
 * Худший исход — не «понизилось до warn», а «опции сброшены, защита исчезла»;
 * различить их можно только требуя диагностику именно со степенью warn.
 */
const WARN_RELAXED_FIXTURE = "src/player/player.service.ts";

describe("guardrails: послабление до warn не сбрасывает опции", () => {
  it("все три запрета остаются на месте и приходят со степенью warn", () => {
    const run = runBiome(WARN_RELAXED_FIXTURE);

    expect(run.loadError).toBeNull();

    const found = restrictedOn(run, WARN_RELAXED_FIXTURE);
    const missing = (["U1", "U2", "P1"] as const).filter(
      (rule) =>
        !found.some(
          (diagnostic) =>
            diagnostic.message.includes(RULE_MESSAGE[rule]) && diagnostic.severity === "warning",
        ),
    );
    expect(missing, `запреты без warn-диагностики: ${missing.join(", ") || "-"}`).toEqual([]);

    // Ни один из трёх не должен остаться error: это означало бы, что блок
    // послабления файл не отобрал и тест доказывает поведение другого блока.
    expect(found.map((diagnostic) => diagnostic.severity)).toEqual([
      "warning",
      "warning",
      "warning",
    ]);
  });
});

const EXCESSIVE_LINES = "lint/style/noExcessiveLinesPerFile";

/**
 * Фикстура размера файла: 250 непустых строк и ни одной пустой. Порог для
 * src/** — 200, поэтому файл обязан нарушать даже при skipBlankLines: true.
 * Лежит вне путей послойных блоков, чтобы диагностика размера не смешивалась с
 * иерархией импортов.
 */
const OVERSIZE_FIXTURE = "src/oversize/oversize.ts";

describe("guardrails: noExcessiveLinesPerFile", () => {
  it("фикстура из 250 строк даёт диагностику правила размера файла", () => {
    const run = runBiome(OVERSIZE_FIXTURE);

    expect(run.loadError).toBeNull();

    const found = run.diagnostics.filter(
      (diagnostic) =>
        diagnostic.category === EXCESSIVE_LINES && diagnostic.path.endsWith(OVERSIZE_FIXTURE),
    );
    expect(found).toHaveLength(1);
  });

  it("фикстура размера не задевает посторонние правила", () => {
    const run = runBiome(OVERSIZE_FIXTURE);

    expect(run.loadError).toBeNull();

    const foreign = run.diagnostics.filter((diagnostic) => diagnostic.category !== EXCESSIVE_LINES);
    expect(foreign.map((diagnostic) => `${diagnostic.path}: ${diagnostic.category}`)).toEqual([]);
  });
});

/**
 * Диагностики GritQL-плагина Biome отдаёт одной категорией `plugin` — своего
 * имени у плагина в отчёте нет. Отсюда и фильтрация по фикстуре: отличить два
 * разных плагина по категории нельзя, а по пути файла — можно.
 */
const PLUGIN_CATEGORY = "plugin";

const NESTED_LOOPS = {
  direct: "src/nested-loops/direct.ts",
  sequential: "src/nested-loops/sequential.ts",
  throughSwitch: "src/nested-loops/through-switch.ts",
  inCallback: "src/nested-loops/in-callback.ts",
} as const;

/**
 * Матрица форм цикла: каждая из пяти форм проверяется и во внешней позиции (с
 * внутренним классическим `for`), и во внутренней (с внешним классическим
 * `for`). Ключ объекта попадает в сообщение о провале, поэтому частичный отказ
 * — типичный симптом неверного имени узла для одной формы — называет
 * конкретную форму и позицию, а не сводится к общему «упало».
 */
const LOOP_FORM_MATRIX: Record<string, string> = {
  "внешний for": "src/nested-loops/matrix/outer-for.ts",
  "внешний for...of": "src/nested-loops/matrix/outer-for-of.ts",
  "внешний for...in": "src/nested-loops/matrix/outer-for-in.ts",
  "внешний while": "src/nested-loops/matrix/outer-while.ts",
  "внешний do...while": "src/nested-loops/matrix/outer-do-while.ts",
  "внутренний for": "src/nested-loops/matrix/inner-for.ts",
  "внутренний for...of": "src/nested-loops/matrix/inner-for-of.ts",
  "внутренний for...in": "src/nested-loops/matrix/inner-for-in.ts",
  "внутренний while": "src/nested-loops/matrix/inner-while.ts",
  "внутренний do...while": "src/nested-loops/matrix/inner-do-while.ts",
};

/** Диагностики плагина по конкретной фикстуре дерева. */
function pluginOn(run: BiomeRun, fixture: string): BiomeDiagnostic[] {
  return run.diagnostics.filter(
    (diagnostic) => diagnostic.category === PLUGIN_CATEGORY && diagnostic.path.endsWith(fixture),
  );
}

/**
 * Номер строки внешнего цикла фикстуры. В каждой позитивной фикстуре строка
 * `// OUTER` стоит ровно над внешним циклом — так тест утверждает «диагностика
 * на внешнем цикле», не завязываясь на конкретную верстку файла.
 */
function outerLoopLine(fixture: string): number {
  const lines = readFileSync(join(FIXTURE_DIR, fixture), "utf8").split("\n");
  const markerIndex = lines.findIndex((line) => line.trim() === "// OUTER");
  if (markerIndex < 0) {
    throw new Error(`в фикстуре ${fixture} нет маркера // OUTER`);
  }
  return markerIndex + 2;
}

describe("guardrails: вложенные циклы", () => {
  it("цикл внутри цикла даёт диагностику, два последовательных цикла — нет", () => {
    // Позитив и негатив живут в одном прогоне намеренно и связаны именно так:
    // «ноль диагностик на последовательных циклах» при неработающем плагине
    // проходит сам собой. Утверждение о негативе имеет смысл только на фоне
    // сработавшего в том же прогоне позитива.
    const run = runBiome([NESTED_LOOPS.direct, NESTED_LOOPS.sequential]);

    expect(run.loadError).toBeNull();

    const positive = pluginOn(run, NESTED_LOOPS.direct);
    expect(positive).toHaveLength(1);
    expect(positive[0]?.line).toBe(outerLoopLine(NESTED_LOOPS.direct));

    expect(pluginOn(run, NESTED_LOOPS.sequential)).toEqual([]);
  });

  it("цикл внутри switch внутри цикла: ровно одна диагностика, на внешнем цикле", () => {
    const run = runBiome(NESTED_LOOPS.throughSwitch);

    expect(run.loadError).toBeNull();

    const found = pluginOn(run, NESTED_LOOPS.throughSwitch);
    // Ровно одна: транзитивность `contains` обязана поймать спрятанный за
    // switch внутренний цикл один раз, а не по разу на каждый уровень.
    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(outerLoopLine(NESTED_LOOPS.throughSwitch));
  });

  it("цикл внутри коллбэка внутри цикла диагностики не даёт", () => {
    // Тот же приём связки: без позитива в этом же прогоне тишина на коллбэке
    // доказывала бы не границу функции, а нерабочий плагин.
    const run = runBiome([NESTED_LOOPS.inCallback, NESTED_LOOPS.direct]);

    expect(run.loadError).toBeNull();
    expect(pluginOn(run, NESTED_LOOPS.direct)).toHaveLength(1);

    expect(pluginOn(run, NESTED_LOOPS.inCallback)).toEqual([]);
  });

  it("все пять форм цикла ловятся и во внешней, и во внутренней позиции", () => {
    const entries = Object.entries(LOOP_FORM_MATRIX);
    const run = runBiome(entries.map(([, fixture]) => fixture));

    expect(run.loadError).toBeNull();

    const missed = entries
      .filter(([, fixture]) => pluginOn(run, fixture).length !== 1)
      .map(([form, fixture]) => `${form} (${fixture}): ${pluginOn(run, fixture).length}`);
    expect(missed, `формы без ровно одной диагностики: ${missed.join("; ") || "-"}`).toEqual([]);

    const misplaced = entries
      .filter(([, fixture]) => {
        const found = pluginOn(run, fixture);
        return found.length === 1 && found[0]?.line !== outerLoopLine(fixture);
      })
      .map(([form]) => form);
    expect(misplaced, `диагностика не на внешнем цикле: ${misplaced.join("; ") || "-"}`).toEqual(
      [],
    );
  });

  it("фикстуры вложенных циклов не дают посторонних диагностик", () => {
    const run = runBiome([...Object.values(NESTED_LOOPS), ...Object.values(LOOP_FORM_MATRIX)]);

    expect(run.loadError).toBeNull();

    const foreign = run.diagnostics.filter((diagnostic) => diagnostic.category !== PLUGIN_CATEGORY);
    expect(foreign.map((diagnostic) => `${diagnostic.path}: ${diagnostic.category}`)).toEqual([]);
  });
});

const FORMAT_CATEGORY = "format";
const ORGANIZE_IMPORTS = "assist/source/organizeImports";

/**
 * Фикстуры формата и порядка импортов. Форматтер и organizeImports уже
 * включены (`biome.json:18-34`), поэтому фазы red здесь нет: тесты фиксируют
 * существующее поведение как регрессионную гарантию — нарушение обязано
 * ронять именно ci-режим, а не молча правиться в редакторе.
 *
 * Прогон идёт подкомандой `ci`, той же, что стоит в гейте: `check` без
 * `--write` даёт тот же результат, но доказывал бы поведение другой команды.
 */
const FORMAT_FIXTURE = "src/format/format.ts";
const IMPORT_ORDER_FIXTURE = "src/import-order/import-order.ts";

describe("guardrails: формат и порядок импортов", () => {
  it("ci на фикстуре нарушенного формата: ненулевой код и диагностика форматтера", () => {
    const run = runBiome(FORMAT_FIXTURE, { command: "ci" });

    expect(run.loadError).toBeNull();
    expect(run.exitCode).not.toBe(0);

    const categories = run.diagnostics
      .filter((diagnostic) => diagnostic.path.endsWith(FORMAT_FIXTURE))
      .map((diagnostic) => diagnostic.category);
    expect(categories).toEqual([FORMAT_CATEGORY]);
  });

  it("ci на фикстуре порядка импортов даёт organizeImports, а не форматтер", () => {
    const run = runBiome(IMPORT_ORDER_FIXTURE, { command: "ci" });

    expect(run.loadError).toBeNull();
    expect(run.exitCode).not.toBe(0);

    const own = run.diagnostics.filter((diagnostic) =>
      diagnostic.path.endsWith(IMPORT_ORDER_FIXTURE),
    );
    // Сверяется равенство списка, а не наличие нужной категории: фикстура
    // отформатирована верно, и соседняя диагностика форматтера означала бы, что
    // тест доказывает не то правило.
    expect(own.map((diagnostic) => diagnostic.category)).toEqual([ORGANIZE_IMPORTS]);
    expect(own[0]?.line).toBe(5);
  });

  it("после --write на временной копии повторный ci даёт нулевой код", () => {
    // Автоправка применяется к копии во временном корне: --write по
    // отслеживаемым файлам репозитория запрещён.
    const before = runBiome([FORMAT_FIXTURE, IMPORT_ORDER_FIXTURE], {
      command: "ci",
      keepRoot: true,
    });

    try {
      expect(before.loadError).toBeNull();
      expect(before.exitCode).not.toBe(0);

      const written = runBiome([FORMAT_FIXTURE, IMPORT_ORDER_FIXTURE], {
        command: "check",
        write: true,
        root: before.root,
        keepRoot: true,
      });
      expect(written.exitCode).toBe(0);

      const after = runBiome([FORMAT_FIXTURE, IMPORT_ORDER_FIXTURE], {
        command: "ci",
        root: before.root,
        keepRoot: true,
      });
      expect(after.loadError).toBeNull();
      expect(after.diagnostics).toEqual([]);
      expect(after.exitCode).toBe(0);
    } finally {
      rmSync(before.root, { recursive: true, force: true });
    }
  });

  it("прогон тестов не изменяет отслеживаемые фикстуры в репозитории", () => {
    // Сторож к предыдущему тесту: --write обязан работать по временной копии.
    // Читается исходник, а не копия, поэтому маркеры нарушений обязаны остаться
    // на месте после всех прогонов.
    const format = readFileSync(join(FIXTURE_DIR, FORMAT_FIXTURE), "utf8");
    expect(format).toContain("'guardrails'");
    expect(format).toContain("    label:");

    const order = readFileSync(join(FIXTURE_DIR, IMPORT_ORDER_FIXTURE), "utf8");
    const importLines = order
      .split("\n")
      .filter((line) => line.startsWith("import"))
      .map((line) => line.trim());
    expect(importLines[0]).toContain("./local.js");
    expect(importLines[2]).toContain('"fastify"');
  });
});
