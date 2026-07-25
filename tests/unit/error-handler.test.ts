import type { FastifyBaseLogger, FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorCodes } from "@/constants/index.js";
import { appErrorHandler, appNotFoundHandler } from "@/plugins/errorHandler.js";
import { isErrorShape } from "@/utils/cache.js";

// Fake reply: records code and the send() payload; code() returns itself for
// chaining, like a real FastifyReply.
function createFakeReply() {
  const state: { code?: number; payload?: unknown } = {};
  const reply = {
    code(status: number) {
      state.code = status;
      return reply;
    },
    send(payload: unknown) {
      state.payload = payload;
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, state };
}

const log = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  fatal: vi.fn(),
  trace: vi.fn(),
} as unknown as FastifyBaseLogger;

const request = { log } as unknown as FastifyRequest;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("appErrorHandler", () => {
  it("passes a thrown envelope through unchanged", () => {
    const envelope = errorCodes.MATCH_NOT_FOUND;
    const { reply, state } = createFakeReply();

    appErrorHandler(envelope as unknown as FastifyError, request, reply);

    expect(state.code).toBe(envelope.code);
    expect(state.payload).toEqual(envelope);
    expect(isErrorShape(state.payload)).toBe(true);
  });

  it("maps a FastifyError with statusCode 400 to a 400 envelope from its message", () => {
    const error = { statusCode: 400, message: "body/email must match format" } as FastifyError;
    const { reply, state } = createFakeReply();

    appErrorHandler(error, request, reply);

    expect(state.code).toBe(400);
    expect(state.payload).toEqual({ code: 400, message: "body/email must match format" });
    expect(isErrorShape(state.payload)).toBe(true);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("maps an Error without statusCode to a generic 500 and logs the details", () => {
    const error = new Error("Prisma: column users.secret does not exist") as FastifyError;
    const { reply, state } = createFakeReply();

    appErrorHandler(error, request, reply);

    expect(state.code).toBe(500);
    expect(state.payload).toEqual(errorCodes.INTERNAL_SERVER_ERROR);
    expect(isErrorShape(state.payload)).toBe(true);
    expect(log.error).toHaveBeenCalledTimes(1);
    // 5xx body must not leak the original error text.
    expect(JSON.stringify(state.payload)).not.toContain("Prisma");
    expect(JSON.stringify(state.payload)).not.toContain("secret");
  });

  it("routes a near-envelope object with a third key through the 500 branch", () => {
    const almost = { code: 409, message: "conflict", extra: true } as unknown as FastifyError;
    const { reply, state } = createFakeReply();

    appErrorHandler(almost, request, reply);

    expect(state.code).toBe(500);
    expect(state.payload).toEqual(errorCodes.INTERNAL_SERVER_ERROR);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("handles a non-Error thrown value (string) through the 500 branch without crashing", () => {
    const { reply, state } = createFakeReply();

    expect(() => appErrorHandler("boom" as unknown as FastifyError, request, reply)).not.toThrow();

    expect(state.code).toBe(500);
    expect(state.payload).toEqual(errorCodes.INTERNAL_SERVER_ERROR);
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});

describe("appNotFoundHandler", () => {
  it("responds with the ROUTE_NOT_FOUND envelope", () => {
    const { reply, state } = createFakeReply();

    appNotFoundHandler(request, reply);

    expect(state.code).toBe(errorCodes.ROUTE_NOT_FOUND.code);
    expect(state.payload).toEqual(errorCodes.ROUTE_NOT_FOUND);
    expect(isErrorShape(state.payload)).toBe(true);
  });
});
