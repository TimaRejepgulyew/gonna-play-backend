import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyExemptions,
  biomeCommand,
  CHECKS,
  checkSource,
  classifyLines,
  collectStats,
  EXEMPTIONS,
  EXIT,
  formatDiagnostic,
  isInScope,
  isPathExcluded,
  LINE_KIND,
  parseHookEvent,
  SCOPE_EXCLUDES,
  THRESHOLDS,
} from "../../scripts/check-comments.mjs";

type Diagnostic = {
  path: string;
  line: number;
  column: number;
  check: string;
  message: string;
  hint: string;
};

const diagnose = (source: string, path = "src/x/y.ts"): Diagnostic[] =>
  checkSource(source, path) as Diagnostic[];

const checksOf = (source: string) => diagnose(source).map((d) => d.check);

const commentBlock = (count: number, text = "объясняет почему") =>
  Array.from({ length: count }, (_, i) => `// ${text} ${i + 1}`);

const codeBlock = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => `export const v${offset + i} = "v";`);

const fixture = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`./fixtures/check-comments/${name}`, import.meta.url)),
    "utf8",
  );

const kinds = (source: string) =>
  (classifyLines(source) as Array<{ kind: string }>).map((line) => line.kind);

describe("scanner: литералы не превращаются в комментарии", () => {
  it("`//` внутри строкового литерала остаётся кодом", () => {
    expect(kinds(`const u = "https://example.com";`)).toEqual([LINE_KIND.CODE]);
    expect(kinds(`const u = 'https://example.com';`)).toEqual([LINE_KIND.CODE]);
  });

  it("`//` внутри шаблонной строки остаётся кодом, в том числе с интерполяцией", () => {
    expect(kinds(`const u = \`https://\${host}/x\`;`)).toEqual([LINE_KIND.CODE]);
    expect(kinds("const u = `// not a comment`;")).toEqual([LINE_KIND.CODE]);
  });

  it("многострочная шаблонная строка не считается комментарием ни на одной строке", () => {
    const source = ["const t = `", "// not a comment", "`;"].join("\n");
    expect(kinds(source)).toEqual([LINE_KIND.CODE, LINE_KIND.CODE, LINE_KIND.CODE]);
  });

  it("`//` внутри regex-литерала остаётся кодом", () => {
    expect(kinds(String.raw`const re = /\/\//;`)).toEqual([LINE_KIND.CODE]);
    expect(kinds(String.raw`if (/[/]\//.test(s)) return 1;`)).toEqual([LINE_KIND.CODE]);
  });

  it("деление не принимается за regex-литерал", () => {
    const source = ["const ratio = a / b;", "// объясняет почему"].join("\n");
    expect(kinds(source)).toEqual([LINE_KIND.CODE, LINE_KIND.COMMENT]);
  });

  it("строка кода с хвостовым комментарием остаётся кодом, но текст комментария виден", () => {
    const [line] = classifyLines(`const a = 1; // хвост`) as Array<{
      kind: string;
      comment: string;
    }>;
    expect(line.kind).toBe(LINE_KIND.CODE);
    expect(line.comment).toBe("хвост");
  });
});

