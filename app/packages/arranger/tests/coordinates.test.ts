// @vitest-environment jsdom
/**
 * Show coordinates: what the pointer hovers, the grid point it picks and
 * what the timestamp reads. Derived in `README.md` ("Show coordinates").
 */

import type { Granularity, Manifest, MeasureKnots, View } from "@timetoalign/tilie-core";
import { DEFAULT_GRANULARITY, gridText, idAddress, inBlock } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { LineAxis } from "@timetoalign/tilie-layout";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  axesOf,
  FrameCoalescer,
  lineAt,
  MeasureKnotsSource,
  mapValueText,
  readingAt,
  timestampSpec,
} from "../src/coordinates.ts";
import { drawingOf } from "../src/drawing.ts";
import type { BlockNode } from "../src/project.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { A, blockIn, changed, load, metrics, viewOf } from "./support.ts";

const q = (numerator: number, denominator = 1) => Rational.of([numerator, denominator]);

/** Block A holding `fixture` at (40, 80). */
const viewWith = (fixture: string, scale?: number): View =>
  viewOf({ id: A, fixture, x: 40, y: 80, ...(scale === undefined ? {} : { scale }) });

/** The drawn lines of block A, layout's record. */
function axes(view: View): ReadonlyMap<string, LineAxis> {
  return axesOf(drawingOf(blockIn(view, A), view.graphical, metrics));
}

/** The line of timeline `id` in block A. */
function axis(view: View, id: string): LineAxis {
  const found = [...axes(view).values()].find((line) => line.timeline === id);
  if (found === undefined) throw new Error(`no line of ${id}`);
  return found;
}

/** `map` with a second map `tempo_2` (its `tempo` under another ID) added to `melody`. */
function twoSlots(): View {
  const tempo = load("map").timelines[0]?.conversion_maps[0];
  if (tempo === undefined) throw new Error("map has changed");
  return changed(viewWith("map"), {
    type: "add",
    into: inBlock(A, idAddress("melody")),
    map: { ...tempo, id: "tempo_2" },
  });
}

/** What `lineAt` hovers at `(x, y)` with tolerance 8, as `[timeline, map, x]`. */
function hovered(view: View, x: number, y: number, tolerance = 8) {
  const hit = lineAt(axes(view), { x, y }, tolerance);
  return hit === null ? null : [hit.axis.timeline, hit.map?.id ?? null, hit.x];
}

function nodes(view: View): BlockNode[] {
  return project(view, NOTHING_SELECTED, [], metrics, null);
}

/** The canvas point of block A's local point `(x, y)`. */
function canvasPoint(view: View, x: number, y: number) {
  const [node] = nodes(view);
  if (node === undefined) throw new Error("no node");
  const { scale } = node.data.block;
  return { x: node.position.x + x * scale, y: node.position.y + y * scale };
}

/** The reading at block A's local point `(x, y)`. */
function readAt(
  view: View,
  x: number,
  y: number,
  options: { zoom?: number; ratio?: number; granularity?: Granularity } = {},
) {
  return readingAt(nodes(view), canvasPoint(view, x, y), {
    zoom: options.zoom ?? 1,
    ratio: options.ratio ?? 1,
    granularity: options.granularity ?? DEFAULT_GRANULARITY,
  });
}

const MELODY_START = 63.53662109375;
const MELODY_END = 463.53662109375;

