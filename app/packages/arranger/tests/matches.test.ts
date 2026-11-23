/**
 * Show matches: where the potential MatchStamps of a table are drawn in a
 * block, what a view draws of them, what the pointer hovers, the flag, the
 * colours of the pinned and the named MatchStamps, and what a press on a
 * match timestamp's line selects. Derived in `README.md` ("Show matches").
 */

import type { AnchorIndex, Manifest } from "@timetoalign/tilie-core";
import {
  addressKey,
  anchorIndexOf,
  DEFAULT_GRANULARITY,
  idAddress,
  inBlock,
  matchClaimColumns,
  partAddress,
  placeKeyText,
  VALUELESS_TEXT,
} from "@timetoalign/tilie-core";
import type { CoordinateValue } from "@timetoalign/tilie-core/numbers";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { AnchorElement, Drawing } from "@timetoalign/tilie-layout";
import { groupCrossSections, lineAxes } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { raisedRoot } from "../src/boxes.ts";
import { seenOn } from "../src/coordinates.ts";
import { drawingOf } from "../src/drawing.ts";
import type { MatchLines, MatchOverlay, Screen, ScreenCoordinate } from "../src/matches.ts";
import {
  fadedPathsOf,
  inScreenOrder,
  matchFlag,
  matchHitAt,
  matchLinesOf,
  namedGroupstamps,
  namedPaint,
  overlayOf,
  pathOf,
  pinnedOverlays,
  screenOrder,
  screenPlace,
  stampOverlay,
} from "../src/matches.ts";
import { holdingMatchStamp, ownerOf } from "../src/selectionRules.ts";
import { G, GROUPSTAMP_FIXTURE } from "./groupTable.ts";
import { BELIEVED, D, NAMED, NAMED_IN_D, OTHER, SCORE, T, TAKE_1, TAKE_2 } from "./matchTables.ts";
import {
  A,
  blockIn,
  changed,
  metrics,
  viewOf,
  withFullCards,
  withoutAncestorCards,
} from "./support.ts";

const view = viewOf({ id: A, fixture: "bundles/bundle_matchstamps", x: 40, y: 80 });
const manifest: Manifest = blockIn(view, A).manifest;
const drawing: Drawing = drawingOf(blockIn(view, A), view.graphical, metrics);
const PLACED = { origin: { x: 40, y: 80 }, scale: 1 };
const SCREEN: Screen = { x: 0, y: 0, zoom: 1, width: 1000, height: 600, ratio: 1 };

/** The lines' ordinates and the abscissas of `README.md`. */
const SCORE_Y = 43.20703125;
const TAKE_1_Y = 100.5859375;
const TAKE_2_Y = 157.96484375;
/**
 * The upper and lower borders of each root's card (layout's record: each 49.37890625 high, its
 * line 14.40234375 below its top, the cards 8 apart), which a cross-section segment on its line
 * spans.
 */
const SCORE_TOP = 28.8046875;
const SCORE_BOTTOM = 78.18359375;
const TAKE_1_TOP = 86.18359375;
const TAKE_1_BOTTOM = 135.5625;
const TAKE_2_TOP = 143.5625;
const TAKE_2_BOTTOM = 192.94140625;
const X_START = 61.0927734375;
const AT_100 = X_START + 100;
const AT_200 = X_START + 200;
const AT_300 = X_START + 300;

const linesOf = (index: AnchorIndex): MatchLines => matchLinesOf(drawing, index);

/** An overlay's lines as `[coordinate, x, y1, y2]` and connectors as `[anchor, x1, y1, x2, y2]`. */
function shape(overlay: MatchOverlay) {
  return {
    lines: overlay.lines.map(({ coordinate, x, y1, y2 }) => [coordinate, x, y1, y2]),
    connectors: overlay.connectors.map(({ anchor, x1, y1, x2, y2 }) => [anchor, x1, y1, x2, y2]),
  };
}

/** The drawn element of the named anchor `id`. */
function anchorElement(id: string): AnchorElement {
  const found = drawing.elements.find(
    (element): element is AnchorElement =>
      element.type === "alignment_anchor" && element.address.id === id,
  );
  if (found === undefined) throw new Error(`no line of ${id}`);
  return found;
}

describe("the index T", () => {
  it("is numbered as README.md derives it", () => {
    const { coordinates, anchors, matchStamps } = T;
    expect(Array.from(coordinates.timeline)).toEqual([
      TAKE_2,
      SCORE,
      SCORE,
      TAKE_1,
      TAKE_1,
      TAKE_1,
      OTHER,
    ]);
    expect([Array.from(anchors.low), Array.from(anchors.high)]).toEqual([
      [0, 0, 1, 2, 2],
      [4, 5, 3, 5, 6],
    ]);
    expect(Array.from(matchStamps.of)).toEqual([0, 1, 0, 1, 0, 0, 0]);
  });
});

describe("the lines holding a table's timelines", () => {
  it("are score's, take_1's and take_2's, in the drawing's order", () => {
    const { all } = linesOf(T);
    expect(
      all.map(({ timeline, card, y, y1, y2, xStart, xEnd }) => [
        timeline,
        card,
        y,
        y1,
        y2,
        xStart,
        xEnd,
      ]),
    ).toEqual([
      [
        SCORE,
        placeKeyText({ item: "score" }),
        SCORE_Y,
        SCORE_TOP,
        SCORE_BOTTOM,
        X_START,
        X_START + 400,
      ],
      [
        TAKE_1,
        placeKeyText({ item: "take_1" }),
        TAKE_1_Y,
        TAKE_1_TOP,
        TAKE_1_BOTTOM,
        X_START,
        X_START + 400,
      ],
      [
        TAKE_2,
        placeKeyText({ item: "take_2" }),
        TAKE_2_Y,
        TAKE_2_TOP,
        TAKE_2_BOTTOM,
        X_START,
        X_START + 400,
      ],
    ]);
  });
});