describe("scanner: блочные комментарии и JSDoc — разные состояния", () => {
  it("многострочный /* */ закрывается на */ и возвращает состояние кода", () => {
    const source = ["/* первая", "   вторая */", "const a = 1;"].join("\n");
    expect(kinds(source)).toEqual([LINE_KIND.COMMENT, LINE_KIND.COMMENT, LINE_KIND.CODE]);
  });

  it("JSDoc-блок помечается отдельным состоянием", () => {
    const source = ["/**", " * Документация.", " */", "export const a = 1;"].join("\n");
    expect(kinds(source)).toEqual([
      LINE_KIND.JSDOC,
      LINE_KIND.JSDOC,
      LINE_KIND.JSDOC,
      LINE_KIND.CODE,
    ]);
  });

  it("код после закрытия блока на той же строке — код", () => {
    expect(kinds("/* note */ const a = 1;")).toEqual([LINE_KIND.CODE]);
    expect(kinds("/** doc */ const a = 1;")).toEqual([LINE_KIND.CODE]);
  });

  it("пустая строка внутри блочного комментария остаётся пустой", () => {
    const source = ["/*", "", "*/"].join("\n");
    expect(kinds(source)).toEqual([LINE_KIND.COMMENT, LINE_KIND.BLANK, LINE_KIND.COMMENT]);
  });

  it("`//` внутри блочного комментария не открывает второй комментарий", () => {
    const source = ["/*", " // внутри", "*/", "const a = 1;"].join("\n");
    expect(kinds(source)).toEqual([
      LINE_KIND.COMMENT,
      LINE_KIND.COMMENT,
      LINE_KIND.COMMENT,
      LINE_KIND.CODE,
    ]);
  });

  it("`/*` внутри строкового литерала не открывает блок", () => {
    const source = [`const s = "/*";`, "const a = 1;"].join("\n");
    expect(kinds(source)).toEqual([LINE_KIND.CODE, LINE_KIND.CODE]);
  });
});

describe("scanner: перевод строки и кодировка", () => {
  it("CRLF-файл даёт то же число строк и ту же классификацию, что LF-версия", () => {
    const lf = fixture("mixed-sample.lf.txt");
    const crlf = fixture("mixed-sample.crlf.txt");
    expect(crlf).toContain("\r\n");
    expect(crlf.replace(/\r\n/g, "\n")).toBe(lf);

    const lfLines = classifyLines(lf) as Array<{ kind: string; comment: string }>;
    const crlfLines = classifyLines(crlf) as Array<{ kind: string; comment: string }>;
    expect(crlfLines.length).toBe(lfLines.length);
    expect(crlfLines.map((l) => l.kind)).toEqual(lfLines.map((l) => l.kind));
    expect(crlfLines.map((l) => l.comment)).toEqual(lfLines.map((l) => l.comment));
    expect(lfLines.map((l) => l.kind)).toEqual([
      LINE_KIND.CODE,
      LINE_KIND.JSDOC,
      LINE_KIND.JSDOC,
      LINE_KIND.JSDOC,
      LINE_KIND.CODE,
      LINE_KIND.BLANK,
      LINE_KIND.COMMENT,
      LINE_KIND.COMMENT,
      LINE_KIND.CODE,
      LINE_KIND.COMMENT,
    ]);
  });

  it("одиночный CR тоже считается переводом строки", () => {
    expect(kinds("const a = 1;\r// хвост")).toEqual([LINE_KIND.CODE, LINE_KIND.COMMENT]);
  });

  it("не-ASCII в комментарии не ломает классификацию и текст", () => {
    const [line] = classifyLines("// объясняет почему — не что 🚀") as Array<{
      kind: string;
      comment: string;
    }>;
    expect(line.kind).toBe(LINE_KIND.COMMENT);
    expect(line.comment).toBe("объясняет почему — не что 🚀");
  });

  it("нумерация строк начинается с единицы и идёт подряд", () => {
    const lines = classifyLines("const a = 1;\n\n// note") as Array<{ line: number }>;
    expect(lines.map((l) => l.line)).toEqual([1, 2, 3]);
  });
});

