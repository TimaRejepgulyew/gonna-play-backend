import { Type } from "@sinclair/typebox";

import { createUserSchema, updateUserSchema, User } from "@/user/user.model.js";
import { PLAYER_LEVEL, PLAYER_POSITION } from "./constant.js";

export default class Player {
  id: number;
  name: string;
  level?: PLAYER_LEVEL;
  position?: PLAYER_POSITION;
  userId?: number;
  createdAt: string;
  updatedAt: string;

  user?: User;

  constructor(player: Player) {
    this.id = player.id;
    this.name = player.name;
    this.level = player.level;
    this.position = player.position;
    this.userId = player.userId;

    this.createdAt = player.createdAt;
    this.updatedAt = player.updatedAt;

    this.user = player.user;
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
  id: Type.Number(),
  name: Type.String(),
  level: Type.Optional(Type.Enum(PLAYER_LEVEL)),
  position: Type.Optional(Type.Enum(PLAYER_POSITION)),
  userId: Type.Optional(Type.Number()),
  user: Type.Optional(updateUserSchema),
});
