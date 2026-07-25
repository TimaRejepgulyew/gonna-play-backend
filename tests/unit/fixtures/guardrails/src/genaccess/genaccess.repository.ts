// Позитивная фикстура U2: прямое обращение к сгенерированному Prisma-клиенту.
import { prismaClient } from "@/generated/prisma/client.js";

export const rawClient = prismaClient;