describe("check comment-run: длина непрерывной серии", () => {
  it("серия ровно на пороге чиста, серия на единицу длиннее даёт одну диагностику", () => {
    const clean = ["const a = 1;", ...commentBlock(THRESHOLDS.commentRun), "const b = 2;"].join(
      "\n",
    );
    expect(diagnose(clean)).toEqual([]);

    const dirty = ["const a = 1;", ...commentBlock(THRESHOLDS.commentRun + 1), "const b = 2;"].join(
      "\n",
    );
    const found = diagnose(dirty);
    expect(found).toHaveLength(1);
    expect(found[0].check).toBe(CHECKS.COMMENT_RUN);
    expect(found[0].line).toBe(2);
    expect(found[0].column).toBe(1);
    expect(found[0].message).toContain(String(THRESHOLDS.commentRun + 1));
    expect(found[0].message).toContain(String(THRESHOLDS.commentRun));
  });

  it("пустая строка разрывает серию", () => {
    const source = [...commentBlock(8), "", ...commentBlock(8)].join("\n");
    expect(checksOf(source)).not.toContain(CHECKS.COMMENT_RUN);
  });

  it("JSDoc-блок не удлиняет серию и не считается её частью", () => {
    const source = [
      ...commentBlock(8),
      "/**",
      " * Документация публичного контракта.",
      " */",
      ...commentBlock(8),
      "export const a = 1;",
    ].join("\n");
    expect(checksOf(source)).not.toContain(CHECKS.COMMENT_RUN);
    expect(collectStats(source).maxRun).toBe(8);
  });

  it("две отдельные длинные серии дают по диагностике каждая", () => {
    const source = [
      ...commentBlock(THRESHOLDS.commentRun + 1),
      "const a = 1;",
      ...commentBlock(THRESHOLDS.commentRun + 2),
      "const b = 2;",
    ].join("\n");
    const runs = diagnose(source).filter((d) => d.check === CHECKS.COMMENT_RUN);
    expect(runs.map((d) => d.line)).toEqual([1, THRESHOLDS.commentRun + 3]);
  });
});

describe("check comment-ratio: доля строк-комментариев", () => {
  it("доля ровно на пороге не даёт диагностики", () => {
    const source = [
      ...commentBlock(7),
      ...codeBlock(13),
      ...commentBlock(7),
      ...codeBlock(13, 13),
    ].join("\n");
    const stats = collectStats(source);
    expect(stats.nonEmpty).toBe(40);
    expect(stats.ratio).toBe(THRESHOLDS.commentRatio);
    expect(diagnose(source)).toEqual([]);
  });

  it("доля выше порога даёт одну диагностику на первой строке файла", () => {
    const source = [
      ...commentBlock(5),
      ...codeBlock(9),
      ...commentBlock(5),
      ...codeBlock(8, 9),
      ...commentBlock(5),
      ...codeBlock(8, 17),
    ].join("\n");
    const found = diagnose(source);
    expect(found).toHaveLength(1);
    expect(found[0].check).toBe(CHECKS.COMMENT_RATIO);
    expect(found[0].line).toBe(1);
    expect(found[0].message).toContain("37.5%");
  });

  it("файл короче порога непустых строк не проверяется на долю вовсе", () => {
    const source = [...commentBlock(10), ...codeBlock(5)].join("\n");
    expect(collectStats(source).nonEmpty).toBeLessThan(THRESHOLDS.ratioMinNonEmptyLines);
    expect(diagnose(source)).toEqual([]);
  });

  it("JSDoc не входит в числитель доли, но входит в знаменатель", () => {
    const jsdoc = ["/**", ...Array.from({ length: 18 }, () => " * Документация."), " */"];
    const source = [...jsdoc, ...commentBlock(5), ...codeBlock(15)].join("\n");
    const stats = collectStats(source);
    expect(stats.nonEmpty).toBe(40);
    expect(stats.jsdoc).toBe(20);
    expect(stats.comment).toBe(5);
    expect(stats.ratio).toBeCloseTo(0.125, 10);
    expect(diagnose(source)).toEqual([]);
  });

  it("пустой файл не роняет скрипт делением на ноль", () => {
    expect(() => diagnose("")).not.toThrow();
    expect(diagnose("")).toEqual([]);
    const stats = collectStats("");
    expect(stats.nonEmpty).toBe(0);
    expect(stats.ratio).toBe(0);
  });

  it("файл из одних комментариев даёт долю 1 и диагностику, а не NaN", () => {
    const source = [...commentBlock(10), "", ...commentBlock(10), "", ...commentBlock(20)].join(
      "\n",
    );
    const stats = collectStats(source);
    expect(stats.ratio).toBe(1);
    expect(diagnose(source).map((d) => d.check)).toContain(CHECKS.COMMENT_RATIO);
  });
});

