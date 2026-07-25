// Покрытие блока B3, запрет U2: прямое обращение к сгенерированному клиенту.
import { prismaClient } from "@/generated/prisma/client.js";

export const b3GeneratedAccess = prismaClient;
