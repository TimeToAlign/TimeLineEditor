/**
 * Arrangements (`docs/drawing.md` in TimeToShare, sections 1, 8.5, 8.6 and
 * 8.8, Drawn once): packing, a block one under another in its item order,
 * side by side with every root drawn once behind the row, and the fallback.
 */

import {
  type ItemArrangement,
  isLoadError,
  loadManifest,
  type Manifest,
} from "@timetoalign/tilie-core";
import { dumps, withFileIds } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { packed } from "../src/arrangement.ts";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnBox,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import { nth } from "../src/traversal.ts";
import { edit, loadFile, metrics, set } from "./support.ts";

/** A bundle fixture drawn under the defaults with `placement`'s members over the default ones. */
function drawn(name: string, placement: Partial<Placement> = {}): Drawing {
  return drawnManifest(loadFile(`bundles/${name}`), placement);
}

/** A manifest drawn under the defaults with `placement`'s members over the default ones. */
function drawnManifest(manifest: Manifest, placement: Partial<Placement> = {}): Drawing {
  return draw(
    manifest,
    { ...DEFAULT_PLACEMENT, ...placement },
    [DEFAULT_LAYER, manifestLayer(manifest)],
    metrics,
  );
}

const STORED = ["page", "group_3", "group_1", "group_2"];
const arranged = (direction: ItemArrangement["direction"]) => ({
  arrangement: { direction, order: STORED },
});

/** The item records (frames and block-held cards) in record order. */
const itemBoxes = (drawing: Drawing): DrawnBox[] =>
  drawing.boxes.filter((box) => box.item !== undefined);

describe("packing", () => {
  const sizes = [
    { width: 10, height: 5 },
    { width: 20, height: 15 },
    { width: 5, height: 8 },
    { width: 7, height: 3 },
    { width: 12, height: 9 },
  ];
  const start = { x: 1, y: 1 };
  it("one under another", () => {
    expect(packed(sizes, { direction: "vertical", gap: 2, start })).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 8 },
      { x: 1, y: 25 },
      { x: 1, y: 35 },
      { x: 1, y: 40 },
    ]);
  });
  it("side by side", () => {
    expect(packed(sizes, { direction: "horizontal", gap: 2, start })).toEqual([
      { x: 1, y: 1 },
      { x: 13, y: 1 },
      { x: 35, y: 1 },
      { x: 42, y: 1 },
      { x: 51, y: 1 },
    ]);
  });
  it("five contents in a matrix of two columns", () => {
    expect(packed(sizes, { direction: "matrix", gap: 2, start, columns: 2 })).toEqual([
      { x: 1, y: 1 },
      { x: 15, y: 1 },
      { x: 1, y: 18 },
      { x: 15, y: 18 },
      { x: 1, y: 28 },
    ]);
  });
  it("refuses a matrix without a positive whole number of columns, packs nothing to nothing", () => {
    expect(() => packed(sizes, { direction: "matrix", gap: 2, start, columns: 0 })).toThrow(
      RangeError,
    );
    expect(() => packed(sizes, { direction: "matrix", gap: 2, start, columns: 1.5 })).toThrow(
      RangeError,
    );
    expect(packed([], { direction: "horizontal", gap: 2, start })).toEqual([]);
  });
});

describe("vertical, in the item order", () => {
  const drawing = drawn("bundle_arranged_roots", {
    ...arranged("vertical"),
    places: { group_1: { x: 500, y: 300 } },
  });
  it("takes the items in the order and at their default places", () => {
    const items = itemBoxes(drawing);
    expect(items.map((box) => box.key?.item)).toEqual(STORED);
    // In place coordinates: the block grows to the left for the ancestor cards.
    const { origin } = drawing;
    expect(items.map((box) => box.x - origin.x)).toEqual([8, 8, 8, 8]);
    expect((items[0]?.y ?? 0) - origin.y).toBe(28.8046875);
    expect(items[2]?.item?.stated).toEqual({ x: 500, y: 300 });
    expect(items[2]?.item?.place.x).toBe(8);
  });
  it("states the arrangement and records the ancestor cards in the item order", () => {
    expect(drawing.arrangement).toEqual({ direction: "vertical", row: STORED, roots: [] });
    const cards = drawing.boxes.filter((box) => box.ancestor !== undefined);
    expect(cards.map((box) => box.ancestor?.group)).toEqual([
      "group_3",
      "group_3",
      "group_1",
      "group_1",
      "group_2",
    ]);
  });
});

