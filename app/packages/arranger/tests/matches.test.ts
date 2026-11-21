/**
 * Show matches: where the potential MatchStamps of a table are drawn in a
 * block, what a view draws of them, what the pointer hovers, the flag, the
 * colours of the pinned and the named MatchStamps, and what a press on a
 * match timestamp's line selects. Derived in `README.md` ("Show matches").
 */

import type { AnchorIndex, Manifest } from "@timetoalign/tilie-core";
import { addressKey, idAddress, inBlock, partAddress, placeKeyText } from "@timetoalign/tilie-core";
import type { CoordinateValue } from "@timetoalign/tilie-core/numbers";
import { Rational } from "@timetoalign/tilie-core/numbers";
import type { AnchorElement, Drawing } from "@timetoalign/tilie-layout";
import { lineAxes } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { drawingOf } from "../src/drawing.ts";
import type { MatchLines, MatchOverlay, Screen, ScreenCoordinate } from "../src/matches.ts";
import {
  inScreenOrder,
  matchFlag,
  matchHitAt,
  matchLinesOf,
  namedPaint,
  overlayOf,
  pathOf,
  pinnedOverlays,
  screenOrder,
  screenPlace,
  stampOverlay,
} from "../src/matches.ts";
import { holdingMatchStamp, ownerOf } from "../src/selectionRules.ts";
import { BELIEVED, D, NAMED, NAMED_IN_D, OTHER, SCORE, T, TAKE_1, TAKE_2 } from "./matchTables.ts";
import { A, blockIn, changed, metrics, viewOf } from "./support.ts";

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
});

describe("the flag", () => {
  it("groups by timeline in screen order, what is not drawn last", () => {
    expect(matchFlag(T, manifest, linesOf(T), 0, 3)).toEqual([
      { timeline: "score", name: "Score", rows: [{ coordinate: 2, text: "6 ♩" }] },
      {
        timeline: "take_1",
        name: "Take 1",
        rows: [
          { coordinate: 4, text: "176 400 smp" },
          { coordinate: 5, text: "264 600 smp" },
        ],
      },
      { timeline: "take_2", name: "Take 2", rows: [{ coordinate: 0, text: "297 675 smp" }] },
      { timeline: "other", name: "other", rows: [{ coordinate: 6, text: "0.5" }] },
    ]);
    expect(matchFlag(T, manifest, linesOf(T), 1, 3)).toEqual([
      { timeline: "score", name: "Score", rows: [{ coordinate: 1, text: "4 ♩" }] },
      { timeline: "take_1", name: "Take 1", rows: [{ coordinate: 3, text: "88 200 smp" }] },
    ]);
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
