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
  Pin,
  PlaceKey,
  View,
} from "@timetoalign/tilie-core";
import {
  DEFAULT_GRANULARITY,
  idAddress,
  inBlock,
  samePlaceKey,
  timelineAxisOf,
  timestampAt,
} from "@timetoalign/tilie-core";
import { axisCoordinate, Rational, realOf, toRational } from "@timetoalign/tilie-core/numbers";
import type { Drawing, LineAxis } from "@timetoalign/tilie-layout";
import { lineAxes, wedgeAt } from "@timetoalign/tilie-layout";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { raisedRoot, stackingOf } from "../src/boxes.ts";
import {
  affordancesOf,
  axesOf,
  crossSectionSpec,
  FrameCoalescer,
  flagParts,
  flagPlace,
  groupScoped,
  lineAt,
  linesOf,
  MeasureKnotsSource,
  namedPin,
  pinnedPlace,
  placesAt,
  placeText,
  readingAt,
  readsGroup,
  rereadPin,
  rowValueText,
  timelinePin,
} from "../src/coordinates.ts";
import { drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import type { BlockNode } from "../src/node.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import {
  A,
  blockIn,
  changed,
  load,
  MIXED,
  metrics,
  placed,
  viewOf,
  withoutAncestorCards,
} from "./support.ts";

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

/** The ordinate of the first line drawn for timeline `id` in block A, an ancestor line included. */
function drawnY(view: View, id: string): number {
  const found = drawingIn(view).axes.find((item) => item.address.id === id);
  if (found === undefined) throw new Error(`no drawn line of ${id}`);
  return found.line;
}

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
});

/** `groups/group_parent_both` in block A, its frame's and its ancestor card's numbers (`README.md`). */
const PARENT_BOTH = "groups/group_parent_both";
const MIDDLE_CARD = { item: "group_1", member: "middle" };
const PIECE_CARD = { item: "group_1", member: "piece" };
/** The abscissa of 8 quarters of `piece` (4 of `middle`), inside the frame and both cards. */
const AT_PIECE_8 = 460.33544921875;
/** `piece`'s ancestor line, below `middle`'s (`32.8046875 + 14.40234375 + 37.9765625`), and the card's line. */
const PIECE_Y = 85.18359375;
/** `middle`'s own line: its card's top 32.8046875 plus `y_root` 14.40234375. */
const MIDDLE_Y = 47.20703125;
/** The card's `middle` row: the card's top `85.18359375 − 48.9765625`, plus `P` and the half pitch 7. */
const CARD_MIDDLE_Y = 51.20703125;
/** `recording`'s line: its card's top `32.8046875 + 87.35546875 + 8` plus `y_root` 14.40234375. */
const RECORDING_Y = 142.5625;

/** The reading at block A's local point `(x, y)` with the editor `editing` open. */
function readWith(view: View, x: number, y: number, editing: Editing | null) {
  const shown = project(view, NOTHING_SELECTED, [], metrics, editing);
  const [node] = shown;
  if (node === undefined) throw new Error("no node");
  const point = { x: node.position.x + x, y: node.position.y + y };
  return readingAt(shown, point, { zoom: 1, ratio: 1, granularity: DEFAULT_GRANULARITY });
}

/** A reading as `[hovered timeline, its card, its parts as [timeline, position]]`; `null` for none. */
function readShape(reading: ReturnType<typeof readingAt>) {
  return reading === null
    ? null
    : [
        reading.hit.axis.timeline,
        reading.hit.axis.card,
        reading.pin.timestamp.parts.map(({ timeline, position }) => [timeline, position]),
      ];
}

const PIECE_EDITOR: Editing = { target: inBlock(A, idAddress("piece")), kind: "timeline" };

describe("a point that is not finite", () => {
  it("reads nothing", () => {
    const view = viewWith(PARENT_BOTH);
    expect(readWith(view, AT_PIECE_8, Number.NaN, null)).toBeNull();
    expect(readWith(view, Number.NaN, MIDDLE_Y, null)).toBeNull();
    expect(readShape(readWith(view, AT_PIECE_8, MIDDLE_Y, null))?.[0]).toBe("middle");
  });
});

describe("an ancestor line, read as its ancestor's", () => {
  const view = viewWith(PARENT_BOTH);
  const drawing = drawingIn(view);

  it("is a line the pointer reads, the drawing's record", () => {
    const lines = [...axes(view)].filter(([, line]) => line.timeline === "piece");
    expect(
      lines.map(([, { card, y, xStart, xEnd, start, drawnLength, ancestor }]) => [
        card,
        y,
        xStart,
        xEnd,
        start,
        drawnLength,
        ancestor,
      ]),
    ).toEqual([
      [MIDDLE_CARD, PIECE_Y, 260.33544921875, 660.33544921875, q(4), q(8), undefined],
      [
        PIECE_CARD,
        PIECE_Y,
        60.33544921875,
        860.33544921875,
        q(0),
        q(16),
        { group: "group_1", member: "middle" },
      ],
    ]);
    expect(drawing.boxes.find((box) => box.kind === "frame")).toMatchObject({
      x: 156.6318359375,
      y: 8,
      width: 543.70361328125,
      height: 177.5390625,
    });
  });

  it.each([
    [360.33544921875, q(6), q(2)],
    [AT_PIECE_8, q(8), q(4)],
    [560.33544921875, q(10), q(6)],
  ])("at %d reads piece at %s across middle's line, middle at %s", (x, piece, middle) => {
    const reading = readAt(view, x, PIECE_Y);
    expect(readShape(reading)).toEqual([
      "piece",
      MIDDLE_CARD,
      [
        ["piece", piece],
        ["middle", middle],
      ],
    ]);
    expect([reading?.row, reading?.position]).toEqual([{ timeline: "piece", map: null }, piece]);
    const spec = reading?.pin.spec;
    expect(
      spec && [
        [spec.anchor.timeline, spec.anchor.ordinate],
        ...spec.members.map(({ timeline, offset, ordinate }) => [timeline, offset, ordinate]),
      ],
    ).toEqual([
      ["piece", PIECE_Y],
      ["middle", q(4), MIDDLE_Y],
    ]);
    expect(reading === null ? null : readsGroup(reading.pin)).toBe(false);
    expect(reading?.at).toEqual({ x, y: PIECE_Y });
  });

  it("lists in the flag the member above its ancestor, the ancestor's coordinate hovered", () => {
    const reading = readAt(view, AT_PIECE_8, PIECE_Y);
    expect(
      reading &&
        flagParts(reading.pin).map(({ timeline, name, rows }) => [
          timeline,
          name,
          rows.map((row) => rowValueText(row, 3)),
        ]),
    ).toEqual([
      ["middle", "Middle", ["4 ♩"]],
      ["piece", "Piece", ["8 ♩"]],
    ]);
  });
});

describe("a covered line, not read", () => {
  const view = viewWith(PARENT_BOTH);

  it.each([
    [
      "the card's middle row inside the frame",
      AT_PIECE_8,
      CARD_MIDDLE_Y,
      [
        "middle",
        MIDDLE_CARD,
        [
          ["middle", q(4)],
          ["piece", q(8)],
          ["recording", 5.0],
        ],
      ],
      [
        "middle",
        PIECE_CARD,
        [
          ["middle", q(4)],
          ["piece", q(8)],
        ],
      ],
    ],
    [
      "the card's piece line inside the frame",
      AT_PIECE_8,
      PIECE_Y,
      [
        "piece",
        MIDDLE_CARD,
        [
          ["piece", q(8)],
          ["middle", q(4)],
        ],
      ],
      [
        "piece",
        PIECE_CARD,
        [
          ["piece", q(8)],
          ["middle", q(4)],
        ],
      ],
    ],
    [
      "middle's own line, inside the raised card",
      AT_PIECE_8,
      MIDDLE_Y,
      [
        "middle",
        MIDDLE_CARD,
        [
          ["middle", q(4)],
          ["piece", q(8)],
          ["recording", 5.0],
        ],
      ],
      [
        "middle",
        PIECE_CARD,
        [
          ["middle", q(4)],
          ["piece", q(8)],
        ],
      ],
    ],
    [
      "the card's piece line left of the frame",
      110.33544921875,
      PIECE_Y,
      ["piece", PIECE_CARD, [["piece", q(1)]]],
      ["piece", PIECE_CARD, [["piece", q(1)]]],
    ],
    [
      "the card's piece line right of the frame",
      760.33544921875,
      PIECE_Y,
      ["piece", PIECE_CARD, [["piece", q(14)]]],
      ["piece", PIECE_CARD, [["piece", q(14)]]],
    ],
  ])("at %s reads on the arranger and with the card raised", (_, x, y, arranger, raised) => {
    expect(readShape(readWith(view, x, y, null))).toEqual(arranger);
    expect(readShape(readWith(view, x, y, PIECE_EDITOR))).toEqual(raised);
  });

  it("raises the root of a timeline edited in no group, and no other", () => {
    const block = blockIn(view, A);
    const editor = (id: string, kind: Editing["kind"]): Editing => ({
      target: inBlock(A, idAddress(id)),
      kind,
    });
    expect(
      [
        PIECE_EDITOR,
        null,
        { target: { block: A }, kind: "bundle" } as Editing,
        editor("group_1", "group"),
        editor("middle", "timeline"),
        editor("recording", "timeline"),
      ].map((editing) => raisedRoot(block, editing)),
    ).toEqual(["piece", null, null, null, null, null]);
  });
});

