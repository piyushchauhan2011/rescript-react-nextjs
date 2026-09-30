import { createHmac, timingSafeEqual } from "node:crypto";
const uuid =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;
function signature(id: string, secret: string): string {
  return createHmac("sha256", secret).update(id).digest("hex");
}
export function visitorFromCookie(
  cookie: string | undefined,
  secret: string | undefined,
): string | undefined {
  if (!secret) {
    return cookie && uuid.test(cookie) ? cookie : undefined;
  }
  if (!cookie) {
    return undefined;
  }
  const match = /^([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(cookie);
  if (!match || !uuid.test(match[1])) {
    return undefined;
  }
  return timingSafeEqual(
    Buffer.from(match[2], "hex"),
    Buffer.from(signature(match[1], secret), "hex"),
  )
    ? match[1]
    : undefined;
}
export function visitorCookie(id: string, secret: string | undefined): string {
  return secret ? id + "." + signature(id, secret) : id;
}
