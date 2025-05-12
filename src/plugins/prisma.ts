import { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";

const prismaPlugin: FastifyPluginAsync = async (fastify, opts) => {
  const prisma = new PrismaClient();

  fastify.decorate("prisma", prisma);

  fastify.addHook("onClose", async (instance) => {
    await instance.prisma.$disconnect();
  });

  fastify.log.info("Prisma plugin registered");
};

export default prismaPlugin;