describe("a later ancestor card over an earlier one", () => {
  /** `bundle_shared_parent` in block A at (0, 0), `group_2`'s frame placed at (1200, 70). */
  const view = placed(viewOf({ id: A, fixture: "bundles/bundle_shared_parent" }), A, "group_2", {
    x: 1200,
    y: 70,
  });
  const drawing = drawingIn(view);
  const FIRST: PlaceKey = { item: "group_1", member: "score" };
  const SECOND: PlaceKey = { item: "group_2", member: "score" };

  it("lies where layout's record puts the two cards and their lines", () => {
    const cards = drawing.boxes.filter((box) => box.ancestor !== undefined);
    expect(cards.map(({ key, x, y, width, height }) => [key, x, y, width, height])).toEqual([
      [FIRST, 8, 28.8046875, 1243.3592936197915, 154.8828125],
      [SECOND, 533.3333333333333, 98.9765625, 1243.3592936197917, 154.8828125],
    ]);
    const frames = drawing.boxes.filter((box) => box.kind === "frame");
    expect(frames.map(({ x, width }) => [x, x + width])).toEqual([
      [40.0234375, 607.41357421875],
      [1232.0234375, 1799.41357421875],
    ]);
    const lineIn = (card: PlaceKey, timeline: string) =>
      [...lineAxes(drawing).values()].find(
        (line) => line.timeline === timeline && samePlaceKey(line.card, card),
      );
    const score = lineIn(FIRST, "score");
    const exposition = lineIn(SECOND, "exposition");
    expect(score && [score.y, score.xStart, score.xEnd]).toEqual([
      127.234375, 167.41357421875, 1234.0802408854165,
    ]);
    expect(exposition && [exposition.y, exposition.xStart, exposition.xEnd]).toEqual([
      159.9296875, 692.7469075520833, 1092.7469075520833,
    ]);
  });

  /** The root `score`'s timeline editor raises both its cards. */
  const raised = raisedRoot(blockIn(view, A), {
    target: inBlock(A, idAddress("score")),
    kind: "timeline",
  });

  it.each([
    ["the first card's score line, inside the second card", 127.234375, null],
    [
      "the second card's exposition row, inside the first card",
      159.9296875,
      ["exposition", SECOND],
    ],
  ])("at x 900 on %s reads %j, the cards raised or not", (_, y, expected) => {
    expect(raised).toBe("score");
    for (const root of [null, raised]) {
      const hit = lineAt(axesOf(drawing), { x: 900, y }, 8, stackingOf(drawing, root).covered);
      expect(hit === null ? null : [hit.axis.timeline, hit.axis.card]).toEqual(expected);
    }
  });

  it("places the root on the later card where the cards meet, raised or not", () => {
    const at = (root: string | null) =>
      placesAt(drawing, "score", q(45, 4), root).map(({ axis, x }) => [axis.card, axis.y, x]);
    expect(at(null)).toEqual([
      [{ item: "group_1", member: "exposition" }, 127.234375, 542.41357421875],
      [SECOND, 197.40625, 1067.7469075520833],
    ]);
    expect(at(raised)).toEqual([[SECOND, 197.40625, 1067.7469075520833]]);
  });
});

describe("two ancestor lines, an ancestor of unknown length, and the scales", () => {
  /** A reading as `[timeline, its card, position, anchor and ordinate, members, parts]`. */
  function readFull(reading: ReturnType<typeof readingAt>) {
    if (reading === null) return null;
    const { spec, timestamp } = reading.pin;
    return [
      reading.hit.axis.timeline,
      reading.hit.axis.card,
      reading.position,
      [spec.anchor.timeline, spec.anchor.ordinate],
      spec.members.map(({ timeline, offset, ordinate }) => [timeline, offset, ordinate]),
      timestamp.parts.map(({ timeline, position }) => [timeline, position]),
    ];
  }
  const THEME_CARD = { item: "group_1", member: "theme" };
  const SCORE_CARD = { item: "group_1", member: "score" };
  const grandchild = viewWith("groups/group_grandchild");

  it("reads a grandchild's two ancestor lines, the flag top to bottom", () => {
    expect(readFull(readAt(grandchild, 1482.265625, 119.16015625))).toEqual([
      "score",
      THEME_CARD,
      q(28),
      ["score", 119.16015625],
      [
        ["movement", q(16), 85.18359375],
        ["theme", q(24), 47.20703125],
      ],
      [
        ["score", q(28)],
        ["movement", q(12)],
        ["theme", q(4)],
      ],
    ]);
    expect(readFull(readAt(grandchild, 1482.265625, 85.18359375))).toEqual([
      "movement",
      THEME_CARD,
      q(12),
      ["movement", 85.18359375],
      [
        ["score", q(-16), 119.16015625],
        ["theme", q(8), 47.20703125],
      ],
      [
        ["movement", q(12)],
        ["score", q(28)],
        ["theme", q(4)],
      ],
    ]);
    const reading = readAt(grandchild, 1482.265625, 119.16015625);
    expect(reading && flagParts(reading.pin).map(({ timeline }) => timeline)).toEqual([
      "theme",
      "movement",
      "score",
    ]);
  });

  it("leaves the card's covered row of the middle ancestor unread, and reads it beyond the frame", () => {
    expect(readAt(grandchild, 1482.265625, 105.16015625)).toBeNull();
    expect(readShape(readAt(grandchild, 1032.265625, 105.16015625))).toEqual([
      "movement",
      SCORE_CARD,
      [
        ["movement", q(3)],
        ["score", q(19)],
      ],
    ]);
  });

  it("reads an ancestor of unknown length on its ancestor line and its card's", () => {
    const unknown = changed(viewWith(PARENT_BOTH), {
      type: "set",
      changes: [{ target: inBlock(A, idAddress("piece")), values: { length: null } }],
    });
    const card = [...lineAxes(drawingIn(unknown)).values()].find(
      (line) => line.timeline === "piece" && line.ancestor !== undefined,
    );
    expect(card && [card.xStart, card.xEnd, card.length, card.drawnLength]).toEqual([
      60.33544921875,
      660.33544921875,
      null,
      q(12),
    ]);
    expect(
      [
        [460.33544921875, PIECE_Y],
        [660.33544921875, PIECE_Y],
        [110.33544921875, PIECE_Y],
      ].map(([x, y]) => readShape(readAt(unknown, x as number, y as number))),
    ).toEqual([
      [
        "piece",
        MIDDLE_CARD,
        [
          ["piece", q(8)],
          ["middle", q(4)],
        ],
      ],
      [
        "piece",
        MIDDLE_CARD,
        [
          ["piece", q(12)],
          ["middle", q(8)],
        ],
      ],
      ["piece", PIECE_CARD, [["piece", q(1)]]],
    ]);
  });

  it("reads the card and the ancestor line at an item scale, a block scale and a zoom", () => {
    const scaled = placed(viewWith(PARENT_BOTH, 0.5), A, "group_1", { scale: 2 });
    const drawing = drawingIn(scaled);
    const frame = drawing.boxes.find((box) => box.kind === "frame");
    expect(frame && [frame.x, frame.x + frame.width]).toEqual([305.263671875, 1392.6708984375]);
    const pieces = [...lineAxes(drawing).values()].filter((line) => line.timeline === "piece");
    expect(pieces.map(({ card, y, xStart, xEnd }) => [card, y, xStart, xEnd])).toEqual([
      [MIDDLE_CARD, 162.3671875, 512.6708984375, 1312.6708984375],
      [PIECE_CARD, 162.3671875, 112.6708984375, 1712.6708984375],
    ]);
    expect(
      [212.6708984375, 912.6708984375, 412.6708984375].map((x) =>
        readShape(readAt(scaled, x, 162.3671875, { zoom: 3 })),
      ),
    ).toEqual([
      ["piece", PIECE_CARD, [["piece", q(1)]]],
      [
        "piece",
        MIDDLE_CARD,
        [
          ["piece", q(8)],
          ["middle", q(4)],
        ],
      ],
      null,
    ]);
  });
});

