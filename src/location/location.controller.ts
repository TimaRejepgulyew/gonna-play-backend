import type { FastifyInstance } from "fastify";
import { getPrisma } from "@/config/prisma.js";
import type { PaginationQuery } from "@/types/pagination.js";
import LocationRepository from "./location.repository.js";
import {
  type CreateLocation,
  type LocationListFilters,
  LocationService,
  type UpdateLocation,
} from "./location.service.js";

export class LocationController {
  private locationService: LocationService;

  constructor(server: FastifyInstance) {
    const prisma = getPrisma();
    const locationRepository = new LocationRepository(prisma);
    this.locationService = new LocationService(locationRepository, server.log);
  }

  getLocationList(req: { query: PaginationQuery & LocationListFilters }) {
    const { page, limit, sort, order, city, country, search } = req.query;
    return this.locationService.getLocationList(
      { page, limit, sort, order },
      { city, country, search },
    );
  }

  getLocation(req: { params: { id: string } }) {
    return this.locationService.getLocation(Number(req.params.id));
  }

  createLocation(req: { body: CreateLocation }) {
    return this.locationService.createLocation(req.body);
  }

  updateLocation(req: { body: UpdateLocation; params: { id: string } }) {
    return this.locationService.updateLocation(Number(req.params.id), req.body);
  }

  deleteLocation(req: { params: { id: string } }) {
    return this.locationService.deleteLocation(Number(req.params.id));
  }
}