describe("check commented-out-code: код против прозы", () => {
  const isCode = (comment: string) => checksOf(comment).includes(CHECKS.COMMENTED_OUT);

  it("закомментированный оператор ловится", () => {
    expect(isCode("// const x = 1;")).toBe(true);
  });

  it("проза не ловится", () => {
    expect(isCode("// объясняет почему")).toBe(false);
  });

  it.each([
    "// let total = 0;",
    "// return null;",
    "// throw new Error(errorCodes.NOT_FOUND);",
    '// import { redis } from "@/config/redis.js";',
    "// export const cacheTtl = 60;",
    "// function build() {",
    "// if (!user) {",
    "// } else {",
    "// await repository.save(entity);",
    "// user.name = next;",
    "// });",
    '// name: "guest",',
    "// ttl: 60,",
  ])("код: %s", (line) => {
    expect(isCode(line)).toBe(true);
  });

  it.each([
    "// объясняет почему — не что",
    "// fail-open: при недоступности Redis запрос идёт мимо кэша",
    "// см. docs/wiki/conventions.md, раздел про слои",
    "// Logout: revoke every refresh token for the user (log out all sessions) and,",
    "// TODO: перенести порог в конфиг",
    "// biome-ignore lint/suspicious/noExplicitAny: внешний контракт",
    "// Зеркало files.includes из biome.json",
    "// Порог подобран по фактическим данным (§9.7)",
  ])("проза: %s", (line) => {
    expect(isCode(line)).toBe(false);
  });

  it("диагностика указывает на строку комментария и не дублируется", () => {
    const source = ["const a = 1;", "// const x = 1;", "const b = 2;"].join("\n");
    const found = diagnose(source);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(2);
    expect(found[0].check).toBe(CHECKS.COMMENTED_OUT);
  });

  it("хвостовой комментарий с кодом тоже ловится", () => {
    expect(isCode("const a = 1; // const x = 2;")).toBe(true);
  });

  it("JSDoc с примером кода не наказывается", () => {
    const source = ["/**", " * const x = 1;", " */", "export const a = 1;"].join("\n");
    expect(diagnose(source)).toEqual([]);
  });
});

describe("формат диагностики повторяет форму Biome", () => {
  it("три строки: путь с позицией, × и i", () => {
    const [found] = diagnose(["const a = 1;", ...commentBlock(13)].join("\n"));
    const lines = (formatDiagnostic(found) as string).split("\n");
    expect(lines[0]).toBe(`src/x/y.ts:2:1 check-comments/${CHECKS.COMMENT_RUN}`);
    expect(lines[1].startsWith("  × ")).toBe(true);
    expect(lines[2].startsWith("  i ")).toBe(true);
  });
});

describe("область: SCOPE_EXCLUDES и суффикс", () => {
  const root = "/repo";

  it("зеркалит исключения biome.json и добавляет дерево фикстур", () => {
    for (const prefix of [
      "src/generated/",
      "dist/",
      "coverage/",
      "node_modules/",
      "docs/",
      "tests/unit/fixtures/",
    ]) {
      expect(SCOPE_EXCLUDES).toContain(prefix);
    }
  });

  it("исключённые пути отсекаются в обеих формах — относительной и абсолютной", () => {
    expect(isPathExcluded("src/generated/prisma/client.ts", root)).toBe(true);
    expect(isPathExcluded("/repo/src/generated/prisma/client.ts", root)).toBe(true);
    expect(isPathExcluded("./docs/wiki/overview.ts", root)).toBe(true);
    expect(isPathExcluded("src/user/user.service.ts", root)).toBe(false);
  });

  it("путь за пределами корня считается вне области", () => {
    expect(isPathExcluded("../elsewhere/x.ts", root)).toBe(true);
    expect(isInScope("../elsewhere/x.ts", root)).toBe(false);
  });

  it("в области только .ts под src/ вне исключений", () => {
    expect(isInScope("src/user/user.service.ts", root)).toBe(true);
    expect(isInScope("src/user/user.service.js", root)).toBe(false);
    expect(isInScope("tests/unit/utils.test.ts", root)).toBe(false);
    expect(isInScope("src/generated/prisma/client.ts", root)).toBe(false);
  });
});