/** The key in `lineAxes` of the line of `timeline` in `drawing` an ancestor card draws, or not. */
function keyOf(drawing: Drawing, timeline: string, inAncestorCard: boolean): string {
  const found = [...lineAxes(drawing)].find(
    ([, line]) => line.timeline === timeline && (line.ancestor !== undefined) === inAncestorCard,
  );
  if (found === undefined) throw new Error(`no such line of ${timeline}`);
  return found[0];
}

describe("a timeline's lines and places, without exception", () => {
  const view = viewWith(PARENT_BOTH);
  const drawing = drawingIn(view);
  const raised = raisedRoot(blockIn(view, A), PIECE_EDITOR);
  const linesShape = (timeline: string, root: string | null) =>
    linesOf(drawing, timeline, stackingOf(drawing, root)).map(({ axis, offset, length }) => [
      axis.card,
      axis.y,
      offset,
      length,
    ]);
  const cardKey = keyOf(drawing, "piece", true);
  const ancestorKey = keyOf(drawing, "piece", false);

  it("holds every line drawing a timeline, the topmost in the stacking first", () => {
    expect([linesShape("middle", null), linesShape("middle", raised)]).toEqual([
      [
        [MIDDLE_CARD, MIDDLE_Y, q(0), null],
        [PIECE_CARD, CARD_MIDDLE_Y, q(0), null],
      ],
      [
        [PIECE_CARD, CARD_MIDDLE_Y, q(0), null],
        [MIDDLE_CARD, MIDDLE_Y, q(0), null],
      ],
    ]);
    expect([linesShape("piece", null), linesShape("piece", raised)]).toEqual([
      [
        [MIDDLE_CARD, PIECE_Y, q(0), null],
        [PIECE_CARD, PIECE_Y, q(0), null],
      ],
      [
        [PIECE_CARD, PIECE_Y, q(0), null],
        [MIDDLE_CARD, PIECE_Y, q(0), null],
      ],
    ]);
    expect(linesShape("recording", null)).toEqual([
      [{ item: "group_1", member: "recording" }, RECORDING_Y, q(0), null],
    ]);
  });

  it("marks a pin of the ancestor where it is seen, or on the line it was pinned on", () => {
    const pin = readAt(view, AT_PIECE_8, PIECE_Y)?.pin;
    if (pin === undefined) throw new Error("piece is not read there");
    const at = (key: string) => ({ key, x: AT_PIECE_8, group: false });
    expect(pinnedPlace(drawing, pin, null, null)).toEqual(at(ancestorKey));
    expect(pinnedPlace(drawing, pin, cardKey, null)).toEqual(at(ancestorKey));
    expect(pinnedPlace(drawing, pin, null, raised)).toEqual(at(cardKey));
    expect(pinnedPlace(drawing, pin, ancestorKey, raised)).toEqual(at(cardKey));
  });

  it("marks a pin in a gap nowhere, and on the card's line while the card is raised", () => {
    const block = blockIn(view, A);
    const pin = timelinePin(
      block.manifest,
      A,
      drawing,
      "piece",
      q(3),
      DEFAULT_GRANULARITY,
      "no_server",
      false,
      null,
      null,
    );
    if (pin === null) throw new Error("no pin of piece");
    expect(pinnedPlace(drawing, pin, null, null)).toBeNull();
    expect(pinnedPlace(drawing, pin, null, raised)).toEqual({
      key: cardKey,
      x: 210.33544921875,
      group: false,
    });
  });

  it("reads a timestamp whose value has no place on its own axis, nothing seen being read", () => {
    const block = blockIn(view, A);
    const piece = block.manifest.timelines.find((timeline) => timeline.id === "piece");
    if (piece === undefined) throw new Error("no piece");
    const read = (root: string | null) =>
      timelinePin(
        block.manifest,
        A,
        drawing,
        "piece",
        q(3),
        DEFAULT_GRANULARITY,
        "no_server",
        false,
        root,
        null,
      )?.spec;
    expect(read(null)).toEqual({
      block: A,
      granularity: DEFAULT_GRANULARITY,
      anchor: timelineAxisOf(piece, piece.conversion_maps),
      members: [],
    });
    expect(read(raised)?.anchor.ordinate).toBe(PIECE_Y);
  });
});

describe("a pin on a timeline drawn in several cards", () => {
  it.each([
    ["the cards shown", (view: View) => view],
    ["the ancestor cards hidden", withoutAncestorCards],
  ])("stays on the card it was pinned on, %s", (_, shown) => {
    const view = shown(viewWith("bundles/bundle_shared_member"));
    const block = blockIn(view, A);
    const drawing = drawingIn(view);
    const t = block.manifest.timelines.find((timeline) => timeline.id === "t");
    if (t?.length === null || t === undefined) throw new Error("no t of known length");
    const half = toRational(realOf(axisCoordinate(t.length, t))).divide(q(2));
    const places = placesAt(drawing, "t", half, null);
    expect(places.map(({ axis }) => axis.card)).toEqual([
      { item: "g1", member: "t" },
      { item: "g2", member: "t" },
    ]);
    const [first, second] = places;
    if (first === undefined || second === undefined) throw new Error("no two places");
    const reading = readAt(view, second.x, second.axis.y);
    if (reading === null) throw new Error("t is not read in g2");
    expect(reading.hit.key).toBe(second.key);
    expect(pinnedPlace(drawing, reading.pin, second.key, null)).toEqual({
      key: second.key,
      x: second.x,
      group: true,
    });
    expect(pinnedPlace(drawing, reading.pin, null, null)?.key).toBe(first.key);
  });
});

describe("a member drawn in the raised card", () => {
  const view = viewWith(PARENT_BOTH);
  const block = blockIn(view, A);
  const drawing = drawingIn(view);
  const raised = raisedRoot(block, PIECE_EDITOR);
  /** The key in `lineAxes` of the card's row of `middle`, and of `middle`'s own line. */
  const [rowKey] = [...lineAxes(drawing)].find(
    ([, line]) => line.timeline === "middle" && line.ancestor !== undefined,
  ) ?? [undefined];
  const [ownKey] = linesOf(drawing, "middle", stackingOf(drawing, null)).map(({ key }) => key);
  /** A pin's parts as `[timeline, its rows' values]`. */
  const partsOf = (pin: Pin) =>
    flagParts(pin).map(({ timeline, rows }) => [timeline, rows.map((row) => rowValueText(row, 3))]);

  it("is placed on the card's row of it, its own line lying under the card", () => {
    expect(rowKey === undefined || ownKey === undefined).toBe(false);
    const at = (root: string | null) =>
      placesAt(drawing, "middle", q(4), root).map(({ key, x, axis }) => [key, x, axis.y]);
    expect(at(null)).toEqual([[ownKey, AT_PIECE_8, MIDDLE_Y]]);
    expect(at(raised)).toEqual([[rowKey, AT_PIECE_8, CARD_MIDDLE_Y]]);
  });

  it("reads back on the tab what the flag on the card's row reads", () => {
    const reading = readWith(view, AT_PIECE_8, CARD_MIDDLE_Y, PIECE_EDITOR);
    if (reading === null) throw new Error("the card's row of middle is not read");
    const pin = timelinePin(
      block.manifest,
      A,
      drawing,
      "middle",
      q(4),
      DEFAULT_GRANULARITY,
      "no_server",
      false,
      raised,
      null,
    );
    if (pin === null) throw new Error("no pin of middle");
    expect(partsOf(reading.pin)).toEqual([
      ["middle", ["4 ♩"]],
      ["piece", ["8 ♩"]],
    ]);
    expect(partsOf(pin)).toEqual(partsOf(reading.pin));
    expect(pinnedPlace(drawing, pin, null, raised)).toEqual({
      key: rowKey,
      x: AT_PIECE_8,
      group: false,
    });
  });
});

