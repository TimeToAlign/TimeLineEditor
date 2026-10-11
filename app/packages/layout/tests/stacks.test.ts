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
    { select: { ids: ["m1"] }, set: { side: m1 } },
    { select: { ids: ["m2"] }, set: { side: m2 } },
  ],
});

describe("a child's own map stack", () => {
  const manifest = build("r", 8, child("r", "c", 4, 4), scalarMap("c", "m1"), scalarMap("c", "m2"));
  const drawWith = (...extra: Graphical[]) =>
    draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, ...extra], metrics);

  it("widens the row's outer half with two maps above", () => {
    const drawing = drawWith(sides("above", "above"));
    expect(ordinates(drawing)).toEqual({ m1: 14, m2: 9, r: 33.5, c: 19.5 });
    expect(drawing.height).toBe(68.4765625);
    expect(element(drawing, "m1")).toMatchObject({
      xs: 222.0478515625,
      xe: 422.0478515625,
    });
  });

  it("widens the row's inner half with two maps below", () => {
    expect(ordinates(drawWith(sides("below", "below")))).toEqual({
      m1: 20.5,
      m2: 25.5,
      r: 33.5,
      c: 15,
    });
  });

  it("keeps the pitch when a one-map stack lies on each side", () => {
    expect(ordinates(drawWith(sides("above", "below")))).toEqual({
      m1: 9.5,
      m2: 20.5,
      r: 29,
      c: 15,
    });
  });

  it("draws above as up on a child below the root", () => {
    const drawing = drawWith({ statements: [{ select: { ids: ["c"] }, set: { side: "below" } }] });
    expect(ordinates(drawing)).toEqual({
      m1: 51.37890625,
      m2: 46.37890625,
      r: 14.40234375,
      c: 56.87890625,
    });
    expect(drawing.height).toBe(71.87890625);
  });
});

describe("the root band", () => {
  it("takes the wedges' reach over a smaller stack and draws the wedges over it", () => {
    const drawing = drawFixture("map", [
      { statements: [{ select: { ids: ["tempo"] }, set: { side: "below" } }] },
    ]);
    expect(ordinates(drawing)).toEqual({
      tempo: 34.5,
      ticks: 9.5,
      melody: 29,
      phrase: 15,
    });
    expect(drawing.height).toBe(63.9765625);
    expect(element(drawing, "melody/start")).toMatchObject({ yt: 30.5, yb: 43.5 });
    const index = (address: string) =>
      drawing.elements.findIndex((item) => item.address === address);
    expect(index("tempo")).toBeLessThan(index("melody/start"));
    expect(index("tempo")).toBeLessThan(index("melody/end"));
  });

  it("draws no map of a hidden root and gives it no room", () => {
    const drawing = drawFixture("map", [
      { statements: [{ select: { ids: ["melody"] }, set: { display: "none" } }] },
    ]);
    expect(ordinates(drawing)).toEqual({ ticks: 9.5, phrase: 15 });
    expect(element(drawing, "melody/start")).toMatchObject({ yt: 30.5, yb: 43.5 });
    expect(drawing.height).toBe(63.9765625);
  });

  it("takes a larger stack's reach, above and below", () => {
    const name = "conversion_maps__maps_quarters";
    const above = drawFixture(name);
    expect(element(above, "maps:quarters")).toMatchObject({ y: 99.5 });
    expect(element(above, "cmap_1")).toMatchObject({ yc: 94 });
    expect(element(above, "tmap_2")).toMatchObject({ yc: 9 });
    expect(above.height).toBe(134.4765625);
    const below = drawFixture(name, [
      { statements: [{ select: { element: "map" }, set: { side: "below" } }] },
    ]);
    expect(element(below, "maps:quarters")).toMatchObject({ y: 14.40234375 });
    expect(element(below, "cmap_1")).toMatchObject({
      yc: 19.90234375,
    });
    expect(element(below, "tmap_2")).toMatchObject({
      yc: 104.90234375,
    });
    expect(below.height).toBe(113.90234375);
  });
});

describe("the end marker", () => {
  const manifest = build("r", 8, child("r", "c", 4, 4));
  const drawLocked = (locked: Record<string, boolean>) =>
    draw(withLocked(manifest, locked), DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
  const lines = (drawing: Drawing) =>
    drawing.elements
      .filter((item): item is LineElement => item.type === "timeline" || item.type === "child")
      .map(({ address, xe, y, locked }) => ({ address, xe, y, locked }));

  it("follows locked on the root and on a child", () => {
    const unlockedRoot = drawLocked({});
    expect(lines(unlockedRoot)).toEqual([
      { address: "r", xe: 422.0478515625, y: 29, locked: false },
      { address: "c", xe: 422.0478515625, y: 15, locked: true },
    ]);
    expect(unlockedRoot.width).toBe(439.0478515625);
    expect(drawLocked({ r: true }).width).toBe(436.4638671875);
    const unlockedChild = drawLocked({ r: true, c: false });
    expect(lines(unlockedChild)).toEqual([
      { address: "r", xe: 422.0478515625, y: 29, locked: true },
      { address: "c", xe: 422.0478515625, y: 15, locked: false },
    ]);
    expect(unlockedChild.width).toBe(439.0478515625);
  });
});
