import type { ElementType } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { Drawing, DrawnElement } from "../src/index.ts";
import { drawFixture } from "./support.ts";

function rootY(drawing: Drawing): number {
  const root = drawing.elements.find((item) => item.type === "timeline");
  if (root?.type !== "timeline") throw new Error("no root");
  return root.y;
}

/**
 * An ordinate on the element's side of the root. A break's flow row may lie
 * on the root's line (its band can be the first of its side), so a break
 * tells its side by its far end, which lies on the other side.
 */
function ordinate(item: DrawnElement): number {
  switch (item.type) {
    case "child":
    case "map":
      return item.y;
    case "region":
      return item.ya;
    case "jump":
      return item.yo;
    case "wedge":
      return item.yb;
    case "break":
      return item.y1 + (item.y1 - item.y2);
    default:
      throw new Error(item.type);
  }
}

function signs(drawing: Drawing, type: ElementType): number[] {
  const y = rootY(drawing);
  return drawing.elements
    .filter((item) => item.type === type)
    .map((item) => Math.sign(ordinate(item) - y));
}

/** Element type, the side it is moved to, the fixture, and how many it draws. */
const CASES: readonly [ElementType, "above" | "below", string, number][] = [
  ["child", "below", "styled__score", 1],
  ["map", "above", "styled__score", 1],
  ["region", "above", "with_region", 1],
  ["jump", "above", "flow_control", 1],
  ["wedge", "below", "styled__score", 2],
  ["break", "above", "flow_control", 1],
];

describe("side", () => {
  for (const [type, side, name, count] of CASES) {
    it(`puts every ${type} ${side} when set`, () => {
      const before = signs(drawFixture(name), type);
      const flipped = drawFixture(name, [
        { statements: [{ select: { element: type }, set: { side } }] },
      ]);
      const after = signs(flipped, type);
      expect(before.length).toBe(count);
      expect(before).toEqual(before.map(() => (side === "above" ? 1 : -1)));
      expect(after).toEqual(before.map(() => (side === "above" ? -1 : 1)));
    });
  }

  it("ends a break moved above at the bottom padding", () => {
    const drawing = drawFixture("flow_control", [
      { statements: [{ select: { element: "break" }, set: { side: "above" } }] },
    ]);
    const line = drawing.elements.find((item) => item.type === "break");
    expect(drawing.height).toBe(88.33203125);
    expect(line).toMatchObject({ y1: 14.40234375, y2: 80.33203125 });
  });
});