/** A pin's parts as `[timeline, [map or "coordinate", value text]…]`, values to three places. */
const rowsOf = (pin: Pin) =>
  flagParts(pin).map(({ timeline, rows }) => [
    timeline,
    rows.map((row) => [row.row.map ?? "coordinate", rowValueText(row, 3)]),
  ]);

/** The timeline editor of `id` in block A; `null` for none. */
const editorOf = (id: string | null): Editing | null =>
  id === null ? null : { target: inBlock(A, idAddress(id)), kind: "timeline" };

describe("a timestamp named from a reading on a timeline's second place", () => {
  /**
   * Read `timeline` at `value` on the second of its places in `fixture`
   * (block A at (40, 80)) with the timeline editor of `editor` open, name
   * a timestamp there (`coordinate` its JSON), and give the place's
   * ordinates, the reading's rows and its named pin's rows on the line
   * read, then at the first place (no line known).
   */
  function nameOnSecond(
    fixture: string,
    editor: string | null,
    timeline: string,
    value: Rational,
    coordinate: unknown,
  ) {
    const view = viewWith(fixture);
    const editing = editorOf(editor);
    const raised = raisedRoot(blockIn(view, A), editing);
    const places = placesAt(drawingIn(view), timeline, value, raised);
    const [, second] = places;
    if (second === undefined) throw new Error(`${timeline} has no second place`);
    const reading = readWith(view, second.x, second.axis.y, editing);
    if (reading === null) throw new Error("nothing is read at the second place");
    const after = changed(view, {
      type: "add",
      into: inBlock(A, idAddress(timeline)),
      timestamp: { name: "Read", coordinate, groupstamp: readsGroup(reading.pin) },
    });
    const block = blockIn(after, A);
    const id = block.manifest.graphical?.timestamps?.find((item) => item.name === "Read")?.id;
    if (id === undefined) throw new Error("nothing named");
    const named = (preferred: string | null) => {
      const pin = namedPin(
        block.manifest,
        A,
        drawingIn(after),
        id,
        DEFAULT_GRANULARITY,
        "no_server",
        raised,
        preferred,
      );
      if (pin === null) throw new Error("no named pin");
      return rowsOf(pin);
    };
    return {
      ordinates: places.map(({ axis }) => axis.y),
      read: [reading.hit.key === second.key, reading.position],
      flag: rowsOf(reading.pin),
      onLine: named(reading.hit.key),
      first: named(null),
    };
  }

  it.each([
    ["groups/group_grandchild", "score", "movement", q(8), 105.16015625],
    ["bundles/bundle_mixed", "recording", "excerpt", q(33075), 303.3203125],
  ])(
    "has in %s with %s's card raised one place of %s %s, the card's row at %d",
    (fixture, editor, timeline, value, y) => {
      const view = viewWith(fixture);
      const editing = editorOf(editor);
      const raised = raisedRoot(blockIn(view, A), editing);
      const drawing = drawingIn(view);
      const places = placesAt(drawing, timeline, value, raised);
      expect(places.map(({ axis }) => [axis.y, axis.ancestor !== undefined])).toEqual([[y, true]]);
      const [place] = places;
      if (place === undefined) throw new Error(`${timeline} has no place`);
      const reading = readWith(view, place.x, y, editing);
      expect(reading && [reading.hit.key === place.key, reading.position]).toEqual([true, value]);
    },
  );

  it("on an ancestor card's line lists the maps that line draws", () => {
    const exposition = [
      "exposition",
      [
        ["cmap_2", "4 320 ticks"],
        ["coordinate", "9 ♩"],
      ],
    ];
    const second = [
      "exposition_second",
      [
        ["cmap_3", "1.5″"],
        ["coordinate", "3 ♩"],
      ],
    ];
    expect(nameOnSecond("bundles/bundle_shared_parent", null, "score", q(9), [9, 1])).toEqual({
      ordinates: [127.234375, 373.3984375],
      read: [true, q(9)],
      flag: [
        exposition,
        second,
        [
          "score",
          [
            ["cmap_1", "4 320 ticks"],
            ["coordinate", "9 ♩"],
          ],
        ],
      ],
      onLine: [
        exposition,
        second,
        [
          "score",
          [
            ["cmap_1", "4 320 ticks"],
            ["coordinate", "9 ♩"],
          ],
        ],
      ],
      first: [exposition, second, ["score", [["coordinate", "9 ♩"]]]],
    });
  });

  it("reads the first place where the line preferred is no place of the position", () => {
    const view = viewWith("groups/group_grandchild");
    const raised = raisedRoot(blockIn(view, A), editorOf("score"));
    const drawing = drawingIn(view);
    const pinOn = (preferred: string | null) =>
      timelinePin(
        blockIn(view, A).manifest,
        A,
        drawing,
        "movement",
        q(8),
        DEFAULT_GRANULARITY,
        "no_server",
        false,
        raised,
        preferred,
      );
    const [theme] = linesOf(drawing, "theme", stackingOf(drawing, null));
    if (theme === undefined) throw new Error("no line of theme");
    expect(pinOn(theme.key)).toEqual(pinOn(null));
    expect(pinOn("no line")).toEqual(pinOn(null));
  });
});

describe("a GroupStamp read under the raised card", () => {
  const view = viewWith(PARENT_BOTH);
  const block = blockIn(view, A);
  const raised = raisedRoot(block, PIECE_EDITOR);
  const recordingPin = (root: string | null) =>
    timelinePin(
      block.manifest,
      A,
      drawingIn(view),
      "recording",
      q(5, 2),
      DEFAULT_GRANULARITY,
      "no_server",
      true,
      root,
      null,
    );

  it("reads a member the raised card draws on the card's row of it", () => {
    const parts = (pin: Pin | null) =>
      pin?.spec.members.map(({ timeline, ordinate, scale }) => [timeline, ordinate, scale]);
    // The member card's timelines in traversal order: the root `piece` (its ancestor line) first.
    expect([parts(recordingPin(null)), parts(recordingPin(raised))]).toEqual([
      [
        ["piece", PIECE_Y, q(4, 5)],
        ["middle", MIDDLE_Y, q(4, 5)],
      ],
      [
        ["piece", PIECE_Y, q(4, 5)],
        ["middle", CARD_MIDDLE_Y, q(4, 5)],
      ],
    ]);
    const middle = ["middle", [["coordinate", "2 ♩"]]];
    const piece = ["piece", [["coordinate", "6 ♩"]]];
    const recording = ["recording", [["coordinate", "2.5″"]]];
    const pinned = [recordingPin(null), recordingPin(raised)];
    expect(pinned.map((pin) => (pin === null ? null : rowsOf(pin)))).toEqual([
      [middle, piece, recording],
      [middle, piece, recording],
    ]);
  });
});

describe("a held pin read again under another raised card", () => {
  const view = viewWith(PARENT_BOTH);
  const block = blockIn(view, A);
  const drawing = drawingIn(view);
  const raised = raisedRoot(block, PIECE_EDITOR);

  it("is read as a fresh reading there: on the card's row without its group, and as it was once the card is lowered", () => {
    const reading = readWith(view, AT_PIECE_8, MIDDLE_Y, null);
    if (reading === null) throw new Error("middle is not read on its line");
    const middle = ["middle", [["coordinate", "4 ♩"]]];
    const piece = ["piece", [["coordinate", "8 ♩"]]];
    const recording = ["recording", [["coordinate", "5″"]]];
    const again = (group: boolean, root: string | null) => {
      const pin = rereadPin(block.manifest, drawing, reading.pin, group, root, reading.hit.key);
      return pin === null ? null : rowsOf(pin);
    };
    // A timeline editor is open while the card is raised, so a fresh reading there reads no group.
    const fresh = readWith(view, AT_PIECE_8, CARD_MIDDLE_Y, PIECE_EDITOR);
    expect([
      rowsOf(reading.pin),
      again(groupScoped(PIECE_EDITOR), raised),
      fresh === null ? null : rowsOf(fresh.pin),
      again(groupScoped(null), null),
    ]).toEqual([
      [middle, piece, recording],
      [middle, piece],
      [middle, piece],
      [middle, piece, recording],
    ]);
    const raisedPin = rereadPin(
      block.manifest,
      drawing,
      reading.pin,
      false,
      raised,
      reading.hit.key,
    );
    if (raisedPin === null) throw new Error("no pin read again");
    expect(pinnedPlace(drawing, raisedPin, reading.hit.key, raised)).toEqual({
      key: [...lineAxes(drawing)].find(
        ([, line]) => line.timeline === "middle" && line.ancestor !== undefined,
      )?.[0],
      x: AT_PIECE_8,
      group: false,
    });
  });

  it("is none once its anchor's timeline is gone", () => {
    const reading = readWith(view, AT_PIECE_8, MIDDLE_Y, null);
    if (reading === null) throw new Error("middle is not read on its line");
    const gone = changed(view, { type: "remove", targets: [inBlock(A, idAddress("middle"))] });
    expect(
      rereadPin(blockIn(gone, A).manifest, drawingIn(gone), reading.pin, true, null, null),
    ).toBeNull();
  });
});

