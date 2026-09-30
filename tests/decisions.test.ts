import { describe, expect, it } from "vitest";
import { createDecisionRegistry, experiments, decisionRegistry } from "@repo/core/Experiments";
import { evaluateRule, ruleEffects } from "@repo/core/Rules";
import {
  fnv1a32,
  bucketForExperiment,
  bucketForSurface,
  assignVariant,
} from "@repo/core/Bucketing";
import { assignPageExperiments } from "@repo/core/Allocate";
import { resolveDecisions } from "@repo/core/Resolve";
import type { ruleContext } from "@repo/core/DecisionTypes";

const india: ruleContext = {
  visitor: { country: "IN" },
  flags: { "seasonal-offers": true, "planning-guide": false },
};
const us: ruleContext = { ...india, visitor: { country: "US" } };
const base = {
  surface: "shared",
  enabled: true,
  owns: ["hero.layout"],
  variants: { control: {}, treatment: { "hero.layout": "split" } },
};
const owner = (id: string, allocation: [number, number] = [0, 10000]) => ({
  ...base,
  id,
  allocation,
});
const visitorIn = (surface: string, start: number, end: number) => {
  for (let i = 0; i < 100000; i++) {
    const id = `visitor-${i}`;
    const bucket = bucketForSurface(id, surface);
    if (bucket >= start && bucket < end) {
      return id;
    }
  }
  throw new Error("No visitor found in interval");
};

it("matches the fixed hash golden and JavaScript UTF-16 FNV overflow", () => {
  expect(bucketForExperiment("fixed-id", "arrival-flow")).toBe(33);
  expect(assignVariant("fixed-id", "arrival-flow")).toBe("control");
  const input = "旅😀\ud800:arrival-flow";
  let expected = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    expected = Math.imul(expected ^ input.charCodeAt(i), 0x01000193);
  }
  expect(fnv1a32(input)).toBe(expected >>> 0);
  expect(bucketForExperiment("旅😀\ud800", "arrival-flow")).toBe((expected >>> 0) % 100);
});

describe("predicate validation", () => {
  it("evaluates the complete all/any/not/eq/flag AST including empty conjunctions", () => {
    expect(evaluateRule({ type: "all", rules: [] }, india)).toBe(true);
    expect(evaluateRule({ type: "any", rules: [] }, india)).toBe(false);
    expect(
      evaluateRule(
        {
          type: "all",
          rules: [
            { type: "flag", name: "seasonal-offers" },
            {
              type: "not",
              rule: { type: "any", rules: [{ type: "eq", field: "visitor.country", value: "US" }] },
            },
          ],
        },
        india,
      ),
    ).toBe(true);
  });
  it.each([
    {
      type: "any",
      rules: [
        { type: "flag", name: "seasonal-offers" },
        { type: "flag", name: "unknown" },
      ],
    },
    {
      type: "all",
      rules: [
        { type: "eq", field: "visitor.country", value: "US" },
        { type: "eq", field: "visitor.region", value: "IN" },
      ],
    },
    { type: "not", rule: { type: "eq", field: "visitor.country", value: "DE" } },
    { type: "all", rules: {} },
    { type: "anything" },
    null,
  ])("rejects malformed and short-circuited branches %#", (rule) => {
    expect(() => evaluateRule(rule, india)).toThrow();
  });
  it.each([
    null,
    {},
    { visitor: { country: "DE" }, flags: india.flags },
    { visitor: india.visitor, flags: { "seasonal-offers": "on", "planning-guide": false } },
    { visitor: india.visitor, flags: { "seasonal-offers": true } },
  ])("validates all context fields even for an empty rule %#", (context) => {
    expect(() => evaluateRule({ type: "all", rules: [] }, context)).toThrow();
  });
});