describe("EXEMPTIONS: словарь послаблений", () => {
  it("на момент реализации пуст — нарушителей нет", () => {
    expect(Object.keys(EXEMPTIONS)).toEqual([]);
  });

  it("послабление снимает названную проверку и только её", () => {
    const found = diagnose(["const a = 1;", ...commentBlock(13)].join("\n"));
    expect(found).toHaveLength(1);
    const exempt = { "src/x/y.ts": { checks: [CHECKS.COMMENT_RUN], reason: "проверка теста" } };
    expect(applyExemptions(found, exempt)).toEqual([]);
    const other = { "src/x/y.ts": { checks: [CHECKS.COMMENT_RATIO], reason: "проверка теста" } };
    expect(applyExemptions(found, other)).toEqual(found);
  });
});

const SCRIPT = fileURLToPath(new URL("../../scripts/check-comments.mjs", import.meta.url));

const DIRTY_SOURCE = ["export const a = 1;", "// const x = 1;", ""].join("\n");
const CLEAN_SOURCE = ["// объясняет почему, а не что", "export const a = 1;", ""].join("\n");

type CliResult = { status: number; stdout: string; stderr: string };

const cli = (args: string[], cwd: string): CliResult => {
  const run = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8" });
  if (run.error) throw run.error;
  return { status: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
};

const makeTree = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), "check-comments-"));
  for (const [relative, source] of Object.entries(files)) {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source, "utf8");
  }
  return root;
};

