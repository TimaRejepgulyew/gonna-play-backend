#!/usr/bin/env node
// Бюджет комментариев для src/**/*.ts (§9.7 задачи biome-code-guardrails).
//
// Сканер работает без парсера и без зависимостей: файл читается построчно,
// состояние переносится между строками (код / блочный комментарий / JSDoc),
// а строковые, шаблонные и regex-литералы вырезаются до поиска `//`.
//
// Пороги (§9.7) и их подтверждение замером по дереву src/ на момент реализации:
// серия — не длиннее 12 строк подряд при фактическом максимуме 8;
// доля строк-комментариев — не выше 0.35 от непустых строк, для файлов от 40
// непустых строк, при фактическом максимуме 27.9%. Пересчитать пороги можно
// прогоном с флагом --report, который печатает те же метрики по каждому файлу.
//
// JSDoc-блоки исключены из числителя доли и не входят в серию: они документируют
// публичный контракт, наказывать за них нельзя. Серией считается только
// непрерывная последовательность обычных строк-комментариев, поэтому пустая
// строка и JSDoc-блок серию разрывают.
//
// Режим --hook-stdin (§9.8) читает событие PostToolUse со stdin и проверяет
// один записанный файл: сам разбирает JSON вместо цепочки shell с jq, потому
// что при событии без пути такая цепочка вернула бы агенту ложную диагностику.
// Любой неразобранный ввод — выход 0 и молчание.
//
// Признаки закомментированного кода (набор в задаче не задан, выбран здесь):
// объявление переменной, функции или класса; import или export; оператор
// return или throw с точкой с запятой; управляющая конструкция со скобками;
// присваивание или вызов, завершённые точкой с запятой; одинокие закрывающие
// скобки; строка свойства объекта с завершающей запятой. Директивы вида
// подавления Biome, TODO, FIXME, NOTE и теги JSDoc проверкой не рассматриваются.
// (Слово «biome-ignore» в комментарии не пишем: Biome читает его как директиву.)

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Состояния строки, которыми оперируют проверки бюджета. */
export const LINE_KIND = {
  BLANK: "blank",
  CODE: "code",
  COMMENT: "comment",
  JSDOC: "jsdoc",
};

const BLOCK_NONE = 0;
const BLOCK_COMMENT = 1;
const BLOCK_JSDOC = 2;

const LINE_COMMENT_LEN = 2;
const BLOCK_OPEN_LEN = 2;
const JSDOC_OPEN_LEN = 3;
const BLOCK_CLOSE_LEN = 2;
const EMPTY_BLOCK_LEN = 4;
const ESCAPE_LEN = 2;

// После этих слов `/` открывает regex-литерал, а не делит.
const REGEX_PRECEDING_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "case",
  "do",
  "else",
  "yield",
  "await",
  "delete",
  "void",
  "new",
  "throw",
]);

const isWordChar = (ch) => /[\w$]/u.test(ch);

/**
 * Разбивает исходник на строки, одинаково понимая LF, CRLF и одиночный CR.
 * Завершающий перевод строки не порождает лишней пустой строки.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function splitLines(source) {
  if (source === "") return [];
  const lines = source.split(/\r\n|\n|\r/u);
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
}

/**
 * Классифицирует каждую строку исходника.
 *
 * @param {string} source
 * @returns {Array<{ line: number, kind: string, comment: string }>}
 */
export function classifyLines(source) {
  const state = { block: BLOCK_NONE, template: 0, braces: [] };
  return splitLines(source).map((text, index) => ({
    line: index + 1,
    ...scanLine(text, state),
  }));
}

function scanLine(text, state) {
  const ctx = {
    text,
    i: 0,
    hasCode: false,
    plain: false,
    jsdoc: false,
    parts: [],
    lastSig: "",
    lastWord: "",
  };

  while (ctx.i < text.length) advance(ctx, state);

  return finishLine(ctx);
}

