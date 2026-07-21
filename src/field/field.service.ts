import { Prisma } from "@prisma/client";

import { errorCodes as appErrorCodes } from "@/constants/index.js";
import {
  CACHE_TTL,
  cacheKeys,
  cacheDel,
  bumpVersion,
  getOrSet,
  getOrSetList,
} from "@/utils/cache.js";
import Field from "./field.model.js";

import type { FastifyBaseLogger } from "fastify";
import type { ErrorResponse } from "@/types/prisma.js";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/types/pagination.js";
import type { MATCH_FORMAT, SURFACE_TYPE } from "@/constants/enums.js";

export interface CreateField {
  locationId: number;
  name: string;
  format: MATCH_FORMAT;
  surface?: SURFACE_TYPE;
  width?: number;
  length?: number;
  isIndoor?: boolean;
}

export type UpdateField = Partial<Omit<CreateField, "locationId">>;

export interface FieldListFilters {
  locationId?: number;
  format?: MATCH_FORMAT;
  surface?: SURFACE_TYPE;
  isIndoor?: boolean;
}

export interface IFieldRepository {
  getFieldList(
    pagination?: PaginationQuery,
    filters?: FieldListFilters
  ): Promise<PaginatedResult<Field>>;
  getField(id: number): Promise<Field | null>;
  createField(data: CreateField): Promise<Field>;
  updateField(id: number, data: UpdateField): Promise<Field | null>;
  deleteField(id: number): Promise<number>;
  locationExists(id: number): Promise<boolean>;
}

export class FieldService {
  constructor(
    private fieldRepository: IFieldRepository,
    private logger: FastifyBaseLogger
  ) {}

  getFieldList(
    pagination?: PaginationQuery,
    filters?: FieldListFilters
  ): Promise<PaginatedResult<Field>> {
    // Cache class `field:list` (versioned).
    return getOrSetList(
      "field:list",
      { ...pagination, ...filters },
      CACHE_TTL.FIELD_LIST,
      () => this.fieldRepository.getFieldList(pagination, filters)
    );
  }

  async getField(id: number): Promise<Field | ErrorResponse> {
    // Cache class `field:detail` (single key).
    const field = await getOrSet(
      cacheKeys.fieldDetail(id),
      CACHE_TTL.FIELD_DETAIL,
      () => this.fieldRepository.getField(id)
    );
    if (!field) {
      return appErrorCodes.FIELD_NOT_FOUND;
    }
    return field;
  }

  async createField(data: CreateField): Promise<Field | ErrorResponse> {
    const exists = await this.fieldRepository.locationExists(data.locationId);
    if (!exists) {
      return appErrorCodes.LOCATION_NOT_FOUND;
    }
    const created = await this.fieldRepository.createField(data);
    // New field alters the list and its location's detail (fields included).
    await Promise.all([
      bumpVersion("field:list"),
      cacheDel(cacheKeys.locationDetail(data.locationId)),
    ]);
    return created;
  }

  async updateField(
    id: number,
    data: UpdateField
  ): Promise<Field | ErrorResponse> {
    const existing = await this.fieldRepository.getField(id);
    if (!existing) {
      return appErrorCodes.FIELD_NOT_FOUND;
    }
    const updated = await this.fieldRepository.updateField(id, data);
    if (!updated) {
      return appErrorCodes.FIELD_NOT_FOUND;
    }
    await Promise.all([
      bumpVersion("field:list"),
      cacheDel(cacheKeys.fieldDetail(id)),
      cacheDel(cacheKeys.locationDetail(existing.locationId)),
    ]);
    return updated;
  }

  async deleteField(id: number): Promise<{ status: string } | ErrorResponse> {
    const existing = await this.fieldRepository.getField(id);
    if (!existing) {
      return appErrorCodes.FIELD_NOT_FOUND;
    }
    try {
      await this.fieldRepository.deleteField(id);
      await Promise.all([
        bumpVersion("field:list"),
        cacheDel(cacheKeys.fieldDetail(id)),
        cacheDel(cacheKeys.locationDetail(existing.locationId)),
      ]);
      return { status: "success" };
    } catch (error) {
      // Field -> Match relation is Restrict: deletion is blocked with matches.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2003" || error.code === "P2014")
      ) {
        return appErrorCodes.FIELD_HAS_MATCHES;
      }
      this.logger.error(error);
      throw error;
    }
  }
}
