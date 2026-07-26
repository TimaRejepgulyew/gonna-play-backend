import env from "@/config/env.js";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 262_144;

export interface HttpRequest {
  url: string;
  method?: "GET" | "POST";
  /** Тело формы: сериализуется URLSearchParams и уходит как x-www-form-urlencoded. */
  form?: Record<string, string>;
  timeoutMs?: number;
}

/** Ответ получен (любой статус) либо запрос не состоялся. Исключений наружу нет. */
export type HttpOutcome =
  | { ok: true; status: number; body: string }
  | { ok: false; failure: "timeout" | "network" | "too-large" };

export interface HttpClient {
  send(request: HttpRequest): Promise<HttpOutcome>;
}

function classifyFailure(error: unknown): HttpOutcome {
  const timedOut = error instanceof Error && error.name === "TimeoutError";
  return { ok: false, failure: timedOut ? "timeout" : "network" };
}

// Настроенный таймаут может оказаться нулевым или отрицательным: тогда берётся
// значение по умолчанию, но не «без таймаута».
function resolveTimeoutMs(requested: number | undefined): number {
  if (requested !== undefined && requested > 0) return requested;
  return env.HTTP_TIMEOUT_MS > 0 ? env.HTTP_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

async function sendOnce(request: HttpRequest): Promise<HttpOutcome> {
  const body = request.form === undefined ? undefined : new URLSearchParams(request.form);
  const headers =
    body === undefined ? undefined : { "content-type": "application/x-www-form-urlencoded" };

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method ?? "GET",
      signal: AbortSignal.timeout(resolveTimeoutMs(request.timeoutMs)),
      headers,
      body,
    });
  } catch (error) {
    return classifyFailure(error);
  }

  try {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      return { ok: false, failure: "too-large" };
    }
    return { ok: true, status: response.status, body: text };
  } catch (error) {
    return classifyFailure(error);
  }
}

// Ретраев нет сознательно: ни бэкоффа, ни circuit breaker. Вызывающий сам
// решает, какой код каталога вернуть на неудачу.
export function createFetchHttpClient(): HttpClient {
  return { send: sendOnce };
}

let client: HttpClient | null = null;

/** Ленивое создание: первый вызвавший создаёт клиента, остальные берут тот же. */
export function getHttp(): HttpClient {
  if (client === null) client = createFetchHttpClient();
  return client;
}

/** Тестовый шов: юнит-прогон занимает слот заглушкой. */
export function setHttp(next: HttpClient): void {
  client = next;
}
