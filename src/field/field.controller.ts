import { getPrisma } from "@/config/prisma.js";
import FieldRepository from "./field.repository.js";
import {
  CreateField,
  FieldListFilters,
  FieldService,
  UpdateField,
} from "./field.service.js";

import type { FastifyInstance } from "fastify";
import type { PaginationQuery } from "@/types/pagination.js";

export class FieldController {
  private fieldService: FieldService;

  constructor(
    server: FastifyInstance
  ) {
    const prisma = getPrisma();
    const fieldRepository = new FieldRepository(prisma);
    this.fieldService = new FieldService(fieldRepository, server.log);
  }

  getFieldList(req: { query: PaginationQuery & FieldListFilters }) {
    const { page, limit, sort, order, locationId, format, surface, isIndoor } =
      req.query;
    return this.fieldService.getFieldList(
      { page, limit, sort, order },
      { locationId, format, surface, isIndoor }
    );
  }

  getField(req: { params: { id: string } }) {
    return this.fieldService.getField(Number(req.params.id));
  }

  createField(req: { body: CreateField }) {
    return this.fieldService.createField(req.body);
  }

  updateField(req: { body: UpdateField; params: { id: string } }) {
    return this.fieldService.updateField(Number(req.params.id), req.body);
  }

  deleteField(req: { params: { id: string } }) {
    return this.fieldService.deleteField(Number(req.params.id));
  }
}
