import { Type } from "typebox";

export default class Role {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(role: Role) {
    this.id = role.id;
    this.name = role.name;
    this.createdAt = role.createdAt;
    this.updatedAt = role.updatedAt;
  }
}

export const createRoleSchema = Type.Object({
  name: Type.String({ minLength: 2 }),
});

export const assignRoleSchema = Type.Object({
  userId: Type.Integer(),
  roleId: Type.Integer(),
});
