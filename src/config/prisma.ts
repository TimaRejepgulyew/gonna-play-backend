import { PrismaClient } from "@prisma/client";
// import fs from "node:fs";
// import path from "node:path";

export default new PrismaClient();

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
