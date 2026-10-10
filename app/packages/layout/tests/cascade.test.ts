/**
 * The cascade: one example per rank of the specification, the container
 * lists, and properties over arbitrary rule lists against a reference that
 * reads the specification directly.
 */

import type { StyleRule } from "@timetoalign/timeskeleton";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type DrawnElement,
  defaultStyle,
  resolveStyle,
  type ScopedRule,
  scopedRules,
} from "../src/index.ts";

const wedge: DrawnElement = {
  element: "wedge",
  id: "a/start",
  domain: "logical",
  modality: "continuous",
};

const at = (depth: number, rule: StyleRule): ScopedRule => ({ ...rule, depth });

describe("defaults", () => {
  it("follow the table of the specification", () => {
    expect(defaultStyle(wedge)).toEqual({
      colour: "#00CC00",
      line_pattern: "solid",
      visible: true,
      side: "below",
      show_length: false,
      show_projected_coordinates: false,
    });
    const discrete: DrawnElement = {
      ...wedge,
      element: "child",
      domain: "physical",
      modality: "discrete",
    };
    expect(defaultStyle(discrete)).toMatchObject({
      colour: "#0050EF",
      line_pattern: "dotted",
      side: "above",
    });
    expect(defaultStyle({ ...wedge, element: "label", domain: "graphical" })).toMatchObject({
      colour: "#000000",
      side: "above",
    });
    expect(defaultStyle({ ...wedge, element: "jump" })).toMatchObject({ line_pattern: "dotted" });
    expect(defaultStyle({ ...wedge, element: "break" })).toMatchObject({
      line_pattern: "solid",
      side: "below",
    });
    expect(defaultStyle({ ...wedge, element: "map", modality: "discrete" })).toMatchObject({
      line_pattern: "solid",
      side: "above",
    });
  });
});

describe("one rank after another", () => {
  const colour = (rules: ScopedRule[]) => resolveStyle(rules, wedge).colour;

  it("lets a rule naming the element's id win over every container", () => {
    const deep = at(3, {
      select: { element: "wedge", domain: "logical" },
      set: { colour: "#000001" },
    });
    const id = at(0, { select: { ids: ["x", "a/start"] }, set: { colour: "#000002" } });
    expect(colour([id, deep])).toBe("#000002");
  });

  it("lets the nearest container win over the ones enclosing it", () => {
    const outer = at(1, {
      select: { element: "wedge", domain: "logical" },
      set: { colour: "#000001" },
    });
    const inner = at(2, { select: {}, set: { colour: "#000002" } });
    expect(colour([outer, inner])).toBe("#000002");
    expect(colour([inner, outer])).toBe("#000002");
  });

  it("lets the element type win over domain and modality within one container", () => {
    const named = at(1, { select: { element: "wedge" }, set: { colour: "#000001" } });
    const both = at(1, {
      select: { domain: "logical", modality: "continuous" },
      set: { colour: "#000002" },
    });
    expect(colour([named, both])).toBe("#000001");
    expect(colour([both, named])).toBe("#000001");
  });

  it("lets more named members win at the same level", () => {
    const type = at(1, { select: { element: "wedge" }, set: { colour: "#000001" } });
    const typeDomain = at(1, {
      select: { element: "wedge", domain: "logical" },
      set: { colour: "#000002" },
    });
    expect(colour([typeDomain, type])).toBe("#000002");
    const domain = at(1, { select: { domain: "logical" }, set: { colour: "#000003" } });
    const domainModality = at(1, {
      select: { domain: "logical", modality: "continuous" },
      set: { colour: "#000004" },
    });
    expect(colour([domainModality, domain])).toBe("#000004");
    const empty = at(1, { select: {}, set: { colour: "#000005" } });
    expect(colour([domain, empty])).toBe("#000003");
  });

  it("gives a tie to the later rule", () => {
    const first = at(1, { select: { element: "wedge" }, set: { colour: "#000001" } });
    const second = at(1, { select: { element: "wedge" }, set: { colour: "#000002" } });
    expect(colour([first, second])).toBe("#000002");
    expect(colour([second, first])).toBe("#000001");
  });

  it("resolves each property on its own, falling through to outer containers", () => {
    const outer = at(1, {
      select: { element: "wedge" },
      set: { side: "above", colour: "#000001" },
    });
    const inner = at(2, { select: {}, set: { colour: "#000002" } });
    expect(resolveStyle([outer, inner], wedge)).toMatchObject({ colour: "#000002", side: "above" });
  });

  it("ignores a rule that does not match every member", () => {
    expect(
      colour([
        at(2, { select: { element: "wedge", modality: "discrete" }, set: { colour: "#000001" } }),
      ]),
    ).toBe("#00CC00");
  });
});

