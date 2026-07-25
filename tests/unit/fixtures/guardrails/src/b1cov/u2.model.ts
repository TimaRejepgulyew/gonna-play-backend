// Покрытие блока B1, запрет U2: прямое обращение к сгенерированному клиенту.
import { prismaClient } from "@/generated/prisma/client.js";

export const b1GeneratedAccess = prismaClient;
