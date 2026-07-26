import type {
  PLAYER_LEVEL,
  PLAYER_POSITION,
  PLAYER_STATUS,
  Player,
  Role,
  User,
  UserRole,
} from "@/generated/prisma/client.js";

export { Prisma, PrismaClient } from "@/generated/prisma/client.js";
// Re-export Prisma types for convenient usage across the application
export type { PLAYER_LEVEL, PLAYER_POSITION, PLAYER_STATUS, Player, Role, User, UserRole };

// Utility types for common operations
export type UserWithRoles = User & {
  userRoles: (UserRole & {
    role: Role;
  })[];
};

export type UserWithPlayer = User & {
  player: Player | null;
};

export type UserComplete = User & {
  player: Player | null;
  userRoles: (UserRole & {
    role: Role;
  })[];
};

export type PlayerWithUser = Player & {
  user: User | null;
};

// Input types for API operations
export interface CreateUserInput {
  email: string;
  password: string;
  name?: string;
  birthDate: string;
  city?: string;
  country?: string;
  gender?: string;
  phone?: string;
}

export interface UpdateUserInput {
  name?: string;
  avatar?: string;
  city?: string;
  country?: string;
  gender?: string;
  phone?: string;
  isActive?: boolean;
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
}

export interface CreatePlayerInput {
  name: string;
  level?: PLAYER_LEVEL;
  position?: PLAYER_POSITION;
  userId?: number;
}

export interface UpdatePlayerInput {
  name?: string;
  level?: PLAYER_LEVEL;
  position?: PLAYER_POSITION;
  status?: PLAYER_STATUS;
}

// Response types for API operations
export interface UserResponse {
  id: number;
  email: string | null;
  name: string | null;
  avatar: string | null;
  birthDate: string | null;
  city: string | null;
  country: string | null;
  gender: string | null;
  isActive: boolean | null;
  isEmailVerified: boolean | null;
  isPhoneVerified: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlayerResponse {
  id: number;
  name: string;
  level: PLAYER_LEVEL | null;
  position: PLAYER_POSITION | null;
  status: PLAYER_STATUS | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ErrorResponse = {
  code: number;
  message: string;
};
