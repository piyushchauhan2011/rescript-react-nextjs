import { afterEach, expect, it, vi } from "vitest";
import { readRollout } from "../apps/web/src/server/rollout";
afterEach(() => vi.unstubAllEnvs());
function clean() {
  for (const key of [
    "DECISION_COOKIE_SECRET",
    "DECISION_DISABLED_EXPERIMENTS",
    "DECISION_SEASONAL_OFFERS",
    "DECISION_PLANNING_GUIDE",
  ]) {
    vi.stubEnv(key, undefined);
  }
  vi.stubEnv("NODE_ENV", "development");
}
it("accepts missing/empty/on flags and rejects public-style off", () => {
  clean();
  expect(readRollout().seasonalOffers).toBe(false);
  vi.stubEnv("DECISION_SEASONAL_OFFERS", "");
  expect(readRollout().seasonalOffers).toBe(false);
  vi.stubEnv("DECISION_SEASONAL_OFFERS", "on");
  expect(readRollout().seasonalOffers).toBe(true);
  vi.stubEnv("DECISION_PLANNING_GUIDE", "on");
  expect(readRollout().planningGuide).toBe(true);
  vi.stubEnv("DECISION_PLANNING_GUIDE", "off");
  expect(() => readRollout()).toThrow("Invalid DECISION_PLANNING_GUIDE");
});
it("normalizes emergency disables but rejects unknown registry owners", () => {
  clean();
  vi.stubEnv("DECISION_DISABLED_EXPERIMENTS", " arrival-flow, ,arrival-flow,destination-density ");
  expect(readRollout().disabledIds).toEqual(["arrival-flow", "destination-density"]);
  vi.stubEnv("DECISION_DISABLED_EXPERIMENTS", "__proto__");
  expect(() => readRollout()).toThrow("unknown experiment __proto__");
});
it("requires a production secret measured in UTF-8 bytes", () => {
  clean();
  vi.stubEnv("NODE_ENV", "production");
  expect(() => readRollout()).toThrow("at least 32 UTF-8 bytes required");
  vi.stubEnv("DECISION_COOKIE_SECRET", "a".repeat(31));
  expect(() => readRollout()).toThrow("at least 32 UTF-8 bytes required");
  vi.stubEnv("DECISION_COOKIE_SECRET", "é".repeat(16));
  expect(readRollout().cookieSecret).toBe("é".repeat(16));
});
