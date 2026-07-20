import { Type } from "@sinclair/typebox";

import { SURFACE_TYPE } from "@/constants/enums.js";
import { paginationQuerySchema } from "@/types/pagination.js";

export default class Location {
  id: number;
  name: string;
  address?: string;
  city: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  surfaceType?: SURFACE_TYPE;
  capacity?: number;
  openingHours?: string;
  createdAt: Date;
  updatedAt: Date;

  fields?: unknown[];

  constructor(location: Location) {
    this.id = location.id;
    this.name = location.name;
    this.address = location.address;
    this.city = location.city;
    this.country = location.country;
    this.latitude = location.latitude;
    this.longitude = location.longitude;
    this.surfaceType = location.surfaceType;
    this.capacity = location.capacity;
    this.openingHours = location.openingHours;
    this.createdAt = location.createdAt;
    this.updatedAt = location.updatedAt;
    this.fields = location.fields;
  }
}

export const createLocationSchema = Type.Object({
  name: Type.String(),
  address: Type.Optional(Type.String()),
  city: Type.String(),
  country: Type.Optional(Type.String()),
  latitude: Type.Optional(Type.Number()),
  longitude: Type.Optional(Type.Number()),
  surfaceType: Type.Optional(Type.Enum(SURFACE_TYPE)),
  capacity: Type.Optional(Type.Integer({ minimum: 0 })),
  openingHours: Type.Optional(Type.String()),
});

export const updateLocationSchema = Type.Partial(createLocationSchema);

export const locationListQuerySchema = Type.Composite([
  paginationQuerySchema,
  Type.Object({
    city: Type.Optional(Type.String()),
    country: Type.Optional(Type.String()),
    search: Type.Optional(Type.String()),
  }),
]);
