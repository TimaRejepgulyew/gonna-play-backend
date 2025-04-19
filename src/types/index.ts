import { FastifyInstance, FastifyRequest } from 'fastify';
import { PoolClient } from 'pg';

export interface User {
  id: number;
  email: string;
  username?: string;
  full_name?: string;
  phone?: string;
  profile_picture?: string;
  created_at: Date;
}

export interface Game {
  id: number;
  created_by: number;
  title: string;
  description?: string;
  start_time: Date;
  end_time: Date;
  location_id: number;
  max_players: number;
  min_players: number;
  status: GameStatus;
  price?: number;
  skill_level?: SkillLevel;
  created_at: Date;
}

export interface Location {
  id: number;
  name: string;
  address: string;
  city: string;
  latitude?: number;
  longitude?: number;
  created_at: Date;
}

export interface Participant {
  id: number;
  user_id: number;
  game_id: number;
  status: ParticipantStatus;
  joined_at: Date;
}

export interface Rating {
  id: number;
  user_id: number;
  game_id: number;
  rating: number;
  comment?: string;
  created_at: Date;
}

export type GameStatus = 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled';
export type ParticipantStatus = 'confirmed' | 'pending' | 'cancelled';
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'professional';

export interface JwtPayload {
  id: number;
  email: string;
  username?: string;
}

export interface DatabaseClient {
  query: PoolClient['query'];
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    generateToken: (user: JwtPayload) => string;
  }
}

// Extend JWT payload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
