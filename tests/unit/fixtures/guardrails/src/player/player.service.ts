// Прообраз послабления `"noRestrictedImports": "warn"`: голая строка степени
// обязана унаследовать набор паттернов последнего совпавшего блока (B3), а не
// сбросить опции. Все три запрета собраны в одном файле, потому что путь блока
// послабления единственный.
import { errorCodes } from "fastify";
import { prismaClient } from "@/generated/prisma/client.js";
import { crossHelper } from "../other/x.js";

export const playerFastifyCodes = errorCodes;
export const playerGeneratedAccess = prismaClient;
export const playerCrossImport = crossHelper;