function advance(ctx, state) {
  const { text } = ctx;
  if (state.block !== BLOCK_NONE) {
    consumeBlockComment(ctx, state);
  } else if (state.template > 0 && state.braces.length === 0) {
    ctx.hasCode = true;
    ctx.i = scanTemplateBody(text, ctx.i, state);
  } else if (text[ctx.i] === " " || text[ctx.i] === "\t") {
    ctx.i += 1;
  } else if (text[ctx.i] === "/" && text[ctx.i + 1] === "/") {
    consumeLineComment(ctx);
  } else if (text[ctx.i] === "/" && text[ctx.i + 1] === "*") {
    openBlockComment(ctx, state);
  } else {
    consumeCodeChar(ctx, state);
  }
}

function consumeBlockComment(ctx, state) {
  const end = ctx.text.indexOf("*/", ctx.i);
  const body = end === -1 ? ctx.text.slice(ctx.i) : ctx.text.slice(ctx.i, end);
  if (state.block === BLOCK_JSDOC) ctx.jsdoc = true;
  else ctx.plain = true;
  addComment(ctx, stripBlockMarkers(body));
  if (end === -1) {
    ctx.i = ctx.text.length;
    return;
  }
  state.block = BLOCK_NONE;
  ctx.i = end + BLOCK_CLOSE_LEN;
}

function openBlockComment(ctx, state) {
  const isJsdoc =
    ctx.text[ctx.i + BLOCK_OPEN_LEN] === "*" &&
    ctx.text.slice(ctx.i, ctx.i + EMPTY_BLOCK_LEN) !== "/**/";
  state.block = isJsdoc ? BLOCK_JSDOC : BLOCK_COMMENT;
  if (isJsdoc) ctx.jsdoc = true;
  else ctx.plain = true;
  ctx.i += isJsdoc ? JSDOC_OPEN_LEN : BLOCK_OPEN_LEN;
}

function consumeLineComment(ctx) {
  ctx.plain = true;
  addComment(ctx, ctx.text.slice(ctx.i + LINE_COMMENT_LEN));
  ctx.i = ctx.text.length;
}

function consumeCodeChar(ctx, state) {
  const ch = ctx.text[ctx.i];
  ctx.hasCode = true;

  if (ch === '"' || ch === "'") {
    ctx.i = scanQuoted(ctx.text, ctx.i, ch);
    return setLastToken(ctx, ch);
  }
  if (ch === "`") {
    state.template += 1;
    ctx.i = scanTemplateBody(ctx.text, ctx.i + 1, state);
    return setLastToken(ctx, "`");
  }
  if (ch === "/" && startsRegex(ctx.lastSig, ctx.lastWord)) {
    ctx.i = scanRegex(ctx.text, ctx.i);
    return setLastToken(ctx, "/");
  }
  if (state.template > 0 && closesInterpolation(state, ch)) {
    ctx.i = scanTemplateBody(ctx.text, ctx.i + 1, state);
    return setLastToken(ctx, "`");
  }

  ctx.lastWord = isWordChar(ch) ? ctx.lastWord + ch : "";
  ctx.lastSig = ch;
  ctx.i += 1;
}

// Внутри шаблонной строки следим за вложенными фигурными скобками, чтобы
// вернуться в тело шаблона на закрывающей скобке своей интерполяции.
function closesInterpolation(state, ch) {
  if (ch === "{") {
    state.braces.push("{");
    return false;
  }
  if (ch !== "}" || state.braces.length === 0) return false;
  state.braces.pop();
  return state.braces.length === 0;
}

function setLastToken(ctx, ch) {
  ctx.lastSig = ch;
  ctx.lastWord = "";
}

function addComment(ctx, raw) {
  const trimmed = raw.trim();
  if (trimmed !== "") ctx.parts.push(trimmed);
}

function finishLine(ctx) {
  const comment = ctx.parts.join(" ");
  if (ctx.hasCode) return { kind: LINE_KIND.CODE, comment };
  if (ctx.text.trim() === "") return { kind: LINE_KIND.BLANK, comment: "" };
  if (ctx.plain) return { kind: LINE_KIND.COMMENT, comment };
  if (ctx.jsdoc) return { kind: LINE_KIND.JSDOC, comment };
  return { kind: LINE_KIND.BLANK, comment: "" };
}

function stripBlockMarkers(body) {
  return body.replace(/^\s*\*+\s?/u, "");
}