describe("horizontal, the worked example of section 8.8", () => {
  const drawing = drawn("bundle_arranged_roots", arranged("horizontal"));
  it("states the row and the roots", () => {
    expect(drawing.arrangement).toEqual({
      direction: "horizontal",
      row: ["page", "group_1", "group_2", "group_3"],
      roots: ["score", "session"],
    });
  });
  it("packs the row and pads the cards", () => {
    const items = itemBoxes(drawing);
    expect(items.map((box) => [box.key?.item, box.x, box.y, box.height])).toEqual([
      ["page", 8, 28.8046875, 49.37890625],
      ["group_1", 623.39013671875, 28.8046875, 232.94140625],
      ["group_2", 1238.7802734375, 28.8046875, 157.5625],
      ["group_3", 1854.17041015625, 28.8046875, 232.94140625],
    ]);
    const card = (item: string, member: string) =>
      drawing.boxes.find((box) => box.key?.item === item && box.key.member === member)?.y;
    expect(card("group_1", "take_a")).toBe(186.3671875);
    expect(card("group_3", "take_b")).toBe(186.3671875);
    expect([drawing.width, drawing.height]).toEqual([2429.560546875, 283.72265625]);
    expect(drawing.origin).toEqual({ x: 0, y: 0 });
  });
  it("draws each root once, behind the first group hanging on it", () => {
    const cards = drawing.boxes.filter((box) => box.ancestor !== undefined);
    expect(cards.map((box) => [box.x, box.y, box.width, box.height, box.ancestor])).toEqual([
      [
        451.322265625,
        46.53515625,
        1947.517333984375,
        73.85546875,
        { group: "group_1", member: "exposition", groups: ["group_1", "group_2", "group_3"] },
      ],
      [
        525.13720703125,
        189.76953125,
        1873.42333984375,
        83.953125,
        { group: "group_1", member: "take_a", groups: ["group_1", "group_3"] },
      ],
    ]);
    expect(drawing.elements.filter((element) => element.type === "ancestor_card")).toHaveLength(2);
  });
  it("draws the root in runs, with seams and a gap between the anchors", () => {
    const runs = (id: string) =>
      drawing.axes
        .filter((axis) => axis.ancestor !== undefined && axis.address.id === id)
        .map((axis) => [axis.line, axis.xStart, axis.xEnd, String(axis.start), String(axis.end)]);
    expect(runs("score")).toEqual([
      [105.98828125, 750.7802734375, 1150.7802734375, "0", "16"],
      [105.98828125, 1366.17041015625, 1766.17041015625, "16", "32"],
      [105.98828125, 1981.560546875, 2381.560546875, "32", "48"],
    ]);
    expect(runs("exposition").map((run) => run[2])).toEqual([1150.7802734375]);
    expect(runs("development").map((run) => run[1])).toEqual([1366.17041015625]);
    expect(runs("session")).toEqual([
      [238.74609375, 750.7802734375, 1190.7802734375, "0", "33"],
      [238.74609375, 1234.8938802083335, 2381.560546875, "44", "130"],
    ]);
    const gaps = drawing.elisions
      .filter((exposure) => exposure.kind === "ancestor_card")
      .map((exposure) =>
        exposure.gaps.map((gap) => [gap.origin, gap.start, gap.end, gap.x1, gap.x2]),
      );
    expect(gaps).toEqual([[], [["arrangement", 33, 44, 1190.7802734375, 1234.8938802083335]]]);
    // A seam draws nothing, and `score`'s line runs whole across both.
    expect(
      drawing.elements.filter(
        (element) => element.type === "elision" && element.address.id === "score",
      ),
    ).toEqual([]);
    const lines = drawing.elements.flatMap((element) =>
      element.type === "timeline" && element.address.id === "score"
        ? [[element.xs, element.xe, element.cuts]]
        : [],
    );
    expect(lines).toEqual([[750.7802734375, 2381.560546875, []]]);
    const ellipses = drawing.elements.filter((element) => element.type === "ellipsis");
    expect(ellipses.map((each) => (each.type === "ellipsis" ? [each.x, each.y] : []))).toEqual([
      [1212.8370768229167, 231.74609375],
    ]);
    // Its name label, centred just below it (section 6.6).
    const label = drawing.elements.find(
      (element) => element.type === "label" && element.address.id === "session",
    );
    expect(label?.type === "label" && [label.x, label.baseline, label.text]).toEqual([
      1212.8370768229167,
      244.10009765625,
      "Session",
    ]);
  });
});