describe("what a view draws", () => {
  it("draws every coordinate in view on its lines and every anchor of a drawn one", () => {
    expect(shape(overlayOf(T, linesOf(T), PLACED, SCREEN))).toEqual({
      lines: [
        [1, AT_200, SCORE_TOP, SCORE_BOTTOM],
        [2, AT_300, SCORE_TOP, SCORE_BOTTOM],
        [3, AT_100, TAKE_1_TOP, TAKE_1_BOTTOM],
        [4, AT_200, TAKE_1_TOP, TAKE_1_BOTTOM],
        [5, AT_300, TAKE_1_TOP, TAKE_1_BOTTOM],
        [0, AT_300, TAKE_2_TOP, TAKE_2_BOTTOM],
      ],
      connectors: [
        [2, AT_200, SCORE_BOTTOM, AT_100, TAKE_1_TOP],
        [3, AT_300, SCORE_BOTTOM, AT_300, TAKE_1_TOP],
        [0, AT_300, TAKE_2_TOP, AT_200, TAKE_1_BOTTOM],
        [1, AT_300, TAKE_2_TOP, AT_300, TAKE_1_BOTTOM],
      ],
    });
  });

  it("joins two coordinates exactly as the named anchor between their timestamps is drawn", () => {
    const [connector] = overlayOf(T, linesOf(T), PLACED, SCREEN).connectors;
    const { x1, y1, x2, y2 } = anchorElement("anchor_1");
    expect(connector).toEqual({ anchor: 2, x1, y1, x2, y2 });
  });

  it("writes the lines, then the connectors, as subpaths", () => {
    expect(pathOf(overlayOf(T, linesOf(T), PLACED, SCREEN))).toBe(
      [
        "M261.0928 28.8047V78.1836",
        "M361.0928 28.8047V78.1836",
        "M161.0928 86.1836V135.5625",
        "M261.0928 86.1836V135.5625",
        "M361.0928 86.1836V135.5625",
        "M361.0928 143.5625V192.9414",
        "M261.0928 78.1836L161.0928 86.1836",
        "M361.0928 78.1836L361.0928 86.1836",
        "M361.0928 143.5625L261.0928 135.5625",
        "M361.0928 143.5625L361.0928 135.5625",
      ].join(""),
    );
  });
});

describe("one line per device pixel column of a card", () => {
  /** The drawn lines of `overlay` on `timeline` of D (0 score, 1 take_1), as coordinate numbers. */
  const on = (overlay: MatchOverlay, timeline: number) =>
    overlay.lines.filter(({ coordinate }) => D.coordinates.timeline[coordinate] === timeline);

  /** The device column of an abscissa of block A on `screen`. */
  const columnOf = (screen: Screen, x: number) =>
    Math.floor((screen.x + (40 + x) * screen.zoom) * screen.ratio);

  /** No two lines of one card (one timeline here) share a column; connectors are the drawn coordinates' anchors. */
  function expectThinned(overlay: MatchOverlay, screen: Screen) {
    for (const timeline of [0, 1]) {
      const columns = on(overlay, timeline).map(({ x }) => columnOf(screen, x));
      expect(new Set(columns).size).toBe(columns.length);
    }
    const anchors = new Set<number>();
    const { offsets, anchors: joined } = D.neighbours;
    for (const { coordinate } of overlay.lines) {
      for (
        let at = offsets[coordinate] as number;
        at < (offsets[coordinate + 1] as number);
        at += 1
      ) {
        anchors.add(joined[at] as number);
      }
    }
    expect(overlay.connectors.map(({ anchor }) => anchor)).toEqual([...anchors]);
  }

  it("draws every fourth score coordinate and one take_1 coordinate a column at zoom 1", () => {
    const overlay = overlayOf(D, linesOf(D), PLACED, SCREEN);
    expect(on(overlay, 0).map(({ coordinate }) => coordinate)).toEqual(
      Array.from({ length: 401 }, (_, n) => 4 * n),
    );
    expect(on(overlay, 0).map(({ x }) => x)).toEqual(
      Array.from({ length: 401 }, (_, n) => X_START + n),
    );
    const take = on(overlay, 1);
    expect(take).toHaveLength(400);
    expect(take.map(({ x }) => columnOf(SCREEN, x))).toEqual(
      Array.from({ length: 400 }, (_, n) => 101 + n),
    );
    expectThinned(overlay, SCREEN);
  });

  it("follows the view, not the table", () => {
    const shifted: Screen = { ...SCREEN, x: -200 };
    const overlay = overlayOf(D, linesOf(D), PLACED, shifted);
    const score = on(overlay, 0).map(({ coordinate }) => coordinate);
    expect(score).toEqual(Array.from({ length: 302 }, (_, n) => 396 + 4 * n));
    expect(columnOf(shifted, on(overlay, 0)[0]?.x ?? Number.NaN)).toBe(0);
    expect(on(overlay, 1).map(({ x }) => columnOf(shifted, x))).toEqual(
      Array.from({ length: 301 }, (_, n) => n),
    );
    expectThinned(overlay, shifted);

    const close: Screen = { ...SCREEN, zoom: 2, ratio: 2 };
    const near = overlayOf(D, linesOf(D), PLACED, close);
    expect(on(near, 0).map(({ coordinate }) => coordinate)).toEqual(
      Array.from({ length: 1596 }, (_, n) => n),
    );
    expectThinned(near, close);
  });
});

describe("hovering", () => {
  const connectors = () => overlayOf(T, linesOf(T), PLACED, SCREEN).connectors;
  const hit = (x: number, y: number, tolerance = 8) =>
    matchHitAt(T, linesOf(T), connectors(), { x, y }, tolerance);

  it("hovers a line by its nearest coordinate, a line before a connector on a tie", () => {
    // 3 right of c2's line at its lower end, where a3 begins: as near, the tie goes to the line.
    expect(hit(AT_300 + 3, SCORE_BOTTOM)).toEqual({
      stamp: 0,
      coordinate: 2,
      anchor: null,
      distance: 3,
      at: { x: AT_300, y: SCORE_Y, top: SCORE_TOP },
    });
  });

  it("hovers a connector nearer than any line", () => {
    expect(hit(AT_300 + 4, SCORE_BOTTOM + 3)).toEqual({
      stamp: 0,
      coordinate: null,
      anchor: 3,
      distance: 4,
      at: { x: AT_300, y: SCORE_BOTTOM + 3, top: SCORE_BOTTOM + 3 },
    });
    const found = hit(311.0927734375, 144.5625);
    expect([found?.stamp, found?.anchor, found?.coordinate]).toEqual([0, 0, null]);
  });

  it("hovers nothing beyond the tolerance", () => {
    expect(hit(461.0927734375, 70)).toBeNull();
    expect(hit(AT_300 + 3, SCORE_Y - 3, 2)).toBeNull();
  });

  it("hovers a coordinate that is not drawn", () => {
    const found = matchHitAt(D, linesOf(D), [], { x: X_START + 0.5, y: SCORE_Y }, 8);
    expect([found?.coordinate, found?.stamp, found?.distance]).toEqual([2, D.matchStamps.of[2], 0]);
  });
});