/** Every timeline of each fixture in pre-order, each of whose pin at 0 is marked (`README.md`). */
const MARKED: Readonly<Record<string, readonly string[]>> = {
  segment_line: ["form", "a", "a1", "b", "b1", "b2", "c", "c1"],
  segment_children: ["piece", "intro", "i1", "i2", "theme", "t1", "t2", "t3", "coda", "c1", "c2"],
  unknown_length_empty: ["score"],
  "bundles/bundle_ungrouped": ["pages", "page_1", "page_2", "page_3", "recording", "score"],
};

describe("the pin's mark on segment lines and zero-length lines", () => {
  /** Every timeline of `manifest`, in pre-order. */
  const timelinesOf = (manifest: Manifest): string[] => {
    const ids: string[] = [];
    const walk = (list: Manifest["timelines"]) => {
      for (const timeline of list) {
        ids.push(timeline.id);
        walk(timeline.children);
      }
    };
    walk(manifest.timelines);
    return ids;
  };

  it.each(["segment_line", "segment_children", "unknown_length_empty", "bundles/bundle_ungrouped"])(
    "in %s marks a pin at 0 at the first place of 0, whatever the line",
    (fixture) => {
      const view = viewWith(fixture);
      const block = blockIn(view, A);
      const drawing = drawingIn(view);
      const outcome = timelinesOf(block.manifest).map((timeline) => {
        const pin = timelinePin(
          block.manifest,
          A,
          drawing,
          timeline,
          q(0),
          DEFAULT_GRANULARITY,
          "no_server",
          false,
          null,
          null,
        );
        if (pin === null) throw new Error(`no pin of ${timeline}`);
        const [first] = placesAt(drawing, timeline, q(0), null);
        return [timeline, pinnedPlace(drawing, pin, null, null)?.key, first?.key];
      });
      expect(outcome.filter(([, mark, first]) => mark === undefined || mark !== first)).toEqual([]);
      expect(outcome.map(([timeline]) => timeline)).toEqual(MARKED[fixture]);
    },
  );
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

  it("of a child holds every timeline of its card, the root with the maps drawn for it", () => {
    // What the child's cross-section line crosses in the card: the root `melody` too, at minus the
    // child's offset 2, with its map `tempo` drawn in the card.
    expect(shape(specOf(viewWith("map"), "phrase"))).toEqual([
      ["phrase", q(0), q(4), ["ticks"]],
      ["melody", q(-2), q(8), ["tempo"]],
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
      ["page", 960n],
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
      ["a", q(-8), q(8), []],
      ["a1", q(-8), q(8), []],
      ["b1", q(0), q(6), []],
      ["b2", q(6), q(6), ["b2_ticks"]],
      ["c", q(12), q(12), []],
      ["c1", q(12), q(12), []],
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
      279.70361328125,
      679.70361328125,
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
    return namedPin(
      block.manifest,
      A,
      drawingIn(view),
      id,
      DEFAULT_GRANULARITY,
      "no_server",
      null,
      null,
    );
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
        ordinate: drawnY(view, "b"),
        mapOrdinates: new Map([["b2_ticks", 30.9765625]]),
      },
      members: (
        [
          ["form", "Form", 32, -14, "form"],
          ["a", "A", 8, -14, "a"],
          ["a1", "a1", 8, -14, "a"],
          ["b", "B", 12, -6, "b"],
          ["b1", "b1", 6, -6, "b"],
          ["c", "C", 12, 6, "c"],
          ["c1", "c1", 12, 6, "c"],
        ] as const
      ).map(([timeline, name, length, offset, line]) => ({
        timeline,
        name,
        unit: "quarters",
        numberType: "fraction",
        length: q(length),
        maps: [],
        offset: q(offset),
        ordinate: drawnY(view, line),
      })),
    });
    expect([drawnY(view, "b"), drawnY(view, "form")]).toEqual([36.4765625, 87.9296875]);
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
      ["form", q(15), []],
      ["b", q(7), []],
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
        ordinate: 22.40234375,
      },
      members: [],
    });
    expect(drawnY(view, "late")).toBe(22.40234375);
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

  it("of a groupstamp holds the other members of its group, read by the group", () => {
    const view = viewWith("groups/group_groupstamp");
    const pin = pinIn(view, "timestamp_1");
    expect(pin?.timestamp.parts.map(({ timeline, position }) => [timeline, position])).toEqual([
      ["score", q(4)],
      ["performance", 2.0],
    ]);
    expect(
      pin?.spec.members.map(({ timeline, offset, scale }) => [timeline, offset, scale]),
    ).toEqual([["performance", q(0), q(1, 2)]]);
    // Each member's maps at their drawings in its own card, layout's record.
    const mapsAt = (id: string) =>
      new Map(
        drawingIn(view)
          .axes.filter(({ address }) => address.id === id)
          .flatMap(({ maps }) => maps.map(({ id: map, yc }) => [map, yc] as const)),
      );
    expect([pin?.spec.anchor.mapOrdinates, pin?.spec.members[0]?.mapOrdinates]).toEqual([
      mapsAt("score"),
      mapsAt("performance"),
    ]);
    expect([...mapsAt("score").keys(), ...mapsAt("performance").keys()]).toEqual([
      "cmap_1",
      "cmap_2",
    ]);
    const plain = pinIn(view, "timestamp_3");
    expect(plain?.timestamp.parts.map(({ timeline }) => timeline)).toEqual(["performance"]);
  });

  it("of a groupstamp on a member's descendant reads the group from the member", () => {
    const motif = { id: "motif", unit: "quarters", number_type: "fraction", length: [4, 1] };
    const nested = changed(viewWith("groups/group_groupstamp"), {
      type: "add",
      into: inBlock(A, idAddress("score")),
      child: { ...motif, offset: [2, 1] },
    });
    const view = changed(nested, {
      type: "add",
      into: inBlock(A, idAddress("motif")),
      timestamp: { name: "Motif", coordinate: [1, 1], groupstamp: true },
    });
    const pin = pinIn(view, "timestamp_6");
    expect(
      pin?.spec.members.map(({ timeline, offset, scale }) => [timeline, offset, scale]),
    ).toEqual([
      ["score", q(-2), undefined],
      ["performance", q(-2), q(1, 2)],
    ]);
    expect(pin?.timestamp.parts.map(({ timeline, position }) => [timeline, position])).toEqual([
      ["motif", q(1)],
      ["score", q(3)],
      ["performance", 1.5],
    ]);
  });

  it("is null for an ID the manifest does not hold", () => {
    expect(pinIn(viewWith("map"), "timestamp_9")).toBeNull();
  });
});

