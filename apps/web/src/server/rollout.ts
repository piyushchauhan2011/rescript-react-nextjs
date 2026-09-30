import { experiments } from "@repo/core/Experiments";
import type { rollout } from "@repo/core/DecisionRequest";
function flag(name: string): boolean {
  const value = process.env[name];
  if (value !== undefined && value !== "" && value !== "on") {
    throw new Error(`Invalid ${name}: expected on or empty`);
  }
  return value === "on";
}
export function readRollout(): rollout & { cookieSecret: string | undefined } {
  const known = new Set(experiments.map((experiment) => experiment.id));
  const disabledIds = [
    ...new Set(
      (process.env.DECISION_DISABLED_EXPERIMENTS ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  for (const id of disabledIds) {
    if (!known.has(id)) {
      throw new Error(`Invalid DECISION_DISABLED_EXPERIMENTS: unknown experiment ${id}`);
    }
  }
  let cookieSecret: string | undefined;
  if (process.env.NODE_ENV === "production") {
    cookieSecret = process.env.DECISION_COOKIE_SECRET;
    if (!cookieSecret || Buffer.byteLength(cookieSecret, "utf8") < 32) {
      throw new Error("Invalid DECISION_COOKIE_SECRET: at least 32 UTF-8 bytes required");
    }
  }
  return {
    disabledIds,
    seasonalOffers: flag("DECISION_SEASONAL_OFFERS"),
    planningGuide: flag("DECISION_PLANNING_GUIDE"),
    cookieSecret,
  };
}
