import { Type } from "@sinclair/typebox";

import {
  MATCH_FORMAT,
  MATCH_STATUS,
  MATCH_TEAM,
  PARTICIPANT_STATUS,
} from "@/constants/enums.js";
import { PLAYER_LEVEL, PLAYER_POSITION } from "@/player/constant.js";
import { paginationQuerySchema } from "@/types/pagination.js";

export class Match {
  id: number;
  organizerId: number;
  fieldId: number;
  startTime: Date;
  durationMinutes: number;
  format: MATCH_FORMAT;
  requiredLevel?: PLAYER_LEVEL;
  price: unknown;
  maxPlayers: number;
  status: MATCH_STATUS;
  createdAt: Date;
  updatedAt: Date;

  field?: unknown;
  participants?: unknown[];

  constructor(match: Match) {
    this.id = match.id;
    this.organizerId = match.organizerId;
    this.fieldId = match.fieldId;
    this.startTime = match.startTime;
    this.durationMinutes = match.durationMinutes;
    this.format = match.format;
    this.requiredLevel = match.requiredLevel;
    this.price = match.price;
    this.maxPlayers = match.maxPlayers;
    this.status = match.status;
    this.createdAt = match.createdAt;
    this.updatedAt = match.updatedAt;
    this.field = match.field;
    this.participants = match.participants;
  }
}

export const createMatchSchema = Type.Object({
  fieldId: Type.Integer(),
  startTime: Type.String({ format: "date-time" }),
  durationMinutes: Type.Optional(Type.Integer({ minimum: 1, default: 60 })),
  format: Type.Enum(MATCH_FORMAT),
  requiredLevel: Type.Optional(Type.Enum(PLAYER_LEVEL)),
  price: Type.Optional(Type.Number({ minimum: 0 })),
  maxPlayers: Type.Integer({ minimum: 2 }),
});

export const updateMatchSchema = Type.Partial(
  Type.Composite([
    Type.Omit(createMatchSchema, ["fieldId", "format"]),
    Type.Object({ status: Type.Enum(MATCH_STATUS) }),
  ])
);

export const matchListQuerySchema = Type.Composite([
  paginationQuerySchema,
  Type.Object({
    city: Type.Optional(Type.String()),
    dateFrom: Type.Optional(Type.String({ format: "date-time" })),
    dateTo: Type.Optional(Type.String({ format: "date-time" })),
    format: Type.Optional(Type.Enum(MATCH_FORMAT)),
    level: Type.Optional(Type.Enum(PLAYER_LEVEL)),
    status: Type.Optional(Type.Enum(MATCH_STATUS)),
    fieldId: Type.Optional(Type.Integer()),
    organizerId: Type.Optional(Type.Integer()),
  }),
]);

export const inviteSchema = Type.Object({
  playerId: Type.Integer(),
  position: Type.Optional(Type.Enum(PLAYER_POSITION)),
  team: Type.Optional(Type.Enum(MATCH_TEAM)),
});

export const joinSchema = Type.Object({
  position: Type.Optional(Type.Enum(PLAYER_POSITION)),
  team: Type.Optional(Type.Enum(MATCH_TEAM)),
});

export const participantsQuerySchema = Type.Object({
  status: Type.Optional(Type.Enum(PARTICIPANT_STATUS)),
});