describe("the hovered and the pinned MatchStamp", () => {
  it("draws every coordinate on its lines and every anchor", () => {
    expect(shape(stampOverlay(T, linesOf(T), 0))).toEqual({
      lines: [
        [0, AT_300, TAKE_2_TOP, TAKE_2_BOTTOM],
        [2, AT_300, SCORE_TOP, SCORE_BOTTOM],
        [4, AT_200, TAKE_1_TOP, TAKE_1_BOTTOM],
        [5, AT_300, TAKE_1_TOP, TAKE_1_BOTTOM],
      ],
      connectors: [
        [0, AT_300, TAKE_2_TOP, AT_200, TAKE_1_BOTTOM],
        [1, AT_300, TAKE_2_TOP, AT_300, TAKE_1_BOTTOM],
        [3, AT_300, SCORE_BOTTOM, AT_300, TAKE_1_TOP],
      ],
    });
    expect(shape(stampOverlay(T, linesOf(T), 7))).toEqual({ lines: [], connectors: [] });
  });
});

describe("the hovered and the pinned MatchStamp drawn as named", () => {
  const grouped = viewOf({ id: A, fixture: GROUPSTAMP_FIXTURE, x: 40, y: 80 });
  const groupedManifest: Manifest = blockIn(grouped, A).manifest;
  const groupedDrawing: Drawing = drawingOf(blockIn(grouped, A), grouped.graphical, metrics);
  const groupedLines = matchLinesOf(groupedDrawing, G);
  const named = namedGroupstamps(groupedManifest, G);
  const START = 102.29150390625;
  const [AT_1, AT_2, AT_3] = [START + 100, START + 200, START + 300];
  /** The cards and the frame's spans less them of `score`'s lines, `group_1`'s then `group_2`'s. */
  const scoreAt = (c: number, x: number) => [
    [c, x, 53.609375, 117.5859375],
    [c, x, 117.5859375, 174.96484375],
    [c, x, 215.76953125, 279.74609375],
    [c, x, 279.74609375, 337.125],
  ];

  /** The line of `G` whose cross-section extent a segment piece is. */
  const lineOf = (piece: { coordinate: number; y1: number; y2: number }) =>
    groupedLines.byTimeline
      .get(G.coordinates.timeline[piece.coordinate] as number)
      ?.find(({ y1, y2 }) => y1 === piece.y1 && y2 === piece.y2);

  it("follows a line with its groupstamp's lines where naming stores a groupstamp", () => {
    expect([0, 1, 2, 3, 4, 5].map(named)).toEqual([true, true, false, true, false, true]);
    expect(shape(stampOverlay(G, groupedLines, 0, named)).lines).toEqual([
      ...scoreAt(0, AT_2),
      [2, AT_1, 125.5859375, 174.96484375],
    ]);
    expect(shape(stampOverlay(G, groupedLines, 1, named)).lines).toEqual([
      ...scoreAt(1, AT_3),
      [5, AT_2, 287.74609375, 337.125],
      [5, AT_2, 215.76953125, 287.74609375],
    ]);
    expect(shape(stampOverlay(G, groupedLines, 2, named)).lines).toEqual([
      [3, AT_3, 125.5859375, 174.96484375],
      [3, AT_3, 53.609375, 125.5859375],
      [4, AT_3, 53.609375, 117.5859375],
      [4, AT_3, 215.76953125, 279.74609375],
    ]);
  });

  it("draws exactly layout's groupstamp pieces, and the named groupstamp's", () => {
    for (let stamp = 0; stamp < G.matchStamps.count; stamp += 1) {
      const plain = stampOverlay(G, groupedLines, stamp).lines;
      const expected = plain.flatMap((piece) => {
        const line = lineOf(piece);
        if (line === undefined) throw new Error("a piece on no line");
        const across = named(piece.coordinate)
          ? groupCrossSections(groupedDrawing, line.key, piece.x).map(({ y1, y2, style }) => ({
              coordinate: piece.coordinate,
              x: piece.x,
              y1,
              y2,
              opacity: style.opacity,
            }))
          : [];
        return [piece, ...across];
      });
      expect(stampOverlay(G, groupedLines, stamp, named).lines).toEqual(expected);
    }
    const timestamp1 = groupedDrawing.elements.flatMap((element) =>
      element.type === "cross_section" && element.address.id === "timestamp_1"
        ? [[element.x, element.y1, element.y2]]
        : [],
    );
    const c0 = stampOverlay(G, groupedLines, 0, named).lines.flatMap(({ coordinate, x, y1, y2 }) =>
      coordinate === 0 ? [[x, y1, y2]] : [],
    );
    const sorted = (pieces: number[][]) =>
      [...pieces].sort((left, right) => (left[1] as number) - (right[1] as number));
    expect(sorted(c0)).toEqual(sorted(timestamp1));
  });

  it("draws no groupstamp without the manifest's word, nor on lines in no frame", () => {
    expect(shape(stampOverlay(G, groupedLines, 1)).lines).toEqual([
      [1, AT_3, 53.609375, 117.5859375],
      [1, AT_3, 215.76953125, 279.74609375],
      [5, AT_2, 287.74609375, 337.125],
    ]);
    for (const stamp of [0, 1]) {
      expect(stampOverlay(T, linesOf(T), stamp, namedGroupstamps(manifest, T))).toEqual(
        stampOverlay(T, linesOf(T), stamp),
      );
    }
  });

  it("fades a group piece over a member card the group gives no value, at that piece's opacity", () => {
    const unknown = changed(grouped, {
      type: "set",
      changes: [{ target: inBlock(A, idAddress("performance")), values: { length: null } }],
    });
    const unknownLines = matchLinesOf(
      drawingOf(blockIn(unknown, A), unknown.graphical, metrics),
      G,
    );
    const unknownNamed = namedGroupstamps(blockIn(unknown, A).manifest, G);
    const opacities = (overlay: MatchOverlay) =>
      overlay.lines.map(({ coordinate, x, y1, y2, opacity }) => [coordinate, x, y1, y2, opacity]);
    // `FADED_OPACITY`, the drawing's opacity of what has no value (drawing.md §6.6).
    const FADED = 0.35;
    const [first, second, third] = [0, 1, 2].map((stamp) =>
      stampOverlay(G, unknownLines, stamp, unknownNamed),
    );
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("three overlays");
    }
    const cutAt = (c: number, x: number) => [
      [c, x, 53.609375, 117.5859375, 1],
      [c, x, 117.5859375, 125.5859375, 1],
      [c, x, 125.5859375, 174.96484375, FADED],
      [c, x, 215.76953125, 279.74609375, 1],
      [c, x, 279.74609375, 337.125, 1],
    ];
    expect(opacities(first)).toEqual([...cutAt(0, AT_2), [2, AT_1, 125.5859375, 174.96484375, 1]]);
    expect(opacities(second)).toEqual([
      ...cutAt(1, AT_3),
      [5, AT_2, 287.74609375, 337.125, 1],
      [5, AT_2, 215.76953125, 287.74609375, 1],
    ]);
    expect(opacities(third)).toEqual([
      [3, AT_3, 125.5859375, 174.96484375, 1],
      [3, AT_3, 53.609375, 125.5859375, FADED],
      [4, AT_3, 53.609375, 117.5859375, 1],
      [4, AT_3, 215.76953125, 279.74609375, 1],
    ]);
    expect(fadedPathsOf(first)).toEqual([{ opacity: FADED, d: "M302.2915 125.5859V174.9648" }]);
    expect(pathOf(first)).toBe(
      pathOf({ ...first, lines: first.lines.filter((line) => line.opacity === 1) }),
    );
    // Both lengths known, every line at 1 and no faded path.
    for (let stamp = 0; stamp < G.matchStamps.count; stamp += 1) {
      const known = stampOverlay(G, groupedLines, stamp, named);
      expect(known.lines.map(({ opacity }) => opacity)).toEqual(known.lines.map(() => 1));
      expect(fadedPathsOf(known)).toEqual([]);
    }
  });

  it("keeps the potential MatchStamps' overlay as it is", () => {
    expect(shape(overlayOf(G, groupedLines, PLACED, SCREEN)).lines).toEqual([
      [0, AT_2, 53.609375, 117.5859375],
      [1, AT_3, 53.609375, 117.5859375],
      [2, AT_1, 125.5859375, 174.96484375],
      [3, AT_3, 125.5859375, 174.96484375],
      [0, AT_2, 215.76953125, 279.74609375],
      [1, AT_3, 215.76953125, 279.74609375],
      [5, AT_2, 287.74609375, 337.125],
    ]);
  });
});

