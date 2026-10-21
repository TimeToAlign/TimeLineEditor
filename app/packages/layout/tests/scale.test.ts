/** Redraw cost: exact operation counts on a synthetic 1,000-element manifest, no timing. */

import type { ChildTimeline, Manifest, TimelineManifest } from "@timetoalign/tilie-core";
import { manifestElements } from "@timetoalign/tilie-core/drawing";
import {
  canonicalOrder,
  type FontMetrics,
  type Graphical,
  type Selector,
} from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { Cascade } from "../src/cascade.ts";
import { DEFAULT_PLACEMENT, draw } from "../src/index.ts";
import { load, metrics } from "./support.ts";

const q = (numerator: number, denominator = 1) => [numerator, denominator] as const;

/** Exactly 1,000 drawing element keys: 60 rich children and a 40-segment line. */
function thousandElements(): Manifest {
  const bare = load("bare");
  const template = bare.timelines[0];
  const map = load("map").timelines[0]?.conversion_maps[0];
  const region = load("with_region").timelines[0]?.regions[0];
  const flow = load("flow_control").timelines[0]?.flow_control ?? [];
  const stop = flow.find((item) => item.type === "flow_marker");
  const jump = flow.find((item) => item.type === "jump_from");
  const marker = flow.find((item) => item.type === "jump_to");
  if (
    template === undefined ||
    map === undefined ||
    region === undefined ||
    stop === undefined ||
    jump === undefined ||
    marker === undefined
  ) {
    throw new Error("operation-count fixtures are incomplete");
  }
  // The jump leads to the timeline's start: no target.
  const { target: _, ...toStart } = jump;

  const richChildren: ChildTimeline[] = Array.from({ length: 60 }, (_, index) => ({
    ...template,
    id: `child_${index}`,
    name: "voice",
    offset: q(index * 2),
    length: null,
    locked: true,
    children:
      index === 0
        ? [
            {
              ...template,
              id: "nested_unknown",
              name: null,
              offset: q(0),
              length: null,
              locked: true,
              children: [],
              conversion_maps: [],
              regions: [],
              flow_control: [],
            },
          ]
        : [],
    conversion_maps: [{ ...map, id: `map_${index}`, name: null }],
    regions: [{ ...region, id: `region_${index}`, name: "region", start: q(0), end: q(1) }],
    flow_control: [
      ...(index < 26
        ? [{ ...stop, id: `break_${index}`, coordinate: q(1, 2), label: "stop", name: null }]
        : []),
      ...(index === 26
        ? [{ ...toStart, id: `jump_${index}`, coordinate: q(1), label: "jump" }]
        : []),
      { ...marker, id: `marker_${index}`, coordinate: q(0) },
    ],
  }));
  const segments: ChildTimeline[] = Array.from({ length: 40 }, (_, index) => ({
    ...template,
    id: `segment_${index}`,
    name: null,
    offset: q(index),
    length: q(1),
    locked: true,
    children: [],
    conversion_maps: [],
    regions: [],
    flow_control: [],
  }));
  const segmentLine: ChildTimeline = {
    ...template,
    id: "segments",
    name: null,
    offset: q(120),
    length: q(40),
    locked: true,
    is_segment_line: true,
    children: segments,
    conversion_maps: [],
    regions: [],
    flow_control: [],
  };
  const root: TimelineManifest = {
    ...template,
    id: "root",
    name: null,
    length: q(200),
    children: [...richChildren, segmentLine],
    conversion_maps: [],
    regions: [],
    flow_control: [],
  };
  return canonicalOrder({ ...bare, name: null, timelines: [root], groups: [] });
}

/**
 * `select` with every read of its `element` member counted. Core's selector
 * test reads it once per test, and the cascade's ranking a fixed number of
 * times per cascade built, which `new Cascade` over the same layer shows.
 */
function counted(select: Selector): { readonly select: Selector; readonly reads: () => number } {
  let reads = 0;
  const proxy = new Proxy(select, {
    get: (target, member, receiver) => {
      if (member === "element") reads += 1;
      return Reflect.get(target, member, receiver);
    },
  });
  return { select: proxy, reads: () => reads };
}

