import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { readRollout } from "./server/rollout";
import { visitorCookie, visitorFromCookie } from "./server/visitor";
export function proxy(request: NextRequest) {
  const { cookieSecret } = readRollout();
  const existing = visitorFromCookie(request.cookies.get("visitorId")?.value, cookieSecret);
  const headers = new Headers(request.headers);
  let issued: string | undefined;
  if (!existing) {
    issued = visitorCookie(randomUUID(), cookieSecret);
    const cookies = (headers.get("cookie") ?? "")
      .split(";")
      .map((v) => v.trim())
      .filter((v) => v && v.split("=", 1)[0] !== "visitorId");
    cookies.push("visitorId=" + issued);
    headers.set("cookie", cookies.join("; "));
  }
  const response = NextResponse.next({ request: { headers } });
  if (issued) {
    response.cookies.set("visitorId", issued, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 31536000,
      secure: process.env.NODE_ENV === "production",
    });
  }
  response.headers.set("Cache-Control", "private, no-cache");
  return response;
}
export const config = { matcher: ["/", "/destinations"] };
