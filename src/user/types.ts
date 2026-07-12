import type { User } from "./user.model.js";

export interface CreateUser
  extends Omit<User, "id" | "createdAt" | "updatedAt"> {}

export interface UpdateUser extends Omit<User, "createdAt" | "updatedAt"> {}
