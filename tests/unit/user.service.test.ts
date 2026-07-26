import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorCodes } from "@/constants/index.js";
import { Prisma, type PrismaClient } from "@/types/prisma.js";
import type { CreateUser, UpdateUser } from "@/user/types.js";
import type { User } from "@/user/user.model.js";
import {
  hasPrivilegedUserFields,
  PRIVILEGED_USER_FIELDS,
  updateUserSchema,
} from "@/user/user.model.js";
import UserRepository from "@/user/user.repository.js";
import UserService, { type IUserRepository } from "@/user/user.service.js";

const logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as unknown as FastifyBaseLogger;

const fakeUser = { id: 1, email: "a@b.c", name: "A" } as unknown as User;

function createFakeRepository(): IUserRepository {
  return {
    getUserList: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    getUser: vi.fn(),
    getUserByEmail: vi.fn(),
    updateUser: vi.fn(),
  };
}

describe("UserService return-as-value convention", () => {
  let repository: IUserRepository;
  let service: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createFakeRepository();
    service = new UserService(repository, logger);
  });

  describe("getUser", () => {
    it("returns USER_NOT_FOUND instead of throwing when the record is absent", async () => {
      vi.mocked(repository.getUser).mockResolvedValue(null);

      const result = await service.getUser(1);

      expect(result).toEqual(errorCodes.USER_NOT_FOUND);
      expect(result).toMatchObject({ code: 404 });
    });

    it("returns the user on happy path", async () => {
      vi.mocked(repository.getUser).mockResolvedValue(fakeUser);

      const result = await service.getUser(1);

      expect(result).toBe(fakeUser);
    });
  });

  describe("updateUser", () => {
    it("returns USER_NOT_FOUND when the record is absent", async () => {
      vi.mocked(repository.getUser).mockResolvedValue(null);

      const result = await service.updateUser({ id: 1 } as UpdateUser);

      expect(result).toEqual(errorCodes.USER_NOT_FOUND);
      expect(repository.updateUser).not.toHaveBeenCalled();
    });

    it("returns USER_NOT_FOUND when the repository update yields nothing", async () => {
      vi.mocked(repository.getUser).mockResolvedValue(fakeUser);
      vi.mocked(repository.updateUser).mockResolvedValue(null);

      const result = await service.updateUser({ id: 1 } as UpdateUser);

      expect(result).toEqual(errorCodes.USER_NOT_FOUND);
    });

    it("returns the updated user on happy path", async () => {
      vi.mocked(repository.getUser).mockResolvedValue(fakeUser);
      vi.mocked(repository.updateUser).mockResolvedValue(fakeUser);

      const result = await service.updateUser({ id: 1 } as UpdateUser);

      expect(result).toBe(fakeUser);
    });
  });

  describe("deleteUser", () => {
    it("returns USER_NOT_FOUND instead of throwing when the record is absent", async () => {
      vi.mocked(repository.deleteUser).mockResolvedValue(null);

      const result = await service.deleteUser(1);

      expect(result).toEqual(errorCodes.USER_NOT_FOUND);
    });

    it("returns the deleted id on happy path", async () => {
      vi.mocked(repository.deleteUser).mockResolvedValue(1);

      const result = await service.deleteUser(1);

      expect(result).toBe(1);
    });
  });

  describe("createUser", () => {
    it("logs and re-throws the original error when the repository throws", async () => {
      const boom = new Error("prisma down");
      vi.mocked(repository.getUserByEmail).mockResolvedValue(null);
      vi.mocked(repository.createUser).mockRejectedValue(boom);

      await expect(service.createUser({ email: "a@b.c" } as CreateUser)).rejects.toBe(boom);
      expect(logger.error).toHaveBeenCalledWith({ err: boom }, "createUser failed");
    });

    it("creates the user on happy path", async () => {
      vi.mocked(repository.getUserByEmail).mockResolvedValue(null);
      vi.mocked(repository.createUser).mockResolvedValue(fakeUser);

      const result = await service.createUser({ email: "a@b.c" } as CreateUser);

      expect(result).toMatchObject({ id: 1, email: "a@b.c" });
    });
  });
});

function prismaDoubleWithDelete(deleteFn: () => Promise<unknown>): PrismaClient {
  return { user: { delete: deleteFn } } as unknown as PrismaClient;
}

function knownRequestError(code: string): Error {
  return new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "test" });
}

describe("UserRepository.deleteUser", () => {
  it("returns null instead of throwing when Prisma reports P2025", async () => {
    const repository = new UserRepository(
      prismaDoubleWithDelete(() => Promise.reject(knownRequestError("P2025"))),
    );

    await expect(repository.deleteUser(404)).resolves.toBeNull();
  });

  it("re-throws any other Prisma error", async () => {
    const other = knownRequestError("P2003");
    const repository = new UserRepository(prismaDoubleWithDelete(() => Promise.reject(other)));

    await expect(repository.deleteUser(1)).rejects.toBe(other);
  });

  it("returns the deleted id on happy path", async () => {
    const repository = new UserRepository(prismaDoubleWithDelete(() => Promise.resolve({ id: 7 })));

    await expect(repository.deleteUser(7)).resolves.toBe(7);
  });
});

describe("UserRepository.updateUser", () => {
  it("writes firstName and lastName when the provider import fills empty names", async () => {
    const calls: { data: Record<string, unknown> }[] = [];
    const prisma = {
      user: {
        update: (args: { data: Record<string, unknown> }) => {
          calls.push(args);
          return Promise.resolve({ id: 1, ...args.data });
        },
      },
    } as unknown as PrismaClient;

    const repository = new UserRepository(prisma);
    const updated = await repository.updateUser({
      id: 1,
      firstName: "Ada",
      lastName: "Lovelace",
    } as UpdateUser);

    expect(calls[0]?.data).toMatchObject({ firstName: "Ada", lastName: "Lovelace" });
    expect(updated).toMatchObject({ firstName: "Ada", lastName: "Lovelace" });
  });
});

describe("updateUserSchema", () => {
  const properties = updateUserSchema.properties as Record<string, unknown>;

  it("no longer accepts a password: changing it is a separate flow", () => {
    expect(properties.password).toBeUndefined();
  });

  it("rejects unknown properties instead of dropping them silently", () => {
    expect((updateUserSchema as { additionalProperties?: boolean }).additionalProperties).toBe(
      false,
    );
  });

  it("keeps the privileged field list in sync with the schema", () => {
    for (const field of PRIVILEGED_USER_FIELDS) {
      expect(properties[field]).toBeDefined();
    }
  });
});

describe("hasPrivilegedUserFields", () => {
  it("reports every privileged field sent by a non-admin", () => {
    for (const field of PRIVILEGED_USER_FIELDS) {
      expect(hasPrivilegedUserFields({ [field]: true }, false)).toBe(true);
    }
  });

  it("lets an admin send the same fields", () => {
    expect(hasPrivilegedUserFields({ isEmailVerified: true }, true)).toBe(false);
  });

  it("ignores ordinary fields and a missing body", () => {
    expect(hasPrivilegedUserFields({ name: "A" }, false)).toBe(false);
    expect(hasPrivilegedUserFields(undefined, false)).toBe(false);
  });

  it("catches a field explicitly set to false: presence is what matters", () => {
    expect(hasPrivilegedUserFields({ isActive: false }, false)).toBe(true);
  });
});
