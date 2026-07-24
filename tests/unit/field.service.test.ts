import type { FastifyBaseLogger } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MATCH_FORMAT } from "@/constants/enums.js";
import { errorCodes } from "@/constants/index.js";
import { FieldService } from "@/field/field.service.js";
import { createFakeFieldRepository, type FakeFieldRepository } from "./doubles/repositories.js";

const logger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as unknown as FastifyBaseLogger;

const payload = {
  locationId: 1,
  name: "Field A",
  format: MATCH_FORMAT.FIVE,
};

describe("FieldService.createField", () => {
  let repository: FakeFieldRepository;
  let service: FieldService;

  beforeEach(() => {
    repository = createFakeFieldRepository();
    service = new FieldService(repository, logger);
  });

  // UNIT-11: src/field/field.service.ts:86-89.
  it("returns LOCATION_NOT_FOUND instead of throwing when the location is absent", async () => {
    const createSpy = vi.spyOn(repository, "createField");

    const result = await service.createField(payload);

    // Доменная ошибка возвращается, а не бросается; HTTP-статус ставит
    // preSerialization (src/index.ts:33-38), поэтому ассертим тело.
    expect(result).toEqual(errorCodes.LOCATION_NOT_FOUND);
    expect(result).toMatchObject({ code: 404 });
    // Ветка отсекает раньше записи — иначе тест зеленел бы и на сервисе,
    // который сперва создаёт поле, а потом возвращает ошибку.
    expect(createSpy).not.toHaveBeenCalled();
    expect(repository.fields.count()).toBe(0);
  });

  it("creates the field when the location exists", async () => {
    repository.locations.seed({ id: payload.locationId });

    const result = await service.createField(payload);

    expect(result).toMatchObject({ id: 1, name: "Field A", locationId: 1 });
    expect(repository.fields.count()).toBe(1);
  });
});
