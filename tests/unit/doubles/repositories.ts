// Каркас поддельных репозиториев для юнит-проекта.
//
// Сервисы принимают репозитории в конструкторе (`src/auth/auth.service.ts:66-72`,
// `src/match/match.service.ts:211-216`), поэтому подмена — обычные объекты,
// реализующие интерфейс, без библиотеки моков (§9.11, §11.4). Настоящий
// PrismaClient в юнит-проекте не создаётся вовсе: `getPrisma()` здесь никто не зовёт.
//
// Ниже — переиспользуемое хранилище (Map + автоинкремент id + `reset()`), поверх
// которого пишется реализация любого интерфейса репозитория. Форма файла при
// добавлении нового интерфейса не меняется: добавляется только фабрика,
// использующая `InMemoryStore`.

import type { IAuthRepository, UserWithSecret } from "@/auth/auth.repository.js";
import type Field from "@/field/field.model.js";
import type { IFieldRepository } from "@/field/field.service.js";
import { buildMeta } from "@/types/pagination.js";

/** Минимум, который каркас требует от строки хранилища. */
export interface StoredEntity {
  id: number;
}

/** Данные строки без id — id выдаёт само хранилище. */
export type NewRow<T extends StoredEntity> = Omit<T, "id">;

/**
 * In-memory таблица: последовательные id с единицы, копирование на входе и
 * выходе (тест не может случайно мутировать хранилище через возвращённую
 * ссылку) и `reset()` для вызова между кейсами.
 */
export class InMemoryStore<T extends StoredEntity> {
  private rows = new Map<number, T>();
  private nextId = 1;

  /** Вставка с автоинкрементным id. */
  insert(data: NewRow<T>): T {
    const row = { ...data, id: this.nextId++ } as T;
    this.rows.set(row.id, row);
    return { ...row };
  }

  /** Вставка с заранее известным id (фикстура, ссылающаяся на конкретный id). */
  seed(row: T): T {
    this.rows.set(row.id, { ...row });
    if (row.id >= this.nextId) this.nextId = row.id + 1;
    return { ...row };
  }