function startsRegex(lastSig, lastWord) {
  if (lastSig === "") return true;
  if (REGEX_PRECEDING_KEYWORDS.has(lastWord)) return true;
  if (isWordChar(lastSig)) return false;
  return !(lastSig === ")" || lastSig === "]" || lastSig === "}");
}

function scanQuoted(text, start, quote) {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += ESCAPE_LEN;
      continue;
    }
    if (ch === quote) return i + 1;
    i += 1;
  }
  return text.length;
}

function scanRegex(text, start) {
  let i = start + 1;
  let inClass = false;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += ESCAPE_LEN;
      continue;
    }
    if (ch === "[") inClass = true;
    else if (ch === "]") inClass = false;
    else if (ch === "/" && !inClass) return i + 1;
    i += 1;
  }
  return text.length;
}

// Тело шаблонной строки до `${`, закрывающего бэктика или конца строки.
function scanTemplateBody(text, start, state) {
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      i += ESCAPE_LEN;
      continue;
    }
    if (ch === "$" && text[i + 1] === "{") {
      state.braces.push("{");
      return i + BLOCK_OPEN_LEN;
    }
    if (ch === "`") {
      state.template -= 1;
      return i + 1;
    }
    i += 1;
  }
  return text.length;
}

export const CHECKS = {
  COMMENTED_OUT: "commented-out-code",
  COMMENT_RUN: "comment-run",
  COMMENT_RATIO: "comment-ratio",
};

const COMMENT_RUN_MAX = 12;
const COMMENT_RATIO_MAX = 0.35;
const RATIO_MIN_NON_EMPTY = 40;

export const THRESHOLDS = {
  commentRun: COMMENT_RUN_MAX,
  commentRatio: COMMENT_RATIO_MAX,
  ratioMinNonEmptyLines: RATIO_MIN_NON_EMPTY,
};

const FIRST_LINE = 1;
const FIRST_COLUMN = 1;
const PERCENT = 100;
const PERCENT_DIGITS = 1;
const RATIO_SCALE = 1_000_000;
const SNIPPET_MAX = 60;
const ELLIPSIS = "…";

// Комментарии-директивы инструментов и метки задач кодом не считаются.
const DIRECTIVE =
  /^(?:@|biome-ignore\b|eslint\b|prettier-ignore\b|c8\b|v8\b|TODO\b|FIXME\b|NOTE\b|XXX\b|HACK\b)/u;

const CODE_LIKE = [
  /^(?:export\s+)?(?:const|let|var)\s+[\w$[\]{},\s]*[\w$\]}]\s*[:=]/u,
  /^import\s+[^;]*['"]/u,
  /^export\s+(?:default|const|let|var|function|class|type|interface|\{|\*)/u,
  /^(?:export\s+)?(?:async\s+)?function\b/u,
  /^(?:export\s+)?(?:abstract\s+)?class\s+[\w$]/u,
  /^(?:if|for|while|switch|catch)\s*\(.*\)\s*\{?\s*$/u,
  /^\}\s*(?:else|catch|finally)\b/u,
  /^[)\]}]+\s*[;,)]?\s*$/u,
  /^(?:return|throw)\b.*;\s*$/u,
  /^[\w$.[\]]+\s*(?:[+\-*/]|\|\||\?\?)?=[^=>].*;\s*$/u,
  /^(?:await\s+|void\s+)?[\w$.]+\(.*\)\s*;\s*$/u,
  // Свойство объекта: значение — один токен, иначе под шаблон попадает проза
  // вида «Logout: revoke every refresh token for the user (log out all …) and,».
  /^[\w$"']+\s*:\s*(?:[^,\s]+|"[^"]*"|'[^']*')\s*,$/u,
];

/**
 * Похож ли текст комментария на закомментированный код.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikeCode(text) {
  const trimmed = text.trim();
  if (trimmed === "" || DIRECTIVE.test(trimmed)) return false;
  return CODE_LIKE.some((pattern) => pattern.test(trimmed));
}

/**
 * Непрерывные серии обычных строк-комментариев.
 *
 * @param {Array<{ line: number, kind: string }>} lines
 * @returns {Array<{ line: number, length: number }>}
 */
