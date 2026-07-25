// Покрытие блока B4, запрет U2: прямое обращение к сгенерированному клиенту.
import { prismaClient } from "@/generated/prisma/client.js";

export const b4GeneratedAccess = prismaClient;