describe("CLI: обход, флаги и коды выхода", () => {
  let root: string;
  let cleanRoot: string;

  beforeAll(() => {
    root = makeTree({
      "src/clean/ok.ts": CLEAN_SOURCE,
      "src/dirty/bad.ts": DIRTY_SOURCE,
      "src/generated/prisma/client.ts": DIRTY_SOURCE,
      "src/with space/spaced.ts": DIRTY_SOURCE,
      "src/notes/readme.md": DIRTY_SOURCE,
      "docs/note.ts": DIRTY_SOURCE,
      "dist/build.ts": DIRTY_SOURCE,
    });
    cleanRoot = makeTree({ "src/clean/ok.ts": CLEAN_SOURCE });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(cleanRoot, { recursive: true, force: true });
  });

  it("чистое дерево: код 0 и полное молчание", () => {
    const run = cli([], cleanRoot);
    expect(run.status).toBe(EXIT.CLEAN);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("");
  });

  it("обход по умолчанию находит нарушителя и не заходит в SCOPE_EXCLUDES", () => {
    const run = cli([], root);
    expect(run.status).toBe(EXIT.VIOLATIONS);
    expect(run.stderr).toContain(`check-comments/${CHECKS.COMMENTED_OUT}`);
    expect(run.stderr).toContain("src/dirty/bad.ts:2:1");
    expect(run.stderr).toContain("src/with space/spaced.ts:2:1");
    expect(run.stderr).not.toContain("src/generated");
    expect(run.stderr).not.toContain("readme.md");
  });

  it("--files с путём внутри SCOPE_EXCLUDES: код 0 и пустой вывод", () => {
    for (const path of ["src/generated/prisma/client.ts", "docs/note.ts", "dist/build.ts"]) {
      const run = cli(["--files", path], root);
      expect(run.status).toBe(EXIT.CLEAN);
      expect(run.stdout).toBe("");
      expect(run.stderr).toBe("");
    }
  });

  it("--files сужает область до перечисленного", () => {
    const clean = cli(["--files", "src/clean/ok.ts"], root);
    expect(clean.status).toBe(EXIT.CLEAN);
    expect(clean.stderr).toBe("");

    const dirty = cli(["--files", "src/clean/ok.ts", "src/dirty/bad.ts"], root);
    expect(dirty.status).toBe(EXIT.VIOLATIONS);
    expect(dirty.stderr).toContain("src/dirty/bad.ts");
  });

  it("--files без путей не подменяется обходом всего дерева", () => {
    const run = cli(["--files"], root);
    expect(run.status).toBe(EXIT.CLEAN);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("");
  });

  it("путь с пробелами, переданный отдельным аргументом, обрабатывается корректно", () => {
    const run = cli(["--files", "src/with space/spaced.ts"], root);
    expect(run.status).toBe(EXIT.VIOLATIONS);
    expect(run.stderr).toContain("src/with space/spaced.ts:2:1");
  });

  it("несуществующий путь в области — поломка скрипта, код 2", () => {
    const run = cli(["--files", "src/nowhere/missing.ts"], root);
    expect(run.status).toBe(EXIT.BROKEN);
    expect(run.stderr).toContain("src/nowhere/missing.ts");
    expect(run.stdout).toBe("");
  });

  it("неизвестный флаг — поломка скрипта, код 2", () => {
    const run = cli(["--unknown"], root);
    expect(run.status).toBe(EXIT.BROKEN);
    expect(run.stderr).toContain("--unknown");
  });

  it("--report печатает таблицу и всегда выходит нулём", () => {
    const run = cli(["--report"], root);
    expect(run.status).toBe(EXIT.CLEAN);
    expect(run.stdout).toContain("src/dirty/bad.ts");
    expect(run.stdout).toContain("доля");
    expect(run.stderr).toBe("");
  });

  it("--json печатает те же диагностики машиночитаемо", () => {
    const run = cli(["--json", "--files", "src/dirty/bad.ts"], root);
    expect(run.status).toBe(EXIT.VIOLATIONS);
    const payload = JSON.parse(run.stdout) as {
      diagnostics: Array<{ path: string; line: number; check: string }>;
    };
    expect(payload.diagnostics).toHaveLength(1);
    expect(payload.diagnostics[0].path).toBe("src/dirty/bad.ts");
    expect(payload.diagnostics[0].line).toBe(2);
    expect(payload.diagnostics[0].check).toBe(CHECKS.COMMENTED_OUT);
  });

  it("--report --json отдаёт метрики массивом и тоже выходит нулём", () => {
    const run = cli(["--report", "--json"], root);
    expect(run.status).toBe(EXIT.CLEAN);
    const payload = JSON.parse(run.stdout) as {
      report: Array<{ path: string; nonEmpty: number; maxRun: number }>;
    };
    expect(payload.report.map((row) => row.path).sort()).toEqual([
      "src/clean/ok.ts",
      "src/dirty/bad.ts",
      "src/with space/spaced.ts",
    ]);
  });
});

const hook = (payload: string, cwd: string): CliResult => {
  const run = spawnSync(process.execPath, [SCRIPT, "--hook-stdin"], {
    cwd,
    input: payload,
    encoding: "utf8",
  });
  if (run.error) throw run.error;
  return { status: run.status ?? -1, stdout: run.stdout, stderr: run.stderr };
};

const event = (filePath: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    session_id: "abc123",
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    tool_input: { file_path: filePath },
    ...extra,
  });

