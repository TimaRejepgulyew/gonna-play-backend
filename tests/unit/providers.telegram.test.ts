import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AUTH_PROVIDER } from "@/auth/constant.js";
import { createTelegramVerifier } from "@/auth/providers/telegram.js";
import { errorCodes as appErrorCodes } from "@/constants/index.js";

const botToken = "1234567:AA-test-bot-token";
const MS_PER_SECOND = 1000;

type Payload = Record<string, string | number>;

// Строка проверки по архивной странице login-legacy: все поля, кроме hash,
// отсортированы по алфавиту и склеены через перевод строки.
function dataCheckString(payload: Payload): string {
  return Object.keys(payload)
    .filter((key) => key !== "hash")
    .sort()
    .map((key) => `${key}=${payload[key]}`)
    .join("\n");
}

function signWithKey(payload: Payload, key: Buffer | string): string {
  return createHmac("sha256", key).update(dataCheckString(payload)).digest("hex");
}

function sign(payload: Payload): string {
  return signWithKey(payload, createHash("sha256").update(botToken).digest());
}

function nowSeconds(): number {
  return Math.floor(Date.now() / MS_PER_SECOND);
}

function widgetPayload(extra: Payload = {}): Payload {
  const payload: Payload = {
    id: 987654321,
    first_name: "Ada",
    last_name: "Lovelace",
    username: "ada",
    photo_url: "https://t.me/i/userpic/320/ada.jpg",
    auth_date: nowSeconds(),
    ...extra,
  };
  return { ...payload, hash: sign(payload) };
}

const verifier = createTelegramVerifier(botToken);

describe("telegram verifier", () => {
  it("accepts a payload signed with HMAC over SHA256 of the bot token", async () => {
    const result = await verifier.verify(widgetPayload());

    expect(result).toEqual({
      provider: AUTH_PROVIDER.Telegram,
      providerUserId: "987654321",
      emailVerified: false,
      firstName: "Ada",
      lastName: "Lovelace",
      username: "ada",
      avatar: "https://t.me/i/userpic/320/ada.jpg",
    });
  });

  it("returns a profile without email", async () => {
    const result = await verifier.verify(widgetPayload());

    expect(result).not.toHaveProperty("email");
    expect((result as { emailVerified: boolean }).emailVerified).toBe(false);
    expect(typeof (result as { providerUserId: string }).providerUserId).toBe("string");
  });

  // Прямая фиксация того, что вывод секрета не перепутан: голый токен бота
  // как ключ HMAC — это чужая формула, и подпись по ней не принимается.
  it("rejects a payload signed with the raw bot token as the HMAC key", async () => {
    const payload = widgetPayload();
    payload.hash = signWithKey(payload, botToken);

    expect(await verifier.verify(payload)).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  it("rejects a payload signed with any other key", async () => {
    const payload = widgetPayload();
    payload.hash = signWithKey(payload, createHash("sha256").update("other-token").digest());

    expect(await verifier.verify(payload)).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  it("rejects a corrupted hash", async () => {
    const payload = widgetPayload();
    const hash = payload.hash as string;
    payload.hash = (hash[0] === "a" ? "b" : "a") + hash.slice(1);

    expect(await verifier.verify(payload)).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  // timingSafeEqual бросает на буферах разной длины — длина сверяется до него.
  it("rejects a hash of another length without throwing", async () => {
    const payload = widgetPayload();
    payload.hash = (payload.hash as string).slice(0, 10);

    expect(await verifier.verify(payload)).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  it("rejects a payload without a hash", async () => {
    const payload = widgetPayload();
    delete payload.hash;

    expect(await verifier.verify(payload)).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  it("rejects a credential that is not an object", async () => {
    expect(await verifier.verify("not-a-payload")).toEqual(
      appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID,
    );
    expect(await verifier.verify(null)).toEqual(appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID);
  });

  it("rejects a payload older than the freshness window", async () => {
    const stale = nowSeconds() - 16 * 60;

    expect(await verifier.verify(widgetPayload({ auth_date: stale }))).toEqual(
      appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID,
    );
  });

  it("accepts a payload just inside the freshness window", async () => {
    const fresh = nowSeconds() - 14 * 60;
    const result = await verifier.verify(widgetPayload({ auth_date: fresh }));

    expect(result).toHaveProperty("providerUserId", "987654321");
  });

  it("rejects a payload without a usable auth_date", async () => {
    expect(await verifier.verify(widgetPayload({ auth_date: "not-a-number" }))).toEqual(
      appErrorCodes.AUTH_PROVIDER_TOKEN_INVALID,
    );
  });

  // Алгоритм требует включать в строку проверки все поля, кроме hash, — значит,
  // поле, о котором мы ничего не знаем, подпись не ломает.
  it("includes an unknown field in the data check string", async () => {
    const result = await verifier.verify(widgetPayload({ some_future_field: "42" }));

    expect(result).toHaveProperty("providerUserId", "987654321");
  });

  it("builds a profile without optional fields when Telegram omits them", async () => {
    const payload: Payload = { id: 5, auth_date: nowSeconds() };
    payload.hash = sign(payload);

    expect(await verifier.verify(payload)).toEqual({
      provider: AUTH_PROVIDER.Telegram,
      providerUserId: "5",
      emailVerified: false,
    });
  });

  it("reports configuration by the presence of a bot token", () => {
    expect(verifier.isConfigured()).toBe(true);
    expect(createTelegramVerifier("").isConfigured()).toBe(false);
  });
});
