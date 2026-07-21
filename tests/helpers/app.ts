import { buildApp, type AppInstance } from "@/app.js";

/**
 * Логгер передаётся как { level: "silent" }, а не logger: false: транспорт
 * pino-pretty (src/config/logger.ts:2-8) объявлен без уровня и без destination,
 * работает в отдельном потоке, который удерживает процесс и печатает по строке
 * на каждый запрос. Уровень silent глушит вывод и не поднимает транспорт.
 */
export async function createTestApp(): Promise<AppInstance> {
  return buildApp({ logger: { level: "silent" } });
}

/**
 * Вызывать в afterAll. После развязки синглтонов app.close() закрывает оба клиента:
 * prismaPlugin.onClose → closePrisma(), redisPlugin.onClose → closeRedis().
 * Ручной $disconnect() не нужен и был бы вреден: он закрыл бы соединение раньше,
 * чем плагин освободит слот.
 */
export async function destroyTestApp(app: AppInstance): Promise<void> {
  await app.close();
}
