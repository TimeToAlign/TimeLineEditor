// @vitest-environment jsdom
/**
 * Show coordinates: what the pointer hovers, the cross-section handed to
 * core, the position picked on the hovered row, a named timestamp's pin,
 * the flag's rows and place. Derived in `README.md` ("Show coordinates").
 */

import type {
  CrossSectionSpec,
  Granularity,
  Manifest,
  MeasureKnots,
  View,
} from "@timetoalign/tilie-core";
import { DEFAULT_GRANULARITY, idAddress, inBlock, timestampAt } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { Drawing, LineAxis } from "@timetoalign/tilie-layout";
import { lineAxes, wedgeAt } from "@timetoalign/tilie-layout";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  affordancesOf,
  axesOf,
  crossSectionSpec,
  FrameCoalescer,
  flagParts,
  flagPlace,
  lineAt,
  MeasureKnotsSource,
  namedPin,
  placeText,
  readingAt,
  rowValueText,
} from "../src/coordinates.ts";
import { drawingOf } from "../src/drawing.ts";
import type { BlockNode } from "../src/node.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { A, blockIn, changed, load, MIXED, metrics, viewOf } from "./support.ts";

const q = (numerator: number, denominator = 1) => Rational.of([numerator, denominator]);

/** Block A holding `fixture` at (40, 80). */
const viewWith = (fixture: string, scale?: number): View =>
  viewOf({ id: A, fixture, x: 40, y: 80, ...(scale === undefined ? {} : { scale }) });

function drawingIn(view: View): Drawing {
  return drawingOf(blockIn(view, A), view.graphical, metrics);
}

/** The lines block A is read on (`axesOf`). */
function axes(view: View): ReadonlyMap<string, LineAxis> {
  return axesOf(drawingIn(view));
}

/** The key and the line of timeline `id` in block A. */
function lineOf(view: View, id: string): [string, LineAxis] {
  const found = [...axes(view)].find(([, line]) => line.timeline === id);
  if (found === undefined) throw new Error(`no line of ${id}`);
  return found;
}

const axis = (view: View, id: string): LineAxis => lineOf(view, id)[1];

/** The spec read on the line of `id` in block A. */
function specOf(view: View, id: string): CrossSectionSpec {
  const block = blockIn(view, A);
  return crossSectionSpec(
    block.manifest,
    A,
    drawingIn(view),
    lineOf(view, id)[0],
    DEFAULT_GRANULARITY,
  );
}