describe("scopedRules", () => {
  it("lists the document's rules, then each container on the path, with their depths", () => {
    const rule = (colour: string): StyleRule => ({ select: {}, set: { colour } });
    const graphical = {
      styles: [rule("#000001")],
      timelines: { r: [rule("#000002")], c: [rule("#000003")], other: [rule("#000004")] },
    };
    expect(
      scopedRules(graphical, ["r", "b", "c"]).map((item) => [item.set.colour, item.depth]),
    ).toEqual([
      ["#000001", 0],
      ["#000002", 1],
      ["#000003", 3],
    ]);
    expect(scopedRules(undefined, ["r"])).toEqual([]);
  });
});

const TYPES = ["timeline", "child", "map", "region", "break", "jump", "wedge", "label"] as const;

const elementArbitrary: fc.Arbitrary<DrawnElement> = fc.record({
  element: fc.constantFrom(...TYPES),
  id: fc.constantFrom("a", "b", "a/start"),
  domain: fc.constantFrom("graphical", "logical", "physical"),
  modality: fc.constantFrom("continuous", "discrete"),
});

const ruleArbitrary: fc.Arbitrary<ScopedRule> = fc.record({
  depth: fc.integer({ min: 0, max: 3 }),
  select: fc.record(
    {
      element: fc.constantFrom(...TYPES),
      domain: fc.constantFrom("graphical", "logical", "physical"),
      modality: fc.constantFrom("continuous", "discrete"),
      ids: fc.subarray(["a", "b", "a/start"], { minLength: 1 }),
    },
    { requiredKeys: [] },
  ),
  set: fc.record(
    {
      colour: fc.constantFrom("#111111", "#222222", "#333333"),
      visible: fc.boolean(),
      side: fc.constantFrom("above", "below"),
    },
    { requiredKeys: [] },
  ),
}) as fc.Arbitrary<ScopedRule>;

type Property = "colour" | "visible" | "side";

/**
 * The reference, read from the specification (section 2.5) without the
 * implementation's helpers: among the matching rules that set the property,
 * the greatest (names the id, container depth, names the type, number of
 * domain and modality named), the later of equals; else the default.
 */
function reference(rules: readonly ScopedRule[], element: DrawnElement, property: Property) {
  let best: ScopedRule | undefined;
  let bestKey: number[] = [];
  for (const rule of rules) {
    const { select } = rule;
    const matching =
      rule.set[property] !== undefined &&
      (select.element === undefined || select.element === element.element) &&
      (select.domain === undefined || select.domain === element.domain) &&
      (select.modality === undefined || select.modality === element.modality) &&
      (select.ids === undefined || select.ids.includes(element.id));
    if (!matching) continue;
    const key = [
      select.ids === undefined ? 0 : 1,
      rule.depth,
      select.element === undefined ? 0 : 1,
      Number(select.domain !== undefined) + Number(select.modality !== undefined),
    ];
    const index = key.findIndex((value, position) => value !== bestKey[position]);
    if (best === undefined || index === -1 || (key[index] as number) > (bestKey[index] as number)) {
      best = rule;
      bestKey = key;
    }
  }
  return best === undefined ? defaultStyle(element)[property] : best.set[property];
}

/** Rules in the order scopedRules lists them: by container depth, each list in its order. */
const ordered = (rules: ScopedRule[]) => [...rules].sort((left, right) => left.depth - right.depth);

describe("the cascade, by properties", () => {
  it("equals the reference reading for every property", () => {
    fc.assert(
      fc.property(fc.array(ruleArbitrary, { maxLength: 8 }), elementArbitrary, (rules, element) => {
        const sorted = ordered(rules);
        const style = resolveStyle(sorted, element);
        for (const property of ["colour", "visible", "side"] as const) {
          expect(style[property]).toEqual(reference(sorted, element, property));
        }
      }),
    );
  });

  it("ignores a rule that matches nothing", () => {
    fc.assert(
      fc.property(fc.array(ruleArbitrary, { maxLength: 8 }), elementArbitrary, (rules, element) => {
        const none = at(3, { select: { ids: ["no such element"] }, set: { colour: "#444444" } });
        const sorted = ordered(rules);
        expect(resolveStyle([...sorted, none], element)).toEqual(resolveStyle(sorted, element));
      }),
    );
  });
});
