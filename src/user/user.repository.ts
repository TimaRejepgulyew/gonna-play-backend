import { User } from "./user.model.js";

import type { UpdateUser } from "./user.service.js";

const userTable = new Map<number, User>();

export default class UserRepository {
  constructor() {}

  async getUserList(): Promise<User[]> {
    return Array.from(userTable.values());
  }

  async createUser(
    user: Omit<User, "id" | "createdAt" | "updatedAt">
  ): Promise<User | null> {
    const id = userTable.size + 1;

    userTable.set(
      id,
      Object.assign(user, {
        id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );

    return userTable.get(id) || null;
  }

  async getUser(id: number): Promise<User | null> {
    return userTable.has(id) ? (userTable.get(id) as User) : null;
  }

  async updateUser(user: UpdateUser): Promise<User | null> {
    const prevUser = userTable.get(user.id);

    if (prevUser) {
      userTable.set(
        user.id,
        Object.assign(
          prevUser,
          Object.assign(user, {
            updatedAt: new Date().toISOString(),
          })
        )
      );

      return userTable.get(user.id) as User;
    }

    return null;
  }

  async deleteUser(id: number): Promise<number | null> {
    if (!userTable.has(id)) {
      return null;
    }

    userTable.delete(id);

    return id;
  }
}
