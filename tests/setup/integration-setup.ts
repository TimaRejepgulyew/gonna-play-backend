import { beforeEach } from "vitest";

import { resetDatabase } from "../helpers/db.js";

// Единственный глобальный хук интеграционного проекта (§9.7): чистая база перед
// каждым тестом. Файл подключается через setupFiles, то есть выполняется в каждом
// тестовом файле, и beforeEach регистрируется в его собственном контексте.
//
// Приложение здесь НЕ создаётся сознательно: правило «одно приложение на файл»
// (§9.7) требует, чтобы createTestApp()/destroyTestApp() звались в beforeAll/afterAll
// самого тестового файла. Общий AppInstance за всех этот модуль не хранит.
beforeEach(async () => {
  await resetDatabase();
});

// Единая точка импорта хелперов Фазы 2 для интеграционных тестов.
// fixtures.ts появится в Фазе 6 и будет реэкспортирован здесь же.
export { createTestApp, destroyTestApp } from "../helpers/app.js";
export { resetDatabase } from "../helpers/db.js";
export { createActor, relogin } from "../helpers/actors.js";
export type { Actor, CreateActorOptions } from "../helpers/actors.js";