describe("screen order", () => {
  /** `bundle_shared_member` with `g1`'s frame at (0, 100) and `g2`'s at (400, 0). */
  const shared = changed(viewOf({ id: A, fixture: "bundles/bundle_shared_member" }), {
    type: "set",
    changes: [
      { target: inBlock(A, idAddress("g1")), values: { place: { x: 0, y: 100 } } },
      { target: inBlock(A, idAddress("g2")), values: { place: { x: 400, y: 0 } } },
    ],
  });
  const twice = drawingOf(blockIn(shared, A), shared.graphical, metrics);
  const T_TOP = 68.01171875;
  const V_Y = 125.390625;
  const U_Y = 225.390625;
  const G1_X = 102.29150390625;
  const G2_X = 502.29150390625;
  const at = (timeline: string, value: CoordinateValue): ScreenCoordinate => ({ timeline, value });
  const t4 = at("t", 4n);
  const t6 = at("t", 6n);
  const v400 = at("v", 400n);
  const u2 = at("u", 2);
  const beyond = at("t", Rational.of([17, 2]));
  const nowhere = at("w", 1n);

  it("places a coordinate at its topmost, then leftmost drawn place", () => {
    const lines = [...lineAxes(twice).values()].filter(({ timeline }) => timeline === "t");
    expect(lines.map(({ y, xStart }) => [y, xStart])).toEqual([
      [T_TOP + 100, G1_X],
      [T_TOP, G2_X],
    ]);
    expect(screenPlace(twice, t4)).toEqual({ x: G2_X + 200, y: T_TOP });
    expect(screenPlace(twice, t6)).toEqual({ x: G2_X + 300, y: T_TOP });
    expect(screenPlace(twice, at("t", 8n))).toEqual({ x: G2_X + 400, y: T_TOP });
    expect(screenPlace(twice, v400)).toEqual({ x: G2_X + 200, y: V_Y });
    expect(screenPlace(twice, u2)).toEqual({ x: G1_X + 200, y: U_Y });
    expect(screenPlace(twice, beyond)).toBeNull();
    expect(screenPlace(twice, at("t", Rational.of([-1, 1])))).toBeNull();
    expect(screenPlace(twice, nowhere)).toBeNull();
  });

  it("orders top to bottom, then left to right, what is not drawn last", () => {
    expect(inScreenOrder(twice, [u2, t6, v400, t4], (item) => item)).toEqual([t4, t6, v400, u2]);
    expect(inScreenOrder(twice, [beyond, u2, nowhere], (item) => item)).toEqual([
      u2,
      beyond,
      nowhere,
    ]);
    const exact = at("t", Rational.of([4, 1]));
    const [first, second] = inScreenOrder(twice, [t4, exact], (item) => item);
    expect([first === t4, second === exact]).toEqual([true, true]);
    const [again, last] = inScreenOrder(twice, [exact, t4], (item) => item);
    expect([again === exact, last === t4]).toEqual([true, true]);
    const place = { x: 0, y: 0 };
    expect([
      screenOrder(place, null) < 0,
      screenOrder(null, place) > 0,
      screenOrder(null, null),
    ]).toEqual([true, true, 0]);
  });

  it("places a segment on its segment line within the segment's span", () => {
    const pages = viewOf({ id: A, fixture: "segment_pages" });
    const drawn = drawingOf(blockIn(pages, A), pages.graphical, metrics);
    const line = lineAxes(drawn).values().next().value;
    expect([line?.timeline, line?.y, line?.xStart, line?.xEnd]).toEqual([
      "pages",
      36.4765625,
      56.85498046875,
      456.85498046875,
    ]);
    expect(screenPlace(drawn, at("page_2", 0n))).toEqual({ x: 156.85498046875, y: 36.4765625 });
    expect(screenPlace(drawn, at("page_2", 1754n))).toEqual({ x: 256.85498046875, y: 36.4765625 });
    expect(screenPlace(drawn, at("page_2", 1755n))).toBeNull();
  });

  it("places a member on its own card, before the row an ancestor card draws of it", () => {
    const parent = viewOf({ id: A, fixture: "groups/group_parent_both", x: 40, y: 80 });
    const drawn = drawingOf(blockIn(parent, A), parent.graphical, metrics);
    const middle4 = at("middle", Rational.of([4, 1]));
    const piece8 = at("piece", Rational.of([8, 1]));
    expect(screenPlace(drawn, middle4)).toEqual({ x: 564.0390625, y: 47.20703125 });
    expect(screenPlace(drawn, piece8)).toEqual({ x: 564.0390625, y: 85.18359375 });
    expect(screenPlace(drawn, at("piece", Rational.of([1, 1])))).toEqual({
      x: 110.33544921875,
      y: 85.18359375,
    });
    expect(inScreenOrder(drawn, [piece8, middle4], (item) => item)).toEqual([middle4, piece8]);
  });
});