describe("a refused horizontal arrangement", () => {
  it("is drawn one under another in the item order and states the conflict", () => {
    const refused = drawn("bundle_arranged_conflict", {
      arrangement: { direction: "horizontal", order: [] },
    });
    expect(refused.arrangement).toEqual({
      direction: "horizontal",
      row: ["group_1", "group_2"],
      roots: [],
      refused: {
        groups: ["group_1", "group_2"],
        roots: ["score"],
        reason: '"Theme A" and "Theme B" overlap on "Score" (8–16 ♩)',
      },
    });
    const { arrangement, ...rest } = refused;
    expect(rest).toEqual(drawn("bundle_arranged_conflict"));
  });
});

describe("horizontal, nothing hanging on a root", () => {
  it("stands the items side by side at the first item's default top", () => {
    const row = drawn("bundle_ungrouped", {
      arrangement: { direction: "horizontal", order: ["score", "pages"] },
    });
    expect(row.arrangement).toEqual({
      direction: "horizontal",
      row: ["score", "pages", "recording"],
      roots: [],
    });
    expect(itemBoxes(row).map((box) => [box.key, box.x, box.y, box.width])).toEqual([
      [{ item: "score" }, 8, 28.8046875, 509.3271484375],
      [{ item: "pages" }, 565.3271484375, 28.8046875, 509.3271484375],
      [{ item: "recording" }, 1122.654296875, 28.8046875, 509.3271484375],
    ]);
    expect(row.boxes.filter((box) => box.ancestor !== undefined)).toEqual([]);
    expect([row.width, row.height]).toEqual([1641.9814453125, 120.7265625]);
  });
});

describe("horizontal, a shared root running on past its last frame (section 8.8)", () => {
  // The worked example's variant: `session` 160.0 seconds long runs on 30.0 past the end 130.0 of
  // `take_b`, the last stretch. Right of Recapitulation's frame, whose right edge `xr` is
  // 2421.560546875, `XO(t)` = `xr + (t − 130.0) × 400 / 30.0`: `s` = 130.0, since 131.0 lies more
  // than 8 right of `xr`, and `XO(160.0) − XO(130.0)` = 400 > 32, so an end gap leaves out 130.0
  // to 160.0, 32 wide from `xr`.
  const manifest = edit("bundles/bundle_arranged_roots", set("session", { length: 160.0 }));
  const drawing = drawnManifest(manifest, arranged("horizontal"));
  const xr = 2421.560546875;

  it("cuts an end gap 32 wide at the frame's right edge, its ellipsis at its middle", () => {
    const gaps = drawing.elisions
      .filter((exposure) => exposure.kind === "ancestor_card")
      .map((exposure) =>
        exposure.gaps.map((gap) => [gap.origin, gap.start, gap.end, gap.x1, gap.x2, gap.drawn]),
      );
    expect(gaps).toEqual([
      [],
      [
        ["arrangement", 33, 44, 1190.7802734375, 1234.8938802083335, 44.113606770833485],
        ["arrangement", 130, 160, xr, xr + 32, 32],
      ],
    ]);
    const ellipses = drawing.elements.filter((element) => element.type === "ellipsis");
    expect(ellipses.map((each) => (each.type === "ellipsis" ? each.x : null))).toEqual([
      1212.8370768229167, 2437.560546875,
    ]);
    const labels = drawing.elements.flatMap((element) =>
      element.type === "label" && element.address.id === "session"
        ? [[element.x, element.text]]
        : [],
    );
    expect(labels).toEqual([
      [1212.8370768229167, "Session"],
      [2437.560546875, "Session"],
    ]);
  });

  it("ends the root's line at the gap's right edge, at most 40 right of the frame", () => {
    const lines = drawing.elements.flatMap((element) =>
      element.type === "timeline" && element.address.id === "session"
        ? [[element.xs, element.xe, element.y]]
        : [],
    );
    expect(lines).toEqual([[750.7802734375, 2453.560546875, 238.74609375]]);
    expect(2453.560546875 - xr).toBe(32);
    // Its arrowhead's tip at 2462.560546875 and `K` beyond: the card's right edge.
    const card = drawing.boxes.find((box) => box.ancestor?.member === "take_a");
    expect(card === undefined ? null : [card.x, card.x + card.width]).toEqual([
      525.13720703125, 2470.560546875,
    ]);
    expect([drawing.width, drawing.height]).toEqual([2480.560546875, 283.72265625]);
  });
});

