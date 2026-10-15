/** Map stacks, the root band and the end marker; every number is derived in tests/README.md. */

import type { Graphical } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  type LineElement,
} from "../src/index.ts";
import { build, child, drawFixture, element, metrics, scalarMap, withLocked } from "./support.ts";

/** The ordinate of every line and map of a drawing, by address. */
function ordinates(drawing: Drawing): Record<string, number> {
  return Object.fromEntries(
    drawing.elements.flatMap((item) => {
      if (item.type === "timeline" || item.type === "child") return [[item.address, item.y]];
      if (item.type === "map") return [[item.address, item.yc]];
      return [];
    }),
  );
}

const sides = (m1: "above" | "below", m2: "above" | "below"): Graphical => ({
  statements: [
    { select: { ids: ["r/m1"] }, set: { side: m1 } },
    { select: { ids: ["r/m2"] }, set: { side: m2 } },
  ],
});

describe("a child's own map stack", () => {
  const manifest = build("r", 8, child("r", "c", 4, 4), scalarMap("c", "m1"), scalarMap("c", "m2"));
  const drawWith = (...extra: Graphical[]) =>
    draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, ...extra], metrics);

  it("widens the row's outer half with two maps above", () => {
    const drawing = drawWith(sides("above", "above"));
    expect(ordinates(drawing)).toEqual({ "r/m1": 22, "r/m2": 17, r: 41.5, c: 27.5 });
    expect(drawing.height).toBe(86.4765625);
    expect(element(drawing, "r/m1")).toMatchObject({
      xs: 230.0478515625,
      xe: 430.0478515625,
    });
  });

  it("widens the row's inner half with two maps below", () => {
    expect(ordinates(drawWith(sides("below", "below")))).toEqual({
      "r/m1": 28.5,
      "r/m2": 33.5,
      r: 41.5,
      c: 23,
    });
  });

  it("keeps the pitch when a one-map stack lies on each side", () => {
    expect(ordinates(drawWith(sides("above", "below")))).toEqual({
      "r/m1": 17.5,
      "r/m2": 28.5,
      r: 37,
      c: 23,
    });
  });

  it("draws above as up on a child below the root", () => {
    const drawing = drawWith({ statements: [{ select: { ids: ["c"] }, set: { side: "below" } }] });
    expect(ordinates(drawing)).toEqual({
      "r/m1": 59.37890625,
      "r/m2": 54.37890625,
      r: 22.40234375,
      c: 64.87890625,
    });
    expect(drawing.height).toBe(89.87890625);
  });
});

describe("the root band", () => {
  it("takes the wedges' reach over a smaller stack and draws the wedges over it", () => {
    const drawing = drawFixture("map", [
      { statements: [{ select: { ids: ["melody/tempo"] }, set: { side: "below" } }] },
    ]);
    expect(ordinates(drawing)).toEqual({
      "melody/tempo": 42.5,
      "melody/ticks": 17.5,
      melody: 37,
      phrase: 23,
    });
    expect(drawing.height).toBe(81.9765625);
    expect(element(drawing, "melody/start")).toMatchObject({ yt: 38.5, yb: 51.5 });
    const index = (address: string) =>
      drawing.elements.findIndex((item) => item.address === address);
    expect(index("melody/tempo")).toBeLessThan(index("melody/start"));
    expect(index("melody/tempo")).toBeLessThan(index("melody/end"));
  });

  it("draws no map of a hidden root and gives it no room", () => {
    const drawing = drawFixture("map", [
      { statements: [{ select: { ids: ["melody"] }, set: { display: "none" } }] },
    ]);
    expect(ordinates(drawing)).toEqual({ "melody/ticks": 17.5, phrase: 23 });
    expect(element(drawing, "melody/start")).toMatchObject({ yt: 38.5, yb: 51.5 });
    expect(drawing.height).toBe(81.9765625);
  });

  it("takes a larger stack's reach, above and below", () => {
    const name = "conversion_maps__maps_quarters";
    const above = drawFixture(name);
    expect(element(above, "maps:quarters")).toMatchObject({ y: 107.5 });
    expect(element(above, "maps:quarters/cmap_1")).toMatchObject({ yc: 102 });
    expect(element(above, "maps:quarters/tmap_2")).toMatchObject({ yc: 17 });
    expect(above.height).toBe(152.4765625);
    const below = drawFixture(name, [
      { statements: [{ select: { element: "map" }, set: { side: "below" } }] },
    ]);
    expect(element(below, "maps:quarters")).toMatchObject({ y: 22.40234375 });
    expect(element(below, "maps:quarters/cmap_1")).toMatchObject({
      yc: 27.90234375,
    });
    expect(element(below, "maps:quarters/tmap_2")).toMatchObject({
      yc: 112.90234375,
    });
    expect(below.height).toBe(131.90234375);
  });
});

describe("the end marker", () => {
  const manifest = build("r", 8, child("r", "c", 4, 4));
  const drawLocked = (locked: Record<string, boolean>) =>
    draw(withLocked(manifest, locked), DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
  const lines = (drawing: Drawing) =>
    drawing.elements
      .filter((item): item is LineElement => item.type === "timeline" || item.type === "child")
      .map(({ address, xe, y, end }) => ({ address, xe, y, end }));

  it("follows locked on the root, and ends a child with the diamond whatever its locked", () => {
    const unlockedRoot = drawLocked({});
    expect(lines(unlockedRoot)).toEqual([
      { address: "r", xe: 430.0478515625, y: 37, end: "arrowhead" },
      { address: "c", xe: 430.0478515625, y: 23, end: "diamond" },
    ]);
    expect(unlockedRoot.width).toBe(457.0478515625);
    const lockedRoot = drawLocked({ r: true });
    expect(lines(lockedRoot).map((line) => line.end)).toEqual(["circle", "diamond"]);
    expect(lockedRoot.width).toBe(454.4638671875);
    const unlockedChild = drawLocked({ r: true, c: false });
    expect(lines(unlockedChild)).toEqual(lines(lockedRoot));
    expect(unlockedChild.width).toBe(454.4638671875);
  });
});