describe("screen order of a grandchild and its two ancestors", () => {
  const grandchild = viewOf({ id: A, fixture: "groups/group_grandchild", x: 40, y: 80 });
  const at = (timeline: string, value: CoordinateValue): ScreenCoordinate => ({ timeline, value });
  const score28 = at("score", Rational.of([28, 1]));
  const movement12 = at("movement", Rational.of([12, 1]));
  const theme4 = at("theme", Rational.of([4, 1]));

  it("places each on the line the user sees in the grandchild's card", () => {
    const full = withFullCards(grandchild);
    const drawn = drawingOf(blockIn(full, A), full.graphical, metrics);
    expect([score28, movement12, theme4].map((item) => screenPlace(drawn, item))).toEqual([
      { x: 1585.96923828125, y: 99.18359375 },
      { x: 1585.96923828125, y: 85.18359375 },
      { x: 1585.96923828125, y: 47.20703125 },
    ]);
    expect(inScreenOrder(drawn, [movement12, score28, theme4], (item) => item)).toEqual([
      theme4,
      movement12,
      score28,
    ]);
  });

  it("keeps that order with every ancestor card hidden", () => {
    const hidden = withoutAncestorCards(grandchild);
    const drawn = drawingOf(blockIn(hidden, A), hidden.graphical, metrics);
    expect([score28, movement12, theme4].map((item) => screenPlace(drawn, item)?.y)).toEqual([
      99.18359375, 85.18359375, 47.20703125,
    ]);
    expect(inScreenOrder(drawn, [movement12, score28, theme4], (item) => item)).toEqual([
      theme4,
      movement12,
      score28,
    ]);
  });
});

