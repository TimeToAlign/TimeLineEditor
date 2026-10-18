import { describe, expect, it } from "vitest";
import type { BlockNode } from "../src/index.ts";
import { FOCUS_DURATION, focusViewport, project, targetBounds } from "../src/index.ts";
import { A, changed, metrics, mixedView } from "./support.ts";

function nodeOf(scale: number): BlockNode {
  const view = changed(mixedView(), { type: "set", changes: [{ target: A, values: { scale } }] });
  const [node] = project(view, new Set(), [], metrics, null);
  if (node === undefined) throw new Error("no node");
  return node;
}

describe("targetBounds", () => {
  const node = nodeOf(1);
  const at = (element: string) => `${A}/${element}`;

  it("is the block's box, a frame or a card on the canvas", () => {
    expect(targetBounds(node, A, metrics)).toEqual({
      x: 40,
      y: 80,
      width: 580.484619140625,
      height: 435.8828125,
    });
    expect(targetBounds(node, at("group_1"), metrics)).toEqual({
      x: 48,
      y: 108.8046875,
      width: 562.484619140625,
      height: 139.5625,
    });
    expect(targetBounds(node, at("annotations"), metrics)).toEqual({
      x: 48,
      y: 456.50390625,
      width: 562.484619140625,
      height: 49.37890625,
    });
  });

  it("spans a child's drawn elements, its line and its name", () => {
    expect(targetBounds(node, at("dlt_1"), metrics)).toEqual({
      x: 64,
      y: 385.125,
      width: 302.29150390625,
      height: 12.8046875,
    });
  });

  it("scales with the block", () => {
    expect(targetBounds(nodeOf(2), at("group_1"), metrics)).toEqual({
      x: 56,
      y: 137.609375,
      width: 1124.96923828125,
      height: 279.125,
    });
  });

  it("refuses a target of another block", () => {
    expect(() => targetBounds(node, "0000000009/group_1", metrics)).toThrow(RangeError);
  });
});

describe("focusViewport", () => {
  const pane = { width: 1200, height: 800 };

  it.each([
    [
      { x: 100, y: 50, width: 320, height: 160 },
      { x: -120, y: 140, zoom: 2 },
    ],
    [
      { x: 100, y: 50, width: 10, height: 10 },
      { x: -20, y: 180, zoom: 4 },
    ],
    [
      { x: 100, y: 50, width: 100000, height: 100 },
      { x: -2105, y: 395, zoom: 0.05 },
    ],
  ])("centres %o left of the drawer", (bounds, viewport) => {
    expect(focusViewport(bounds, pane, 400)).toEqual(viewport);
  });

  it("uses the whole pane without a drawer", () => {
    expect(
      focusViewport({ x: 0, y: 0, width: 400, height: 100 }, { width: 1000, height: 500 }, 0),
    ).toEqual({ x: 100, y: 150, zoom: 2 });
  });

  it("takes a second", () => {
    expect(FOCUS_DURATION).toBe(1000);
  });
});