describe("a position's pin on a timeline", () => {
  const pinAtTimeline = (view: View, timeline: string, position: Rational) =>
    timelinePin(
      blockIn(view, A).manifest,
      A,
      drawingIn(view),
      timeline,
      position,
      DEFAULT_GRANULARITY,
      "no_server",
      false,
      null,
      null,
    );

  it("is a named timestamp's pin there, unnamed", () => {
    const view = changed(viewWith("map"), {
      type: "add",
      into: inBlock(A, idAddress("melody")),
      timestamp: { name: "Mark", coordinate: [4, 1] },
    });
    const named = namedPin(
      blockIn(view, A).manifest,
      A,
      drawingIn(view),
      "timestamp_3",
      DEFAULT_GRANULARITY,
      "no_server",
      null,
      null,
    );
    expect(named).not.toBeNull();
    expect(pinAtTimeline(view, "melody", q(4))).toEqual({ ...named, named: null });
    const hidden = changed(view, {
      type: "style",
      select: { addresses: [{ id: "melody" }] },
      set: { display: "none" },
      blocks: [A],
    });
    const melody = load("map").timelines[0];
    expect(pinAtTimeline(hidden, "melody", q(4))?.spec).toEqual({
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
  });

  it("reads no group", () => {
    const pin = pinAtTimeline(viewWith("groups/group_groupstamp"), "score", q(4));
    expect(pin?.spec.members).toEqual([]);
    expect(pin?.timestamp.parts.map(({ timeline, position }) => [timeline, position])).toEqual([
      ["score", q(4)],
    ]);
  });

  it("is null for a timeline the manifest does not hold", () => {
    expect(pinAtTimeline(viewWith("map"), "nowhere", q(0))).toBeNull();
  });
});

describe("a reading above a timeline editor", () => {
  const view = viewWith("groups/group_groupstamp");
  const score = axis(view, "score");
  const middle = score.xStart + (score.xEnd - score.xStart) / 2;

  /** The reading at the middle of `score`'s line with the editor `editing` open. */
  function readIn(editing: Editing | null) {
    const shown = project(view, NOTHING_SELECTED, [], metrics, editing);
    const [node] = shown;
    if (node === undefined) throw new Error("no node");
    const point = { x: node.position.x + middle, y: node.position.y + score.y };
    const options = { zoom: 1, ratio: 1, granularity: DEFAULT_GRANULARITY };
    return readingAt(shown, point, options);
  }

  const partsOf = (reading: ReturnType<typeof readIn>) =>
    reading?.pin.timestamp.parts.map(({ timeline, position }) => [timeline, position]);

  it("holds the other members of the group whose frame draws the line", () => {
    const editors: (Editing | null)[] = [
      null,
      { target: { block: A }, kind: "bundle" },
      { target: inBlock(A, idAddress("group_1")), kind: "group" },
    ];
    for (const editing of editors) {
      const reading = readIn(editing);
      expect(partsOf(reading)).toEqual([
        ["score", q(4)],
        ["performance", 2.0],
      ]);
      expect(reading === null ? null : readsGroup(reading.pin)).toBe(true);
    }
  });

  it("stays on its timeline in a timeline editor", () => {
    const reading = readIn({ target: inBlock(A, idAddress("score")), kind: "timeline" });
    expect(partsOf(reading)).toEqual([["score", q(4)]]);
    expect(reading === null ? null : readsGroup(reading.pin)).toBe(false);
  });

  it("holds no group where there is none", () => {
    const reading = readAt(viewWith("map"), MELODY_START + 200, axis(viewWith("map"), "melody").y);
    expect(reading === null ? null : readsGroup(reading.pin)).toBe(false);
  });
});

describe("the cross-section of a hovered line, made once", () => {
  const view = viewWith("groups/group_groupstamp");
  const score = axis(view, "score");

  /** The spec of the reading at `share` of `score`'s line with `editing` open, read with `granularity`. */
  function specAt(share: number, editing: Editing | null, granularity: Granularity) {
    const shown = project(view, NOTHING_SELECTED, [], metrics, editing);
    const [node] = shown;
    if (node === undefined) throw new Error("no node");
    const x = score.xStart + (score.xEnd - score.xStart) * share;
    const point = { x: node.position.x + x, y: node.position.y + score.y };
    return readingAt(shown, point, { zoom: 1, ratio: 1, granularity })?.pin.spec;
  }

  it("is the same object wherever the pointer lies on the line", () => {
    const first = specAt(0.25, null, DEFAULT_GRANULARITY);
    expect(first).toBeDefined();
    expect(specAt(0.75, null, DEFAULT_GRANULARITY)).toBe(first);
  });

  it("is made again for another granularity or another group reading", () => {
    const first = specAt(0.25, null, DEFAULT_GRANULARITY);
    const coarser = { ...DEFAULT_GRANULARITY };
    expect(specAt(0.25, null, coarser)).not.toBe(first);
    expect(specAt(0.25, null, coarser)?.granularity).toBe(coarser);
    const inEditor = specAt(0.25, editorOf("score"), DEFAULT_GRANULARITY);
    expect(inEditor?.members.map(({ timeline }) => timeline)).toEqual([]);
    expect(first?.members.map(({ timeline }) => timeline)).toEqual(["performance"]);
  });
});

describe("a reading across a group whose member has a child", () => {
  const view = viewWith("groups/group_groupstamp_child_member");

  /** The parts of the reading at the share `share` of the line of `id`, on the arranger. */
  function partsAt(id: string, share: number) {
    const line = axis(view, id);
    const x = line.xStart + share * (line.xEnd - line.xStart);
    return readAt(view, x, line.y)?.pin.timestamp.parts.map(({ timeline, position }) => [
      timeline,
      position,
    ]);
  }

  it("holds the other member's crossed child where it is active", () => {
    expect(partsAt("performance", 3 / 4)).toEqual([
      ["performance", 3.0],
      ["score", q(6)],
      ["second-half", q(2)],
    ]);
    expect(partsAt("score", 3 / 4)).toEqual([
      ["score", q(6)],
      ["second-half", q(2)],
      ["performance", 3.0],
    ]);
  });

  it("leaves the child out outside its span", () => {
    expect(partsAt("performance", 1 / 4)).toEqual([
      ["performance", 1.0],
      ["score", q(2)],
    ]);
    expect(partsAt("score", 1 / 4)).toEqual([
      ["score", q(2)],
      ["performance", 1.0],
    ]);
  });

  it("reads the child at the member's offset and scale", () => {
    const line = axis(view, "performance");
    const reading = readAt(view, line.xStart + (3 / 4) * (line.xEnd - line.xStart), line.y);
    expect(
      reading?.pin.spec.members.map(({ timeline, offset, scale }) => [timeline, offset, scale]),
    ).toEqual([
      ["score", q(0), q(2)],
      ["second-half", q(2), q(2)],
    ]);
  });

  it("lists in the flag the timelines the groupstamp's pin lists", () => {
    const named = namedPin(
      blockIn(view, A).manifest,
      A,
      drawingIn(view),
      "timestamp_1",
      DEFAULT_GRANULARITY,
      "no_server",
      null,
      null,
    );
    expect(
      named?.spec.members.map(({ timeline, offset, scale }) => [timeline, offset, scale]),
    ).toEqual([
      ["score", q(-4), undefined],
      ["performance", q(-4), q(1, 2)],
    ]);
    expect(named?.timestamp.parts.map(({ timeline, position }) => [timeline, position])).toEqual([
      ["second-half", q(2)],
      ["score", q(6)],
      ["performance", 3.0],
    ]);
    const line = axis(view, "performance");
    const reading = readAt(view, line.xStart + (3 / 4) * (line.xEnd - line.xStart), line.y);
    const flagged = reading === null ? [] : flagParts(reading.pin).map(({ timeline }) => timeline);
    const pinned = named?.timestamp.parts.map(({ timeline }) => timeline) ?? [];
    expect(flagged.toSorted()).toEqual(pinned.toSorted());
    expect(flagged.toSorted()).toEqual(["performance", "score", "second-half"]);
  });
});

describe("a reading across a group whose member is a child", () => {
  const view = viewWith("groups/group_parent_both");

  /** The reading at the middle of the line of `id`, on the arranger. */
  function readMiddle(id: string) {
    const line = axis(view, id);
    const reading = readAt(view, line.xStart + (line.xEnd - line.xStart) / 2, line.y);
    if (reading === null) throw new Error(`${id} is not read there`);
    return reading;
  }

  /** The rows of a reading's flag as `[timeline, coordinate text]`, its parts' ordinates beside. */
  function rowsOf(reading: ReturnType<typeof readMiddle>) {
    const { spec } = reading.pin;
    const ordinates = new Map(
      [spec.anchor, ...spec.members].map((member) => [member.timeline, member.ordinate]),
    );
    return flagParts(reading.pin).map(({ timeline, rows }) => [
      timeline,
      rows.map((row) => rowValueText(row, 3)),
      ordinates.get(timeline),
    ]);
  }

  it("reads the other member's ancestors, at the member's offset and scale", () => {
    const reading = readMiddle("recording");
    expect(
      reading.pin.spec.members.map(({ timeline, offset, scale }) => [timeline, offset, scale]),
    ).toEqual([
      ["piece", q(-5), q(4, 5)],
      ["middle", q(0), q(4, 5)],
    ]);
    expect(
      reading.pin.timestamp.parts.map(({ timeline, position }) => [timeline, position]),
    ).toEqual([
      ["recording", 5.0],
      ["piece", q(8)],
      ["middle", q(4)],
    ]);
  });

  it("lists the flag top to bottom where it crosses each line", () => {
    const top = [drawnY(view, "piece"), drawnY(view, "middle"), drawnY(view, "recording")];
    expect(top).toEqual([PIECE_Y, MIDDLE_Y, RECORDING_Y]);
    expect(rowsOf(readMiddle("recording"))).toEqual([
      ["middle", ["4 ♩"], top[1]],
      ["piece", ["8 ♩"], top[0]],
      ["recording", ["5″"], top[2]],
    ]);
    expect(rowsOf(readMiddle("middle"))).toEqual([
      ["middle", ["4 ♩"], top[1]],
      ["piece", ["8 ♩"], top[0]],
      ["recording", ["5″"], top[2]],
    ]);
  });
});

describe("a timestamp named on an ancestor line", () => {
  /** `bundle_mixed` with a timestamp named on `recording` at 88200 samples, and its ID. */
  const named = (view: View): [View, string] => {
    const added = changed(view, {
      type: "add",
      into: inBlock(A, idAddress("recording")),
      timestamp: { name: "Named", coordinate: 88200 },
    });
    const id = blockIn(added, A).manifest.graphical?.timestamps?.find(
      (item) => item.name === "Named",
    )?.id;
    if (id === undefined) throw new Error("no timestamp named");
    return [added, id];
  };
  /** Flag parts as `[timeline, [row's map or "coordinate", value text]]`. */
  const parts = (pin: Pin) =>
    flagParts(pin).map(({ timeline, rows }) => [
      timeline,
      rows.map((row) => [row.row.map ?? "coordinate", rowValueText(row, 3)]),
    ]);

  it.each([
    ["the cards shown", (view: View) => view, 279.70361328125],
    ["every ancestor card hidden", withoutAncestorCards, 126.29150390625],
  ])("lists in its tab what the flag listed there, %s", (_, layered, xStart) => {
    const [view, id] = named(layered(viewWith(MIXED)));
    const drawing = drawingIn(view);
    const line = [...lineAxes(drawing).values()].find(
      (each) => each.timeline === "recording" && each.ancestor === undefined,
    );
    expect(line && [line.card, line.y, line.xStart, line.xEnd]).toEqual([
      { item: "group_2", member: "excerpt" },
      340.796875,
      xStart,
      xStart + 400,
    ]);
    const reading = readAt(view, xStart + 200, 340.796875);
    if (reading === null) throw new Error("the ancestor line is not read");
    expect([reading.hit.axis.start, reading.hit.axis.drawnLength, reading.position]).toEqual([
      q(44100),
      q(88200),
      q(88200),
    ]);
    const flag = parts(reading.pin);
    expect(flag).toEqual([
      [
        "excerpt",
        [
          ["cmap_6", "1″"],
          ["coordinate", "44 100 smp"],
        ],
      ],
      ["recording", [["coordinate", "88 200 smp"]]],
    ]);
    const block = blockIn(view, A);
    const pin = namedPin(
      block.manifest,
      A,
      drawing,
      id,
      DEFAULT_GRANULARITY,
      "no_server",
      null,
      null,
    );
    expect(pin && parts(pin)).toEqual(flag);
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

  /** `view` with a named timestamp at `coordinate` on `timeline` displaying nothing, and its ID. */
  function blank(view: View, timeline: string, coordinate: unknown): [View, string] {
    const added = changed(view, {
      type: "add",
      into: inBlock(A, idAddress(timeline)),
      timestamp: { name: "Blank", coordinate },
    });
    const id = blockIn(added, A).manifest.graphical?.timestamps?.find(
      (item) => item.name === "Blank",
    )?.id;
    if (id === undefined) throw new Error("no timestamp named");
    return [undisplayed(added, id), id];
  }

  it("has none in a gap, and one on the card's line while the card is raised", () => {
    const [view, id] = blank(viewWith(PARENT_BOTH), "piece", [3, 1]);
    const block = blockIn(view, A);
    const drawing = drawingIn(view);
    const cardKey = keyOf(drawing, "piece", true);
    expect(affordancesOf(block.manifest, drawing)).toEqual([]);
    expect(affordancesOf(block.manifest, drawing, raisedRoot(block, PIECE_EDITOR))).toEqual([
      {
        kind: "affordance",
        address: idAddress(id),
        line: cardKey,
        points: [
          [210.33544921875, 86.68359375],
          [207.33544921875, 99.68359375],
          [213.33544921875, 99.68359375],
        ],
      },
    ]);
  });

  it("lies on a member's own line, and on the card's row of it while the card is raised", () => {
    const [view, id] = blank(viewWith(PARENT_BOTH), "middle", [4, 1]);
    const block = blockIn(view, A);
    const drawing = drawingIn(view);
    const [ownKey] = linesOf(drawing, "middle", stackingOf(drawing, null)).map(({ key }) => key);
    const [rowKey] = [...lineAxes(drawing)].find(
      ([, line]) => line.timeline === "middle" && line.ancestor !== undefined,
    ) ?? [undefined];
    if (ownKey === undefined || rowKey === undefined) throw new Error("no line of middle");
    expect(affordancesOf(block.manifest, drawing)).toEqual([
      expected(view, id, ownKey, AT_PIECE_8),
    ]);
    expect(affordancesOf(block.manifest, drawing, raisedRoot(block, PIECE_EDITOR))).toEqual([
      expected(view, id, rowKey, AT_PIECE_8),
    ]);
  });

  it("lies on a middle ancestor's ancestor line, never on the card's covered row", () => {
    const [view, id] = blank(viewWith("groups/group_grandchild"), "movement", [12, 1]);
    const block = blockIn(view, A);
    const drawing = drawingIn(view);
    const [ancestorKey] = [...lineAxes(drawing)].find(
      ([, line]) => line.timeline === "movement" && line.ancestor === undefined,
    ) ?? [undefined];
    if (ancestorKey === undefined) throw new Error("no ancestor line of movement");
    const points = [
      [1482.265625, 86.68359375],
      [1479.265625, 99.68359375],
      [1485.265625, 99.68359375],
    ];
    expect(affordancesOf(block.manifest, drawing)).toEqual([
      { kind: "affordance", address: idAddress(id), line: ancestorKey, points },
    ]);
    const pin = timelinePin(
      block.manifest,
      A,
      drawing,
      "movement",
      q(12),
      DEFAULT_GRANULARITY,
      "no_server",
      false,
      null,
      null,
    );
    if (pin === null) throw new Error("no pin of movement");
    expect(pinnedPlace(drawing, pin, null, null)).toEqual({
      key: ancestorKey,
      x: 1482.265625,
      group: false,
    });
  });

  it("lies on a member's own card alone, never on the row an ancestor card draws of it", () => {
    const view = undisplayed(viewWith("groups/group_child_member_stamps"), "timestamp_1");
    const own = [...lineAxes(drawingIn(view))].find(
      ([, line]) => line.timeline === "middle" && line.ancestor === undefined,
    );
    if (own === undefined) throw new Error("no member line of middle");
    expect([own[1].y, own[1].xStart, own[1].card]).toEqual([
      MIDDLE_Y,
      260.33544921875,
      MIDDLE_CARD,
    ]);
    const [affordance, ...more] = affordances(view);
    expect(more).toEqual([]);
    expect(affordance).toEqual(expected(view, "timestamp_1", own[0], 360.33544921875));
    expect(affordance?.points).toEqual([
      [360.33544921875, 48.70703125],
      [357.33544921875, 61.70703125],
      [363.33544921875, 61.70703125],
    ]);
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
    // `b` and its segment `b2` lie on `b`'s line, above `form`'s: top to bottom, the timestamp's
    // order kept at one ordinate; `b2_ticks` is drawn above `b`'s line, so before `b2`'s coordinate.
    expect(parts).toEqual([
      ["b", "B", [[{ timeline: "b", map: null }, "B", "9 25/48 ♩"]]],
      [
        "b2",
        "b2",
        [
          [{ timeline: "b2", map: "b2_ticks" }, "Ticks", "1 690 ticks"],
          [{ timeline: "b2", map: null }, "b2", "3 25/48 ♩"],
        ],
      ],
      ["form", "Form", [[{ timeline: "form", map: null }, "Form", "17 25/48 ♩"]]],
    ]);
    expect(reading.pin.timestamp.parts.map(({ timeline }) => timeline)).toEqual([
      "b",
      "form",
      "b2",
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
    const [part] = flagParts(reading.pin);
    // Both maps are drawn above `score`'s line, so before its coordinate, the first nearest it.
    expect(part?.rows.map(({ row }) => row.map)).toEqual(["cmap_2", "cmap_1", null]);
    const [seconds] = part?.rows ?? [];
    expect(seconds && rowValueText(seconds, 3)).toBe("1.6″");
  });

  /** The flag of `melody` read at 4 on `fixture` as `[name, [label, text]]` per part. */
  function melodyFlag(fixture: string) {
    const view = viewWith(fixture);
    const melody = axis(view, "melody");
    const reading = readAt(view, melody.xStart + (melody.xEnd - melody.xStart) / 2, melody.y);
    if (reading === null) throw new Error(`melody is not read on ${fixture}`);
    return flagParts(reading.pin).map(({ name, rows }) => [
      name,
      rows.map((row) => [row.row.map === null ? "coordinate" : row.label, rowValueText(row, 3)]),
    ]);
  }

  it("lists a part's rows top to bottom as drawn: maps above the line first", () => {
    expect(melodyFlag("map")).toEqual([
      [
        "Phrase",
        [
          ["Ticks", "960 ticks"],
          ["coordinate", "2 ♩"],
        ],
      ],
      [
        "Melody",
        [
          ["Tempo", "2″"],
          ["coordinate", "4 ♩"],
        ],
      ],
    ]);
  });

  it("lists maps drawn below their line after its coordinate, by the stated band orders", () => {
    // `melody`'s order puts its maps below its line, and `phrase` follows it.
    expect(melodyFlag("map_root_band_order")).toEqual([
      [
        "Phrase",
        [
          ["coordinate", "2 ♩"],
          ["Ticks", "960 ticks"],
        ],
      ],
      [
        "Melody",
        [
          ["coordinate", "4 ♩"],
          ["Tempo", "2″"],
        ],
      ],
    ]);
    // Only `phrase`'s order puts its maps below its line; `melody`'s stay above.
    expect(melodyFlag("map_child_band_order")).toEqual([
      [
        "Phrase",
        [
          ["coordinate", "2 ♩"],
          ["Ticks", "960 ticks"],
        ],
      ],
      [
        "Melody",
        [
          ["Tempo", "2″"],
          ["coordinate", "4 ♩"],
        ],
      ],
    ]);
  });

  it("carries each drawn map's ordinate, layout's record of its drawing", () => {
    for (const fixture of ["map", "map_root_band_order", "map_child_band_order"]) {
      const view = viewWith(fixture);
      const drawn = new Map(
        drawingIn(view).axes.flatMap(({ maps }) => maps.map(({ id, yc }) => [id, yc] as const)),
      );
      const spec = specOf(view, "melody");
      expect([
        spec.anchor.mapOrdinates,
        spec.members.map(({ timeline, mapOrdinates }) => [timeline, mapOrdinates]),
      ]).toEqual([
        new Map([["tempo", drawn.get("tempo")]]),
        [["phrase", new Map([["ticks", drawn.get("ticks")]])]],
      ]);
    }
  });

  it.each([
    [{ x: 100, y: 200, top: 150 }, { x: 100, top: 128, bottom: 200 }, 100.5, 128],
    // At the right border too the flag starts right of its pole: the shift alone moves it.
    [{ x: 700, y: 200, top: 150 }, { x: 700, top: 128, bottom: 200 }, 700.5, 128],
    [{ x: 100, y: 40, top: 10 }, { x: 100, top: 0, bottom: 40 }, 100.5, 0],
  ])("hangs right of the pole at %j", (at, pole, left, top) => {
    expect(flagPlace(at)).toEqual({ pole, left, top });
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
    const row =
      reading === null
        ? undefined
        : flagParts(reading.pin)[0]?.rows.find(({ row }) => row.map === "cmap_1");
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

describe("what a timestamp's line crosses in its card", () => {
  /** `view` with a child `id` of `parent` at `offset`, `length` quarters long. */
  const withChild = (view: View, parent: string, id: string, offset: number, length: number) =>
    changed(view, {
      type: "add",
      into: inBlock(A, idAddress(parent)),
      child: {
        id,
        unit: "quarters",
        number_type: "fraction",
        offset: [offset, 1],
        length: [length, 1],
      },
    });

  /** The unnamed pin of `timeline` at `value` in block A, no group read, `raised` raised. */
  const pinOf = (view: View, timeline: string, value: Rational, raised: string | null = null) => {
    const pin = timelinePin(
      blockIn(view, A).manifest,
      A,
      drawingIn(view),
      timeline,
      value,
      DEFAULT_GRANULARITY,
      "no_server",
      false,
      raised,
      null,
    );
    if (pin === null) throw new Error(`no pin of ${timeline}`);
    return pin;
  };

  it("lists the root and a sibling of a child, top to bottom, the child primary", () => {
    const view = withChild(viewWith("map"), "melody", "motif", 3, 4);
    const pin = pinOf(view, "phrase", q(2));
    const rows = new Map(rowsOf(pin).map(([timeline, values]) => [timeline, values]));
    expect(Object.fromEntries(rows)).toEqual({
      melody: [
        ["tempo", "2″"],
        ["coordinate", "4 ♩"],
      ],
      phrase: [
        ["ticks", "960 ticks"],
        ["coordinate", "2 ♩"],
      ],
      motif: [["coordinate", "1 ♩"]],
    });
    const topDown = ["melody", "phrase", "motif"].sort(
      (left, right) => drawnY(view, left) - drawnY(view, right),
    );
    expect(flagParts(pin).map(({ timeline }) => timeline)).toEqual(topDown);
    expect(pin.spec.anchor.timeline).toBe("phrase");
    // At `melody` 2.5 the line lies left of `motif`, which starts at 3.
    const before = pinOf(view, "phrase", q(1, 2));
    expect(
      flagParts(before)
        .map(({ timeline }) => timeline)
        .sort(),
    ).toEqual(["melody", "phrase"]);
  });

  it("lists on an ancestor line what the member's card draws, and in the raised card what it draws", () => {
    const view = withChild(viewWith(PARENT_BOTH), "piece", "intro", 8, 4);
    const block = blockIn(view, A);
    const listed = (pin: Pin) =>
      pin.timestamp.parts.map(({ timeline, position }) => [timeline, position]);
    expect(listed(pinOf(view, "piece", q(10)))).toEqual([
      ["piece", q(10)],
      ["middle", q(6)],
    ]);
    expect(listed(pinOf(view, "piece", q(10), raisedRoot(block, PIECE_EDITOR)))).toEqual([
      ["piece", q(10)],
      ["middle", q(6)],
      ["intro", q(2)],
    ]);
  });

  it("lists a groupstamp's sibling in its member's card and the other member", () => {
    const branched = withChild(
      viewWith("groups/group_groupstamp_child_member"),
      "score",
      "bridge",
      2,
      4,
    );
    const view = changed(branched, {
      type: "add",
      into: inBlock(A, idAddress("second-half")),
      timestamp: { name: "Crossing", coordinate: [2, 1], groupstamp: true },
    });
    const manifest = blockIn(view, A).manifest;
    const id = manifest.graphical?.timestamps?.find((item) => item.name === "Crossing")?.id;
    if (id === undefined) throw new Error("no timestamp named");
    const pin = namedPin(
      manifest,
      A,
      drawingIn(view),
      id,
      DEFAULT_GRANULARITY,
      "no_server",
      null,
      null,
    );
    expect(pin?.spec.anchor.timeline).toBe("second-half");
    expect(
      pin?.timestamp.parts.map(({ timeline, position }) => [timeline, position]).sort(),
    ).toEqual(
      [
        ["second-half", q(2)],
        ["score", q(6)],
        ["bridge", q(4)],
        ["performance", 3.0],
      ].sort(),
    );
  });
});
