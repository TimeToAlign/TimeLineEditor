import { dumps, type Selector, schema } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import type { ElementAddress, Facet, Part } from "../src/manifest/address.ts";
import { addressKey, FACETS } from "../src/manifest/address.ts";
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

/** The address of the element `value`, with the part words `part`. */
const id = (value: string, ...part: Part[]): ElementAddress =>
  part.length === 0 ? { id: value } : { id: value, part };

/** The address of the band drawing the facet `facet` of the timeline `timeline`. */
const band = (timeline: string, facet: Facet): ElementAddress => ({ id: timeline, facet });

/** The addresses of a timeline's five bands, in the order of `FACETS`. */
const bandsOf = (timeline: string) => FACETS.map((facet) => band(timeline, facet));

/** The five bands of the child `phrase` of `map.json`. */
const PHRASE_BANDS = bandsOf("phrase");

/** The addresses of the keys a selector matches, in enumeration order. */
function matcher(keys: readonly ElementKey[], ancestry: ReadonlyMap<string, readonly string[]>) {
  return (select: Selector) =>
    keys.filter((key) => selectorMatches(select, key, ancestry)).map((key) => key.address);
}

describe("the elements of a manifest", () => {
  it("enumerates map.json in tree order", () => {
    const melody = ["melody", "logical", "continuous", CLT] as const;
    const phrase = ["phrase", "logical", "continuous", CLT] as const;
    const line = ["block", "timeline"];
    const child = [...line, "band", "child"];
    const facet = (timeline: string, kind: Facet, inside: string[]) => [
      "band",
      band(timeline, kind),
      timeline,
      null,
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
        key.facet,
        key.inside,
      ]),
    ).toEqual([
      ["block", {}, null, null, null, null, null, []],
      ["card", id("melody", "card"), ...melody, null, ["block"]],
      ["timeline", id("melody"), ...melody, null, ["block"]],
      ["name", id("melody", "name"), ...melody, null, line],
      facet("melody", "children", line),
      ["child", id("phrase"), ...phrase, null, [...line, "band"]],
      ["name", id("phrase", "name"), ...phrase, null, child],
      facet("phrase", "children", child),
      facet("phrase", "conversion_maps", child),
      ["map", id("ticks"), "phrase", "logical", "discrete", "LinearMap", null, [...child, "band"]],
      facet("phrase", "markers", child),
      facet("phrase", "regions", child),
      facet("phrase", "flow_control", child),
      facet("melody", "conversion_maps", line),
      [
        "map",
        id("tempo"),
        "melody",
        "physical",
        "continuous",
        "LinearMap",
        null,
        [...line, "band"],
      ],
      facet("melody", "markers", line),
      ["wedge", id("melody", "start"), ...melody, null, [...line, "band"]],
      ["label", id("melody", "start", "label"), ...melody, null, [...line, "band", "wedge"]],
      ["wedge", id("melody", "end"), ...melody, null, [...line, "band"]],
      ["label", id("melody", "end", "label"), ...melody, null, [...line, "band", "wedge"]],
      facet("melody", "regions", line),
      facet("melody", "flow_control", line),
    ]);
  });

  it("gives regions, flow markers and jump origins their drawn addresses, each with a label", () => {
    const addresses = (name: string) =>
      manifestElements(load(name))
        .filter((key) => ["region", "flow_marker", "jump_from"].includes(key.type as string))
        .map((key) => key.address);
    expect(addresses("with_region.json")).toEqual([id("region_1")]);
    expect(
      manifestElements(load("with_region.json")).find((key) => key.type === "region")?.inside,
    ).toEqual(["block", "timeline", "band"]);
    const flow = "flow:quarters";
    expect(
      manifestElements(load("flow_control.json")).map((key) => [key.type, key.address]),
    ).toEqual([
      ["block", {}],
      ["card", id(flow, "card")],
      ["timeline", id(flow)],
      ["name", id(flow, "name")],
      ["band", band(flow, "children")],
      ["band", band(flow, "conversion_maps")],
      ["band", band(flow, "markers")],
      ["wedge", id(flow, "start")],
      ["label", id(flow, "start", "label")],
      ["wedge", id(flow, "end")],
      ["label", id(flow, "end", "label")],
      ["band", band(flow, "regions")],
      ["band", band(flow, "flow_control")],
      ["flow_marker", id("flow_marker_1")],
      ["label", id("flow_marker_1", "label")],
      ["jump_from", id("jump_from_1")],
      ["label", id("jump_from_1", "label")],
      ["jump_from", id("jump_from_2")],
      ["label", id("jump_from_2", "label")],
    ]);
  });

  it("enumerates every manifest fixture of one root with unique addresses", () => {
    for (const { name, text } of allFixtures.filter((item) => !item.name.includes("/"))) {
      const addresses = manifestElements(loadText(text)).map((key) => addressKey(key.address));
      expect([name, new Set(addresses).size]).toEqual([name, addresses.length]);
    }
  });

  it("lists the title of a named manifest, addressed by the part name alone", () => {
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
  address: { part: ["name"] },
  timeline: null,
  domain: null,
  modality: null,
  class: null,
  facet: null,
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
  const matched = matcher(keys, timelineAncestry(manifest));

  it.each([
    [{ element: "map", domain: "physical" }, [id("tempo")]],
    [
      { within: "phrase" },
      [
        id("phrase"),
        id("phrase", "name"),
        ...PHRASE_BANDS.slice(0, 2),
        id("ticks"),
        ...PHRASE_BANDS.slice(2),
      ],
    ],
    [{ addresses: [{ id: "tempo" }] }, [id("tempo")]],
    [{ class: "LinearMap" }, [id("ticks"), id("tempo")]],
    [{ modality: "discrete" }, [id("ticks")]],
    [{ element: "card" }, [id("melody", "card")]],
    [{ element: "card", domain: "logical" }, [id("melody", "card")]],
    [
      { element: "band" },
      [
        band("melody", "children"),
        ...PHRASE_BANDS,
        band("melody", "conversion_maps"),
        band("melody", "markers"),
        band("melody", "regions"),
        band("melody", "flow_control"),
      ],
    ],
    [{ element: "band", facet: "regions" }, [band("phrase", "regions"), band("melody", "regions")]],
    [{ facet: "children" }, [band("melody", "children"), band("phrase", "children")]],
    [{ facet: "markers" }, [band("phrase", "markers"), band("melody", "markers")]],
    [{ class: "regions" }, []],
    [{ addresses: [{ id: "phrase", facet: "regions" }] }, [band("phrase", "regions")]],
    [
      { addresses: [{ id: "melody", part: ["end", "label"] }, { id: "ticks" }] },
      [id("ticks"), id("melody", "end", "label")],
    ],
    [{ addresses: [{ id: "melody", part: ["label", "end"] }] }, []],
    [{ addresses: [{ id: "melody", part: ["card"] }] }, [id("melody", "card")]],
    [{ addresses: [{ part: ["name"] }] }, []],
    [{ element: "band", domain: "logical" }, []],
    [{ element: "band", modality: "continuous" }, []],
  ] as [Selector, ElementAddress[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  it("matches everything with the empty selector", () => {
    expect(matched({})).toEqual(keys.map((key) => key.address));
    expect(keys.length).toBe(22);
  });

  it("matches a free ID as a whole", () => {
    const free = load("bundles/bundle_free_ids.json");
    const statement = free.graphical?.statements?.[0];
    expect(statement?.select).toEqual({ addresses: [{ id: "take 2/intro" }] });
    const found = manifestElements(free).filter((key) =>
      selectorMatches(statement?.select ?? {}, key, timelineAncestry(free)),
    );
    expect(found.map((key) => [key.type, key.address, key.timeline])).toEqual([
      ["region", id("take 2/intro"), "perf/take 2"],
    ]);
  });
});

describe("the selector member inside", () => {
  const manifest = load("map.json");
  const keys = manifestElements(manifest);
  const ancestry = timelineAncestry(manifest);
  const matched = matcher(keys, ancestry);

  it.each([
    [
      { inside: "child" },
      [id("phrase", "name"), ...PHRASE_BANDS.slice(0, 2), id("ticks"), ...PHRASE_BANDS.slice(2)],
    ],
    [
      { inside: "band" },
      [
        id("phrase"),
        id("phrase", "name"),
        ...PHRASE_BANDS.slice(0, 2),
        id("ticks"),
        ...PHRASE_BANDS.slice(2),
        id("tempo"),
        id("melody", "start"),
        id("melody", "start", "label"),
        id("melody", "end"),
        id("melody", "end", "label"),
      ],
    ],
    [{ element: "band", inside: "band" }, PHRASE_BANDS],
    [{ inside: "wedge" }, [id("melody", "start", "label"), id("melody", "end", "label")]],
    [{ inside: "card" }, []],
    [{ inside: "map" }, []],
    [{ element: "name", inside: "child" }, [id("phrase", "name")]],
  ] as [Selector, ElementAddress[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  it("matches every key but the block inside the block, every key after the line inside it", () => {
    expect(matched({ inside: "block" })).toEqual(keys.slice(1).map((key) => key.address));
    expect(keys[2]?.address).toEqual(id("melody"));
    expect(matched({ inside: "timeline" })).toEqual(keys.slice(3).map((key) => key.address));
  });

  it("reads the holder chain and nothing else", () => {
    const mark: ElementKey = {
      type: "wedge",
      address: id("melody", "start"),
      timeline: "melody",
      domain: "logical",
      modality: "continuous",
      class: CLT,
      facet: null,
      inside: ["block", "frame", "timeline", "ancestor"],
    };
    const test = (select: Selector) => selectorMatches(select, mark, ancestry);
    expect([
      test({ inside: "frame" }),
      test({ inside: "ancestor" }),
      test({ inside: "child" }),
    ]).toEqual([true, true, false]);
  });
});

describe("the elements of a segment line", () => {
  const manifest = load("segment_line.json");
  const keys = manifestElements(manifest);
  const matched = matcher(keys, timelineAncestry(manifest));
  const row = (facet: ElementAddress) => ["band", facet];
  /** The (type, address) pairs of a timeline's five bands. */
  const five = (timeline: string) => bandsOf(timeline).map(row);
  /** The last four of them: conversion maps, markers, regions, flow control. */
  const four = (timeline: string) => five(timeline).slice(1);
  const find = (address: ElementAddress) =>
    keys.find((key) => addressKey(key.address) === addressKey(address));

  it("enumerates segments in their children bands, boundaries and labels on their lines", () => {
    expect(keys.map((key) => [key.type, key.address])).toEqual([
      ["block", {}],
      ["card", id("form", "card")],
      ["timeline", id("form")],
      ["name", id("form", "name")],
      row(band("form", "children")),
      ["child", id("a")],
      ["label", id("a", "label")],
      row(band("a", "children")),
      [null, id("a1")],
      ["label", id("a1", "label")],
      ...five("a1"),
      ...four("a"),
      ["child", id("b")],
      ["boundary", id("b", "start")],
      ["label", id("b", "label")],
      row(band("b", "children")),
      [null, id("b1")],
      ["label", id("b1", "label")],
      ...five("b1"),
      [null, id("b2")],
      ["boundary", id("b2", "start")],
      ["label", id("b2", "label")],
      ...five("b2"),
      ...four("b"),
      ["child", id("c")],
      ["boundary", id("c", "start")],
      ["label", id("c", "label")],
      row(band("c", "children")),
      [null, id("c1")],
      ["label", id("c1", "label")],
      ...five("c1"),
      ...four("c"),
      row(band("form", "conversion_maps")),
      row(band("form", "markers")),
      ["wedge", id("form", "start")],
      ["label", id("form", "start", "label")],
      ["wedge", id("form", "end")],
      ["label", id("form", "end", "label")],
      row(band("form", "regions")),
      row(band("form", "flow_control")),
    ]);
    expect(find(id("b", "start"))).toEqual({
      type: "boundary",
      address: id("b", "start"),
      timeline: "b",
      domain: "logical",
      modality: "continuous",
      class: CLT,
      facet: null,
      inside: ["block", "timeline"],
    });
    expect(find(id("b", "label"))?.inside).toEqual(["block", "timeline"]);
    for (const address of [id("b2", "start"), id("b2", "label")]) {
      expect([address, find(address)?.inside]).toEqual([
        address,
        ["block", "timeline", "band", "child"],
      ]);
    }
    for (const address of [id("a1"), ...bandsOf("a1")]) {
      expect([address, find(address)?.inside]).toEqual([
        address,
        ["block", "timeline", "band", "child", "band"],
      ]);
    }
  });

  it.each([
    [{ element: "boundary" }, [id("b", "start"), id("b2", "start"), id("c", "start")]],
    [{ element: "child" }, [id("a"), id("b"), id("c")]],
    [{ addresses: [{ id: "b" }] }, [id("b")]],
    [
      { within: "b" },
      [
        id("b"),
        id("b", "start"),
        id("b", "label"),
        band("b", "children"),
        id("b1"),
        id("b1", "label"),
        ...bandsOf("b1"),
        id("b2"),
        id("b2", "start"),
        id("b2", "label"),
        ...bandsOf("b2"),
        ...bandsOf("b").slice(1),
      ],
    ],
  ] as [Selector, ElementAddress[]][])("%j", (select, expected) => {
    expect(matched(select)).toEqual(expected);
  });

  const regions = ["a1", "a", "b1", "b2", "b", "c1", "c"].map((timeline) =>
    band(timeline, "regions"),
  );

  it.each([
    [{ element: "band", facet: "regions" }, [...regions, band("form", "regions")]],
    [{ element: "band", facet: "regions", inside: "band" }, regions],
  ] as [Selector, ElementAddress[]][])(
    "matches the bands of a root, a child and a segment: %j",
    (select, expected) => {
      expect(matched(select)).toEqual(expected);
    },
  );

  it("holds in a band everything but the root's line, its bands and its segments' parts", () => {
    const outside = [
      {},
      id("form", "card"),
      id("form"),
      id("form", "name"),
      ...bandsOf("form"),
      id("a", "label"),
      id("b", "start"),
      id("b", "label"),
      id("c", "start"),
      id("c", "label"),
    ].map(addressKey);
    expect(matched({ inside: "band" })).toEqual(
      keys.map((key) => key.address).filter((address) => !outside.includes(addressKey(address))),
    );
    expect(keys.filter((key) => outside.includes(addressKey(key.address))).length).toBe(
      outside.length,
    );
  });
});