describe("where a timeline drawn only in an ancestor card is seen", () => {
  const parent = viewOf({ id: A, fixture: "groups/group_parent_both", x: 40, y: 80 });
  const block = blockIn(parent, A);
  const drawn = drawingOf(block, parent.graphical, metrics);
  const raised = raisedRoot(block, {
    target: inBlock(A, idAddress("piece")),
    kind: "timeline",
  });
  const fraction = (value: number) => Rational.of([value, 1]);
  /** The table P of `README.md`: `middle` m ↔ `piece` p for (2, 6), (0, 1), (8, 14), (1, 3). */
  const P = anchorIndexOf(
    matchClaimColumns(
      [
        { id: "middle", numberType: "fraction" },
        { id: "piece", numberType: "fraction" },
      ],
      [
        [2, 6],
        [0, 1],
        [8, 14],
        [1, 3],
      ].map(([m, p], at) => ({
        id: `p_${at + 1}`,
        timelines: [0, 1],
        start: [fraction(m as number), fraction(p as number)],
      })),
    ),
  );
  const MIDDLE_CARD = placeKeyText({ item: "group_1", member: "middle" });
  const PIECE_CARD = placeKeyText({ item: "group_1", member: "piece" });
  /** The key in `lineAxes` of the card's row of `middle`. */
  const CARD_MIDDLE_ROW = [...lineAxes(drawn)].find(
    ([, line]) => line.timeline === "middle" && line.ancestor !== undefined,
  )?.[0];
  /** The frame's borders, where the card's axis has its seams. */
  const LEFT = 260.33544921875;
  const RIGHT = 804.0390625;
  const linesIn = (root: string | null) =>
    matchLinesOf(drawn, P, root).all.map(({ card, timeline, y, y1, y2, xStart, from, to }) => [
      card,
      timeline,
      y,
      y1,
      y2,
      xStart,
      from,
      to,
    ]);

  it("is numbered as README.md derives it", () => {
    expect([...P.coordinates.timeline]).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect([...P.coordinates.position]).toEqual([0, 1, 2, 8, 1, 3, 6, 14]);
    expect([...P.matchStamps.of]).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(raised).toBe("piece");
  });

  it("covers the card's run under the frame, its runs left and right of the frame seen", () => {
    expect([(LEFT - 60.33544921875) / 50, 12 + (RIGHT - 804.0390625) / 50]).toEqual([4, 12]);
    expect(
      seenOn(drawn, "piece", null).map(({ section, xFrom, xTo }) => [section, xFrom, xTo]),
    ).toEqual([
      ['["group_1","middle"]{"id":"middle"}', 364.0390625, 764.0390625],
      ['["group_1","piece"]{"id":"piece"}', 60.33544921875, LEFT],
      ['["group_1","piece"]{"id":"piece"}#2', RIGHT, 1004.0390625],
    ]);
    expect(seenOn(drawn, "piece", raised).map(({ xFrom, xTo }) => [xFrom, xTo])).toEqual([
      [60.33544921875, LEFT],
      [364.0390625, 764.0390625],
      [RIGHT, 1004.0390625],
    ]);
    expect(
      seenOn(drawn, "middle", raised).map(({ key, section, xFrom, xTo }) => [
        key,
        section,
        xFrom,
        xTo,
      ]),
    ).toEqual([[CARD_MIDDLE_ROW, CARD_MIDDLE_ROW, 364.0390625, 764.0390625]]);
  });

  it("draws a member on its own card's line, the root on its ancestor line and beyond the frame", () => {
    expect(linesIn(null)).toEqual([
      [MIDDLE_CARD, 1, 85.18359375, 32.8046875, 100.18359375, 364.0390625, 4, 12],
      [MIDDLE_CARD, 0, 47.20703125, 32.8046875, 100.18359375, 364.0390625, 0, 8],
      [PIECE_CARD, 1, 85.18359375, 36.20703125, 99.5859375, 60.33544921875, 0, 4],
      [PIECE_CARD, 1, 85.18359375, 36.20703125, 99.5859375, RIGHT, 12, 16],
    ]);
  });

  it("draws the root on the card's line and the member on the card's row while the card is raised", () => {
    expect(linesIn(raised)).toEqual([
      [PIECE_CARD, 1, 85.18359375, 36.20703125, 99.5859375, 60.33544921875, 0, 4],
      [PIECE_CARD, 1, 85.18359375, 36.20703125, 99.5859375, 364.0390625, 4, 12],
      [PIECE_CARD, 1, 85.18359375, 36.20703125, 99.5859375, RIGHT, 12, 16],
      [PIECE_CARD, 0, 51.20703125, 36.20703125, 99.5859375, 364.0390625, 0, 8],
    ]);
  });

  it("draws each MatchStamp where its coordinates are seen", () => {
    const stamps = (root: string | null) =>
      [0, 1, 2, 3].map((stamp) => shape(stampOverlay(P, matchLinesOf(drawn, P, root), stamp)));
    const ON_MIDDLE = [32.8046875, 100.18359375];
    const ON_CARD = [36.20703125, 99.5859375];
    const ON_ROW = [36.20703125, 99.5859375];
    // `piece` 1 and 3 lie left of the frame, 14 right of it, 6 under it; `middle` under it.
    const expected = (on: number[], six: number[]) => [
      {
        lines: [
          [0, 364.0390625, ...on],
          [4, 110.33544921875, ...ON_CARD],
        ],
        connectors: [[0, 364.0390625, 67.896484375, 110.33544921875, 67.896484375]],
      },
      {
        lines: [
          [1, 414.0390625, ...on],
          [5, 210.33544921875, ...ON_CARD],
        ],
        connectors: [[1, 414.0390625, 67.896484375, 210.33544921875, 67.896484375]],
      },
      {
        lines: [
          [2, 464.0390625, ...on],
          [6, 464.0390625, ...six],
        ],
        connectors: [],
      },
      {
        lines: [
          [3, 764.0390625, ...on],
          [7, 904.0390625, ...ON_CARD],
        ],
        connectors: [[3, 764.0390625, 67.896484375, 904.0390625, 67.896484375]],
      },
    ];
    expect(stamps(null)).toEqual(expected(ON_MIDDLE, ON_MIDDLE));
    expect(stamps(raised)).toEqual(expected(ON_ROW, ON_CARD));
  });

  it("hits a coordinate where it is drawn and nowhere else", () => {
    const hits = (root: string | null) => {
      const lines = matchLinesOf(drawn, P, root);
      const { connectors } = overlayOf(P, lines, { origin: { x: 40, y: 80 }, scale: 1 }, SCREEN);
      return [
        { x: 110.33544921875, y: 85.18359375 },
        { x: 464.0390625, y: 74 },
        { x: 464.0390625, y: 91.40234375 },
        { x: 210.33544921875, y: 80 },
        { x: 904.0390625, y: 85.18359375 },
        { x: 414.0390625, y: 51.20703125 },
      ].map((point) => {
        const hit = matchHitAt(P, lines, connectors, point, 8);
        return hit === null
          ? null
          : [hit.stamp, hit.coordinate, hit.anchor, hit.distance, hit.at.x, hit.at.y, hit.at.top];
      });
    };
    expect(hits(null)).toEqual([
      [0, 4, null, 0, 110.33544921875, 85.18359375, 36.20703125],
      [2, 6, null, 0, 464.0390625, 85.18359375, 32.8046875],
      [2, 6, null, 0, 464.0390625, 85.18359375, 32.8046875],
      [1, 5, null, 0, 210.33544921875, 85.18359375, 36.20703125],
      [3, 7, null, 0, 904.0390625, 85.18359375, 36.20703125],
      [1, 1, null, 0, 414.0390625, 47.20703125, 32.8046875],
    ]);
    expect(hits(raised)).toEqual([
      [0, 4, null, 0, 110.33544921875, 85.18359375, 36.20703125],
      [2, 6, null, 0, 464.0390625, 85.18359375, 36.20703125],
      [2, 6, null, 0, 464.0390625, 85.18359375, 36.20703125],
      [1, 5, null, 0, 210.33544921875, 85.18359375, 36.20703125],
      [3, 7, null, 0, 904.0390625, 85.18359375, 36.20703125],
      [1, 1, null, 0, 414.0390625, 51.20703125, 36.20703125],
    ]);
  });

  it("has its screen place left of the frame, raised or not", () => {
    const piece3 = { timeline: "piece", value: fraction(3) };
    const middle1 = { timeline: "middle", value: fraction(1) };
    const left = { x: 210.33544921875, y: 85.18359375 };
    expect([screenPlace(drawn, piece3), screenPlace(drawn, piece3, raised)]).toEqual([left, left]);
    expect(screenPlace(drawn, middle1)).toEqual({ x: 414.0390625, y: 47.20703125 });
    expect(screenPlace(drawn, middle1, raised)).toEqual({ x: 414.0390625, y: 51.20703125 });
    expect(inScreenOrder(drawn, [piece3, middle1], (item) => item)).toEqual([middle1, piece3]);
    expect(inScreenOrder(drawn, [piece3, middle1], (item) => item, raised)).toEqual([
      middle1,
      piece3,
    ]);
  });

  it("is seen on its ancestor line alone where every ancestor card is hidden", () => {
    const hidden = withoutAncestorCards(parent);
    const plain = drawingOf(blockIn(hidden, A), hidden.graphical, metrics);
    const [key, line] = [...lineAxes(plain)].find(([, axis]) => axis.timeline === "piece") ?? [];
    if (key === undefined || line === undefined) throw new Error("no line of piece");
    expect([line.card, line.start, line.drawnLength, line.xEnd - line.xStart]).toEqual([
      { item: "group_1", member: "middle" },
      Rational.of([4, 1]),
      Rational.of([8, 1]),
      400,
    ]);
    const lines = matchLinesOf(plain, P);
    expect(lines.byTimeline.get(1)?.map(({ key: at, from, to }) => [at, from, to])).toEqual([
      [key, 4, 12],
    ]);
    // The ancestor line's coordinate line spans `middle`'s card, as `middle`'s line's does.
    const card = plain.boxes.find(
      (box) => box.kind === "card" && box.key?.item === "group_1" && box.key.member === "middle",
    );
    if (card === undefined) throw new Error("no card of middle");
    const x = line.xStart + 100;
    expect(shape(stampOverlay(P, lines, 2)).lines.at(-1)).toEqual([
      6,
      x,
      card.y,
      card.y + card.height,
    ]);
    expect(screenPlace(plain, { timeline: "piece", value: fraction(6) })).toEqual({
      x,
      y: line.y,
    });
  });
});