/** A child `[id, offset, length]` of a root, in quarters. */
type Child = readonly [string, number, number];

/**
 * A bundle of the shape of op. 2 no. 1 (fractions of quarters): `track_1` (100) holds three
 * excerpts, each the one member of a group of its own ("A 1" to "A 3"), and `track_2` (100) two,
 * the first starting 30 in ("D 1", "D 2"); `piece` (40) holds the member of "C" alone, a root that
 * one group hangs on; "B" holds a root and hangs on nothing. In name order the row is "A 1", "A 2",
 * "A 3", "B", "C", "D 1", "D 2".
 */
function opusShaped(): Manifest {
  const pair = (value: number) => [value, 1];
  const timeline = (id: string, name: string, length: number, extra: object = {}) => ({
    id,
    name,
    unit: "quarters",
    number_type: "fraction",
    length: pair(length),
    ...extra,
  });
  const root = (id: string, name: string, length: number, children: readonly Child[]) =>
    timeline(id, name, length, {
      children: children.map(([child, offset, span]) =>
        timeline(child, child, span, { offset: pair(offset) }),
      ),
    });
  const groups: [string, string, string][] = [
    ["g_d2", "D 2", "t2_b"],
    ["g_a2", "A 2", "t1_b"],
    ["g_c", "C", "p_a"],
    ["g_a1", "A 1", "t1_a"],
    ["g_b", "B", "loose"],
    ["g_d1", "D 1", "t2_a"],
    ["g_a3", "A 3", "t1_c"],
  ];
  const value = {
    timetoshare: "0.2.0",
    name: "Bundle",
    timelines: [
      root("track_1", "Track 1", 100, [
        ["t1_a", 0, 10],
        ["t1_b", 20, 10],
        ["t1_c", 40, 10],
      ]),
      root("track_2", "Track 2", 100, [
        ["t2_a", 30, 10],
        ["t2_b", 60, 10],
      ]),
      root("piece", "Piece", 40, [["p_a", 10, 10]]),
      timeline("loose", "Loose", 10),
    ],
    groups: groups.map(([id, name, member]) => ({ id, name, members: [member] })),
  };
  const manifest = loadManifest(dumps(withFileIds(value)));
  if (isLoadError(manifest)) throw new Error(JSON.stringify(manifest.problems));
  return manifest;
}

