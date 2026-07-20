import { PrismaClient } from "@prisma/client";

import { resolvePagination } from "@/types/pagination.js";
import Location from "./location.model.js";

import type {
  CreateLocation,
  ILocationRepository,
  LocationListFilters,
  UpdateLocation,
} from "./location.service.js";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/types/pagination.js";

const LOCATION_SORT_FIELDS = ["createdAt", "updatedAt", "name", "city"];

export default class LocationRepository implements ILocationRepository {
  constructor(private prisma: PrismaClient) {}

  async getLocationList(
    pagination: PaginationQuery = {},
    filters: LocationListFilters = {}
  ): Promise<PaginatedResult<Location>> {
    const { skip, take, page, limit, orderBy } = resolvePagination(
      pagination,
      LOCATION_SORT_FIELDS,
      "createdAt"
    );

    const where = {
      ...(filters.city ? { city: filters.city } : {}),
      ...(filters.country ? { country: filters.country } : {}),
      ...(filters.search
        ? { name: { contains: filters.search, mode: "insensitive" as const } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.location.findMany({ where, skip, take, orderBy }),
      this.prisma.location.count({ where }),
    ]);

    return {
      data: rows as unknown as Location[],
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getLocation(id: number): Promise<Location | null> {
    const location = await this.prisma.location.findUnique({
      where: { id },
      include: { fields: true },
    });
    return location as unknown as Location | null;
  }

  async createLocation(data: CreateLocation): Promise<Location> {
    const created = await this.prisma.location.create({ data });
    return created as unknown as Location;
  }

  async updateLocation(
    id: number,
    data: UpdateLocation
  ): Promise<Location | null> {
    const updated = await this.prisma.location.update({ where: { id }, data });
    return updated as unknown as Location | null;
  }

  async deleteLocation(id: number): Promise<number> {
    await this.prisma.location.delete({ where: { id } });
    return id;
  }
}