function commentRuns(lines) {
  const runs = [];
  let current = null;
  for (const line of lines) {
    if (line.kind === LINE_KIND.COMMENT) {
      current = current ?? { line: line.line, length: 0 };
      current.length += 1;
      continue;
    }
    if (current !== null) runs.push(current);
    current = null;
  }
  if (current !== null) runs.push(current);
  return runs;
}

/**
 * Метрики бюджета по одному файлу.
 *
 * @param {string} source
 * @returns {{ total: number, nonEmpty: number, code: number, comment: number,
 *   jsdoc: number, blank: number, ratio: number, maxRun: number, maxRunLine: number }}
 */
export function collectStats(source) {
  const lines = classifyLines(source);
  const count = (kind) => lines.filter((line) => line.kind === kind).length;
  const code = count(LINE_KIND.CODE);
  const comment = count(LINE_KIND.COMMENT);
  const jsdoc = count(LINE_KIND.JSDOC);
  const nonEmpty = code + comment + jsdoc;
  const longest = commentRuns(lines).reduce(
    (best, run) => (run.length > best.length ? run : best),
    { line: 0, length: 0 },
  );

  return {
    total: lines.length,
    nonEmpty,
    code,
    comment,
    jsdoc,
    blank: lines.length - nonEmpty,
    ratio: nonEmpty === 0 ? 0 : comment / nonEmpty,
    maxRun: longest.length,
    maxRunLine: longest.line,
  };
}

/**
 * Три проверки бюджета по исходнику одного файла.
 *
 * @param {string} source
 * @param {string} [path]
 * @returns {Array<{ path: string, line: number, column: number, check: string,
 *   message: string, hint: string }>}
 */
export function checkSource(source, path = "<stdin>") {
  const lines = classifyLines(source);
  const found = [
    ...commentedOutDiagnostics(lines, path),
    ...runDiagnostics(lines, path),
    ...ratioDiagnostics(source, path),
  ];
  return found.sort((a, b) => a.line - b.line);
}

function commentedOutDiagnostics(lines, path) {
  return lines
    .filter((line) => line.kind !== LINE_KIND.JSDOC && looksLikeCode(line.comment))
    .map((line) =>
      diagnostic({
        path,
        line: line.line,
        check: CHECKS.COMMENTED_OUT,
        message: `Закомментированный код: «${snippet(line.comment)}».`,
        hint: "История кода живёт в git — закомментированные строки удаляются.",
      }),
    );
}

function runDiagnostics(lines, path) {
  return commentRuns(lines)
    .filter((run) => run.length > COMMENT_RUN_MAX)
    .map((run) =>
      diagnostic({
        path,
        line: run.line,
        check: CHECKS.COMMENT_RUN,
        message: `Непрерывная серия комментариев — ${run.length} строк при пороге ${COMMENT_RUN_MAX}.`,
        hint: "Объяснение длиннее абзаца переезжает в docs/wiki/, а в коде остаётся ссылка.",
      }),
    );
}

function ratioDiagnostics(source, path) {
  const stats = collectStats(source);
  if (stats.nonEmpty < RATIO_MIN_NON_EMPTY) return [];
  if (scaled(stats.ratio) <= scaled(COMMENT_RATIO_MAX)) return [];

  return [
    diagnostic({
      path,
      line: FIRST_LINE,
      check: CHECKS.COMMENT_RATIO,
      message: `Доля строк-комментариев — ${percent(stats.ratio)}% при пороге ${percent(COMMENT_RATIO_MAX)}%.`,
      hint: "Комментарии объясняют «почему»; остальное переезжает в docs/wiki/.",
    }),
  ];
}

function diagnostic({ path, line, check, message, hint }) {
  return { path, line, column: FIRST_COLUMN, check, message, hint };
}

const scaled = (value) => Math.round(value * RATIO_SCALE);
const percent = (ratio) => (ratio * PERCENT).toFixed(PERCENT_DIGITS);

