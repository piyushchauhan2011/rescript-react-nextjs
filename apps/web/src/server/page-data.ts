import { cookies } from "next/headers";
import { resolveDecisionRequest } from "@repo/core/DecisionRequest";
import { validatePageSearch } from "@repo/core/Search";
import type { page } from "@repo/core/DecisionTypes";
import { readRollout } from "./rollout";
import { visitorFromCookie } from "./visitor";
export async function pageDecisions(
  page: page,
  input: Record<string, string | string[] | undefined>,
) {
  const production = process.env.NODE_ENV === "production";
  const search = { ...validatePageSearch(input, production) };
  const trusted = readRollout();
  const visitorId = visitorFromCookie(
    (await cookies()).get("visitorId")?.value,
    trusted.cookieSecret,
  );
  if (!visitorId) {
    throw new Error("Missing verified visitor identity: page request must pass through proxy");
  }
  const resolved = resolveDecisionRequest({
    page,
    search,
    visitorId,
    production,
    rollout: trusted,
  });
  // React Flight rejects null-prototype dictionaries; spread preserves own keys safely.
  const snapshot = {
    ...resolved,
    assignments: { ...resolved.assignments },
    ignored: { ...resolved.ignored },
  };
  return { search, snapshot, production };
}
