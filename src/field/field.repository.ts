import { PrismaClient } from "@prisma/client";

import { resolvePagination } from "@/types/pagination.js";
import Field from "./field.model.js";

import type {
  CreateField,
  FieldListFilters,
  IFieldRepository,
  UpdateField,
} from "./field.service.js";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/types/pagination.js";

const FIELD_SORT_FIELDS = ["createdAt", "updatedAt", "name", "format"];

export default class FieldRepository implements IFieldRepository {
  constructor(private prisma: PrismaClient) {}

  async getFieldList(
    pagination: PaginationQuery = {},
    filters: FieldListFilters = {}
  ): Promise<PaginatedResult<Field>> {
    const { skip, take, page, limit, orderBy } = resolvePagination(
      pagination,
      FIELD_SORT_FIELDS,
      "createdAt"
    );

    const where = {
      ...(filters.locationId ? { locationId: filters.locationId } : {}),
      ...(filters.format ? { format: filters.format } : {}),
      ...(filters.surface ? { surface: filters.surface } : {}),
      ...(filters.isIndoor !== undefined ? { isIndoor: filters.isIndoor } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.field.findMany({ where, skip, take, orderBy }),
      this.prisma.field.count({ where }),
    ]);

    return {
      data: rows as unknown as Field[],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getField(id: number): Promise<Field | null> {
    const field = await this.prisma.field.findUnique({
      where: { id },
      include: { location: true },
    });
    return field as unknown as Field | null;
  }

  async createField(data: CreateField): Promise<Field> {
    const created = await this.prisma.field.create({ data });
    return created as unknown as Field;
  }

  async updateField(id: number, data: UpdateField): Promise<Field | null> {
    const updated = await this.prisma.field.update({ where: { id }, data });
    return updated as unknown as Field | null;
  }

  async deleteField(id: number): Promise<number> {
    await this.prisma.field.delete({ where: { id } });
    return id;
  }

  async locationExists(id: number): Promise<boolean> {
    const location = await this.prisma.location.findUnique({
      where: { id },
      select: { id: true },
    });
    return !!location;
  }
}