describe("hovering", () => {
  const map = () => viewWith("map");

  it.each([
    [48.5, ["melody", null, 263.53662109375]],
    [48.515625, null],
    [37, ["melody", "tempo", 263.53662109375]],
    [37.75, ["melody", null, 263.53662109375]],
  ])("at y %d hovers %j", (y, expected) => {
    expect(hovered(map(), 263.53662109375, y)).toEqual(expected);
  });

  it("reaches 8 past a line's end and holds the abscissa to it", () => {
    expect(hovered(map(), 471.53662109375, 40.5)).toEqual(["melody", null, MELODY_END]);
    expect(hovered(map(), 471.55224609375, 40.5)).toBeNull();
  });

  it("prefers the nearer map of a child and holds the abscissa to its span", () => {
    expect(hovered(map(), 156, 20)).toEqual(["phrase", "ticks", 163.53662109375]);
  });

  it.each([
    [42.5, ["melody", "tempo"]],
    [43, ["melody", null]],
    [37.75, ["melody", "tempo"]],
    [37.25, ["melody", "tempo_2"]],
    [33, ["melody", "tempo_2"]],
    [32.984375, null],
    [47.5, ["melody", null]],
    [47.515625, null],
  ])("at zoom 2 on ratio 2 covers the line and its maps: at y %s hovers %j", (y, expected) => {
    const reading = readAt(twoSlots(), 263.53662109375, y, { zoom: 2, ratio: 2 });
    expect(
      reading === null ? null : [reading.hit.axis.timeline, reading.hit.map?.id ?? null],
    ).toEqual(expected);
  });

  it("never hovers a line of unknown length", () => {
    expect(hovered(viewWith("unknown_length"), 200, 37)).toBeNull();
  });
});

describe("the grid point", () => {
  const at = MELODY_START + 123.75;

  it.each([
    [{ zoom: 1, ratio: 1 }, DEFAULT_GRANULARITY, q(1, 32), q(79, 32)],
    [{ zoom: 2, ratio: 2 }, DEFAULT_GRANULARITY, q(1, 128), q(317, 128)],
    [
      { zoom: 1, ratio: 1 },
      { ...DEFAULT_GRANULARITY, fraction: { denominator: 5, refine: false } },
      q(1, 5),
      q(12, 5),
    ],
  ])(
    "on a fraction line at %j with %j: step %s, position %s",
    (view, granularity, step, position) => {
      const reading = readAt(viewWith("map"), at, 40.5, { ...view, granularity });
      expect(reading?.step).toEqual(step);
      expect(reading?.position).toEqual(position);
      expect(reading?.timestamp.parts[0]?.position).toEqual(position);
    },
  );

  it("holds the position to the line's ends", () => {
    expect(readAt(viewWith("map"), MELODY_END + 4, 40.5)?.position).toEqual(q(8));
    expect(readAt(viewWith("map"), MELODY_START - 4, 40.5)?.position).toEqual(q(0));
  });

  it.each([
    [DEFAULT_GRANULARITY, q(1, 200), q(31, 50), 0.62, "grid 0.005 s (float base 1, refining)"],
    [
      { ...DEFAULT_GRANULARITY, float: { step: "0.2", refine: false } },
      q(1, 5),
      q(3, 5),
      0.6,
      "grid 0.2 s (float base 0.2, fixed)",
    ],
  ])("on a float line with %j", (granularity, step, position, read, footer) => {
    const view = viewWith("conversion_maps__maps_seconds");
    const start = axis(view, "maps:seconds").xStart;
    const reading = readAt(view, start + 123.75, 22.5, { granularity });
    expect([reading?.step, reading?.position, reading?.timestamp.parts[0]?.position]).toEqual([
      step,
      position,
      read,
    ]);
    expect(gridText({ step, numberType: "float", unit: "seconds", granularity })).toBe(footer);
  });

  it("on an int line", () => {
    const view = viewWith("discrete_physical");
    const reading = readAt(view, axis(view, "dpt_1").xStart + 123.75, 37);
    expect([reading?.step, reading?.position, reading?.timestamp.parts[0]?.position]).toEqual([
      q(200),
      q(13600),
      13600n,
    ]);
    expect(
      gridText({
        step: q(200),
        numberType: "int",
        unit: "samples",
        granularity: DEFAULT_GRANULARITY,
      }),
    ).toBe("grid 200 smp (int base 1, refining)");
  });

  it("writes a fraction line's footer", () => {
    expect(
      gridText({
        step: q(1, 32),
        numberType: "fraction",
        unit: "quarters",
        granularity: DEFAULT_GRANULARITY,
      }),
    ).toBe("grid 1/32 ♩ (fraction base 1, refining)");
  });
});