describe("registry validation and ownership", () => {
  it("claims ownership for empty controls and rejects cross-surface/rule collisions", () => {
    expect(() =>
      createDecisionRegistry(
        [...experiments, { ...owner("competing"), surface: "other" }],
        ruleEffects,
      ),
    ).toThrow(/Ownership conflict.*hero.layout.*arrival-flow.*competing/);
    expect(() =>
      createDecisionRegistry(experiments, [
        ...ruleEffects,
        {
          id: "collision",
          owns: ["destinations.columns"],
          when: { type: "all", rules: [] },
          patch: {},
        },
      ]),
    ).toThrow(/Ownership conflict/);
    expect(() =>
      createDecisionRegistry([owner("duplicate"), owner("duplicate", [0, 0])], []),
    ).toThrow(/Duplicate registration ID/);
    expect(() =>
      createDecisionRegistry(
        [owner("same")],
        [{ id: "same", owns: ["offers.visible"], when: { type: "all", rules: [] }, patch: {} }],
      ),
    ).toThrow(/Duplicate registration ID/);
  });
  it.each([
    { ...owner(" ") },
    { ...owner("bad"), surface: " " },
    { ...owner("bad"), enabled: "on" },
    { ...owner("bad"), owns: [] },
    { ...owner("bad"), owns: ["unknown"] },
    { ...owner("bad"), owns: ["hero.layout", "hero.layout"] },
    { ...owner("bad"), variants: { control: null, treatment: {} } },
    { ...owner("bad"), variants: { control: {}, treatment: { "hero.layout": "overlay" } } },
    { ...owner("bad"), variants: { control: {}, treatment: { "offers.visible": true } } },
    { ...owner("bad"), variants: { control: {}, treatment: { unknown: true } } },
    {
      ...owner("bad"),
      eligibleWhen: {
        type: "any",
        rules: [
          { type: "all", rules: [] },
          { type: "flag", name: "unknown" },
        ],
      },
    },
  ])("rejects invalid registrations %#", (experiment) => {
    expect(() => createDecisionRegistry([experiment], [])).toThrow();
  });
});

describe("registry allocation intervals and rule patches", () => {
  it.each([[-1, 100], [0, 10001], [1.5, 50], [5000, 4999], [5, 5], [0], [0, 1, 2]])(
    "rejects invalid allocation %j",
    (...allocation) => {
      expect(() => createDecisionRegistry([{ ...owner("bad"), allocation }], [])).toThrow(
        /Invalid allocation/,
      );
    },
  );
  it("sorts global intervals and accepts only the zero empty interval, including disabled owners", () => {
    const registry = createDecisionRegistry(
      [owner("b", [5000, 10000]), owner("empty", [0, 0]), owner("a", [0, 5000])],
      [],
    );
    expect(registry.allocationsBySurface.shared?.map((e) => e.id)).toEqual(["empty", "a", "b"]);
    expect(() =>
      createDecisionRegistry(
        [owner("a", [0, 5000]), { ...owner("b", [4999, 10000]), enabled: false }],
        [],
      ),
    ).toThrow(/Overlapping allocation/);
    const allocation = assignPageExperiments({
      page: "home",
      visitorId: "fixed-id",
      context: india,
      registry: createDecisionRegistry([{ ...owner("empty", [0, 0]), enabled: false }], []),
    });
    expect(allocation.assignments).toEqual({});
  });
  it("validates rule patches, even rules that cannot match", () => {
    const effect = { id: "bad", owns: ["offers.visible"], when: { type: "any", rules: [] } };
    expect(() =>
      createDecisionRegistry([], [{ ...effect, patch: { "offers.visible": "on" } }]),
    ).toThrow(/Invalid value/);
    expect(() => createDecisionRegistry([], [{ ...effect, patch: [] }])).toThrow(/Invalid patch/);
    expect(() =>
      createDecisionRegistry([], [{ ...effect, patch: { "hero.layout": "split" } }]),
    ).toThrow(/without owning/);
  });
});

describe("allocation", () => {
  it("uses half-open boundaries, preserves gaps and never redistributes global slots across pages", () => {
    const registry = createDecisionRegistry(
      [
        { ...owner("home-only", [0, 5000]) },
        {
          ...owner("dest-only", [5000, 10000]),
          owns: ["destinationCard.layout"],
          variants: { control: {}, treatment: { "destinationCard.layout": "compact" } },
        },
      ],
      [],
    );
    const before = visitorIn("shared", 4999, 5000);
    const boundary = visitorIn("shared", 5000, 5001);
    expect(
      assignPageExperiments({ visitorId: before, page: "home", context: india, registry })
        .assignments,
    ).toEqual({ "home-only": assignVariant(before, "home-only") });
    expect(
      assignPageExperiments({ visitorId: before, page: "destinations", context: india, registry })
        .assignments,
    ).toEqual({});
    expect(
      assignPageExperiments({ visitorId: boundary, page: "destinations", context: india, registry })
        .assignments,
    ).toEqual({ "dest-only": assignVariant(boundary, "dest-only") });
    const gapRegistry = createDecisionRegistry([owner("small", [0, 100])], []);
    const gap = visitorIn("shared", 100, 10000);
    expect(
      assignPageExperiments({ visitorId: gap, page: "home", context: india, registry: gapRegistry })
        .assignments,
    ).toEqual({});
    expect(
      assignPageExperiments({
        visitorId: gap,
        page: "home",
        context: india,
        registry: gapRegistry,
        overrides: { "exp.small": "treatment" },
      }).assignments,
    ).toEqual({ small: "treatment" });
  });
  it("allows disjoint same-surface owners and lexicographically resolves competing forces", () => {
    const registry = createDecisionRegistry([owner("b", [5000, 10000]), owner("a", [0, 5000])], []);
    const result = assignPageExperiments({
      page: "home",
      visitorId: "fixed-id",
      context: india,
      registry,
      overrides: { "exp.b": "treatment", "exp.a": "control" },
    });
    expect(result.assignments).toEqual({ a: "control" });
    expect(result.ignored).toEqual({ "exp.b": "treatment (surface already forced by a)" });
    expect(() =>
      resolveDecisions({
        page: "home",
        context: india,
        registry,
        assignments: { a: "control", b: "control" },
      }),
    ).toThrow(/Multiple assignments on surface/);
  });
});

