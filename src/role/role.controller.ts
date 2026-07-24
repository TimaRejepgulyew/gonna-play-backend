import type { FastifyInstance } from "fastify";
import { getPrisma } from "@/config/prisma.js";
import RoleRepository from "./role.repository.js";
import { type AssignRoleInput, RoleService } from "./role.service.js";

export class RoleController {
  private roleService: RoleService;

  constructor(server: FastifyInstance) {
    const prisma = getPrisma();
    const roleRepository = new RoleRepository(prisma);
    this.roleService = new RoleService(roleRepository, server.log);
  }

  listRoles() {
    return this.roleService.listRoles();
  }

  createRole(req: { body: { name: string } }) {
    return this.roleService.createRole(req.body.name);
  }

  deleteRole(req: { params: { id: string } }) {
    return this.roleService.deleteRole(Number(req.params.id));
  }

  assignRole(req: { body: AssignRoleInput }) {
    return this.roleService.assignRole(req.body);
  }

  revokeRole(req: { body: AssignRoleInput }) {
    return this.roleService.revokeRole(req.body);
  }
}
