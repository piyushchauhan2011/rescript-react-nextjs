import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { visitorCookie, visitorFromCookie } from "../apps/web/src/server/visitor";
const id = "123e4567-e89b-42d3-a456-426614174000";
const secret = "0123456789abcdef0123456789abcdef";
describe("visitor identity trust", () => {
  it("accepts only UUID identities in development", () => {
    expect(visitorFromCookie(id, undefined)).toBe(id);
    for (const special of [
      "00000000-0000-0000-0000-000000000000",
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
    ]) {
      expect(visitorFromCookie(special, undefined)).toBe(special);
    }
    for (const invalid of [
      undefined,
      "",
      "fixed-id",
      "123e4567-e89b-02d3-a456-426614174000",
      id + ".bad",
    ]) {
      expect(visitorFromCookie(invalid, undefined)).toBeUndefined();
    }
  });
  it("signs and verifies lowercase production cookies", () => {
    const expected = `${id}.${createHmac("sha256", secret).update(id).digest("hex")}`;
    expect(visitorCookie(id, secret)).toBe(expected);
    expect(visitorFromCookie(expected, secret)).toBe(id);
    expect(visitorFromCookie(id, secret)).toBeUndefined();
    expect(visitorFromCookie(expected.toUpperCase(), secret)).toBeUndefined();
    expect(
      visitorFromCookie(expected.slice(0, -1) + (expected.endsWith("0") ? "1" : "0"), secret),
    ).toBeUndefined();
    expect(
      visitorFromCookie(expected, "rotated-secret-0123456789abcdef0123456789"),
    ).toBeUndefined();
  });
  it("rejects malformed signatures without unsafe comparison", () => {
    for (const cookie of [
      undefined,
      `${id}.`,
      `${id}.00`,
      `${id}.${"g".repeat(64)}`,
      `${id}.${"0".repeat(65)}`,
    ]) {
      expect(visitorFromCookie(cookie, secret)).toBeUndefined();
    }
  });
});
