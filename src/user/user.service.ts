import { errorCodes } from "fastify";

import { errorCodes as userErrorCodes } from "@/constants/index.js";
import type { PaginatedResult, PaginationQuery } from "@/types/pagination.js";

import type { ErrorResponse } from "@/types/prisma.js";
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
  constructor(private userRepository: IUserRepository) {}

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
    } catch {
      throw errorCodes.FST_ERR_CTP_INVALID_HANDLER();
    }
  }

  async getUser(id: number): Promise<User> {
    const user = await this.userRepository.getUser(id);

    if (!user) {
      throw errorCodes.FST_ERR_NOT_FOUND();
    }

    return user;
  }

  async updateUser(updateUser: UpdateUser): Promise<User | null> {
    const user = await this.getUser(updateUser.id);

    if (!user) {
      throw errorCodes.FST_ERR_NOT_FOUND();
    }

    return this.userRepository.updateUser(updateUser);
  }

  async deleteUser(id: number): Promise<number> {
    const deletedUser = await this.userRepository.deleteUser(id);

    if (!deletedUser) {
      throw errorCodes.FST_ERR_NOT_FOUND();
    }
    return deletedUser;
  }
}
