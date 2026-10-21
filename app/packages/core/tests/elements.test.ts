import { dumps, type Selector, schema } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import type { ElementKey } from "../src/manifest/elements.ts";
import {
  manifestElements,
  selectorMatches,
  timelineAncestry,
  timelineClass,
  unitDomain,
} from "../src/manifest/elements.ts";
import { allFixtures, load, loadText, manifestValue } from "./support.ts";

const CLT = "ContinuousLogicalTimeline";

/** The addresses of a timeline's five bands, in the order of `BAND_KINDS`. */
const bandsOf = (id: string) =>
  ["children", "conversion_maps", "markers", "regions", "flow_control"].map(
    (kind) => `${id}/${kind}_1`,
  );

/** The five bands of the child `phrase` of `map.json`. */
const PHRASE_BANDS = bandsOf("phrase");

describe("the elements of a manifest", () => {
  it("enumerates map.json in tree order", () => {
    const melody = ["melody", "logical", "continuous", CLT] as const;
    const phrase = ["phrase", "logical", "continuous", CLT] as const;
    const line = ["block", "timeline"];
    const child = [...line, "band", "child"];
    const band = (timeline: string, kind: string, inside: string[]) => [
      "band",
      `${timeline}/${kind}_1`,
      timeline,
      null,
      null,
      kind,
      inside,
    ];
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
      band("melody", "children", line),
      ["child", "phrase", ...phrase, [...line, "band"]],
      ["name", "phrase/name", ...phrase, child],
      band("phrase", "children", child),
      band("phrase", "conversion_maps", child),
      ["map", "melody/ticks", "phrase", "logical", "discrete", "LinearMap", [...child, "band"]],
      band("phrase", "markers", child),
      band("phrase", "regions", child),
      band("phrase", "flow_control", child),
      band("melody", "conversion_maps", line),
      ["map", "melody/tempo", "melody", "physical", "continuous", "LinearMap", [...line, "band"]],
      band("melody", "markers", line),
      ["wedge", "melody/start", ...melody, [...line, "band"]],
      ["label", "melody/start/label", ...melody, [...line, "band", "wedge"]],
      ["wedge", "melody/end", ...melody, [...line, "band"]],
      ["label", "melody/end/label", ...melody, [...line, "band", "wedge"]],
      band("melody", "regions", line),
      band("melody", "flow_control", line),
    ]);
  });

  it("gives regions, flow markers and jump origins their drawn addresses, each with a label", () => {
    const addresses = (name: string) =>
      manifestElements(load(name))
        .filter((key) => ["region", "flow_marker", "jump_from"].includes(key.type as string))
        .map((key) => key.address);
    expect(addresses("with_region.json")).toEqual(["clt_1/region_1"]);
    expect(
      manifestElements(load("with_region.json")).find((key) => key.type === "region")?.inside,
    ).toEqual(["block", "timeline", "band"]);
    const flow = "flow:quarters";
    expect(
      manifestElements(load("flow_control.json")).map((key) => [key.type, key.address]),
    ).toEqual([
      ["block", null],
      ["card", `${flow}/card`],
      ["timeline", flow],
      ["name", `${flow}/name`],
      ["band", `${flow}/children_1`],
      ["band", `${flow}/conversion_maps_1`],
      ["band", `${flow}/markers_1`],
      ["wedge", `${flow}/start`],
      ["label", `${flow}/start/label`],
      ["wedge", `${flow}/end`],
      ["label", `${flow}/end/label`],
      ["band", `${flow}/regions_1`],
      ["band", `${flow}/flow_control_1`],
      ["flow_marker", `${flow}/flow_marker_1`],
      ["label", `${flow}/flow_marker_1/label`],
      ["jump_from", `${flow}/jump_from_1`],
      ["label", `${flow}/jump_from_1/label`],
      ["jump_from", `${flow}/jump_from_2`],
      ["label", `${flow}/jump_from_2/label`],
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
      ContinuousLogicalTimeline: ["number", "floating_measures", "whole_notes", "quarters"],
      DiscreteLogicalTimeline: ["ticks"],
      ContinuousPhysicalTimeline: ["milliseconds", "seconds", "minutes"],
      DiscretePhysicalTimeline: ["samples", "frames"],
      ContinuousGraphicalTimeline: ["meters", "centimeters", "millimeters", "inches", "points"],
      DiscreteGraphicalTimeline: ["pixels"],
    } as const;
    const units = Object.values(classes).flat();
    expect([...units].sort()).toEqual(
      schema.$defs.TimeUnit.oneOf.map((entry) => entry.const).sort(),
    );
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
    [
      { within: "phrase" },
      [
        "phrase",
        "phrase/name",
        ...PHRASE_BANDS.slice(0, 2),
        "melody/ticks",
        ...PHRASE_BANDS.slice(2),
      ],
    ],
    [{ ids: ["melody/tempo"] }, ["melody/tempo"]],
    [{ class: "LinearMap" }, ["melody/ticks", "melody/tempo"]],
    [{ modality: "discrete" }, ["melody/ticks"]],
    [{ element: "card" }, ["melody/card"]],
    [{ element: "card", domain: "logical" }, ["melody/card"]],
    [
      { element: "band" },
      [
        "melody/children_1",
        ...PHRASE_BANDS,
        "melody/conversion_maps_1",
        "melody/markers_1",
        "melody/regions_1",
        "melody/flow_control_1",
      ],
    ],
    [{ element: "band", class: "regions" }, ["phrase/regions_1", "melody/regions_1"]],
    [{ class: "children" }, ["melody/children_1", "phrase/children_1"]],
    [{ ids: ["phrase/regions_1"] }, ["phrase/regions_1"]],
    [{ element: "band", domain: "logical" }, []],
    [{ element: "band", modality: "continuous" }, []],
  ] as [Selector, string[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  it("matches everything with the empty selector", () => {
    expect(matched({})).toEqual(keys.map((key) => key.address));
    expect(keys.length).toBe(22);
  });
});

describe("the selector member inside", () => {
  const manifest = load("map.json");
  const keys = manifestElements(manifest);
  const ancestry = timelineAncestry(manifest);
  const matched = (select: Selector) =>
    keys.filter((key) => selectorMatches(select, key, ancestry)).map((key) => key.address);

  it.each([
    [
      { inside: "child" },
      ["phrase/name", ...PHRASE_BANDS.slice(0, 2), "melody/ticks", ...PHRASE_BANDS.slice(2)],
    ],
    [
      { inside: "band" },
      [
        "phrase",
        "phrase/name",
        ...PHRASE_BANDS.slice(0, 2),
        "melody/ticks",
        ...PHRASE_BANDS.slice(2),
        "melody/tempo",
        "melody/start",
        "melody/start/label",
        "melody/end",
        "melody/end/label",
      ],
    ],
    [{ element: "band", inside: "band" }, PHRASE_BANDS],
    [{ inside: "wedge" }, ["melody/start/label", "melody/end/label"]],
    [{ inside: "card" }, []],
    [{ inside: "map" }, []],
    [{ element: "name", inside: "child" }, ["phrase/name"]],
  ] as [Selector, string[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  it("matches every key but the block inside the block, every key after the line inside it", () => {
    expect(matched({ inside: "block" })).toEqual(keys.slice(1).map((key) => key.address));
    expect(keys[2]?.address).toBe("melody");
    expect(matched({ inside: "timeline" })).toEqual(keys.slice(3).map((key) => key.address));
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
  const band = (address: string) => ["band", address];
  /** The (type, address) pairs of a timeline's five bands. */
  const five = (id: string) => bandsOf(id).map(band);
  /** The last four of them: conversion maps, markers, regions, flow control. */
  const four = (id: string) => five(id).slice(1);

  it("enumerates segments in their children bands, boundaries and labels on their lines", () => {
    expect(keys.map((key) => [key.type, key.address])).toEqual([
      ["block", null],
      ["card", "form/card"],
      ["timeline", "form"],
      ["name", "form/name"],
      band("form/children_1"),
      ["child", "a"],
      ["label", "a/label"],
      band("a/children_1"),
      [null, "a1"],
      ["label", "a1/label"],
      ...five("a1"),
      ...four("a"),
      ["child", "b"],
      ["boundary", "b/start"],
      ["label", "b/label"],
      band("b/children_1"),
      [null, "b1"],
      ["label", "b1/label"],
      ...five("b1"),
      [null, "b2"],
      ["boundary", "b2/start"],
      ["label", "b2/label"],
      ...five("b2"),
      ...four("b"),
      ["child", "c"],
      ["boundary", "c/start"],
      ["label", "c/label"],
      band("c/children_1"),
      [null, "c1"],
      ["label", "c1/label"],
      ...five("c1"),
      ...four("c"),
      band("form/conversion_maps_1"),
      band("form/markers_1"),
      ["wedge", "form/start"],
      ["label", "form/start/label"],
      ["wedge", "form/end"],
      ["label", "form/end/label"],
      band("form/regions_1"),
      band("form/flow_control_1"),
    ]);
    const boundary = keys.find((key) => key.address === "b/start");
    expect(boundary).toEqual({
      type: "boundary",
      address: "b/start",
      timeline: "b",
      domain: "logical",
      modality: "continuous",
      class: CLT,
      inside: ["block", "timeline"],
    });
    const inside = (address: string) => keys.find((key) => key.address === address)?.inside;
    expect(inside("b/label")).toEqual(["block", "timeline"]);
    for (const address of ["b2/start", "b2/label"]) {
      expect([address, inside(address)]).toEqual([address, ["block", "timeline", "band", "child"]]);
    }
    for (const address of ["a1", ...bandsOf("a1")]) {
      expect([address, inside(address)]).toEqual([
        address,
        ["block", "timeline", "band", "child", "band"],
      ]);
    }
  });

  it.each([
    [{ element: "boundary" }, ["b/start", "b2/start", "c/start"]],
    [{ element: "child" }, ["a", "b", "c"]],
    [{ ids: ["b"] }, ["b"]],
    [
      { within: "b" },
      [
        "b",
        "b/start",
        "b/label",
        "b/children_1",
        "b1",
        "b1/label",
        ...bandsOf("b1"),
        "b2",
        "b2/start",
        "b2/label",
        ...bandsOf("b2"),
        ...bandsOf("b").slice(1),
      ],
    ],
  ] as [Selector, string[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  const regions = [
    "a1/regions_1",
    "a/regions_1",
    "b1/regions_1",
    "b2/regions_1",
    "b/regions_1",
    "c1/regions_1",
    "c/regions_1",
  ];

  it.each([
    [{ element: "band", class: "regions" }, [...regions, "form/regions_1"]],
    [{ element: "band", class: "regions", inside: "band" }, regions],
  ] as [Selector, string[]][])(
    "matches the bands of a root, a child and a segment: %j",
    (select, expected) => {
      expect(matched(select)).toEqual(expected);
    },
  );

  it("holds in a band everything but the root's line, its bands and its segments' parts", () => {
    const outside = [
      null,
      "form/card",
      "form",
      "form/name",
      ...bandsOf("form"),
      "a/label",
      "b/start",
      "b/label",
      "c/start",
      "c/label",
    ];
    expect(matched({ inside: "band" })).toEqual(
      keys.map((key) => key.address).filter((address) => !outside.includes(address)),
    );
    expect(keys.filter((key) => outside.includes(key.address)).length).toBe(outside.length);
  });
});
