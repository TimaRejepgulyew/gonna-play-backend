import { Type } from "@sinclair/typebox";

import { MATCH_FORMAT, SURFACE_TYPE } from "@/constants/enums.js";
import { paginationQuerySchema } from "@/types/pagination.js";

export default class Field {
  id: number;
  locationId: number;
  name: string;
  format: MATCH_FORMAT;
  surface?: SURFACE_TYPE;
  width?: number;
  length?: number;
  isIndoor: boolean;
  createdAt: Date;
  updatedAt: Date;

  location?: unknown;

  constructor(field: Field) {
    this.id = field.id;
    this.locationId = field.locationId;
    this.name = field.name;
    this.format = field.format;
    this.surface = field.surface;
    this.width = field.width;
    this.length = field.length;
    this.isIndoor = field.isIndoor;
    this.createdAt = field.createdAt;
    this.updatedAt = field.updatedAt;
    this.location = field.location;
  }
}

export const createFieldSchema = Type.Object({
  locationId: Type.Integer(),
  name: Type.String(),
  format: Type.Enum(MATCH_FORMAT),
  surface: Type.Optional(Type.Enum(SURFACE_TYPE)),
  width: Type.Optional(Type.Number()),
  length: Type.Optional(Type.Number()),
  isIndoor: Type.Optional(Type.Boolean()),
});

export const updateFieldSchema = Type.Partial(
  Type.Omit(createFieldSchema, ["locationId"])
);

export const fieldListQuerySchema = Type.Composite([
  paginationQuerySchema,
  Type.Object({
    locationId: Type.Optional(Type.Integer()),
    format: Type.Optional(Type.Enum(MATCH_FORMAT)),
    surface: Type.Optional(Type.Enum(SURFACE_TYPE)),
    isIndoor: Type.Optional(Type.Boolean()),
  }),
]);
