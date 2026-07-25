import { Composite, Type } from "typebox";
import { PLAYER_STATUS } from "@/constants/enums.js";
import { paginationQuerySchema } from "@/types/pagination.js";
import { createUserSchema, type User, updateUserSchema } from "@/user/user.model.js";
import { PLAYER_LEVEL, PLAYER_POSITION } from "./constant.js";

export interface PlayerRatingAggregate {
  average: number;
  count: number;
}

export default class Player {
  id: number;
  name: string;
  level?: PLAYER_LEVEL;
  position?: PLAYER_POSITION;
  status?: PLAYER_STATUS;
  userId?: number;
  createdAt: string;
  updatedAt: string;

  user?: User;
  rating?: PlayerRatingAggregate;

  constructor(player: Player) {
    this.id = player.id;
    this.name = player.name;
    this.level = player.level;
    this.position = player.position;
    this.status = player.status;
    this.userId = player.userId;

    this.createdAt = player.createdAt;
    this.updatedAt = player.updatedAt;

    this.user = player.user;
    this.rating = player.rating;
  }
}

export const createPlayerSchema = Type.Object({
  name: Type.String(),
  level: Type.Optional(Type.Enum(PLAYER_LEVEL)),
  position: Type.Optional(Type.Enum(PLAYER_POSITION)),
  userId: Type.Optional(Type.Number()),
  user: Type.Optional(createUserSchema),
});

export const updatePlayerSchema = Type.Object({
  name: Type.Optional(Type.String()),
  level: Type.Optional(Type.Enum(PLAYER_LEVEL)),
  position: Type.Optional(Type.Enum(PLAYER_POSITION)),
  status: Type.Optional(Type.Enum(PLAYER_STATUS)),
  userId: Type.Optional(Type.Number()),
  user: Type.Optional(updateUserSchema),
});

export const playerListQuerySchema = Composite(
  paginationQuerySchema,
  Type.Object({
    level: Type.Optional(Type.Enum(PLAYER_LEVEL)),
    position: Type.Optional(Type.Enum(PLAYER_POSITION)),
    status: Type.Optional(Type.Enum(PLAYER_STATUS)),
    search: Type.Optional(Type.String()),
  }),
);