function snippet(text) {
  return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX)}${ELLIPSIS}` : text;
}

/**
 * Диагностика в форме Biome: позиция, строка `×`, строка `i`.
 *
 * @param {{ path: string, line: number, column: number, check: string,
 *   message: string, hint: string }} found
 * @returns {string}
 */
export function formatDiagnostic(found) {
  const head = `${found.path}:${found.line}:${found.column} check-comments/${found.check}`;
  return `${head}\n  × ${found.message}\n  i ${found.hint}`;
}

// Зеркало files.includes из biome.json:4-17. Скрипт — отдельный процесс Node,
// исключения Biome на него не действуют, поэтому список зашит здесь; при правке
// biome.json правится и он. Последняя строка — сверх зеркала: под ней лежат
// фикстуры, намеренно нарушающие правила, и предъявлять к ним бюджет нельзя.
export const SCOPE_EXCLUDES = [
  "dist/",
  "coverage/",
  "node_modules/",
  "src/generated/",
  "postman/collections/",
  "postman/specs/",
  "prisma/migrations/",
  "docs/",
  ".claude/",
  "tests/unit/fixtures/",
];

export const SCOPE_ROOT = "src";
export const SCOPE_INCLUDE_SUFFIX = ".ts";

// Путь → освобождённые проверки плюс причина, в духе biome.json.overrides.
// Пороги подобраны так, что нарушителей нет, поэтому словарь пуст.
export const EXEMPTIONS = {
  // "src/path/file.ts": { checks: ["comment-ratio"], reason: "почему" },
};

// 0 — чисто, 1 — нашлись нарушения, 2 — скрипт сломался сам (§10.4).
export const EXIT = { CLEAN: 0, VIOLATIONS: 1, BROKEN: 2 };

const PARENT_PREFIX = "../";

class ScriptError extends Error {}

function toRelativePath(target, rootDir) {
  return relative(rootDir, resolve(rootDir, target)).split(sep).join("/");
}

/**
 * Лежит ли путь под одним из исключений области (или вовсе вне корня).
 *
 * @param {string} target
 * @param {string} [rootDir]
 * @returns {boolean}
 */
export function isPathExcluded(target, rootDir = process.cwd()) {
  const path = toRelativePath(target, rootDir);
  if (path === "" || path.startsWith(PARENT_PREFIX)) return true;
  return SCOPE_EXCLUDES.some((prefix) => path.startsWith(prefix) || path === prefix.slice(0, -1));
}

/**
 * Подлежит ли путь проверке: `.ts` под `src/` вне исключений.
 *
 * @param {string} target
 * @param {string} [rootDir]
 * @returns {boolean}
 */
export function isInScope(target, rootDir = process.cwd()) {
  const path = toRelativePath(target, rootDir);
  if (!path.endsWith(SCOPE_INCLUDE_SUFFIX)) return false;
  if (!path.startsWith(`${SCOPE_ROOT}/`)) return false;
  return !isPathExcluded(target, rootDir);
}

/**
 * Снимает диагностики, от которых файл освобождён списком послаблений.
 *
 * @param {Array<{ path: string, check: string }>} found
 * @param {Record<string, { checks: string[], reason: string }>} [exemptions]
 * @returns {Array<{ path: string, check: string }>}
 */
export function applyExemptions(found, exemptions = EXEMPTIONS) {
  return found.filter((item) => !exemptions[item.path]?.checks.includes(item.check));
}

function walkScope(rootDir) {
  const found = [];
  const visit = (dir) => {
    for (const entry of readdirSync(join(rootDir, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (isPathExcluded(path, rootDir)) continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && path.endsWith(SCOPE_INCLUDE_SUFFIX)) found.push(path);
    }
  };
  visit(SCOPE_ROOT);
  return found.sort();
}

// Пути извне (pre-commit, хук) проходят ту же проверку области: вне области —
// молча пропускаем, в области, но нет на диске — это поломка, а не чистота.
function resolveGiven(files, rootDir) {
  const found = [];
  for (const file of files) {
    if (!isInScope(file, rootDir)) continue;
    const path = toRelativePath(file, rootDir);
    let stats;
    try {
      stats = statSync(join(rootDir, path));
    } catch {
      throw new ScriptError(`файл не найден: ${file}`);
    }
    if (!stats.isFile()) throw new ScriptError(`не файл: ${file}`);
    found.push(path);
  }
  return found;
}

/**
 * Разбор аргументов без внешних библиотек: за `--files` идут пути до
 * следующего флага. Пустой список после `--files` — не повод обойти дерево:
 * pre-commit с пустым набором staged-файлов проверять нечего.
 *
 * @param {string[]} argv
 * @returns {{ files: string[], filesGiven: boolean, report: boolean,
 *   json: boolean, hookStdin: boolean }}
 */
export function parseArgs(argv) {
  const options = { files: [], filesGiven: false, report: false, json: false, hookStdin: false };
  let collecting = false;
  for (const arg of argv) {
    if (!arg.startsWith("-")) {
      if (!collecting) throw new ScriptError(`неожиданный аргумент: ${arg}`);
      options.files.push(arg);
      continue;
    }
    collecting = arg === "--files";
    if (arg === "--files") options.filesGiven = true;
    else if (arg === "--report") options.report = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--hook-stdin") options.hookStdin = true;
    else throw new ScriptError(`неизвестный флаг: ${arg}`);
  }
  return options;
}

// Имя поля с путём подтверждено документацией хуков Claude Code (событие
// PostToolUse: общие поля плюс tool_name/tool_input/tool_use_id, путь записи —
// tool_input.file_path). Любая другая форма payload трактуется как «пути нет».
const STDIN_FD = 0;

const BIOME_BIN = fileURLToPath(new URL("../node_modules/.bin/biome", import.meta.url));
const BIOME_FLAGS = [
  "check",
  "--no-errors-on-unmatched",
  "--files-ignore-unknown=true",
  "--colors=off",
];

/**
 * Команда прогона Biome по одному файлу. Путь — отдельный элемент массива
 * аргументов и никогда не попадает в строку для оболочки: он приходит извне.
 *
 * @param {string} path
 * @returns {{ command: string, args: string[] }}
 */
export function biomeCommand(path) {
  return { command: BIOME_BIN, args: [...BIOME_FLAGS, path] };
}

/**
 * Разбор недоверенного stdin события PostToolUse. Пустой ввод, невалидный JSON,
 * чужая форма и отсутствующий путь одинаково дают `null` — режим хука на этом
 * молча выходит нулём, а не выдаёт агенту ложную диагностику.
 *
 * @param {string} raw
 * @returns {{ path: string, cwd: string | null } | null}
 */
export function parseHookEvent(raw) {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;

  const path = payload.tool_input?.file_path;
  if (typeof path !== "string" || path.trim() === "") return null;

  const cwd = typeof payload.cwd === "string" && payload.cwd !== "" ? payload.cwd : null;
  return { path, cwd };
}

function readStdin(io) {
  if (io.stdin !== undefined) return io.stdin;
  if (process.stdin.isTTY) return "";
  try {
    return readFileSync(STDIN_FD, "utf8");
  } catch {
    return "";
  }
}

// Единственный подпроцесс скрипта (§13): shell: false, путь — отдельный
// аргумент. Вывод показываем только при ненулевом коде, иначе хук шумел бы
// строкой «Checked 1 file» на каждой записи файла. Диагностики Biome шлёт в
// stderr, сводку — в stdout; порядок сохраняем, потому что при коде 1 агенту
// достаётся первая строка stderr, и это должна быть диагностика, а не сводка.
function runBiome(path, rootDir, stderr) {
  const { command, args } = biomeCommand(path);
  const run = spawnSync(command, args, { cwd: rootDir, encoding: "utf8", shell: false });
  if (run.error) throw new ScriptError(`не удалось запустить biome: ${run.error.message}`);
  if (run.status === EXIT.CLEAN) return false;

  const output = `${run.stderr ?? ""}\n${run.stdout ?? ""}`.trim();
  if (output !== "") stderr(output);
  return true;
}

// Путь события и корень приходят из разных источников и могут расходиться
// симлинками (на macOS /var против /private/var). Без канонизации файл внутри
// корня выглядел бы лежащим снаружи, и хук молча пропускал бы проверку.
function canonicalPath(target) {
  const absolute = resolve(target);
  try {
    return realpathSync(absolute);
  } catch {
    // Файла нет — канонизируем хотя бы каталог.
  }
  try {
    return join(realpathSync(dirname(absolute)), basename(absolute));
  } catch {
    return absolute;
  }
}

/**
 * Режим хука: путь одного записанного файла со stdin, обе проверки по нему.
 * Файл, исчезнувший с диска между записью и хуком, — не поломка: выходим нулём.
 */
function runHookStdin(io, fallbackRoot, stderr) {
  const found = parseHookEvent(readStdin(io));
  if (found === null) return EXIT.CLEAN;

  const rootDir = canonicalPath(io.rootDir ?? found.cwd ?? fallbackRoot);
  const target = canonicalPath(resolve(rootDir, found.path));
  if (isPathExcluded(target, rootDir)) return EXIT.CLEAN;

  const path = toRelativePath(target, rootDir);
  const absolute = join(rootDir, path);
  try {
    if (!statSync(absolute).isFile()) return EXIT.CLEAN;
  } catch {
    return EXIT.CLEAN;
  }

  const diagnostics = isInScope(path, rootDir)
    ? applyExemptions(checkSource(readFileSync(absolute, "utf8"), path))
    : [];
  for (const item of diagnostics) stderr(formatDiagnostic(item));

  const biomeFailed = runBiome(path, rootDir, stderr);
  return diagnostics.length > 0 || biomeFailed ? EXIT.VIOLATIONS : EXIT.CLEAN;
}

const REPORT_HEADER = ["файл", "непустых", "комментариев", "доля", "серия"];
const REPORT_GAP = "  ";
const FIRST_COLUMN_INDEX = 0;

function formatReport(rows) {
  const cells = rows.map((row) => [
    row.path,
    String(row.nonEmpty),
    String(row.comment),
    `${percent(row.ratio)}%`,
    String(row.maxRun),
  ]);
  const widths = REPORT_HEADER.map((title, column) =>
    Math.max(title.length, ...cells.map((row) => row[column].length)),
  );
  const line = (row) =>
    row
      .map((cell, column) =>
        column === FIRST_COLUMN_INDEX ? cell.padEnd(widths[column]) : cell.padStart(widths[column]),
      )
      .join(REPORT_GAP)
      .trimEnd();
  return [REPORT_HEADER, ...cells].map(line).join("\n");
}

function buildReport(sources) {
  return sources
    .map(({ path, source }) => ({ path, ...collectStats(source) }))
    .sort((a, b) => b.ratio - a.ratio || a.path.localeCompare(b.path));
}

// Обычный режим: собственный обход дерева либо список путей извне.
function runOverFiles(options, rootDir, stdout, stderr) {
  const targets = options.filesGiven ? resolveGiven(options.files, rootDir) : walkScope(rootDir);
  const sources = targets.map((path) => ({
    path,
    source: readFileSync(join(rootDir, path), "utf8"),
  }));

  if (options.report) {
    const report = buildReport(sources);
    stdout(options.json ? JSON.stringify({ report }) : formatReport(report));
    return EXIT.CLEAN;
  }

  const diagnostics = sources.flatMap(({ path, source }) =>
    applyExemptions(checkSource(source, path)),
  );
  if (options.json) stdout(JSON.stringify({ diagnostics }));
  else for (const found of diagnostics) stderr(formatDiagnostic(found));

  return diagnostics.length > 0 ? EXIT.VIOLATIONS : EXIT.CLEAN;
}

/**
 * Разбирает аргументы, проверяет отобранные файлы и возвращает код выхода.
 *
 * @param {string[]} argv
 * @param {{ rootDir?: string, stdin?: string, stdout?: (text: string) => void,
 *   stderr?: (text: string) => void }} [io]
 * @returns {number}
 */
export function runCli(argv, io = {}) {
  const rootDir = io.rootDir ?? process.cwd();
  const stdout = io.stdout ?? ((text) => process.stdout.write(`${text}\n`));
  const stderr = io.stderr ?? ((text) => process.stderr.write(`${text}\n`));

  try {
    const options = parseArgs(argv);
    return options.hookStdin
      ? runHookStdin(io, rootDir, stderr)
      : runOverFiles(options, rootDir, stdout, stderr);
  } catch (error) {
    stderr(`check-comments: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.BROKEN;
  }
}

function isEntryPoint() {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (isEntryPoint()) process.exitCode = runCli(process.argv.slice(2));
