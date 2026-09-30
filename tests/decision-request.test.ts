import { describe, expect, it } from "vitest";
import { resolveDecisionRequest } from "@repo/core/DecisionRequest";
import {
  validatePageSearch,
  inspectorSearch,
  fromQuery,
  toQuery,
  updateSearch,
  withDestination,
} from "@repo/core/Search";
import type { decisionRequest } from "@repo/core/DecisionRequest";

const base: decisionRequest = {
  page: "home",
  visitorId: "fixed-id",
  production: false,
  search: {},
  rollout: { disabledIds: [], seasonalOffers: false, planningGuide: false },
};

it("ignores direct public overrides in production but retains trusted rollout flags", () => {
  const request = { ...base, production: true, rollout: { ...base.rollout, planningGuide: true } };
  const plain = resolveDecisionRequest(request);
  const tampered = resolveDecisionRequest({
    ...request,
    search: {
      country: "IN",
      offers: "on",
      guide: "off",
      "exp.arrival-flow": "treatment",
      "exp.unknown": "treatment",
    },
  });
  expect(tampered).toEqual(plain);
  expect(plain.values["offers.visible"]).toBe(false);
  expect(plain.values["planningGuide.visible"]).toBe(true);
  expect(plain.ignored).toEqual({});
});

it("normalizes development previews and exposes only the serializable complete snapshot", () => {
  const result = resolveDecisionRequest({
    ...base,
    search: {
      country: "IN",
      offers: "on",
      guide: "on",
      "exp.arrival-flow": "treatment",
      "exp.destination-density": "treatment",
      "exp.planning-guide-detail": "treatment",
    },
  });
  expect(result.values).toEqual({
    "hero.layout": "split",
    "search.layout": "inline",
    "destinationCard.layout": "compact",
    "destinations.columns": "two",
    "offers.visible": true,
    "planningGuide.visible": true,
    "planningGuide.detail": "expanded",
  });
  expect(result.provenance["hero.layout"]).toEqual({
    source: "experiment",
    id: "arrival-flow",
    variant: "treatment",
  });
  expect(result.provenance["offers.visible"]).toEqual({
    source: "rule",
    id: "india-seasonal-offers",
  });
  expect(result.provenance["planningGuide.visible"]).toEqual({
    source: "rule",
    id: "planning-guide-flag",
  });
  expect(Object.keys(result).toSorted()).toEqual([
    "assignments",
    "ignored",
    "provenance",
    "values",
  ]);
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});

it("uses query-only flags in development, including missing flags overriding trusted on", () => {
  const request = {
    ...base,
    rollout: { ...base.rollout, seasonalOffers: true, planningGuide: true },
  };
  const absent = resolveDecisionRequest({ ...request, search: { country: "IN" } });
  expect(absent.values["offers.visible"]).toBe(false);
  expect(absent.values["planningGuide.visible"]).toBe(false);
  const malformed = resolveDecisionRequest({
    ...request,
    search: { country: "DE", offers: "yes", guide: "true", "exp.arrival-flow": "wrong" },
  });
  expect(malformed.ignored).toEqual({
    country: "DE",
    offers: "yes",
    guide: "true",
    "exp.arrival-flow": "wrong",
  });
  expect(malformed.values["offers.visible"]).toBe(false);
  expect(malformed.values["planningGuide.visible"]).toBe(false);
  expect(malformed.assignments).toEqual(absent.assignments);
});

it("emergency disables block preview forces without assigning replacement owners", () => {
  const result = resolveDecisionRequest({
    ...base,
    rollout: { ...base.rollout, disabledIds: ["arrival-flow"] },
    search: { "exp.arrival-flow": "treatment" },
  });
  expect(result.values["hero.layout"]).toBe("immersive");
  expect(result.values["search.layout"]).toBe("overlay");
  expect(result.values["destinationCard.layout"]).toBe("image");
  expect(Object.hasOwn(result.assignments, "arrival-flow")).toBe(false);
  expect(result.ignored).toEqual({ "exp.arrival-flow": "treatment" });
  expect(result.provenance["hero.layout"]).toEqual({ source: "default" });
});

describe("search allowlisting and URL replacements", () => {
  const input = {
    destination: "kyoto",
    country: "IN",
    offers: "off",
    guide: "bad",
    "exp.arrival-flow": "invalid",
    "exp.planning-guide-detail": "treatment",
    "exp.unknown": "control",
    unknown: "drop",
    arrays: ["drop"],
  };
  it("retains malformed recognized scalar strings for inspector diagnostics, not unknown keys", () => {
    expect(validatePageSearch(input, false)).toEqual({
      destination: "kyoto",
      country: "IN",
      offers: "off",
      guide: "bad",
      "exp.arrival-flow": "invalid",
      "exp.planning-guide-detail": "treatment",
    });
    expect(
      validatePageSearch(
        { country: ["US", "IN"], destination: ["kyoto"], offers: true, guide: 1 },
        false,
      ),
    ).toEqual({});
    expect(validatePageSearch(input, true)).toEqual({ destination: "kyoto" });
    expect(inspectorSearch(validatePageSearch(input, true), true)).toEqual({});
  });
  it.each([null, undefined, [], "country=IN", 1])(
    "treats non-object input as empty %#",
    (source) => {
      expect(validatePageSearch(source, false)).toEqual({});
    },
  );
  it("uses own properties rather than inherited allowlisted values", () => {
    const source = Object.create({ country: "IN", destination: "kyoto" });
    source.guide = "on";
    expect(validatePageSearch(source, false)).toEqual({ guide: "on" });
  });
  it("drops repeated parameters and safely encodes scalar destination and preview strings", () => {
    expect(
      fromQuery(
        "country=US&country=IN&country=US&destination=kyoto&exp.arrival-flow=treatment&unknown=x",
        false,
      ),
    ).toEqual({ destination: "kyoto", "exp.arrival-flow": "treatment" });
    const normalized = validatePageSearch({ destination: "a&b=旅", guide: "on" }, false);
    expect(fromQuery(toQuery(normalized), false)).toEqual(normalized);
    expect(fromQuery(toQuery(normalized), true)).toEqual({ destination: "a&b=旅" });
  });
  it("updates recognized previews without losing destination and removes Auto without mutating old search", () => {
    const initial = fromQuery("destination=kyoto&country=IN&guide=on", false);
    const next = updateSearch(initial, "exp.arrival-flow", "treatment", false);
    expect(next).toEqual({
      destination: "kyoto",
      country: "IN",
      guide: "on",
      "exp.arrival-flow": "treatment",
    });
    expect(initial).toEqual({ destination: "kyoto", country: "IN", guide: "on" });
    expect(updateSearch(next, "exp.arrival-flow", "auto", false)).toEqual(initial);
    expect(updateSearch(initial, "exp.unknown", "treatment", false)).toEqual(initial);
    expect(updateSearch(initial, "guide", "off", true)).toEqual({ destination: "kyoto" });
  });
  it("clears only destination on index links and never propagates production previews", () => {
    const initial = fromQuery("destination=kyoto&country=IN&guide=on", false);
    expect(withDestination(initial, undefined, false)).toEqual({ country: "IN", guide: "on" });
    expect(withDestination(initial, "lisbon", false)).toEqual({
      country: "IN",
      guide: "on",
      destination: "lisbon",
    });
    expect(withDestination(initial, undefined, true)).toEqual({});
    expect(withDestination(initial, "lisbon", true)).toEqual({ destination: "lisbon" });
    expect(inspectorSearch(initial, false)).toEqual({ country: "IN", guide: "on" });
  });
});
