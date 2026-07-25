import { Type } from "typebox";

export interface RatingAggregate {
  playerId: number;
  average: number;
  count: number;
}

export default class PlayerRating {
  id: number;
  matchId: number;
  raterId: number;
  ratedId: number;
  score: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(rating: PlayerRating) {
    this.id = rating.id;
    this.matchId = rating.matchId;
    this.raterId = rating.raterId;
    this.ratedId = rating.ratedId;
    this.score = rating.score;
    this.comment = rating.comment;
    this.createdAt = rating.createdAt;
    this.updatedAt = rating.updatedAt;
  }
}

export const createRatingSchema = Type.Object({
  matchId: Type.Integer(),
  ratedId: Type.Integer(),
  score: Type.Integer({ minimum: 1, maximum: 5 }),
  comment: Type.Optional(Type.String({ maxLength: 500 })),
  // raterId is taken from req.user.playerId, not the body.
});

export const ratingAggregateSchema = Type.Object({
  playerId: Type.Integer(),
  average: Type.Number(),
  count: Type.Integer(),
});