describe("what is read", () => {
  /** `segment_line` with `b_tempo` on the segment line `b` and `b2_ticks` on its segment `b2`. */
  function segmentMaps(): View {
    const melody = load("map").timelines[0];
    const tempo = melody?.conversion_maps[0];
    const ticks = melody?.children[0]?.conversion_maps[0];
    if (tempo === undefined || ticks === undefined) throw new Error("map has changed");
    const into = (id: string) => inBlock(A, idAddress(id));
    const view = changed(viewWith("segment_line"), {
      type: "add",
      into: into("b"),
      map: { ...tempo, id: "b_tempo" },
    });
    return changed(view, { type: "add", into: into("b2"), map: { ...ticks, id: "b2_ticks" } });
  }
  const tempo = (value: number) => ({
    id: "b_tempo",
    name: "Tempo",
    targetUnit: "seconds",
    value: { unit: "seconds", numberType: "float", value },
    missingKnots: null,
  });
  const part = (timeline: string, name: string, position: Rational, segment: boolean) => ({
    timeline,
    name,
    unit: "quarters",
    numberType: "fraction",
    position,
    segment,
  });

  it("on a segment line gives every segment, each with its own maps", () => {
    const view = segmentMaps();
    const reading = readAt(view, 223.294921875, 39.9765625);
    expect(reading?.hit.map).toBeNull();
    const spec = timestampSpec(
      blockIn(view, A).manifest,
      A,
      { axis: axis(view, "b"), map: null },
      q(1, 8),
    );
    expect(spec.line.maps.map((map) => map.id)).toEqual(["b_tempo"]);
    expect(
      spec.segments.map(({ timeline, offset, maps }) => [timeline, offset, maps.map((m) => m.id)]),
    ).toEqual([
      ["b1", q(0), []],
      ["b2", q(6), ["b2_ticks"]],
    ]);
    expect(reading?.timestamp).toEqual({
      block: A,
      timeline: "b",
      step: q(1, 8),
      parts: [
        { ...part("b", "B", q(45, 8), false), maps: [tempo(2.8125)] },
        { ...part("b1", "b1", q(45, 8), true), maps: [] },
      ],
    });
  });

  it("on a segment's map reads that segment, also on the boundary it shares", () => {
    const reading = readAt(segmentMaps(), 223.294921875, 29.4765625);
    expect(reading?.hit.map?.id).toBe("b2_ticks");
    expect(reading?.timestamp.parts).toEqual([
      { ...part("b", "B", q(6), false), maps: [tempo(3)] },
      {
        ...part("b2", "b2", q(0), true),
        maps: [
          {
            id: "b2_ticks",
            name: "Ticks",
            targetUnit: "ticks",
            value: { unit: "ticks", numberType: "int", value: 0n },
            missingKnots: null,
          },
        ],
      },
    ]);
  });

  it("on a line without maps gives every segment to core, which reads the later one at a boundary", () => {
    const view = segmentMaps();
    const form = axis(view, "form");
    const reading = readAt(view, 152.294921875, form.y);
    expect(reading?.timestamp.parts.map(({ timeline, position }) => [timeline, position])).toEqual([
      ["form", q(8)],
      ["b", q(0)],
    ]);
  });

  it("writes each value in its number type, a float to 3 places", () => {
    const [b, b2] = readAt(segmentMaps(), 223.294921875, 29.4765625)?.timestamp.parts ?? [];
    const [tempoMap] =
      readAt(segmentMaps(), 223.294921875, 39.9765625)?.timestamp.parts[0]?.maps ?? [];
    expect([b?.maps[0], b2?.maps[0], tempoMap].map((map) => map && mapValueText(map))).toEqual([
      { text: "3.0", unit: "s" },
      { text: "0", unit: "ticks" },
      { text: "2.812", unit: "s" },
    ]);
  });

  it("a child reads its own maps only", () => {
    const reading = readAt(viewWith("map"), 263.53662109375, 23);
    expect(
      reading?.timestamp.parts.map(({ timeline, maps }) => [timeline, maps.map((m) => m.id)]),
    ).toEqual([["phrase", ["ticks"]]]);
  });
});

