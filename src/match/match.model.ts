import { Composite, Type } from "typebox";

import {
  MATCH_FORMAT,
  MATCH_STATUS,
  MATCH_VISIBILITY,
  PARTICIPANT_STATUS,
} from "@/constants/enums.js";
import { PLAYER_LEVEL, PLAYER_POSITION } from "@/player/constant.js";
import { paginationQuerySchema } from "@/types/pagination.js";

export class Match {
  id: number;
  organizerId: number;
  fieldId: number;
  title: string;
  startsAt: Date;
  durationMin: number;
  format: MATCH_FORMAT;
  minPlayers: number;
  maxPlayers: number;
  price: unknown;
  currency?: string | null;
  visibility: MATCH_VISIBILITY;
  status: MATCH_STATUS;
  skillMin?: PLAYER_LEVEL | null;
  skillMax?: PLAYER_LEVEL | null;
  description?: string | null;
  teamsBalancedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;

  field?: unknown;
  participants?: unknown[];

  constructor(match: Match) {
    this.id = match.id;
    this.organizerId = match.organizerId;
    this.fieldId = match.fieldId;
    this.title = match.title;
    this.startsAt = match.startsAt;
    this.durationMin = match.durationMin;
    this.format = match.format;
    this.minPlayers = match.minPlayers;
    this.maxPlayers = match.maxPlayers;
    this.price = match.price;
    this.currency = match.currency;
    this.visibility = match.visibility;
    this.status = match.status;
    this.skillMin = match.skillMin;
    this.skillMax = match.skillMax;
    this.description = match.description;
    this.teamsBalancedAt = match.teamsBalancedAt;
    this.createdAt = match.createdAt;
    this.updatedAt = match.updatedAt;
    this.field = match.field;
    this.participants = match.participants;
  }
}

export const createMatchSchema = Type.Object({
  fieldId: Type.Integer(),
  title: Type.String({ minLength: 1, maxLength: 200 }),
  startsAt: Type.String({ format: "date-time" }),
  durationMin: Type.Optional(Type.Integer({ minimum: 1, default: 60 })),
  format: Type.Enum(MATCH_FORMAT),
  minPlayers: Type.Integer({ minimum: 2 }),
  maxPlayers: Type.Integer({ minimum: 2 }),
  price: Type.Optional(Type.Number({ minimum: 0 })),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
  visibility: Type.Optional(Type.Enum(MATCH_VISIBILITY)),
  skillMin: Type.Optional(Type.Enum(PLAYER_LEVEL)),
  skillMax: Type.Optional(Type.Enum(PLAYER_LEVEL)),
  description: Type.Optional(Type.String({ maxLength: 2000 })),
});

export const updateMatchSchema = Type.Partial(
  Composite(
    Type.Omit(createMatchSchema, ["fieldId", "format"]),
    Type.Object({ status: Type.Enum(MATCH_STATUS) }),
  ),
);

export const matchListQuerySchema = Composite(
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
);

export const joinSchema = Type.Object({
  position: Type.Optional(Type.Enum(PLAYER_POSITION)),
});

export const participantsQuerySchema = Type.Object({
  status: Type.Optional(Type.Enum(PARTICIPANT_STATUS)),
});
