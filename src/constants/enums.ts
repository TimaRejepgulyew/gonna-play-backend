// Shared TS mirrors of Prisma enums for TypeBox `Type.Enum(...)` usage.
// Values MUST match the generated `@prisma/client` enum member names so the
// parsed request values are directly assignable to Prisma fields.
// Player-scoped enums (PLAYER_LEVEL, PLAYER_POSITION) live in
// `src/player/constant.ts` and are imported from there where needed.

export enum MATCH_FORMAT {
  FIVE_V_FIVE = "FIVE_V_FIVE",
  SEVEN_V_SEVEN = "SEVEN_V_SEVEN",
  ELEVEN_V_ELEVEN = "ELEVEN_V_ELEVEN",
}

export enum MATCH_STATUS {
  OPEN = "OPEN",
  FULL = "FULL",
  ONGOING = "ONGOING",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum PARTICIPANT_STATUS {
  INVITED = "INVITED",
  REQUESTED = "REQUESTED",
  CONFIRMED = "CONFIRMED",
  DECLINED = "DECLINED",
  LEFT = "LEFT",
}

export enum MATCH_TEAM {
  TEAM_A = "TEAM_A",
  TEAM_B = "TEAM_B",
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
