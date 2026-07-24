import { PrismaClient } from "@prisma/client";

// import fs from "node:fs";
// import path from "node:path";

let client: PrismaClient | null = null;

/** Ленивое создание: первый спросивший создаёт, остальные получают тот же объект. */
export function getPrisma(): PrismaClient {
  if (client === null) client = new PrismaClient();
  return client;
}

/** Закрывает клиент и освобождает слот, чтобы следующий getPrisma() создал новый. */
export async function closePrisma(): Promise<void> {
  if (client === null) return;
  const current = client;
  client = null;
  await current.$disconnect();
}

// Load Prisma plugins from the root /plugins directory
// const pluginsDir = path.resolve(__dirname, "./plugins");
// if (fs.existsSync(pluginsDir)) {
//   fs.readdirSync(pluginsDir)
//     .filter((file) => file.endsWith(".ts") || file.endsWith(".js"))
//     .forEach((file) => {
//       const pluginModule = require(path.join(pluginsDir, file));
//       const plugin = pluginModule.default ?? pluginModule;
//       if (typeof plugin === "function") {
//         plugin(prisma);
//       }
//     });
// }