describe("horizontal, shared roots on one line, a root of one group behind its frame", () => {
  const manifest = opusShaped();
  const ROW = ["g_a1", "g_a2", "g_a3", "g_b", "g_c", "g_d1", "g_d2"];
  const drawing = drawnManifest(manifest, { arrangement: { direction: "horizontal", order: [] } });
  const items = itemBoxes(drawing);
  const itemOf = (id: string) => {
    const found = items.find((box) => box.key?.item === id);
    if (found === undefined) throw new Error(`no item ${id}`);
    return found;
  };
  const cards = drawing.boxes.filter((box) => box.ancestor !== undefined);

  it("takes the row in name order and draws the two shared roots once", () => {
    expect(drawing.arrangement).toEqual({
      direction: "horizontal",
      row: ROW,
      roots: ["track_1", "track_2"],
    });
    expect(items.map((box) => box.key?.item)).toEqual(ROW);
    expect(cards.map((box) => [box.key?.member, box.ancestor])).toEqual([
      ["track_1", { group: "g_a1", member: "t1_a", groups: ["g_a1", "g_a2", "g_a3"] }],
      ["track_2", { group: "g_d1", member: "t2_a", groups: ["g_d1", "g_d2"] }],
      ["piece", { group: "g_c", member: "p_a", groups: ["g_c"] }],
    ]);
  });

  it("packs the row by the row extents, a root of one group widening its frame's", () => {
    // Each item's row extent: its frame, and the ancestor card of `piece` behind "C" where it lies
    // beyond the frame; each extent starts the row gap 48 right of where the previous one ends.
    const extent = (id: string) => {
      const frame = itemOf(id);
      const own = cards.filter(
        (box) => box.ancestor?.groups.length === 1 && box.ancestor.group === id,
      );
      return [
        Math.min(frame.x, ...own.map((box) => box.x)),
        Math.max(frame.x + frame.width, ...own.map((box) => box.x + box.width)),
      ] as const;
    };
    for (const [index, id] of ROW.slice(1).entries()) {
      const [, previousEnd] = extent(nth(ROW, index));
      expect(extent(id)[0], id).toBe(previousEnd + 48);
    }
    const piece = cards.find((box) => box.key?.member === "piece");
    expect(extent("g_c")).toEqual([piece?.x, (piece?.x ?? 0) + (piece?.width ?? 0)]);
    // The once card of `track_1` reaches left of the first frame, so the row is packed again from
    // the right of `P` by as much: its left edge lies at `P`.
    expect(cards.find((box) => box.key?.member === "track_1")?.x).toBe(8);
    expect(items.map((box) => box.x)).toEqual([
      108.19189453125, 677.65185546875, 1247.11181640625, 1816.57177734375, 2831.30419921875,
      4217.76416015625, 4787.22412109375,
    ]);
  });

  it("keeps the ancestor card of a root one group hangs on where it lies unarranged", () => {
    const plain = drawnManifest(manifest);
    const relative = (of: Drawing) => {
      const frame = itemBoxes(of).find((box) => box.key?.item === "g_c");
      const card = of.boxes.find((box) => box.key?.item === "g_c" && box.key.member === "piece");
      if (frame === undefined || card === undefined) throw new Error("no card behind C");
      return [card.x - frame.x, card.y - frame.y, card.width, card.height];
    };
    expect(relative(drawing)).toEqual(relative(plain));
    expect(relative(drawing)).toEqual([-445.2724609375, 24.20703125, 1783.732421875, 43.40234375]);
  });

  it("puts both shared roots on the highest line, each group hanging from it", () => {
    const rootLines = drawing.elements.flatMap((element) =>
      element.type === "timeline" && ["track_1", "track_2"].includes(element.address.id ?? "")
        ? [[element.address.id, element.y]]
        : [],
    );
    expect(rootLines).toEqual([
      ["track_1", 82.01171875],
      ["track_2", 82.01171875],
    ]);
    // In every frame hanging on a shared root, its ancestor line lies on the root's line.
    const ancestorLines = drawing.elements.flatMap((element) =>
      element.type === "ancestor" && element.address.id?.startsWith("track_") === true
        ? [element.y]
        : [],
    );
    expect(ancestorLines).toEqual(Array(5).fill(82.01171875));
    // Every item at the first item's default top: those hanging on a shared root as high as those
    // hanging on none.
    expect(new Set(items.map((box) => box.y))).toEqual(new Set([28.8046875]));
  });

  it("cuts each shared root at most 40 beyond its outer frames", () => {
    const outer = drawing.elisions
      .filter((exposure) => exposure.kind === "ancestor_card" && exposure.drawn === "full")
      .map((exposure) =>
        exposure.gaps
          .filter((gap) => gap.origin === "arrangement")
          .map((gap) => [String(gap.start), String(gap.end), gap.x1, gap.x2]),
      );
    const left = (id: string) => itemOf(id).x;
    const right = (id: string) => itemOf(id).x + itemOf(id).width;
    expect(outer).toEqual([
      [
        ["11", "18", 629.65185546875, 679.11181640625],
        ["31", "38", 1199.11181640625, 1248.57177734375],
        // `t1_c` ends at 50: 51 lies 40 right of A 3's frame, more than 8, so the gap starts at 50.
        ["50", "100", right("g_a3"), right("g_a3") + 32],
      ],
      [
        // `t2_a` starts at 30: 29 lies 40 left of D 1's frame, so the gap ends at 30.
        ["0", "30", left("g_d1") - 32, left("g_d1")],
        ["41", "58", 4739.22412109375, 4788.68408203125],
        ["70", "100", right("g_d2"), right("g_d2") + 32],
      ],
    ]);
  });
});
