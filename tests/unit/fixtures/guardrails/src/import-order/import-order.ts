// Намеренно нарушенный порядок импортов: относительный `./local.js` стоит перед
// алиасным `@/config/env.js`, а тот — перед пакетом `fastify`. Сам файл
// отформатирован верно, чтобы диагностика organizeImports не смешивалась с
// форматтером.
import { LOCAL_MARKER } from "./local.js";
import { ENV_MARKER } from "@/config/env.js";
import type { FastifyBaseLogger } from "fastify";

export type OrderLogger = FastifyBaseLogger;

export const ORDER_PROBE = `${LOCAL_MARKER}:${ENV_MARKER}`;