  findById(id: number): T | null {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  find(predicate: (row: T) => boolean): T | null {
    for (const row of this.rows.values()) {
      if (predicate(row)) return { ...row };
    }
    return null;
  }

  filter(predicate: (row: T) => boolean): T[] {
    return this.all().filter(predicate);
  }

  /** Все строки в порядке вставки. */
  all(): T[] {
    return [...this.rows.values()].map((row) => ({ ...row }));
  }

  count(predicate?: (row: T) => boolean): number {
    return predicate ? this.filter(predicate).length : this.rows.size;
  }

  update(id: number, patch: Partial<NewRow<T>>): T | null {
    const row = this.rows.get(id);
    if (!row) return null;
    const updated = { ...row, ...patch, id } as T;
    this.rows.set(id, updated);
    return { ...updated };
  }

  delete(id: number): boolean {
    return this.rows.delete(id);
  }

  /** Полный сброс: строки и счётчик id. */
  reset(): void {
    this.rows.clear();
    this.nextId = 1;
  }
}

/** Сброс группы хранилищ одним вызовом в `beforeEach` теста сервиса. */
export function resetStores(...stores: { reset(): void }[]): void {
  for (const store of stores) store.reset();
}

// ---------------------------------------------------------------------------
// ТОЧКА РАСШИРЕНИЯ
//
// Реализации конкретных интерфейсов репозиториев добавляются сюда фабриками
// вида `createFakeXRepository(): IXRepository`, каждая поверх своего
// `InMemoryStore`.
//
// Отложено в Фазу 6 (матчевый домен переписывается параллельно):
//   - IMatchRepository            — src/match/match.service.ts:131-141
//   - IMatchParticipantRepository — src/match/match.service.ts:143-179
//     (контракт каждого метода участия закомментирован прямо в интерфейсе,
//      `:156-178` — заглушка пишется по этим комментариям, а не по догадке)
// ---------------------------------------------------------------------------

/** Строка хранилища: `UserWithSecret` плюс то, что отдают два других метода. */
export interface AuthUserRow extends StoredEntity {
  email: string;
  name: string | null;
  /** Хранимое значение вида `salt:hash` — как в колонке `User.password`. */
  password: string;
  roles: string[];
  playerId?: number;
}

export interface FakeAuthRepository extends IAuthRepository {
  users: InMemoryStore<AuthUserRow>;
  /** Аргументы вызовов: позволяют доказать, что ветка отсекла раньше запросов. */
  calls: {
    getUserByEmailWithSecret: string[];
    getRoleNames: number[];
    getPlayerIdByUserId: number[];
  };
  reset(): void;
}

/**
 * Поддельный `AuthRepository` для `AuthService` (`src/auth/auth.service.ts:66-72`).
 * Возвращает `password` целиком, в отличие от `UserRepository` — этого требует
 * `login` (`src/auth/auth.repository.ts:21-28`).
 */
export function createFakeAuthRepository(): FakeAuthRepository {
  const users = new InMemoryStore<AuthUserRow>();
  const calls: FakeAuthRepository["calls"] = {
    getUserByEmailWithSecret: [],
    getRoleNames: [],
    getPlayerIdByUserId: [],
  };

  return {
    users,
    calls,
    reset() {
      users.reset();
      calls.getUserByEmailWithSecret.length = 0;
      calls.getRoleNames.length = 0;
      calls.getPlayerIdByUserId.length = 0;
    },
    async getUserByEmailWithSecret(email: string): Promise<UserWithSecret | null> {
      calls.getUserByEmailWithSecret.push(email);
      const row = users.find((candidate) => candidate.email === email);
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        password: row.password,
      };
    },
    async getRoleNames(userId: number): Promise<string[]> {
      calls.getRoleNames.push(userId);
      return users.findById(userId)?.roles ?? [];
    },
    async getPlayerIdByUserId(userId: number): Promise<number | undefined> {
      calls.getPlayerIdByUserId.push(userId);
      return users.findById(userId)?.playerId;
    },
  };
}

/** Хранилища фейкового репозитория полей, открытые тесту для подготовки данных. */
export interface FakeFieldRepository extends IFieldRepository {
  fields: InMemoryStore<Field>;
  /** Локации нужны только по id: `locationExists` — единственный к ним запрос. */
  locations: InMemoryStore<StoredEntity>;
  reset(): void;
}

/** In-memory `IFieldRepository` — src/field/field.service.ts:41-51. */
export function createFakeFieldRepository(): FakeFieldRepository {
  const fields = new InMemoryStore<Field>();
  const locations = new InMemoryStore<StoredEntity>();

  return {
    fields,
    locations,
    reset: () => resetStores(fields, locations),

    async getFieldList(pagination, filters) {
      const rows = fields.filter((row) =>
        Object.entries(filters ?? {}).every(
          ([key, value]) => value === undefined || row[key as keyof Field] === value,
        ),
      );
      const page = pagination?.page ?? 1;
      const limit = pagination?.limit ?? 20;
      return {
        data: rows.slice((page - 1) * limit, page * limit),
        meta: buildMeta(page, limit, rows.length),
      };
    },

    async getField(id) {
      return fields.findById(id);
    },

    async createField(data) {
      const now = new Date();
      return fields.insert({
        ...data,
        isIndoor: data.isIndoor ?? false,
        createdAt: now,
        updatedAt: now,
      } as NewRow<Field>);
    },

    async updateField(id, data) {
      return fields.update(id, { ...data, updatedAt: new Date() });
    },

    async deleteField(id) {
      return fields.delete(id) ? 1 : 0;
    },

    async locationExists(id) {
      return locations.findById(id) !== null;
    },
  };
}
