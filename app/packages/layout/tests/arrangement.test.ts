/**
 * Arrangements (`docs/drawing.md` in TimeToShare, sections 1, 8.5, 8.6 and
 * 8.8, Drawn once): packing, a block one under another in its item order,
 * side by side with every root drawn once behind the row, and the fallback.
 */

import type { ItemArrangement } from "@timetoalign/tilie-core";
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
import { loadFile, metrics } from "./support.ts";

/** A bundle fixture drawn under the defaults with `placement`'s members over the default ones. */
function drawn(name: string, placement: Partial<Placement> = {}): Drawing {
  const manifest = loadFile(`bundles/${name}`);
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
      ["group_1", 623.39013671875, 34.57421875, 232.94140625],
      ["group_2", 1238.7802734375, 34.57421875, 157.5625],
      ["group_3", 1854.17041015625, 34.57421875, 232.94140625],
    ]);
    const card = (item: string, member: string) =>
      drawing.boxes.find((box) => box.key?.item === item && box.key.member === member)?.y;
    expect(card("group_1", "take_a")).toBe(192.13671875);
    expect(card("group_3", "take_b")).toBe(192.13671875);
    expect([drawing.width, drawing.height]).toEqual([2429.560546875, 275.515625]);
    expect(drawing.origin).toEqual({ x: 0, y: 0 });
  });
  it("draws each root once, behind the first group hanging on it", () => {
    const cards = drawing.boxes.filter((box) => box.ancestor !== undefined);
    expect(cards.map((box) => [box.x, box.y, box.width, box.height, box.ancestor])).toEqual([
      [
        591.36669921875,
        28.8046875,
        1807.472900390625,
        97.35546875,
        { group: "group_1", member: "exposition", groups: ["group_1", "group_2", "group_3"] },
      ],
      [
        652.52734375,
        195.5390625,
        1746.033203125,
        63.37890625,
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
      [111.7578125, 750.7802734375, 1150.7802734375, "0", "16"],
      [111.7578125, 1366.17041015625, 1766.17041015625, "16", "32"],
      [111.7578125, 1981.560546875, 2381.560546875, "32", "48"],
    ]);
    expect(runs("exposition").map((run) => run[2])).toEqual([1150.7802734375]);
    expect(runs("development").map((run) => run[1])).toEqual([1366.17041015625]);
    expect(runs("session")).toEqual([
      [244.515625, 750.7802734375, 1190.7802734375, "0", "33"],
      [244.515625, 1234.8938802083335, 2381.560546875, "44", "130"],
    ]);
    const gaps = drawing.elisions
      .filter((exposure) => exposure.kind === "ancestor_card")
      .map((exposure) =>
        exposure.gaps.map((gap) => [gap.origin, gap.start, gap.end, gap.x1, gap.x2]),
      );
    expect(gaps).toEqual([
      [
        ["arrangement", gap16(), gap16(), 1150.7802734375, 1366.17041015625],
        ["arrangement", gap32(), gap32(), 1766.17041015625, 1981.560546875],
      ],
      [["arrangement", 33, 44, 1190.7802734375, 1234.8938802083335]],
    ]);
    const seams = drawing.elements.filter(
      (element) => element.type === "elision" && element.address.id === "score",
    );
    expect(seams.map((seam) => (seam.type === "elision" ? seam.continuations : []))).toEqual([
      [111.7578125],
      [111.7578125],
    ]);
    const ellipses = drawing.elements.filter((element) => element.type === "ellipsis");
    expect(ellipses.map((each) => (each.type === "ellipsis" ? [each.x, each.y] : []))).toEqual([
      [1212.8370768229167, 244.515625],
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

/** 16 and 32 quarters on the score's fraction axis, as exact values. */
function gap16() {
  return expect.objectContaining({ numerator: 16n, denominator: 1n });
}
function gap32() {
  return expect.objectContaining({ numerator: 32n, denominator: 1n });
}
