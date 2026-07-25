import type { FastifyBaseLogger } from "fastify";
import { errorCodes as userErrorCodes } from "@/constants/index.js";
import type { PaginatedResult, PaginationQuery } from "@/types/pagination.js";

import type { ErrorResponse } from "@/types/prisma.js";
import { isErrorShape } from "@/utils/cache.js";
import type { CreateUser, UpdateUser } from "./types.js";
import { User } from "./user.model.js";

export interface UserListFilters {
  city?: string;
  isActive?: boolean;
}

export interface IUserRepository {
  getUserList(
    pagination?: PaginationQuery,
    filters?: UserListFilters,
  ): Promise<PaginatedResult<User>>;
  createUser(user: CreateUser): Promise<User | null>;
  deleteUser(id: number): Promise<number | null>;
  getUser(id: number): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  updateUser(user: UpdateUser): Promise<User | null>;
}

export default class UserService {
  private logger: FastifyBaseLogger;

  constructor(
    private userRepository: IUserRepository,
    logger: FastifyBaseLogger,
  ) {
    this.logger = logger;
  }

  getUserList(
    pagination?: PaginationQuery,
    filters?: UserListFilters,
  ): Promise<PaginatedResult<User>> {
    return this.userRepository.getUserList(pagination, filters);
  }

  async createUser(user: CreateUser): Promise<User | ErrorResponse> {
    try {
      const existingUser = await this.userRepository.getUserByEmail?.(user.email);
      if (existingUser) {
        return userErrorCodes.USER_EMAIL_DUPLICATED;
      }

      const createdUser = await this.userRepository.createUser(user);
      if (!createdUser) {
        return userErrorCodes.USER_NOT_CREATED;
      }
      return new User(createdUser);
    } catch (error) {
      this.logger.error({ err: error }, "createUser failed");
      throw error;
    }
  }

  async getUser(id: number): Promise<User | ErrorResponse> {
    const user = await this.userRepository.getUser(id);

    if (!user) {
      return userErrorCodes.USER_NOT_FOUND;
    }

    return user;
  }

  async updateUser(updateUser: UpdateUser): Promise<User | ErrorResponse> {
    const user = await this.getUser(updateUser.id);

    if (isErrorShape(user)) {
      return user;
    }

    const updated = await this.userRepository.updateUser(updateUser);
    if (!updated) {
      return userErrorCodes.USER_NOT_FOUND;
    }
    return updated;
  }

  async deleteUser(id: number): Promise<number | ErrorResponse> {
    const deletedUser = await this.userRepository.deleteUser(id);

    if (!deletedUser) {
      return userErrorCodes.USER_NOT_FOUND;
    }
    return deletedUser;
  }
}
