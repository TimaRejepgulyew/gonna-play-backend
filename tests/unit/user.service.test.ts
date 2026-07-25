import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorCodes } from "@/constants/index.js";
import type { CreateUser, UpdateUser } from "@/user/types.js";
import type { User } from "@/user/user.model.js";
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