describe("the flag", () => {
  /** A row of a coordinate of the index. */
  const row = (coordinate: number, text: string) => ({ key: String(coordinate), coordinate, text });

  it("groups by timeline in screen order, what is not drawn last", () => {
    expect(matchFlag(T, manifest, linesOf(T), 0, 3)).toEqual([
      { key: "2", timeline: "score", name: "Score", rows: [row(2, "6 ♩")] },
      {
        key: "4",
        timeline: "take_1",
        name: "Take 1",
        rows: [row(4, "176 400 smp"), row(5, "264 600 smp")],
      },
      { key: "0", timeline: "take_2", name: "Take 2", rows: [row(0, "297 675 smp")] },
      { key: "6", timeline: "other", name: "other", rows: [row(6, "0.5")] },
    ]);
    expect(matchFlag(T, manifest, linesOf(T), 1, 3)).toEqual([
      { key: "1", timeline: "score", name: "Score", rows: [row(1, "4 ♩")] },
      { key: "3", timeline: "take_1", name: "Take 1", rows: [row(3, "88 200 smp")] },
    ]);
  });

  describe("of a MatchStamp crossing groupstamps", () => {
    const grouped = viewOf({ id: A, fixture: GROUPSTAMP_FIXTURE, x: 40, y: 80 });
    const block = blockIn(grouped, A);
    const drawing = drawingOf(block, grouped.graphical, metrics);
    const lines = matchLinesOf(drawing, G);
    const groups = {
      block: A,
      granularity: DEFAULT_GRANULARITY,
      groupstampAt: namedGroupstamps(block.manifest, G),
    };
    /** A row a groupstamp reads on another member: its timeline and exact value as its key. */
    const read = (timeline: string, value: string, text: string) => ({
      key: `${timeline} ${value}`,
      coordinate: null,
      text,
    });
    const flagOf = (stamp: number, reading: typeof groups | null) =>
      matchFlag(G, block.manifest, lines, stamp, 3, reading).map(({ timeline, rows }) => [
        timeline,
        rows,
      ]);

    it("lists every coordinate its groupstamps read, in the order they are drawn, a timeline once per run", () => {
      expect(flagOf(0, groups)).toEqual([
        ["score", [row(0, "4 ♩")]],
        ["performance", [row(2, "1″"), read("performance", "2", "2″")]],
        ["page", [read("page", "400", "400 px")]],
      ]);
      expect(flagOf(1, groups)).toEqual([
        ["score", [row(1, "6 ♩")]],
        ["performance", [read("performance", "3", "3″")]],
        ["second-half", [read("second-half", "0", "0 ♩")]],
        ["score", [read("score", "4", "4 ♩")]],
        ["page", [row(5, "400 px"), read("page", "600", "600 px")]],
      ]);
      expect(
        matchFlag(G, block.manifest, lines, 1, 3, groups).map(({ key, name }) => [key, name]),
      ).toEqual([
        ["1", "Score"],
        ["performance 3", "Performance"],
        ["second-half 0", "Second half"],
        ["score 4", "Score"],
        ["5", "Page"],
      ]);
      expect(flagOf(2, groups)).toEqual([
        ["second-half", [row(4, "2 ♩")]],
        ["score", [read("score", "6", "6 ♩")]],
        ["performance", [row(3, "3″")]],
      ]);
    });

    it("says a member the group gives no value has none, in its row's place", () => {
      const unknown = changed(grouped, {
        type: "set",
        changes: [{ target: inBlock(A, idAddress("performance")), values: { length: null } }],
      });
      const unknownBlock = blockIn(unknown, A);
      const unknownLines = matchLinesOf(drawingOf(unknownBlock, unknown.graphical, metrics), G);
      const unknownGroups = { ...groups, groupstampAt: namedGroupstamps(unknownBlock.manifest, G) };
      const flag = (stamp: number) =>
        matchFlag(G, unknownBlock.manifest, unknownLines, stamp, 3, unknownGroups).map(
          ({ timeline, rows }) => [timeline, rows],
        );
      expect(flag(0)).toEqual([
        ["score", [row(0, "4 ♩")]],
        ["performance", [row(2, "1″"), read("performance", "2", VALUELESS_TEXT)]],
        ["page", [read("page", "400", "400 px")]],
      ]);
      expect(flag(1)).toEqual([
        ["score", [row(1, "6 ♩")]],
        ["performance", [read("performance", "3", VALUELESS_TEXT)]],
        ["second-half", [read("second-half", "0", "0 ♩")]],
        ["score", [read("score", "4", "4 ♩")]],
        ["page", [row(5, "400 px"), read("page", "600", "600 px")]],
      ]);
      expect(flag(2)).toEqual([
        ["second-half", [row(4, "2 ♩")]],
        ["score", [read("score", "6", VALUELESS_TEXT)]],
        ["performance", [row(3, "3″")]],
      ]);
    });

    it("lists the MatchStamp's own coordinates alone inside a timeline editor", () => {
      expect(flagOf(0, null)).toEqual([
        ["score", [row(0, "4 ♩")]],
        ["performance", [row(2, "1″")]],
      ]);
      expect(flagOf(1, null)).toEqual([
        ["score", [row(1, "6 ♩")]],
        ["page", [row(5, "400 px")]],
      ]);
    });
  });
});