/** A spec's anchor and members as `[timeline, offset, length, map IDs]`, the anchor's offset 0. */
function shape(spec: CrossSectionSpec) {
  const { anchor, members } = spec;
  return [{ ...anchor, offset: q(0) }, ...members].map(({ timeline, offset, length, maps }) => [
    timeline,
    offset,
    length,
    maps.map((map) => map.id),
  ]);
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

/** `segment_line` with `b2_ticks` (`map`'s `ticks` under another ID) on `b`'s segment `b2`. */
function segmentTicks(): View {
  const ticks = load("map").timelines[0]?.children[0]?.conversion_maps[0];
  if (ticks === undefined) throw new Error("map has changed");
  return changed(viewWith("segment_line"), {
    type: "add",
    into: inBlock(A, idAddress("b2")),
    map: { ...ticks, id: "b2_ticks" },
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

/** `map` with the root `late` added to block A, of unknown length and without content. */
const withLate = (): View =>
  changed(viewWith("map"), {
    type: "add",
    into: { block: A },
    timeline: { id: "late", unit: "quarters", number_type: "fraction", length: null },
  });

/** `view` with the `display` of the named timestamp `id` of block A emptied. */
const undisplayed = (view: View, id: string): View =>
  changed(view, {
    type: "set",
    changes: [{ target: inBlock(A, idAddress(id)), values: { display: [] } }],
  });

/** The key and the drawn line of timeline `id` in block A, whether or not it is read. */
function drawnLine(view: View, id: string): [string, LineAxis] {
  const found = [...lineAxes(drawingIn(view))].find(([, line]) => line.timeline === id);
  if (found === undefined) throw new Error(`no drawn line of ${id}`);
  return found;
}

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

  it("hovers a line of unknown length over its drawn span, up to its reach", () => {
    const view = viewWith("unknown_length");
    const score = axis(view, "score");
    expect([score.y, score.xStart, score.xEnd, score.length, score.drawnLength]).toEqual([
      37,
      53.798828125,
      453.798828125,
      null,
      q(14),
    ]);
    expect(axis(view, "coda").xStart).toBe(339.5131138392857);
    const reading = readAt(view, 353.798828125, 37);
    expect([reading?.row, reading?.position]).toEqual([{ timeline: "score", map: null }, q(21, 2)]);
    expect(
      reading?.pin.timestamp.parts.map(({ timeline, position }) => [timeline, position]),
    ).toEqual([
      ["score", q(21, 2)],
      ["coda", q(1, 2)],
    ]);
  });

  it("never hovers a line whose drawn length is 0", () => {
    const view = withLate();
    const [, late] = drawnLine(view, "late");
    expect([late.y, late.xStart, late.xEnd, late.length, late.drawnLength]).toEqual([
      22.40234375,
      63.53662109375,
      463.53662109375,
      null,
      q(0),
    ]);
    expect([...axes(view).values()].some((line) => line.timeline === "late")).toBe(false);
    expect(hovered(view, 263.53662109375, 22.40234375)).toBeNull();
  });

  it("never hovers an ancestor line", () => {
    const view = viewWith(MIXED);
    expect(axis(view, "excerpt")).toMatchObject({ y: 340.796875 });
    expect([...axes(view).values()].some((line) => line.timeline === "recording")).toBe(false);
    expect(hovered(view, 326.29150390625, 323.296875)).toBeNull();
  });
});

describe("the cross-section", () => {
  it("of a root holds its children with their maps", () => {
    expect(shape(specOf(viewWith("map"), "melody"))).toEqual([
      ["melody", q(0), q(8), ["tempo"]],
      ["phrase", q(2), q(4), ["ticks"]],
    ]);
    const { anchor, members } = specOf(viewWith("map"), "melody");
    expect([anchor.name, anchor.unit, anchor.numberType, members[0]?.name]).toEqual([
      "Melody",
      "quarters",
      "fraction",
      "Phrase",
    ]);
    expect(anchor.maps).toEqual(load("map").timelines[0]?.conversion_maps);
  });

  it("of a child holds its ancestors, parent first, without maps", () => {
    expect(shape(specOf(viewWith("map"), "phrase"))).toEqual([
      ["phrase", q(0), q(4), ["ticks"]],
      ["melody", q(-2), q(8), []],
    ]);
    const reading = readAt(viewWith("map"), MELODY_START + 200, 40.5);
    expect(
      reading?.pin.timestamp.parts.map(({ timeline, position }) => [timeline, position]),
    ).toEqual([
      ["melody", q(4)],
      ["phrase", q(2)],
    ]);
  });

  it("of a child that is a group's member holds its ancestors in its own card", () => {
    const view = viewWith(MIXED);
    const excerpt = axis(view, "excerpt");
    const reading = readAt(view, (excerpt.xStart + excerpt.xEnd) / 2, excerpt.y);
    expect(
      reading?.pin.timestamp.parts.map(({ timeline, position }) => [timeline, position]),
    ).toEqual([
      ["excerpt", 44100n],
      ["recording", 88200n],
    ]);
  });

  it("holds every crossed line and every segment once, in traversal order", () => {
    expect(shape(specOf(segmentTicks(), "form"))).toEqual([
      ["form", q(0), q(32), []],
      ["a", q(0), q(8), []],
      ["a1", q(0), q(8), []],
      ["b", q(8), q(12), []],
      ["b1", q(8), q(6), []],
      ["b2", q(14), q(6), ["b2_ticks"]],
      ["c", q(20), q(12), []],
      ["c1", q(20), q(12), []],
    ]);
  });

  it("of a segment line names a segment's map by its segment", () => {
    const view = segmentTicks();
    const b = axis(view, "b");
    expect([b.y, b.xStart, b.xEnd, b.maps]).toEqual([
      36.4765625,
      152.294921875,
      302.294921875,
      [{ id: "b2_ticks", owner: "b2", xs: 227.294921875, xe: 302.294921875, yc: 30.9765625 }],
    ]);
    expect(shape(specOf(view, "b"))).toEqual([
      ["b", q(0), q(12), []],
      ["form", q(-8), q(32), []],
      ["b1", q(0), q(6), []],
      ["b2", q(6), q(6), ["b2_ticks"]],
    ]);
    expect(readAt(view, 271.419921875, 30.9765625)?.row).toEqual({
      timeline: "b2",
      map: "b2_ticks",
    });
    expect(readAt(view, 271.419921875, 36.4765625)?.row).toEqual({ timeline: "b", map: null });
  });
});

describe("the position, snapped on the hovered row", () => {
  /** `bundle_mixed`'s `score` read at `p` = 3.13 with `h` = 0.004 (zoom 3.75), at the ordinate `y`. */
  function onScore(y: number, granularity: Granularity = DEFAULT_GRANULARITY) {
    const view = viewWith(MIXED);
    const score = axis(view, "score");
    expect([score.xStart, score.xEnd, score.y, score.maps.map((map) => map.yc)]).toEqual([
      126.29150390625,
      526.29150390625,
      73.109375,
      [67.609375, 62.609375],
    ]);
    return readAt(view, score.xStart + 3.13 / 0.03, y, { zoom: 3.75, granularity });
  }

  it.each([
    [73.109375, DEFAULT_GRANULARITY, { timeline: "score", map: null }, q(47, 15)],
    [67.609375, DEFAULT_GRANULARITY, { timeline: "score", map: "cmap_1" }, q(751, 240)],
    [62.609375, { denominator: 2520, decimals: 1 }, { timeline: "score", map: "cmap_2" }, q(16, 5)],
    [62.609375, DEFAULT_GRANULARITY, { timeline: "score", map: "cmap_2" }, q(313, 100)],
  ])("on bundle_mixed's score at y %d with %j: %j gives %s", (y, granularity, row, position) => {
    const reading = onScore(y, granularity);
    expect([reading?.row, reading?.position]).toEqual([row, position]);
    expect(reading?.pin.timestamp.parts[0]?.position).toEqual(position);
  });

  it("on a segment's map snaps its value and brings it back to the line", () => {
    const view = segmentTicks();
    const onLine = readAt(view, 271.419921875, 36.4765625);
    const onMap = readAt(view, 271.419921875, 30.9765625);
    expect([onLine?.position, onMap?.position]).toEqual([q(19, 2), q(457, 48)]);
    expect(onMap?.pin.timestamp.parts).toEqual([
      {
        timeline: "b",
        name: "B",
        unit: "quarters",
        numberType: "fraction",
        position: q(457, 48),
        maps: [],
      },
      {
        timeline: "form",
        name: "Form",
        unit: "quarters",
        numberType: "fraction",
        position: q(841, 48),
        maps: [],
      },
      {
        timeline: "b2",
        name: "b2",
        unit: "quarters",
        numberType: "fraction",
        position: q(169, 48),
        maps: [
          {
            id: "b2_ticks",
            name: "Ticks",
            targetUnit: "ticks",
            value: { unit: "ticks", numberType: "int", value: 1690n },
            missingKnots: null,
          },
        ],
      },
    ]);
  });

  it.each([
    [DEFAULT_GRANULARITY, q(31, 50), 0.62],
    [{ denominator: 2520, decimals: 1 }, q(3, 5), 0.6],
  ])("on a float line with %j", (granularity, position, read) => {
    const view = viewWith("conversion_maps__maps_seconds");
    const line = axis(view, "maps:seconds");
    const reading = readAt(view, line.xStart + 123.75, line.y, { granularity });
    expect([reading?.position, reading?.pin.timestamp.parts[0]?.position]).toEqual([
      position,
      read,
    ]);
  });

  it("on an int line", () => {
    const view = viewWith("discrete_physical");
    const line = axis(view, "dpt_1");
    const reading = readAt(view, line.xStart + 123.75, line.y);
    expect([reading?.position, reading?.pin.timestamp.parts[0]?.position]).toEqual([
      q(13643),
      13643n,
    ]);
  });

  it("holds the position to the line's ends", () => {
    expect(readAt(viewWith("map"), MELODY_END + 4, 40.5)?.position).toEqual(q(8));
    expect(readAt(viewWith("map"), MELODY_START - 4, 40.5)?.position).toEqual(q(0));
  });

  it("is held as an unnamed pin with the reading's spec, knots and timestamp", () => {
    const granularity = { denominator: 2520, decimals: 3 };
    const reading = readAt(viewWith("map"), MELODY_START + 200, 40.5, { granularity });
    expect([reading?.pin.named, reading?.pin.knots]).toEqual([null, "no_server"]);
    expect(reading?.pin.spec.granularity).toBe(granularity);
    expect(reading?.pin.timestamp.granularity).toBe(granularity);
    expect(reading && placeText(reading.pin.timestamp)).toBe("Melody at 4 ♩");
  });
});

describe("a named timestamp's pin", () => {
  /** `view` with a named timestamp "Mark" at `coordinate` on the timeline `into`. */
  const stamped = (view: View, into: string, coordinate: unknown): View =>
    changed(view, {
      type: "add",
      into: inBlock(A, idAddress(into)),
      timestamp: { name: "Mark", coordinate },
    });

  const pinIn = (view: View, id: string) => {
    const block = blockIn(view, A);
    return namedPin(block.manifest, A, drawingIn(view), id, DEFAULT_GRANULARITY, "no_server");
  };

  const named = (view: View, id: string) =>
    blockIn(view, A).manifest.graphical?.timestamps?.find((item) => item.id === id);

  it("is read on its line's cross-section, as a click there reads it", () => {
    const view = stamped(viewWith("map"), "melody", [4, 1]);
    const pin = pinIn(view, "timestamp_3");
    const spec = specOf(view, "melody");
    expect(pin).toEqual({
      spec,
      knots: "no_server",
      timestamp: timestampAt(spec, q(4), "no_server"),
      named: named(view, "timestamp_3"),
    });
    expect(pin?.named).toBe(named(view, "timestamp_3"));
    expect(pin?.timestamp.parts.map(({ timeline, position }) => [timeline, position])).toEqual([
      ["melody", q(4)],
      ["phrase", q(2)],
    ]);
  });

  it("of a segment without a line is anchored on the segment, read on its segment line's line", () => {
    const view = stamped(segmentTicks(), "b2", [1, 1]);
    const pin = pinIn(view, "timestamp_3");
    const b2 = blockIn(view, A).manifest.timelines[0]?.children[1]?.children[1];
    expect(b2?.id).toBe("b2");
    expect(pin?.spec).toEqual({
      block: A,
      granularity: DEFAULT_GRANULARITY,
      anchor: {
        timeline: "b2",
        name: "b2",
        unit: "quarters",
        numberType: "fraction",
        length: q(6),
        maps: b2?.conversion_maps,
      },
      members: [
        {
          timeline: "b",
          name: "B",
          unit: "quarters",
          numberType: "fraction",
          length: q(12),
          maps: [],
          offset: q(-6),
        },
        {
          timeline: "form",
          name: "Form",
          unit: "quarters",
          numberType: "fraction",
          length: q(32),
          maps: [],
          offset: q(-14),
        },
      ],
    });
    expect(pin?.spec).toEqual(
      crossSectionSpec(
        blockIn(view, A).manifest,
        A,
        drawingIn(view),
        lineOf(view, "b")[0],
        DEFAULT_GRANULARITY,
        "b2",
      ),
    );
    expect(
      pin?.timestamp.parts.map(({ timeline, position, maps }) => [
        timeline,
        position,
        maps.map((map) => map.value),
      ]),
    ).toEqual([
      ["b2", q(1), [{ unit: "ticks", numberType: "int", value: 480n }]],
      ["b", q(7), []],
      ["form", q(15), []],
    ]);
  });

  it("of a line of unknown length is read on that line", () => {
    const view = undisplayed(viewWith("unknown_length"), "timestamp_1");
    const pin = pinIn(view, "timestamp_1");
    expect(pin?.spec).toEqual(specOf(view, "score"));
    expect(shape(specOf(view, "score"))).toEqual([
      ["score", q(0), null, []],
      ["coda", q(10), q(4), []],
    ]);
    expect(pin?.timestamp.parts.map(({ timeline, position }) => [timeline, position])).toEqual([
      ["score", q(0)],
    ]);
  });

  it("of a zero-length line is read on that line, though nothing is hovered there", () => {
    const view = undisplayed(withLate(), "timestamp_3");
    const pin = pinIn(view, "timestamp_3");
    expect(pin?.named?.timeline).toBe("late");
    expect(pin?.spec).toEqual({
      block: A,
      granularity: DEFAULT_GRANULARITY,
      anchor: {
        timeline: "late",
        name: "late",
        unit: "quarters",
        numberType: "fraction",
        length: null,
        maps: [],
      },
      members: [],
    });
    expect(pin?.timestamp.parts.map(({ timeline, position }) => [timeline, position])).toEqual([
      ["late", q(0)],
    ]);
  });

  it("is read on its own axis with all its own maps where no line draws it", () => {
    const hidden = changed(stamped(viewWith("map"), "melody", [4, 1]), {
      type: "style",
      select: { addresses: [{ id: "melody" }] },
      set: { display: "none" },
      blocks: [A],
    });
    expect(axes(hidden).size).toBe(0);
    const melody = load("map").timelines[0];
    const pin = pinIn(hidden, "timestamp_3");
    expect(pin?.spec).toEqual({
      block: A,
      granularity: DEFAULT_GRANULARITY,
      anchor: {
        timeline: "melody",
        name: "Melody",
        unit: "quarters",
        numberType: "fraction",
        length: q(8),
        maps: melody?.conversion_maps,
      },
      members: [],
    });
    expect(pin?.timestamp.parts.map(({ timeline, position }) => [timeline, position])).toEqual([
      ["melody", q(4)],
    ]);
  });

  it("is null for an ID the manifest does not hold", () => {
    expect(pinIn(viewWith("map"), "timestamp_9")).toBeNull();
  });
});

describe("the affordance of a named timestamp that draws nothing", () => {
  const affordances = (view: View) => affordancesOf(blockIn(view, A).manifest, drawingIn(view));

  /** The affordance of the named timestamp `id` on line `line` with its wedge at `x`. */
  function expected(view: View, id: string, line: string, x: number) {
    const wedge = wedgeAt(drawingIn(view), line, x);
    if (wedge === null) throw new Error(`no wedge on ${line}`);
    return { kind: "affordance", address: idAddress(id), line, points: wedge.points };
  }

  it("lies on a line of unknown length at the abscissa of its coordinate", () => {
    const view = undisplayed(viewWith("unknown_length"), "timestamp_1");
    const [line] = drawnLine(view, "score");
    expect(affordances(view)).toEqual([expected(view, "timestamp_1", line, 53.798828125)]);
  });

  it("lies on a zero-length line at its start", () => {
    const view = undisplayed(withLate(), "timestamp_3");
    const [line] = drawnLine(view, "late");
    expect(affordances(view)).toEqual([expected(view, "timestamp_3", line, 63.53662109375)]);
  });

  it("is computed once per drawing", () => {
    const view = undisplayed(viewWith("unknown_length"), "timestamp_1");
    const block = blockIn(view, A);
    const drawing = drawingIn(view);
    expect(affordancesOf(block.manifest, drawing)).toBe(affordancesOf(block.manifest, drawing));
  });

  it("is none for a timestamp that displays anything", () => {
    expect(affordances(withLate())).toEqual([]);
  });

  it("is none for a match timestamp that displays nothing", () => {
    const matches = viewWith("bundles/bundle_matchstamps");
    expect(affordances(undisplayed(matches, "timestamp_1"))).toEqual([]);
    const both = undisplayed(undisplayed(matches, "timestamp_1"), "timestamp_4");
    expect(affordances(both).map(({ address }) => address)).toEqual([idAddress("timestamp_4")]);
  });
});

describe("the flag", () => {
  it("lists the rows part by part, values to the granularity's places", () => {
    const reading = readAt(segmentTicks(), 271.419921875, 30.9765625);
    if (reading === null) throw new Error("b2_ticks is not read there");
    const parts = flagParts(reading.pin).map(({ timeline, name, rows }) => [
      timeline,
      name,
      rows.map((row) => [row.row, row.label, rowValueText(row, 3)]),
    ]);
    expect(parts).toEqual([
      ["b", "B", [[{ timeline: "b", map: null }, "B", "9 25/48 ♩"]]],
      ["form", "Form", [[{ timeline: "form", map: null }, "Form", "17 25/48 ♩"]]],
      [
        "b2",
        "b2",
        [
          [{ timeline: "b2", map: null }, "b2", "3 25/48 ♩"],
          [{ timeline: "b2", map: "b2_ticks" }, "Ticks", "1 690 ticks"],
        ],
      ],
    ]);
  });

  it("writes a float to the granularity's places", () => {
    const view = viewWith(MIXED);
    const score = axis(view, "score");
    const reading = readAt(view, score.xStart + 3.13 / 0.03, 62.609375, {
      zoom: 3.75,
      granularity: { denominator: 2520, decimals: 1 },
    });
    if (reading === null) throw new Error("cmap_2 is not read there");
    const [, , seconds] = flagParts(reading.pin)[0]?.rows ?? [];
    expect(seconds && rowValueText(seconds, 3)).toBe("1.6″");
  });

  it.each([
    [{ x: 100, y: 200, top: 150 }, 800, { x: 100, top: 128, bottom: 200 }, 100.5, 128, false],
    [{ x: 700, y: 200, top: 150 }, 800, { x: 700, top: 128, bottom: 200 }, 519.5, 128, true],
    [{ x: 619.5, y: 200, top: 150 }, 800, { x: 619.5, top: 128, bottom: 200 }, 620, 128, false],
    [{ x: 100, y: 40, top: 10 }, 800, { x: 100, top: 0, bottom: 40 }, 100.5, 0, false],
  ])("hangs at the pole at %j on a canvas %d wide", (at, width, pole, left, top, flipped) => {
    expect(flagPlace(at, 180, width)).toEqual({ pole, left, top, flipped });
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

  /** The row of the `MeasureRecordMap` `cmap_1` of `score`, read with `knotsOf` when given. */
  function measureRow(knotsOf?: (manifest: Manifest) => ReturnType<MeasureKnotsSource["knotsOf"]>) {
    const view = viewOf({ id: A, fixture: "groups/group_measure_map", x: 40, y: 80 });
    const score = axis(view, "score");
    const reading = readingAt(nodes(view), canvasPoint(view, score.xStart + 10, score.y), {
      zoom: 1,
      ratio: 1,
      granularity: DEFAULT_GRANULARITY,
      knotsOf,
    });
    const row = reading === null ? undefined : flagParts(reading.pin)[0]?.rows[1];
    if (row === undefined) throw new Error("score reads its measure view");
    return row;
  }

  it("leaves a measure view without a value until they are there, and says why", () => {
    const row = measureRow();
    expect([row.row, row.value]).toEqual([{ timeline: "score", map: "cmap_1" }, null]);
    expect(
      [
        row,
        measureRow(() => "pending"),
        measureRow(() => "unsupported"),
        measureRow(() => "unreachable"),
        measureRow(() => "failed"),
      ].map((item) => rowValueText(item, 3)),
    ).toEqual([
      "needs a server to expand its measure map",
      "waiting for the server",
      "the server cannot expand measure maps",
      "no server answered, so its measure map is not expanded",
      "the server did not expand its measure map",
    ]);
  });

  it.each([
    ["fails", () => Promise.reject(new Error("unreachable")), "failed"],
    ["cannot expand them", () => Promise.resolve("unsupported" as const), "unsupported"],
    ["does not answer", () => Promise.resolve("unreachable" as const), "unreachable"],
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
