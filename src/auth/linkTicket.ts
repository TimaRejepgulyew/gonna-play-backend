import { randomBytes } from "node:crypto";

import env from "@/config/env.js";
import { getRedis } from "@/config/redis.js";
import { errorCodes } from "@/constants/index.js";
import type { ErrorResponse } from "@/types/prisma.js";

import type { ProviderProfile } from "./providers/types.js";

// Одноразовые тикеты подтверждения владения аккаунтом (§9.4.8), по образцу
// refreshStore.ts:
//   auth:link:{ticket} -> JSON { userId, profile }, TTL = AUTH_LINK_TICKET_TTL
//
// В отличие от refreshStore этот модуль НЕ fail-open: недоступный Redis даёт
// AUTH_PROVIDER_UNAVAILABLE, потому что fail-open здесь означал бы привязку
// чужого способа входа без доказательства владения.
// Префикс `gp:` навешивает ioredis (src/config/env.ts:33) — здесь он не пишется.

const ticketKey = (ticket: string) => `auth:link:${ticket}`;

const TICKET_BYTES = 32;

export interface LinkTicketPayload {
  userId: number;
  profile: ProviderProfile;
}

// Список способов входа в тикете не хранится: сервис пересчитывает его по
// AuthIdentity в момент подтверждения (правило 8 §9.4.5).
export async function create(
  userId: number,
  profile: ProviderProfile,
): Promise<string | ErrorResponse> {
  // Непредсказуемый идентификатор, не выводимый из данных пользователя.
  const ticket = randomBytes(TICKET_BYTES).toString("base64url");
  const payload: LinkTicketPayload = { userId, profile };
  try {
    const redis = getRedis();
    await redis.set(ticketKey(ticket), JSON.stringify(payload), "EX", env.AUTH_LINK_TICKET_TTL);
  } catch {
    return errorCodes.AUTH_PROVIDER_UNAVAILABLE;
  }
  return ticket;
}

// GETDEL: чтение с удалением одной командой — повторное предъявление тикета
// уже не найдёт записи.
export async function consume(ticket: string): Promise<LinkTicketPayload | ErrorResponse> {
  let raw: string | null;
  try {
    const redis = getRedis();
    raw = await redis.getdel(ticketKey(ticket));
  } catch {
    return errorCodes.AUTH_PROVIDER_UNAVAILABLE;
  }
  if (raw === null) return errorCodes.AUTH_LINK_TICKET_INVALID;
  try {
    return JSON.parse(raw) as LinkTicketPayload;
  } catch {
    // Битое содержимое ключа — тикетом такое не считается.
    return errorCodes.AUTH_LINK_TICKET_INVALID;
  }
}
