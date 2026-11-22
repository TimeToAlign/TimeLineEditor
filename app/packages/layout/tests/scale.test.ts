/** Redraw cost: exact operation counts on synthetic manifests, no timing. */

import {
  addressKey,
  type ChildTimeline,
  type ElementAddress,
  isLoadError,
  loadManifest,
  type Manifest,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import { manifestElements } from "@timetoalign/tilie-core/drawing";
import {
  type Address,
  canonicalOrder,
  type FontMetrics,
  type Graphical,
  type Selector,
} from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { Cascade } from "../src/cascade.ts";
import { DEFAULT_LAYER, DEFAULT_PLACEMENT, draw } from "../src/index.ts";
import { at, load, metrics } from "./support.ts";

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
  // The root's named timestamps `origin` and `length`, `bare`'s moved to it: a wedge and a
  // coordinate label each.
  const timestamps = (bare.graphical?.timestamps ?? []).map((timestamp) => ({
    ...timestamp,
    timeline: "root",
    ...(timestamp.name === "length" ? { coordinate: q(200) } : {}),
  }));
  return canonicalOrder({
    ...bare,
    name: null,
    timelines: [root],
    groups: [],
    graphical: { ...bare.graphical, timestamps },
  });
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
 * Every distinct text the drawing measures: the coordinate labels of the root's `origin` and
 * `length`, the region's,
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

/** An element's address as a selector states it. */
function selected({ id, facet, part }: ElementAddress): Address {
  const [first, ...rest] = part ?? [];
  return {
    ...(id === undefined ? {} : { id }),
    ...(facet === undefined ? {} : { facet }),
    ...(first === undefined ? {} : { part: [first, ...rest] }),
  };
}

/** A text's code points as the advance table is keyed. */
const codePoints = (text: string): string[] =>
  Array.from(text, (character) => String(character.codePointAt(0)));

describe("redraw operation counts", () => {
  const manifest = thousandElements();
  const keys = manifestElements(manifest);
  const general = counted({});
  const discriminating = [
    counted({ addresses: [at("not-in-the-manifest")] }),
    counted({ class: "ChainMap" }),
    counted({ element: "frame" }),
  ];
  // One rule per address the drawing's keys carry, the block's `{}` included: the cascade
  // tests it only on keys there.
  const addresses = [
    ...new Map(keys.map((key) => [addressKey(key.address), selected(key.address)])).values(),
  ];
  const byAddress = addresses.map((address) => ({ address, ...counted({ addresses: [address] }) }));
  const layer: Graphical = {
    rules: [
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
  // The tests each rule saw while drawing: its reads less a second ranking, draw's own cascade.
  const tests = all.map(({ reads: count }, index) => count() - 2 * (ranking[index] ?? 0));

  it("styles 1,000 element keys", () => {
    expect(keys).toHaveLength(1000);
  });

  it("tests the general rule once per element key and twice per line, so resolves each key once", () => {
    // Each timeline or child line also resolves the wedge and the cross-section line no named
    // timestamp holds, once each.
    const lines = keys.filter((key) => key.type === "timeline" || key.type === "child").length;
    expect(tests[0]).toBe(1000 + 2 * lines);
  });

  it("tests a rule with addresses, a class or an element only on keys it can match", () => {
    expect(tests.slice(1, 4)).toEqual([0, 0, 0]);
    const perAddress = new Map<string, number>();
    for (const { address } of keys) {
      const key = addressKey(address);
      perAddress.set(key, (perAddress.get(key) ?? 0) + 1);
    }
    expect(byAddress.map(({ address }, index) => [address, tests[4 + index]])).toEqual(
      addresses.map((address) => [address, perAddress.get(addressKey(address))]),
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

/**
 * `roots` chains of three timelines: the root `r<i>` (4 ♩) holding `c<i>` (2 ♩ at 1 ♩), which
 * holds `g<i>` (1 ♩ at 0); the last root and its child state their band orders.
 */
function chains(roots: number): Manifest {
  const timelines = Array.from({ length: roots }, (_, index) => ({
    id: `#r${index}`,
    unit: "quarters",
    length: [4, 1],
    children: [
      {
        id: `#c${index}`,
        unit: "quarters",
        length: [2, 1],
        offset: [1, 1],
        children: [{ id: `#g${index}`, unit: "quarters", length: [1, 1], offset: [0, 1] }],
      },
    ],
  }));
  const last = roots - 1;
  const order = { [`#r${last}`]: ["markers", "line"], [`#c${last}`]: ["line", "children"] };
  const manifest = loadManifest(
    JSON.stringify({ timetoshare: "0.2.0", timelines, graphical: { order } }),
  );
  if (isLoadError(manifest)) throw new Error(`chains: ${manifest.problems[0]?.message}`);
  return manifest;
}

/** `manifest` with every read of a timeline's `children` counted, by the timeline's ID. */
function walked(manifest: Manifest): {
  readonly manifest: Manifest;
  readonly reads: ReadonlyMap<string, number>;
} {
  const reads = new Map<string, number>();
  const wrap = <T extends TimelineManifest | ChildTimeline>(timeline: T): T =>
    new Proxy(
      { ...timeline, children: timeline.children.map(wrap) },
      {
        get: (target, member, receiver) => {
          if (member === "children") reads.set(target.id, (reads.get(target.id) ?? 0) + 1);
          return Reflect.get(target, member, receiver);
        },
      },
    );
  return { manifest: { ...manifest, timelines: manifest.timelines.map(wrap) }, reads };
}

describe("work per timeline", () => {
  const readsOf = (roots: number): ReadonlyMap<string, number> => {
    const { manifest, reads } = walked(chains(roots));
    draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    return reads;
  };
  const small = readsOf(100);
  const large = readsOf(1000);
  const chainOf = (reads: ReadonlyMap<string, number>, index: number) =>
    ["r", "c", "g"].map((prefix) => reads.get(`${prefix}${index}`));

  it("draws 300 and 3,000 timelines, reading every one", () => {
    expect([small.size, large.size]).toEqual([300, 3000]);
  });

  it("reads the first and the last chain as often in the larger manifest as in the smaller", () => {
    expect(chainOf(large, 0)).toEqual(chainOf(small, 0));
    expect(chainOf(large, 999)).toEqual(chainOf(small, 99));
  });

  it("reads no timeline more often in the larger manifest than the most-read of the smaller", () => {
    expect(Math.max(...large.values())).toBe(Math.max(...small.values()));
  });
});
