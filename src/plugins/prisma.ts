import fp from "fastify-plugin";

import { closePrisma, getPrisma } from "@/config/prisma.js";

// Ownership: the single client lives in the module slot of `src/config/prisma.ts`.
// This plugin does not create its own — it asks for the same one and closes it.
//
// `fp` is required, not cosmetic: without it Fastify encapsulates the plugin and
// `decorate` lands on a throwaway child context, leaving `server.prisma` undefined
// on the root instance while `src/types/fastify.d.ts:10` still promises the field.
// Caught by INT-25 (tests/integration/infrastructure.test.ts), which asserts that
// the decorated client and the one repositories use are the same object.
const prismaPlugin = fp(async (fastify) => {
  fastify.decorate("prisma", getPrisma());

  fastify.addHook("onClose", async () => {
    await closePrisma();
  });

  fastify.log.info("Prisma plugin registered");
});

export default prismaPlugin;