/** `manifest` with every listing of its own keys counted, which any copy of it makes. */
function listed(manifest: Manifest): {
  readonly manifest: Manifest;
  readonly listings: () => number;
} {
  let listings = 0;
  const proxy = new Proxy(manifest, {
    ownKeys: (target) => {
      listings += 1;
      return Reflect.ownKeys(target);
    },
  });
  return { manifest: proxy, listings: () => listings };
}

/** The font metrics with every read of the advance table recorded, by code point. */
function counting(): { readonly font: FontMetrics; readonly reads: string[] } {
  const reads: string[] = [];
  const advances = new Proxy(metrics.advances, {
    get: (table, point: string) => {
      reads.push(point);
      return table[point];
    },
  });
  return { font: { ...metrics, advances }, reads };
}

/**
 * Every distinct text the drawing measures: the root's start and end labels, the region's,
 * flow marker's and jump origin's labels, the root's name, the nested child's, and the names
 * of the rows of children, each row's names joined (the segment line's row ends with its own).
 */
const MEASURED = [
  "0 ♩",
  "200 ♩",
  "region",
  "stop",
  "jump",
  "root",
  "nested_unknown",
  "voice, voice, voice",
  "voice, voice, voice, voice, voice, voice",
  "voice, voice, voice, voice, voice, voice, voice",
  "voice, voice, voice, voice, voice, voice, voice, segments",
];

/** A text's code points as the advance table is keyed. */
const codePoints = (text: string): string[] =>
  Array.from(text, (character) => String(character.codePointAt(0)));

describe("redraw operation counts", () => {
  const manifest = thousandElements();
  const keys = manifestElements(manifest);
  const general = counted({});
  const discriminating = [
    counted({ ids: ["not-in-the-manifest"] }),
    counted({ class: "ChainMap" }),
    counted({ element: "group" }),
  ];
  // One statement per address the drawing's keys carry: the cascade tests it only on keys there.
  const addresses = [
    ...new Set(keys.flatMap((key) => (key.address === null ? [] : [key.address]))),
  ];
  const byAddress = addresses.map((address) => ({ address, ...counted({ ids: [address] }) }));
  const layer: Graphical = {
    statements: [
      { select: general.select, set: { "font-size": 9 } },
      ...discriminating.map(({ select }) => ({ select, set: { stroke: "#111111" } })),
      ...byAddress.map(({ select }) => ({ select, set: {} })),
    ],
  };
  const all = [general, ...discriminating, ...byAddress];
  // What building the cascade alone reads, before any test.
  new Cascade([layer], new Map());
  const ranking = all.map(({ reads }) => reads());
  const drawn = listed(manifest);
  const { font, reads } = counting();
  draw(drawn.manifest, DEFAULT_PLACEMENT, [layer], font);
  // The tests each statement saw while drawing: its reads less a second ranking, draw's own cascade.
  const tests = all.map(({ reads: count }, index) => count() - 2 * (ranking[index] ?? 0));

  it("styles 1,000 element keys", () => {
    expect(keys).toHaveLength(1000);
  });

  it("tests the general statement once per element key, so resolves each key once", () => {
    expect(tests[0]).toBe(1000);
  });

  it("tests a statement with ids, a class or an element only on keys it can match", () => {
    expect(tests.slice(1, 4)).toEqual([0, 0, 0]);
    const perAddress = new Map<string, number>();
    for (const { address } of keys) {
      if (address !== null) perAddress.set(address, (perAddress.get(address) ?? 0) + 1);
    }
    expect(byAddress.map(({ address }, index) => [address, tests[4 + index]])).toEqual(
      addresses.map((address) => [address, perAddress.get(address)]),
    );
  });

  it("reads the font once per distinct text measured, one read per code point", () => {
    expect(reads).toHaveLength(203);
    expect([...reads].sort()).toEqual(MEASURED.flatMap(codePoints).sort());
  });

  it("draws the manifest it is given, copying none", () => {
    expect(drawn.listings()).toBe(0);
  });
});
