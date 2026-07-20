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
import Location from "./location.model.js";

import type { Logger } from "pino";
import type { ErrorResponse } from "@/types/prisma.js";
import type {
  PaginatedResult,
  PaginationQuery,
} from "@/types/pagination.js";
import type { SURFACE_TYPE } from "@/constants/enums.js";

export interface CreateLocation {
  name: string;
  address?: string;
  city: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  surfaceType?: SURFACE_TYPE;
  capacity?: number;
  openingHours?: string;
}

export type UpdateLocation = Partial<CreateLocation>;

export interface LocationListFilters {
  city?: string;
  country?: string;
  search?: string;
}

export interface ILocationRepository {
  getLocationList(
    pagination?: PaginationQuery,
    filters?: LocationListFilters
  ): Promise<PaginatedResult<Location>>;
  getLocation(id: number): Promise<Location | null>;
  createLocation(data: CreateLocation): Promise<Location>;
  updateLocation(id: number, data: UpdateLocation): Promise<Location | null>;
  deleteLocation(id: number): Promise<number>;
}

export class LocationService {
  constructor(
    private locationRepository: ILocationRepository,
    private logger: Logger
  ) {}

  getLocationList(
    pagination?: PaginationQuery,
    filters?: LocationListFilters
  ): Promise<PaginatedResult<Location>> {
    // Cache class `location:list` (versioned).
    return getOrSetList(
      "location:list",
      { ...pagination, ...filters },
      CACHE_TTL.LOCATION_LIST,
      () => this.locationRepository.getLocationList(pagination, filters)
    );
  }

  async getLocation(id: number): Promise<Location | ErrorResponse> {
    // Cache class `location:detail` (single key, includes fields).
    const location = await getOrSet(
      cacheKeys.locationDetail(id),
      CACHE_TTL.LOCATION_DETAIL,
      () => this.locationRepository.getLocation(id)
    );
    if (!location) {
      return appErrorCodes.LOCATION_NOT_FOUND;
    }
    return location;
  }

  async createLocation(data: CreateLocation): Promise<Location> {
    const created = await this.locationRepository.createLocation(data);
    await bumpVersion("location:list");
    return created;
  }

  async updateLocation(
    id: number,
    data: UpdateLocation
  ): Promise<Location | ErrorResponse> {
    const existing = await this.locationRepository.getLocation(id);
    if (!existing) {
      return appErrorCodes.LOCATION_NOT_FOUND;
    }
    const updated = await this.locationRepository.updateLocation(id, data);
    if (!updated) {
      return appErrorCodes.LOCATION_NOT_FOUND;
    }
    await Promise.all([
      bumpVersion("location:list"),
      cacheDel(cacheKeys.locationDetail(id)),
    ]);
    return updated;
  }

  async deleteLocation(id: number): Promise<{ status: string } | ErrorResponse> {
    const existing = await this.locationRepository.getLocation(id);
    if (!existing) {
      return appErrorCodes.LOCATION_NOT_FOUND;
    }
    try {
      await this.locationRepository.deleteLocation(id);
      await Promise.all([
        bumpVersion("location:list"),
        cacheDel(cacheKeys.locationDetail(id)),
      ]);
      return { status: "success" };
    } catch (error) {
      // Cascade Location -> Field is blocked by Field -> Match (Restrict).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2003" || error.code === "P2014")
      ) {
        return appErrorCodes.LOCATION_HAS_MATCHES;
      }
      this.logger.error(error);
      throw error;
    }
  }
}