describe("measure maps", () => {
  const withMeasureMaps = (): Manifest => load("groups/group_measure_map");

  it("asks once per manifest with MeasureMaps, never without, and hands the answer on", async () => {
    const answer: readonly MeasureKnots[] = [{ id: "bars", rows: [] }];
    const fetch = vi.fn((_text: string) => Promise.resolve(answer));
    const changedCount = vi.fn();
    const source = new MeasureKnotsSource(fetch, changedCount);
    const manifest = withMeasureMaps();
    expect(source.knotsOf(load("map"))).toBeUndefined();
    expect(source.knotsOf(manifest)).toBe("pending");
    expect(source.knotsOf(manifest)).toBe("pending");
    await vi.waitFor(() => expect(changedCount).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(source.knotsOf(manifest)).toBe(answer);
    expect(source.knotsOf(manifest)).toBe(answer);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  /** What the `MeasureRecordMap` `cmap_1` of `score` reads, with `knotsOf` when given. */
  function measureView(
    knotsOf?: (manifest: Manifest) => ReturnType<MeasureKnotsSource["knotsOf"]>,
  ) {
    const view = viewOf({ id: A, fixture: "groups/group_measure_map", x: 40, y: 80 });
    const score = axis(view, "score");
    const [map] =
      readingAt(nodes(view), canvasPoint(view, score.xStart + 10, score.y), {
        zoom: 1,
        ratio: 1,
        granularity: DEFAULT_GRANULARITY,
        knotsOf,
      })?.timestamp.parts[0]?.maps ?? [];
    if (map === undefined) throw new Error("score reads its measure view");
    return map;
  }

  it("leaves a measure view without a value until they are there, and says why", () => {
    const map = measureView();
    expect(map).toEqual({
      id: "cmap_1",
      name: null,
      targetUnit: null,
      value: null,
      missingKnots: "no_server",
    });
    expect(
      [
        map,
        measureView(() => "pending"),
        measureView(() => "unsupported"),
        measureView(() => "failed"),
      ].map(mapValueText),
    ).toEqual(
      [
        "needs a server to expand its measure map",
        "waiting for the server",
        "the server cannot expand measure maps",
        "the server did not expand its measure map",
      ].map((text) => ({ text, unit: null })),
    );
  });

  it.each([
    ["fails", () => Promise.reject(new Error("unreachable")), "failed"],
    ["cannot expand them", () => Promise.resolve("unsupported" as const), "unsupported"],
  ])("says why when the server %s, asking no more", async (_, answer, why) => {
    const fetch = vi.fn((_text: string) => answer());
    const changedCount = vi.fn();
    const source = new MeasureKnotsSource(fetch, changedCount);
    const manifest = withMeasureMaps();
    expect(source.knotsOf(manifest)).toBe("pending");
    await vi.waitFor(() => expect(changedCount).toHaveBeenCalledTimes(1));
    expect(source.knotsOf(manifest)).toBe(why);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("one reading per frame", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] }));
  afterEach(() => vi.useRealTimers());

  it("runs once with the last of three moves", () => {
    const run = vi.fn();
    const frames = new FrameCoalescer<number>(run);
    frames.push(1);
    frames.push(2);
    frames.push(3);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersToNextFrame();
    expect(run.mock.calls).toEqual([[3]]);
  });
});