describe("--hook-stdin: разбор payload события PostToolUse", () => {
  let root: string;

  beforeAll(() => {
    root = makeTree({
      "src/clean/ok.ts": CLEAN_SOURCE,
      "src/dirty/bad.ts": DIRTY_SOURCE,
      "src/dirty/a;b.ts": DIRTY_SOURCE,
      "src/generated/prisma/client.ts": DIRTY_SOURCE,
    });
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("пустой stdin — код 0 и полное молчание", () => {
    const run = hook("", root);
    expect(run.status).toBe(EXIT.CLEAN);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("");
  });

  it("не-JSON на stdin — код 0 и полное молчание", () => {
    for (const payload of ["не json вовсе", "{", "<html>"]) {
      const run = hook(payload, root);
      expect(run.status).toBe(EXIT.CLEAN);
      expect(run.stdout).toBe("");
      expect(run.stderr).toBe("");
    }
  });

  it("JSON без поля пути — код 0 и полное молчание, каждая форма по отдельности", () => {
    const payloads = [
      "{}",
      "[1,2]",
      '"строка"',
      "null",
      JSON.stringify({ tool_input: {} }),
      JSON.stringify({ tool_input: null }),
      JSON.stringify({ tool_input: "не объект" }),
      event(""),
      event("   "),
      event(42),
      event(null),
    ];
    for (const payload of payloads) {
      const run = hook(payload, root);
      expect([payload, run.status]).toEqual([payload, EXIT.CLEAN]);
      expect(run.stdout).toBe("");
      expect(run.stderr).toBe("");
    }
  });

  it("путь вне области не запускает biome и не даёт вывода", () => {
    for (const path of ["src/generated/prisma/client.ts", "../elsewhere/x.ts"]) {
      const run = hook(event(path), root);
      expect(run.status).toBe(EXIT.CLEAN);
      expect(run.stdout).toBe("");
      expect(run.stderr).toBe("");
    }
  });

  it("чистый файл — код 0, вывод biome о проверенных файлах не шумит", () => {
    const run = hook(event("src/clean/ok.ts"), root);
    expect(run.status).toBe(EXIT.CLEAN);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("");
  });

  it("файл-нарушитель — код 1, в stderr имя правила и путь", () => {
    const run = hook(event("src/dirty/bad.ts"), root);
    expect(run.status).toBe(EXIT.VIOLATIONS);
    expect(run.stderr).toContain(`check-comments/${CHECKS.COMMENTED_OUT}`);
    expect(run.stderr).toContain("src/dirty/bad.ts:2:1");
  });

  it("абсолютный путь события и поле cwd payload понимаются", () => {
    const absolute = join(root, "src/dirty/bad.ts");
    expect(hook(event(absolute), root).status).toBe(EXIT.VIOLATIONS);

    const elsewhere = mkdtempSync(join(tmpdir(), "check-comments-cwd-"));
    const run = hook(event(absolute, { cwd: root }), elsewhere);
    expect(run.status).toBe(EXIT.VIOLATIONS);
    expect(run.stderr).toContain("src/dirty/bad.ts:2:1");
    rmSync(elsewhere, { recursive: true, force: true });
  });

  it("файл события исчез с диска — код 0, а не ложная поломка", () => {
    const run = hook(event("src/dirty/gone.ts"), root);
    expect(run.status).toBe(EXIT.CLEAN);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("");
  });

  it("путь передаётся аргументом, а не через оболочку", () => {
    expect(biomeCommand("src/a b.ts").args.at(-1)).toBe("src/a b.ts");
    const run = hook(event("src/dirty/a;b.ts"), root);
    expect(run.status).toBe(EXIT.VIOLATIONS);
    expect(run.stderr).toContain("src/dirty/a;b.ts:2:1");
  });

  it("parseHookEvent — единственная точка разбора недоверенного ввода", () => {
    expect(parseHookEvent("")).toBeNull();
    expect(parseHookEvent("{")).toBeNull();
    expect(parseHookEvent(event(""))).toBeNull();
    expect(parseHookEvent(event("src/x/y.ts"))).toEqual({ path: "src/x/y.ts", cwd: null });
    expect(parseHookEvent(event("src/x/y.ts", { cwd: "/repo" }))).toEqual({
      path: "src/x/y.ts",
      cwd: "/repo",
    });
  });
});
