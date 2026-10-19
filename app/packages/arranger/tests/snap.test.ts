import { describe, expect, it } from "vitest";
import type { Box } from "../src/snap.ts";
import { snap } from "../src/snap.ts";

const grid = { size: 8, snap: true };
const moving: Box = { id: "m", x: 101, y: 203, width: 458, height: 49, origin: 142.5771484375 };

function other(id: string, x: number, origin: number): Box {
  return { id, x, y: 0, width: 100, height: 40, origin };
}

describe("snap", () => {
  it("snaps to the grid alone", () => {
    expect(snap(moving, [], grid, 6)).toEqual({ x: 104, y: 200, guides: [] });
    expect(snap(moving, [other("a", 200, 260)], grid, 6)).toEqual({ x: 104, y: 200, guides: [] });
  });

  it("aligns left edges within the tolerance, inclusive", () => {
    expect(snap(moving, [other("a", 110, 300)], grid, 6)).toEqual({
      x: 110,
      y: 200,
      guides: [{ axis: "x", at: 110 }],
    });
    expect(snap(moving, [other("a", 110.5, 300)], grid, 6)).toEqual({
      x: 104,
      y: 200,
      guides: [],
    });
  });

  it("aligns origins", () => {
    expect(snap(moving, [other("a", 300, 147)], grid, 6)).toEqual({
      x: 105.4228515625,
      y: 200,
      guides: [{ axis: "x", at: 147 }],
    });
  });

  it("takes the nearest candidate", () => {
    expect(snap(moving, [other("a", 107, 400), other("b", 300, 145)], grid, 6)).toEqual({
      x: 103.4228515625,
      y: 200,
      guides: [{ axis: "x", at: 145 }],
    });
  });

  it("takes the first candidate on a tie", () => {
    // 100 and 108 lie 4 from the snapped edge 104; the first listed wins.
    expect(snap(moving, [other("a", 108, 500), other("b", 100, 600)], grid, 6).guides).toEqual([
      { axis: "x", at: 108 },
    ]);
    expect(snap(moving, [other("b", 100, 600), other("a", 108, 500)], grid, 6).guides).toEqual([
      { axis: "x", at: 100 },
    ]);
  });

  it("ignores the moving box among the others", () => {
    expect(snap(moving, [{ ...moving, x: 105 }], grid, 6)).toEqual({ x: 104, y: 200, guides: [] });
  });

  it("quantizes to 1/2048 when the grid does not snap", () => {
    expect(snap({ ...moving, x: 101.3, y: 203.3 }, [], { size: 8, snap: false }, 6)).toEqual({
      x: 101.2998046875,
      y: 203.2998046875,
      guides: [],
    });
  });
});
