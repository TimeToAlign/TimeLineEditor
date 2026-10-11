import type { ElementType } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { Drawing, DrawnElement } from "../src/index.ts";
import { drawFixture } from "./support.ts";

function lineY(drawing: Drawing, address: string): number {
  const line = drawing.elements.find((item) => item.address === address);
  if (line?.type !== "timeline" && line?.type !== "child") throw new Error(`no line ${address}`);
  return line.y;
}

/**
 * An ordinate on the element's side and its reference line: the root's line,
 * or for a map its own timeline's line. A break's flow row may lie on the
 * root's line (its band can be the first of its side), so a break tells its
 * side by its far end, which lies on the other side.
 */
function ordinate(drawing: Drawing, item: DrawnElement): [number, number] {
  const root = drawing.elements.find((other) => other.type === "timeline");
  if (root?.type !== "timeline") throw new Error("no root");
  switch (item.type) {
    case "child":
      return [item.y, root.y];
    case "map":
      return [item.yc, lineY(drawing, item.address.slice(0, item.address.indexOf("/map/")))];
    case "region":
      return [item.ya, root.y];
    case "jump":
      return [item.c1[1], root.y];
    case "wedge":
      return [item.yb, root.y];
    case "break":
      return [item.y1 + (item.y1 - item.y2), root.y];
    default:
      throw new Error(item.type);
  }
}

function signs(drawing: Drawing, type: ElementType): number[] {
  return drawing.elements
    .filter((item) => item.type === type)
    .map((item) => {
      const [y, reference] = ordinate(drawing, item);
      return Math.sign(y - reference);
    });
}

/** Element type, the side it is moved to, the fixture, and how many it draws. */
const CASES: readonly [ElementType, "above" | "below", string, number][] = [
  ["child", "below", "map", 1],
  ["map", "below", "map", 2],
  ["region", "above", "with_region", 1],
  ["jump", "above", "flow_control", 1],
  ["wedge", "above", "map", 2],
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
    expect(drawing.height).toBe(77.9296875);
    expect(line).toMatchObject({ y1: 8, y2: 69.9296875 });
    expect(
      drawing.elements.find((item) => item.address === "flow:quarters/break/0/label"),
    ).toMatchObject({ x: 385.9775390625, baseline: 16.35400390625 });
  });
});