describe("allocation eligibility and preview overrides", () => {
  it.each(["disabled", "ineligible", "emergency"] as const)(
    "does not redistribute or force past %s",
    (mode) => {
      const experiment = {
        ...owner("a", [0, 5000]),
        enabled: mode !== "disabled",
        ...(mode === "ineligible"
          ? { eligibleWhen: { type: "eq", field: "visitor.country", value: "IN" } }
          : {}),
      };
      const registry = createDecisionRegistry([experiment, owner("b", [5000, 10000])], []);
      const result = assignPageExperiments({
        page: "home",
        visitorId: visitorIn("shared", 0, 5000),
        context: us,
        registry,
        disabledIds: mode === "emergency" ? ["a"] : [],
        overrides: { "exp.a": "treatment" },
      });
      expect(result.assignments).toEqual({});
      expect(result.ignored).toEqual({ "exp.a": "treatment" });
    },
  );
  it("auto and invalid variants return to natural assignment, while unknown direct overrides reject", () => {
    const natural = assignPageExperiments({ page: "home", visitorId: "fixed-id", context: india });
    expect(
      assignPageExperiments({
        page: "home",
        visitorId: "fixed-id",
        context: india,
        overrides: { "exp.arrival-flow": "auto" },
      }).assignments,
    ).toEqual(natural.assignments);
    const invalid = assignPageExperiments({
      page: "home",
      visitorId: "fixed-id",
      context: india,
      overrides: { "exp.arrival-flow": "broken" },
    });
    expect(invalid.assignments).toEqual(natural.assignments);
    expect(invalid.ignored).toEqual({ "exp.arrival-flow": "broken" });
    expect(() =>
      assignPageExperiments({
        page: "home",
        visitorId: "fixed-id",
        context: india,
        overrides: { "exp.unknown": "auto" },
      }),
    ).toThrow(/Unknown experiment override/);
    expect(() => assignPageExperiments({ page: "home", visitorId: " ", context: india })).toThrow(
      /Invalid visitor ID/,
    );
    expect(() =>
      assignPageExperiments({ page: "unknown" as never, visitorId: "fixed-id", context: india }),
    ).toThrow(/Unknown decision page/);
  });
  it("keeps natural cross-page assignments stable and rejects irrelevant previews", () => {
    const home = assignPageExperiments({ visitorId: "fixed-id", context: india, page: "home" });
    const index = assignPageExperiments({
      visitorId: "fixed-id",
      context: india,
      page: "destinations",
    });
    expect(index.assignments["arrival-flow"]).toBe(home.assignments["arrival-flow"]);
    const registry = createDecisionRegistry([owner("home-only")], []);
    expect(
      assignPageExperiments({
        visitorId: "fixed-id",
        context: india,
        page: "destinations",
        registry,
        overrides: { "exp.home-only": "treatment" },
      }),
    ).toEqual({ assignments: {}, ignored: { "exp.home-only": "treatment" } });
  });
});