describe("the pinned MatchStamp by colour", () => {
  const parts = (stamp: number, beliefs: Uint8Array | undefined) =>
    pinnedOverlays(T, stampOverlay(T, linesOf(T), stamp), beliefs).map(
      ({ belief, stroke, overlay }) => [belief, stroke, shape(overlay)],
    );

  it("draws each connector by the belief in its MatchClaims, the lines blue", () => {
    expect(parts(0, BELIEVED)).toEqual([
      [
        "true",
        "#339933",
        { lines: [], connectors: [[3, AT_300, SCORE_BOTTOM, AT_300, TAKE_1_TOP]] },
      ],
      [
        "undecided",
        "#1BA1E2",
        {
          lines: [
            [0, AT_300, TAKE_2_TOP, TAKE_2_BOTTOM],
            [2, AT_300, SCORE_TOP, SCORE_BOTTOM],
            [4, AT_200, TAKE_1_TOP, TAKE_1_BOTTOM],
            [5, AT_300, TAKE_1_TOP, TAKE_1_BOTTOM],
          ],
          connectors: [[0, AT_300, TAKE_2_TOP, AT_200, TAKE_1_BOTTOM]],
        },
      ],
      [
        "false",
        "#E51400",
        { lines: [], connectors: [[1, AT_300, TAKE_2_TOP, AT_300, TAKE_1_BOTTOM]] },
      ],
    ]);
    expect(parts(1, BELIEVED)).toEqual([
      [
        "undecided",
        "#1BA1E2",
        {
          lines: [
            [1, AT_200, SCORE_TOP, SCORE_BOTTOM],
            [3, AT_100, TAKE_1_TOP, TAKE_1_BOTTOM],
          ],
          connectors: [],
        },
      ],
      [
        "unlikely",
        "#E07000",
        { lines: [], connectors: [[2, AT_200, SCORE_BOTTOM, AT_100, TAKE_1_TOP]] },
      ],
    ]);
  });

  it("draws every connector undecided without beliefs, once per overlay and beliefs", () => {
    const overlay = stampOverlay(T, linesOf(T), 0);
    const whole = pinnedOverlays(T, overlay, undefined);
    expect(whole.map(({ belief, overlay: part }) => [belief, part])).toEqual([
      ["undecided", overlay],
    ]);
    expect(pinnedOverlays(T, overlay, undefined)).toBe(whole);
    const byBelief = pinnedOverlays(T, overlay, BELIEVED);
    expect(pinnedOverlays(T, overlay, BELIEVED)).toBe(byBelief);
  });
});

describe("named MatchStamps painted", () => {
  const key = (id: string, part?: "line" | "name") =>
    addressKey(part === undefined ? idAddress(id) : partAddress(idAddress(id), part));
  const stroke = (colour: string) => ({ attribute: "stroke", colour, marked: false });
  const RED = stroke("#E51400");

  it("draws an anchor by its belief and a MatchStamp out of date all red", () => {
    expect(NAMED.map(({ comparison }) => comparison.stated)).toEqual([[2], [null]]);
    expect(NAMED.map(({ comparison }) => comparison.outOfDate)).toEqual([false, true]);
    const outOfDate = [
      [key("anchor_2"), RED],
      [key("anchor_2", "name"), { attribute: "fill", colour: "#E51400", marked: true }],
      [key("timestamp_1", "line"), RED],
      [key("timestamp_3", "line"), RED],
    ];
    expect([...namedPaint(manifest, NAMED, undefined)]).toEqual([
      [key("anchor_1"), stroke("#1BA1E2")],
      ...outOfDate,
    ]);
    const painted = namedPaint(manifest, NAMED, BELIEVED);
    expect([...painted]).toEqual([[key("anchor_1"), stroke("#E07000")], ...outOfDate]);
    expect(namedPaint(manifest, NAMED, BELIEVED)).toBe(painted);
  });

  it("marks the name label of one out of date", () => {
    expect([...namedPaint(manifest, NAMED_IN_D, undefined)]).toEqual([
      [key("anchor_1"), RED],
      [key("anchor_1", "name"), { attribute: "fill", colour: "#E51400", marked: true }],
      [key("timestamp_1", "line"), RED],
      [key("timestamp_2", "line"), RED],
    ]);
  });
});

describe("what a press on a match timestamp's line selects", () => {
  const line = (id: string) => partAddress(idAddress(id), "line");
  const stamps = manifest.graphical?.matchstamps ?? [];
  const [first, second] = stamps;
  if (first === undefined || second === undefined) throw new Error("two named MatchStamps");
  const withStamps = (matchstamps: typeof stamps): Manifest => ({
    ...manifest,
    graphical: { ...manifest.graphical, matchstamps },
  });
  const [anchor] = first.alignment_anchors;
  const unnamed = {
    ...first,
    alignment_anchors: [{ ...anchor, display: ["line"] }] as const,
  };

  it("selects the MatchStamp whose anchor shows the name, else the first", () => {
    expect(holdingMatchStamp(manifest, "timestamp_1")).toBe("matchstamp_1");
    expect(holdingMatchStamp(manifest, "timestamp_3")).toBe("matchstamp_2");
    expect(holdingMatchStamp(manifest, "timestamp_4")).toBeUndefined();
    expect(holdingMatchStamp(withStamps([unnamed, second]), "timestamp_1")).toBe("matchstamp_1");
    expect(holdingMatchStamp(withStamps([second, first]), "timestamp_1")).toBe("matchstamp_1");
    expect(holdingMatchStamp(withStamps([second, unnamed]), "timestamp_1")).toBe("matchstamp_2");
  });

  it("owns the line as the timestamp and selects the MatchStamp with it", () => {
    expect(ownerOf(manifest, line("timestamp_1"))).toEqual({
      address: idAddress("timestamp_1"),
      kind: "timestamp",
      match: true,
      selects: idAddress("matchstamp_1"),
    });
    expect(ownerOf(manifest, line("timestamp_3"))?.selects).toEqual(idAddress("matchstamp_2"));
    expect(ownerOf(manifest, partAddress(idAddress("timestamp_3"), "name"))?.selects).toEqual(
      idAddress("timestamp_3"),
    );
    expect(ownerOf(manifest, partAddress(idAddress("timestamp_4"), "coordinate"))).toEqual({
      address: idAddress("timestamp_4"),
      kind: "timestamp",
      match: false,
      selects: idAddress("timestamp_4"),
    });
    expect(ownerOf(manifest, partAddress(idAddress("anchor_1"), "name"))).toEqual({
      address: idAddress("matchstamp_1"),
      kind: "matchstamp",
      match: true,
      selects: idAddress("matchstamp_1"),
    });
  });
});
