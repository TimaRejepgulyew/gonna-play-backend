import { errorCodes } from "fastify";
import { User } from "./user.model.js";
import UserRepository from "./user.repository.js";

export interface IUserRepository {
  createUser(user: CreateUser): Promise<User | null>;
  getUser(id: number): Promise<User | null>;
  updateUser(user: UpdateUser): Promise<User | null>;
  deleteUser(id: number): Promise<number | null>;
}

export interface CreateUser
  extends Omit<User, "id" | "createdAt" | "updatedAt"> {}

export interface UpdateUser extends Omit<User, "createdAt" | "updatedAt"> {}

export default class UserService {
  private userRepository: UserRepository;
  constructor() {
    this.userRepository = new UserRepository();
  }

  async createUser(user: CreateUser): Promise<User> {
    const createdUser = await this.userRepository.createUser(user);
    if (!createdUser) {
      throw errorCodes.FST_ERR_NOT_FOUND();
    }
    return createdUser;
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