describe("resolution", () => {
  it("resolves complete values and precise provenance, including whole cross-page patches", () => {
    const result = resolveDecisions({
      page: "home",
      context: india,
      assignments: { "arrival-flow": "treatment", "destination-density": "treatment" },
    });
    expect(result.values).toEqual({
      "hero.layout": "split",
      "search.layout": "inline",
      "destinationCard.layout": "compact",
      "destinations.columns": "two",
      "offers.visible": true,
      "planningGuide.visible": false,
      "planningGuide.detail": "brief",
    });
    expect(result.provenance["search.layout"]).toEqual({
      source: "experiment",
      id: "arrival-flow",
      variant: "treatment",
    });
    expect(result.provenance["offers.visible"]).toEqual({
      source: "rule",
      id: "india-seasonal-offers",
    });
    expect(result.provenance["planningGuide.detail"]).toEqual({ source: "default" });
    const index = resolveDecisions({
      page: "destinations",
      context: india,
      assignments: { "arrival-flow": "treatment" },
    });
    expect(index.values["hero.layout"]).toBe("split");
    expect(index.values["search.layout"]).toBe("inline");
    expect(index.values["offers.visible"]).toBe(false);
    expect(index.provenance["hero.layout"]).toEqual(result.provenance["hero.layout"]);
    expect(Object.keys(index.values)).toEqual(Object.keys(result.values));
  });
  it("independently gates guide visibility and detail, retaining default provenance for empty controls", () => {
    const on = { ...us, flags: { ...us.flags, "planning-guide": true } };
    const expanded = resolveDecisions({
      page: "home",
      context: on,
      assignments: { "planning-guide-detail": "treatment", "arrival-flow": "control" },
    });
    expect(expanded.values["planningGuide.visible"]).toBe(true);
    expect(expanded.values["planningGuide.detail"]).toBe("expanded");
    expect(expanded.provenance["planningGuide.visible"]).toEqual({
      source: "rule",
      id: "planning-guide-flag",
    });
    expect(expanded.provenance["hero.layout"]).toEqual({ source: "default" });
    const hidden = resolveDecisions({
      page: "home",
      context: us,
      assignments: { "planning-guide-detail": "treatment" },
    });
    expect(hidden.values["planningGuide.visible"]).toBe(false);
    expect(hidden.values["planningGuide.detail"]).toBe("expanded");
    const brief = resolveDecisions({
      page: "home",
      context: on,
      assignments: { "planning-guide-detail": "control" },
    });
    expect(brief.values["planningGuide.detail"]).toBe("brief");
    expect(brief.provenance["planningGuide.detail"]).toEqual({ source: "default" });
  });
});

describe("resolution rejects invalid assignments and conflicting writes", () => {
  it("rejects every invalid external assignment before applying patches", () => {
    expect(() =>
      resolveDecisions({ page: "home", context: india, assignments: { unknown: "control" } }),
    ).toThrow(/Unknown experiment ID/);
    expect(() =>
      resolveDecisions({
        page: "home",
        context: india,
        assignments: { "arrival-flow": "broken" as never },
      }),
    ).toThrow(/Unknown variant/);
    expect(() =>
      resolveDecisions({ page: "home", context: india, assignments: [] as never }),
    ).toThrow(/Invalid experiment assignments/);
    expect(() =>
      resolveDecisions({
        page: "home",
        context: india,
        assignments: { "arrival-flow": "control" },
        disabledIds: ["arrival-flow"],
      }),
    ).toThrow(/disabled or ineligible/);
    const registry = createDecisionRegistry([owner("home-only")], []);
    expect(() =>
      resolveDecisions({
        page: "destinations",
        context: india,
        assignments: { "home-only": "control" },
        registry,
      }),
    ).toThrow(/irrelevant/);
    const ineligible = createDecisionRegistry(
      [{ ...owner("a"), eligibleWhen: { type: "eq", field: "visitor.country", value: "IN" } }],
      [],
    );
    expect(() =>
      resolveDecisions({
        page: "home",
        context: us,
        assignments: { a: "control" },
        registry: ineligible,
      }),
    ).toThrow(/disabled or ineligible/);
  });
  it("rejects active write conflicts even if a registry is externally mutated after validation", () => {
    const registry = createDecisionRegistry(
      [owner("a")],
      [
        {
          id: "rule",
          owns: ["offers.visible"],
          when: { type: "all", rules: [] },
          patch: { "offers.visible": true },
        },
      ],
    );
    Object.assign(registry.rulesByPage.home[0]!.patch, { "hero.layout": "immersive" });
    expect(() =>
      resolveDecisions({ page: "home", context: india, assignments: { a: "treatment" }, registry }),
    ).toThrow(/Decision write conflict/);
  });
  it.each(["__proto__", "constructor", "toString"])(
    "handles prototype-sensitive registration %s without inherited ownership",
    (id) => {
      const registry = createDecisionRegistry([{ ...owner(id), surface: id }], []);
      const assignments = Object.fromEntries([[id, "treatment"]]);
      const result = resolveDecisions({
        page: "home",
        context: india,
        assignments: assignments as never,
        registry,
      });
      expect(Object.hasOwn(result.assignments, id)).toBe(true);
      expect(result.assignments[id]).toBe("treatment");
      expect(JSON.parse(JSON.stringify(result.assignments))).toEqual(assignments);
      expect(result.values["hero.layout"]).toBe("split");
    },
  );
  it("does not mistake an inherited experiment name for a registered owner", () => {
    expect(() =>
      resolveDecisions({
        page: "home",
        context: india,
        assignments: { toString: "control" as const },
        registry: decisionRegistry,
      }),
    ).toThrow(/Unknown experiment ID/);
  });
});
