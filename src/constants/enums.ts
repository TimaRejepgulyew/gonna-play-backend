// Shared TS mirrors of Prisma enums for TypeBox `Type.Enum(...)` usage.
// Values MUST match the generated `@prisma/client` enum member names so the
// parsed request values are directly assignable to Prisma fields.
// Player-scoped enums (PLAYER_LEVEL, PLAYER_POSITION) live in
// `src/player/constant.ts` and are imported from there where needed.

export enum MATCH_FORMAT {
  FIVE = "FIVE",
  SEVEN = "SEVEN",
  ELEVEN = "ELEVEN",
}

export enum MATCH_STATUS {
  DRAFT = "DRAFT",
  OPEN = "OPEN",
  FULL = "FULL",
  CONFIRMED = "CONFIRMED",
  IN_PROGRESS = "IN_PROGRESS",
  FINISHED = "FINISHED",
  CANCELLED = "CANCELLED",
}

export enum MATCH_VISIBILITY {
  PUBLIC = "PUBLIC",
  PRIVATE = "PRIVATE",
}

export enum PARTICIPANT_STATUS {
  REGISTERED = "REGISTERED",
  WAITLISTED = "WAITLISTED",
  CONFIRMED = "CONFIRMED",
  CHECKED_IN = "CHECKED_IN",
  NO_SHOW = "NO_SHOW",
  CANCELLED = "CANCELLED",
}

export enum TEAM_SIDE {
  A = "A",
  B = "B",
}

export enum PAYMENT_STATUS {
  UNPAID = "UNPAID",
  PAID = "PAID",
  WAIVED = "WAIVED",
}

export enum SURFACE_TYPE {
  NATURAL_GRASS = "NATURAL_GRASS",
  ARTIFICIAL_GRASS = "ARTIFICIAL_GRASS",
  FUTSAL = "FUTSAL",
  CONCRETE = "CONCRETE",
  DIRT = "DIRT",
}

export enum PLAYER_STATUS {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}
