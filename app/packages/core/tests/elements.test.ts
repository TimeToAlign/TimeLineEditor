import { dumps, type Selector, schema } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { ElementKey } from "../src/index.ts";
import {
  manifestElements,
  selectorMatches,
  timelineAncestry,
  timelineClass,
  unitDomain,
} from "../src/index.ts";
import { allFixtures, load, loadText, manifestValue } from "./support.ts";

const CLT = "ContinuousLogicalTimeline";

describe("the elements of a manifest", () => {
  it("enumerates map.json in tree order", () => {
    const melody = ["melody", "logical", "continuous", CLT] as const;
    const phrase = ["phrase", "logical", "continuous", CLT] as const;
    const line = ["block", "timeline"];
    expect(
      manifestElements(load("map.json")).map((key) => [
        key.type,
        key.address,
        key.timeline,
        key.domain,
        key.modality,
        key.class,
        key.inside,
      ]),
    ).toEqual([
      ["block", null, null, null, null, null, []],
      ["card", "melody/card", ...melody, ["block"]],
      ["timeline", "melody", ...melody, ["block"]],
      ["name", "melody/name", ...melody, line],
      ["map", "melody/tempo", "melody", "physical", "continuous", "ScalarMap", line],
      ["wedge", "melody/start", ...melody, line],
      ["label", "melody/start/label", ...melody, [...line, "wedge"]],
      ["wedge", "melody/end", ...melody, line],
      ["label", "melody/end/label", ...melody, [...line, "wedge"]],
      ["child", "phrase", ...phrase, line],
      ["name", "phrase/name", ...phrase, [...line, "child"]],
      [
        "map",
        "melody/ticks",
        "phrase",
        "logical",
        "discrete",
        "QuartersToTicks",
        [...line, "child"],
      ],
    ]);
  });

  it("gives regions, breaks and jumps their drawn addresses, each with a label", () => {
    const addresses = (name: string) =>
      manifestElements(load(name))
        .filter((key) => ["region", "break", "jump"].includes(key.type as string))
        .map((key) => key.address);
    expect(addresses("with_region.json")).toEqual(["clt_1/region_1"]);
    expect(addresses("flow_control.json")).toEqual([
      "flow:quarters/break_1",
      "flow:quarters/jump_1",
    ]);
    const labels = manifestElements(load("flow_control.json"))
      .filter((key) => key.type === "label")
      .map((key) => key.address);
    expect(labels).toEqual([
      "flow:quarters/break_1/label",
      "flow:quarters/jump_1/label",
      "flow:quarters/start/label",
      "flow:quarters/end/label",
    ]);
  });

  it("enumerates every manifest fixture of one root with unique addresses", () => {
    for (const { name, text } of allFixtures.filter((item) => !item.name.includes("/"))) {
      const addresses = manifestElements(loadText(text)).map((key) => key.address);
      expect([name, new Set(addresses).size]).toEqual([name, addresses.length]);
    }
  });

  it("lists the title of a named manifest, addressed name", () => {
    const title = { ...BLOCK_NAME };
    const top = (members: object) =>
      manifestElements(loadText(dumps({ ...manifestValue("bare.json"), ...members })))[1];
    expect(top({ name: "Piece" })).toEqual(title);
    expect(top({ id: "edition" })).toEqual(title);
    expect(top({})?.type).toBe("card");
  });
});

const BLOCK_NAME = {
  type: "name",
  address: "name",
  timeline: null,
  domain: null,
  modality: null,
  class: null,
  inside: ["block"],
};

describe("timeline classes", () => {
  it("derive from the unit, each unit belonging to exactly one class", () => {
    const classes = {
      ContinuousLogicalTimeline: ["number", "floating_measures", "whole_note", "quarters"],
      DiscreteLogicalTimeline: ["ticks"],
      ContinuousPhysicalTimeline: ["milliseconds", "seconds", "minutes"],
      DiscretePhysicalTimeline: ["samples", "frames"],
      ContinuousGraphicalTimeline: ["meters", "centimeters", "millimeters", "inches", "points"],
      DiscreteGraphicalTimeline: ["pixels"],
    } as const;
    const units = Object.values(classes).flat();
    expect([...units].sort()).toEqual([...schema.$defs.TimeUnit.enum].sort());
    for (const [name, own] of Object.entries(classes)) {
      for (const unit of own) expect([unit, timelineClass(unit)]).toEqual([unit, name]);
    }
  });

  it("give a map the domain and modality of its target unit, number included", () => {
    expect(unitDomain("number")).toEqual(["logical", "continuous"]);
    expect(unitDomain("samples")).toEqual(["physical", "discrete"]);
    expect(unitDomain(null)).toBe(null);
  });
});

