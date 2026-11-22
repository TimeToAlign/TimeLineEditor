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
import { A, blockIn, changed, metrics, viewOf, withoutAncestorCards } from "./support.ts";

const view = viewOf({ id: A, fixture: "bundles/bundle_matchstamps", x: 40, y: 80 });
const manifest: Manifest = blockIn(view, A).manifest;
const drawing: Drawing = drawingOf(blockIn(view, A), view.graphical, metrics);
const PLACED = { origin: { x: 40, y: 80 }, scale: 1 };
const SCREEN: Screen = { x: 0, y: 0, zoom: 1, width: 1000, height: 600, ratio: 1 };

/** The lines' ordinates and the abscissas of `README.md`. */
const SCORE_Y = 43.20703125;
const TAKE_1_Y = 100.5859375;
const TAKE_2_Y = 157.96484375;
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
      [SCORE, placeKeyText({ item: "score" }), SCORE_Y, SCORE_Y, SCORE_Y, X_START, X_START + 400],
      [
        TAKE_1,
        placeKeyText({ item: "take_1" }),
        TAKE_1_Y,
        TAKE_1_Y,
        TAKE_1_Y,
        X_START,
        X_START + 400,
      ],
      [
        TAKE_2,
        placeKeyText({ item: "take_2" }),
        TAKE_2_Y,
        TAKE_2_Y,
        TAKE_2_Y,
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
        [1, AT_200, SCORE_Y, SCORE_Y],
        [2, AT_300, SCORE_Y, SCORE_Y],
        [3, AT_100, TAKE_1_Y, TAKE_1_Y],
        [4, AT_200, TAKE_1_Y, TAKE_1_Y],
        [5, AT_300, TAKE_1_Y, TAKE_1_Y],
        [0, AT_300, TAKE_2_Y, TAKE_2_Y],
      ],
      connectors: [
        [2, AT_200, SCORE_Y, AT_100, TAKE_1_Y],
        [3, AT_300, SCORE_Y, AT_300, TAKE_1_Y],
        [0, AT_300, TAKE_2_Y, AT_200, TAKE_1_Y],
        [1, AT_300, TAKE_2_Y, AT_300, TAKE_1_Y],
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
        "M261.0928 43.207V43.207",
        "M361.0928 43.207V43.207",
        "M161.0928 100.5859V100.5859",
        "M261.0928 100.5859V100.5859",
        "M361.0928 100.5859V100.5859",
        "M361.0928 157.9648V157.9648",
        "M261.0928 43.207L161.0928 100.5859",
        "M361.0928 43.207L361.0928 100.5859",
        "M361.0928 157.9648L261.0928 100.5859",
        "M361.0928 157.9648L361.0928 100.5859",
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
    expect(hit(AT_300 + 3, SCORE_Y - 3)).toEqual({
      stamp: 0,
      coordinate: 2,
      anchor: null,
      distance: Math.hypot(3, 3),
      at: { x: AT_300, y: SCORE_Y, top: SCORE_Y },
    });
  });

  it("hovers a connector nearer than any line", () => {
    expect(hit(AT_300 + 4, SCORE_Y + 3)).toEqual({
      stamp: 0,
      coordinate: null,
      anchor: 3,
      distance: 4,
      at: { x: AT_300, y: SCORE_Y + 3, top: SCORE_Y + 3 },
    });
    const found = hit(311.0927734375, 134.275390625);
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
        [0, AT_300, TAKE_2_Y, TAKE_2_Y],
        [2, AT_300, SCORE_Y, SCORE_Y],
        [4, AT_200, TAKE_1_Y, TAKE_1_Y],
        [5, AT_300, TAKE_1_Y, TAKE_1_Y],
      ],
      connectors: [
        [0, AT_300, TAKE_2_Y, AT_200, TAKE_1_Y],
        [1, AT_300, TAKE_2_Y, AT_300, TAKE_1_Y],
        [3, AT_300, SCORE_Y, AT_300, TAKE_1_Y],
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
  /** The extents and the frame's spans of `score`'s lines, `group_1`'s then `group_2`'s. */
  const scoreAt = (c: number, x: number) => [
    [c, x, 61.609375, 82.609375],
    [c, x, 53.609375, 61.609375],
    [c, x, 82.609375, 174.96484375],
    [c, x, 223.76953125, 244.76953125],
    [c, x, 215.76953125, 223.76953125],
    [c, x, 244.76953125, 337.125],
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
      [2, AT_1, 139.98828125, 139.98828125],
    ]);
    expect(shape(stampOverlay(G, groupedLines, 1, named)).lines).toEqual([
      ...scoreAt(1, AT_3),
      [5, AT_2, 302.1484375, 302.1484375],
      [5, AT_2, 215.76953125, 337.125],
    ]);
    expect(shape(stampOverlay(G, groupedLines, 2, named)).lines).toEqual([
      [3, AT_3, 139.98828125, 139.98828125],
      [3, AT_3, 53.609375, 174.96484375],
      [4, AT_3, 68.609375, 68.609375],
      [4, AT_3, 230.76953125, 230.76953125],
    ]);
  });

  it("draws exactly layout's groupstamp pieces, and the named groupstamp's", () => {
    for (let stamp = 0; stamp < G.matchStamps.count; stamp += 1) {
      const plain = stampOverlay(G, groupedLines, stamp).lines;
      const expected = plain.flatMap((piece) => {
        const line = lineOf(piece);
        if (line === undefined) throw new Error("a piece on no line");
        const across = named(piece.coordinate)
          ? groupCrossSections(groupedDrawing, line.key, piece.x).map(({ y1, y2 }) => ({
              coordinate: piece.coordinate,
              x: piece.x,
              y1,
              y2,
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
      [1, AT_3, 61.609375, 82.609375],
      [1, AT_3, 223.76953125, 244.76953125],
      [5, AT_2, 302.1484375, 302.1484375],
    ]);
    for (const stamp of [0, 1]) {
      expect(stampOverlay(T, linesOf(T), stamp, namedGroupstamps(manifest, T))).toEqual(
        stampOverlay(T, linesOf(T), stamp),
      );
    }
  });

  it("keeps the potential MatchStamps' overlay as it is", () => {
    expect(shape(overlayOf(G, groupedLines, PLACED, SCREEN)).lines).toEqual([
      [0, AT_2, 61.609375, 82.609375],
      [1, AT_3, 61.609375, 82.609375],
      [2, AT_1, 139.98828125, 139.98828125],
      [3, AT_3, 139.98828125, 139.98828125],
      [0, AT_2, 223.76953125, 244.76953125],
      [1, AT_3, 223.76953125, 244.76953125],
      [5, AT_2, 302.1484375, 302.1484375],
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
    expect(screenPlace(drawn, middle4)).toEqual({ x: 460.33544921875, y: 81.78125 });
    expect(screenPlace(drawn, piece8)).toEqual({ x: 460.33544921875, y: 67.78125 });
    expect(screenPlace(drawn, at("piece", Rational.of([1, 1])))).toEqual({
      x: 110.33544921875,
      y: 67.78125,
    });
    expect(inScreenOrder(drawn, [middle4, piece8], (item) => item)).toEqual([piece8, middle4]);
  });
});

describe("screen order of a grandchild and its two ancestors", () => {
  const grandchild = viewOf({ id: A, fixture: "groups/group_grandchild", x: 40, y: 80 });
  const at = (timeline: string, value: CoordinateValue): ScreenCoordinate => ({ timeline, value });
  const score28 = at("score", Rational.of([28, 1]));
  const movement12 = at("movement", Rational.of([12, 1]));
  const theme4 = at("theme", Rational.of([4, 1]));

  it("places each on the line the user sees in the grandchild's card", () => {
    const drawn = drawingOf(blockIn(grandchild, A), grandchild.graphical, metrics);
    expect([score28, movement12, theme4].map((item) => screenPlace(drawn, item))).toEqual([
      { x: 1482.265625, y: 70.9765625 },
      { x: 1482.265625, y: 104.953125 },
      { x: 1482.265625, y: 118.953125 },
    ]);
    expect(inScreenOrder(drawn, [movement12, score28, theme4], (item) => item)).toEqual([
      score28,
      movement12,
      theme4,
    ]);
  });

  it("keeps that order with every ancestor card hidden", () => {
    const hidden = withoutAncestorCards(grandchild);
    const drawn = drawingOf(blockIn(hidden, A), hidden.graphical, metrics);
    expect([score28, movement12, theme4].map((item) => screenPlace(drawn, item)?.y)).toEqual([
      67.78125, 101.7578125, 115.7578125,
    ]);
    expect(inScreenOrder(drawn, [movement12, score28, theme4], (item) => item)).toEqual([
      score28,
      movement12,
      theme4,
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
  const LEFT = 156.6318359375;
  const RIGHT = 700.33544921875;
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

  it("covers the card's line by the frame, so the cases leave two gaps", () => {
    expect([(LEFT - 60.33544921875) / 50, (RIGHT - 60.33544921875) / 50]).toEqual([
      1.925927734375, 12.8,
    ]);
    expect(
      seenOn(drawn, "piece", null).map(({ section, xFrom, xTo }) => [section, xFrom, xTo]),
    ).toEqual([
      ['["group_1","middle"]{"id":"middle"}', 260.33544921875, 660.33544921875],
      ['["group_1","piece"]{"id":"piece"}', 60.33544921875, LEFT],
      ['["group_1","piece"]{"id":"piece"}', RIGHT, 860.33544921875],
    ]);
    expect(seenOn(drawn, "piece", raised).map(({ xFrom, xTo }) => [xFrom, xTo])).toEqual([
      [60.33544921875, 860.33544921875],
    ]);
    expect(
      seenOn(drawn, "middle", raised).map(({ key, section, xFrom, xTo }) => [
        key,
        section,
        xFrom,
        xTo,
      ]),
    ).toEqual([[CARD_MIDDLE_ROW, CARD_MIDDLE_ROW, 260.33544921875, 660.33544921875]]);
  });

  it("draws a member on its own card's line, the root on its ancestor line and beyond the frame", () => {
    expect(linesIn(null)).toEqual([
      [MIDDLE_CARD, 1, 67.78125, 67.78125, 81.78125, 260.33544921875, 4, 12],
      [MIDDLE_CARD, 0, 81.78125, 67.78125, 81.78125, 260.33544921875, 0, 8],
      [PIECE_CARD, 1, 67.78125, 26.8046875, 67.78125, 60.33544921875, 0, 1.925927734375],
      [PIECE_CARD, 1, 67.78125, 26.8046875, 67.78125, 60.33544921875, 12.8, 16],
    ]);
  });

  it("draws the root on the card's line and the member on the card's row while the card is raised", () => {
    expect(linesIn(raised)).toEqual([
      [PIECE_CARD, 1, 67.78125, 26.8046875, 67.78125, 60.33544921875, 0, 16],
      [PIECE_CARD, 0, 33.8046875, 33.8046875, 33.8046875, 260.33544921875, 0, 8],
    ]);
  });

  it("draws each MatchStamp where its coordinates are seen", () => {
    const stamps = (root: string | null) =>
      [0, 1, 2, 3].map((stamp) => shape(stampOverlay(P, matchLinesOf(drawn, P, root), stamp)));
    const ON_MIDDLE = [67.78125, 81.78125];
    const ON_CARD = [26.8046875, 67.78125];
    expect(stamps(null)).toEqual([
      {
        lines: [
          [0, 260.33544921875, ...ON_MIDDLE],
          [4, 110.33544921875, ...ON_CARD],
        ],
        connectors: [[0, 260.33544921875, 67.78125, 110.33544921875, 67.78125]],
      },
      { lines: [[1, 310.33544921875, ...ON_MIDDLE]], connectors: [] },
      {
        lines: [
          [2, 360.33544921875, ...ON_MIDDLE],
          [6, 360.33544921875, ...ON_MIDDLE],
        ],
        connectors: [],
      },
      {
        lines: [
          [3, 660.33544921875, ...ON_MIDDLE],
          [7, 760.33544921875, ...ON_CARD],
        ],
        connectors: [[3, 660.33544921875, 67.78125, 760.33544921875, 67.78125]],
      },
    ]);
    const ON_ROW = [33.8046875, 33.8046875];
    expect(stamps(raised)).toEqual([
      {
        lines: [
          [0, 260.33544921875, ...ON_ROW],
          [4, 110.33544921875, ...ON_CARD],
        ],
        connectors: [[0, 260.33544921875, 33.8046875, 110.33544921875, 33.8046875]],
      },
      {
        lines: [
          [1, 310.33544921875, ...ON_ROW],
          [5, 210.33544921875, ...ON_CARD],
        ],
        connectors: [[1, 310.33544921875, 33.8046875, 210.33544921875, 33.8046875]],
      },
      {
        lines: [
          [2, 360.33544921875, ...ON_ROW],
          [6, 360.33544921875, ...ON_CARD],
        ],
        connectors: [],
      },
      {
        lines: [
          [3, 660.33544921875, ...ON_ROW],
          [7, 760.33544921875, ...ON_CARD],
        ],
        connectors: [[3, 660.33544921875, 33.8046875, 760.33544921875, 33.8046875]],
      },
    ]);
  });

  it("hits a coordinate where it is drawn and nowhere else", () => {
    const hits = (root: string | null) => {
      const lines = matchLinesOf(drawn, P, root);
      const { connectors } = overlayOf(P, lines, { origin: { x: 40, y: 80 }, scale: 1 }, SCREEN);
      return [
        { x: 110.33544921875, y: 67.78125 },
        { x: 360.33544921875, y: 74 },
        { x: 360.33544921875, y: 81.78125 },
        { x: 210.33544921875, y: 40 },
        { x: 760.33544921875, y: 67.78125 },
        { x: 310.33544921875, y: 33.8046875 },
      ].map((point) => {
        const hit = matchHitAt(P, lines, connectors, point, 8);
        return hit === null
          ? null
          : [hit.stamp, hit.coordinate, hit.anchor, hit.distance, hit.at.x, hit.at.y, hit.at.top];
      });
    };
    expect(hits(null)).toEqual([
      [0, 4, null, 0, 110.33544921875, 67.78125, 26.8046875],
      [2, 6, null, 0, 360.33544921875, 67.78125, 67.78125],
      [2, 6, null, 0, 360.33544921875, 67.78125, 67.78125],
      null,
      [3, 7, null, 0, 760.33544921875, 67.78125, 26.8046875],
      null,
    ]);
    expect(hits(raised)).toEqual([
      [0, 4, null, 0, 110.33544921875, 67.78125, 26.8046875],
      [2, 6, null, 6.21875, 360.33544921875, 67.78125, 26.8046875],
      null,
      [1, 5, null, 0, 210.33544921875, 67.78125, 26.8046875],
      [3, 7, null, 0, 760.33544921875, 67.78125, 26.8046875],
      [1, 1, null, 0, 310.33544921875, 33.8046875, 33.8046875],
    ]);
  });

  it("has no screen place in a gap, and its place on the card's line while the card is raised", () => {
    const piece3 = { timeline: "piece", value: fraction(3) };
    const middle1 = { timeline: "middle", value: fraction(1) };
    expect(screenPlace(drawn, piece3)).toBeNull();
    expect(screenPlace(drawn, piece3, raised)).toEqual({ x: 210.33544921875, y: 67.78125 });
    expect(screenPlace(drawn, middle1)).toEqual({ x: 310.33544921875, y: 81.78125 });
    expect(screenPlace(drawn, middle1, raised)).toEqual({ x: 310.33544921875, y: 33.8046875 });
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
    const middle = [...lineAxes(plain).values()].find((axis) => axis.timeline === "middle");
    const x = line.xStart + 100;
    expect(shape(stampOverlay(P, lines, 2)).lines.at(-1)).toEqual([6, x, line.y, middle?.y]);
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
      { timeline: "score", name: "Score", rows: [row(2, "6 ♩")] },
      {
        timeline: "take_1",
        name: "Take 1",
        rows: [row(4, "176 400 smp"), row(5, "264 600 smp")],
      },
      { timeline: "take_2", name: "Take 2", rows: [row(0, "297 675 smp")] },
      { timeline: "other", name: "other", rows: [row(6, "0.5")] },
    ]);
    expect(matchFlag(T, manifest, linesOf(T), 1, 3)).toEqual([
      { timeline: "score", name: "Score", rows: [row(1, "4 ♩")] },
      { timeline: "take_1", name: "Take 1", rows: [row(3, "88 200 smp")] },
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

    it("lists every coordinate its groupstamps read, in the order they are drawn", () => {
      expect(flagOf(0, groups)).toEqual([
        ["score", [row(0, "4 ♩")]],
        ["performance", [row(2, "1″"), read("performance", "2", "2″")]],
        ["page", [read("page", "400", "400 px")]],
      ]);
      expect(flagOf(1, groups)).toEqual([
        ["score", [row(1, "6 ♩"), read("score", "4", "4 ♩")]],
        ["performance", [read("performance", "3", "3″")]],
        ["second-half", [read("second-half", "0", "0 ♩")]],
        ["page", [row(5, "400 px"), read("page", "600", "600 px")]],
      ]);
      expect(flagOf(2, groups)).toEqual([
        ["second-half", [row(4, "2 ♩")]],
        ["score", [read("score", "6", "6 ♩")]],
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
      ["true", "#339933", { lines: [], connectors: [[3, AT_300, SCORE_Y, AT_300, TAKE_1_Y]] }],
      [
        "undecided",
        "#1BA1E2",
        {
          lines: [
            [0, AT_300, TAKE_2_Y, TAKE_2_Y],
            [2, AT_300, SCORE_Y, SCORE_Y],
            [4, AT_200, TAKE_1_Y, TAKE_1_Y],
            [5, AT_300, TAKE_1_Y, TAKE_1_Y],
          ],
          connectors: [[0, AT_300, TAKE_2_Y, AT_200, TAKE_1_Y]],
        },
      ],
      ["false", "#E51400", { lines: [], connectors: [[1, AT_300, TAKE_2_Y, AT_300, TAKE_1_Y]] }],
    ]);
    expect(parts(1, BELIEVED)).toEqual([
      [
        "undecided",
        "#1BA1E2",
        {
          lines: [
            [1, AT_200, SCORE_Y, SCORE_Y],
            [3, AT_100, TAKE_1_Y, TAKE_1_Y],
          ],
          connectors: [],
        },
      ],
      ["unlikely", "#E07000", { lines: [], connectors: [[2, AT_200, SCORE_Y, AT_100, TAKE_1_Y]] }],
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
