import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client.js";

let client: PrismaClient | null = null;

/** Ленивое создание: первый спросивший создаёт, остальные получают тот же объект. */
export function getPrisma(): PrismaClient {
  if (client === null) {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    client = new PrismaClient({ adapter });
  }
  return client;
}

/** Закрывает клиент и освобождает слот, чтобы следующий getPrisma() создал новый. */
export async function closePrisma(): Promise<void> {
  if (client === null) return;
  const current = client;
  client = null;
  await current.$disconnect();
}