describe("selector matching", () => {
  const manifest = load("map.json");
  const keys = manifestElements(manifest);
  const ancestry = timelineAncestry(manifest);
  const matched = (select: Selector) =>
    keys.filter((key) => selectorMatches(select, key, ancestry)).map((key) => key.address);

  it.each([
    [{ element: "map", domain: "physical" }, ["melody/tempo"]],
    [{ within: "phrase" }, ["phrase", "phrase/name", "melody/ticks"]],
    [{ ids: ["melody/tempo"] }, ["melody/tempo"]],
    [{ class: "QuartersToTicks" }, ["melody/ticks"]],
    [{ modality: "discrete" }, ["melody/ticks"]],
    [{ element: "card" }, ["melody/card"]],
    [{ element: "card", domain: "logical" }, ["melody/card"]],
  ] as [Selector, string[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  it("matches everything with the empty selector", () => {
    expect(matched({})).toEqual(keys.map((key) => key.address));
    expect(keys.length).toBe(12);
  });
});

describe("the selector member inside", () => {
  const manifest = load("map.json");
  const keys = manifestElements(manifest);
  const ancestry = timelineAncestry(manifest);
  const matched = (select: Selector) =>
    keys.filter((key) => selectorMatches(select, key, ancestry)).map((key) => key.address);

  it.each([
    [{ inside: "child" }, ["phrase/name", "melody/ticks"]],
    [
      { inside: "timeline" },
      [
        "melody/name",
        "melody/tempo",
        "melody/start",
        "melody/start/label",
        "melody/end",
        "melody/end/label",
        "phrase",
        "phrase/name",
        "melody/ticks",
      ],
    ],
    [{ inside: "wedge" }, ["melody/start/label", "melody/end/label"]],
    [{ inside: "card" }, []],
    [{ inside: "map" }, []],
    [{ element: "name", inside: "child" }, ["phrase/name"]],
  ] as [Selector, string[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  it("matches every key but the block inside the block", () => {
    expect(matched({ inside: "block" })).toEqual(keys.slice(1).map((key) => key.address));
  });

  it("reads the holder chain and nothing else", () => {
    const mark: ElementKey = {
      type: "wedge",
      address: "melody/start",
      timeline: "melody",
      domain: "logical",
      modality: "continuous",
      class: CLT,
      inside: ["block", "group", "timeline", "ancestor"],
    };
    const test = (select: Selector) => selectorMatches(select, mark, ancestry);
    expect([
      test({ inside: "group" }),
      test({ inside: "ancestor" }),
      test({ inside: "child" }),
    ]).toEqual([true, true, false]);
  });
});

describe("the elements of a segment line", () => {
  const manifest = load("segment_line.json");
  const keys = manifestElements(manifest);
  const ancestry = timelineAncestry(manifest);
  const matched = (select: Selector) =>
    keys.filter((key) => selectorMatches(select, key, ancestry)).map((key) => key.address);

  it("enumerates segments as nodes with a boundary after the first and a label", () => {
    expect(keys.map((key) => [key.type, key.address])).toEqual([
      ["block", null],
      ["card", "form/card"],
      ["timeline", "form"],
      ["name", "form/name"],
      ["wedge", "form/start"],
      ["label", "form/start/label"],
      ["wedge", "form/end"],
      ["label", "form/end/label"],
      ["child", "a"],
      ["label", "a/label"],
      [null, "a1"],
      ["label", "a1/label"],
      ["child", "b"],
      ["boundary", "b/start"],
      ["label", "b/label"],
      [null, "b1"],
      ["label", "b1/label"],
      [null, "b2"],
      ["boundary", "b2/start"],
      ["label", "b2/label"],
      ["child", "c"],
      ["boundary", "c/start"],
      ["label", "c/label"],
      [null, "c1"],
      ["label", "c1/label"],
    ]);
    const boundary = keys.find((key) => key.address === "b/start");
    expect(boundary).toEqual({
      type: "boundary",
      address: "b/start",
      timeline: "b",
      domain: "logical",
      modality: "continuous",
      class: CLT,
      inside: ["block", "timeline", "child"],
    });
    expect(keys.find((key) => key.address === "b2/start")?.inside).toEqual([
      "block",
      "timeline",
      "child",
    ]);
  });

  it.each([
    [{ element: "boundary" }, ["b/start", "b2/start", "c/start"]],
    [{ element: "child" }, ["a", "b", "c"]],
    [{ ids: ["b"] }, ["b"]],
    [{ within: "b" }, ["b", "b/start", "b/label", "b1", "b1/label", "b2", "b2/start", "b2/label"]],
  ] as [Selector, string[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });
});
