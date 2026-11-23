import { WORKSPACE } from "@timetoalign/tilie-core";
import { DEFAULT_LAYER, draw, manifestLayer } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { drawingOf } from "../src/drawing.ts";
import {
  A,
  blockIn,
  changed,
  metrics,
  mixedPlain,
  placed,
  viewOf,
  withGrid,
  withoutAncestorCards,
} from "./support.ts";

describe("drawingOf", () => {
  const view = viewOf({ id: A, fixture: "bare", x: 40, y: 80 });
  const block = blockIn(view, A);

  it("draws with the default layer, the workspace's graphical and the manifest, in that order", () => {
    const expected = draw(
      block.manifest,
      {
        length: 400,
        spacing: 8,
        width: null,
        height: null,
        places: {},
      },
      [DEFAULT_LAYER, view.graphical, manifestLayer(block.manifest)],
      metrics,
    );
    expect(drawingOf(block, view.graphical, metrics)).toEqual(expected);
    expect(expected.width).toBe(476.5771484375);
  });

  it("memoizes by block and the workspace's graphical, whatever the settings", () => {
    const drawing = drawingOf(block, view.graphical, metrics);
    expect(drawingOf(block, view.graphical, metrics)).toBe(drawing);
    const gridded = withGrid(view, 16, false);
    expect(gridded.graphical).toBe(view.graphical);
    expect(drawingOf(blockIn(gridded, A), gridded.graphical, metrics)).toBe(drawing);
  });

  it("redraws when the workspace's graphical changes", () => {
    const first = drawingOf(block, view.graphical, metrics);
    const styled = changed(view, {
      type: "set",
      changes: [
        {
          target: WORKSPACE,
          values: {
            graphical: { rules: [{ select: { element: "block" }, set: { fill: "#FFFFFF" } }] },
          },
        },
      ],
    });
    expect(blockIn(styled, A)).toBe(block);
    const second = drawingOf(block, styled.graphical, metrics);
    expect(second).not.toBe(first);
    expect(second.elements[0]?.style.fill).toBe("#FFFFFF");
  });

  it("draws overridden placement members, leaving the block's own drawing", () => {
    const memoized = drawingOf(block, view.graphical, metrics);
    expect(drawingOf(block, view.graphical, metrics, { length: 800 }).width).toBe(876.5771484375);
    expect(drawingOf(block, view.graphical, metrics)).toBe(memoized);
  });

  it("draws a block's places, and overridden places", () => {
    // Drawn without `recording`'s ancestor card, whose room would move the place origin.
    const moved = placed(withoutAncestorCards(mixedPlain()), A, "annotations", { x: -30 });
    const mixed = blockIn(moved, A);
    const drawing = drawingOf(mixed, moved.graphical, metrics);
    expect(drawing).toEqual(
      draw(
        mixed.manifest,
        {
          length: 400,
          spacing: 8,
          width: null,
          height: null,
          places: { annotations: { x: -30 } },
        },
        [DEFAULT_LAYER, moved.graphical, manifestLayer(mixed.manifest)],
        metrics,
      ),
    );
    expect(drawing.origin).toEqual({ x: 38, y: 0 });
    expect(drawingOf(mixed, moved.graphical, metrics, { places: {} }).origin).toEqual({
      x: 0,
      y: 0,
    });
    expect(drawingOf(mixed, moved.graphical, metrics)).toBe(drawing);
  });

  describe("equal placements share a drawing", () => {
    const longer = { length: 800 };

    it("draws one override once", () => {
      const first = drawingOf(block, view.graphical, metrics, longer);
      expect(drawingOf(block, view.graphical, metrics, longer)).toBe(first);
    });

    it("serves a block set to that placement", () => {
      const first = drawingOf(block, view.graphical, metrics, longer);
      const set = changed(view, {
        type: "set",
        changes: [{ target: { block: A }, values: longer }],
      });
      expect(blockIn(set, A)).not.toBe(block);
      expect(drawingOf(blockIn(set, A), set.graphical, metrics)).toBe(first);
    });

    it("compares places by value", () => {
      const once = blockIn(placed(mixedPlain(), A, "annotations", { x: -30 }), A);
      const again = placed(mixedPlain(), A, "annotations", { x: -30 });
      const twice = blockIn(again, A);
      expect(twice.places).not.toBe(once.places);
      const drawing = drawingOf(once, again.graphical, metrics, { places: once.places });
      expect(drawingOf(once, again.graphical, metrics, { places: twice.places })).toBe(drawing);
      const apart = blockIn(placed(mixedPlain(), A, "annotations", { x: -31 }), A);
      expect(drawingOf(once, again.graphical, metrics, { places: apart.places })).not.toBe(drawing);
    });

    it("redraws under another graphical of the workspace", () => {
      const first = drawingOf(block, view.graphical, metrics, longer);
      const styled = changed(view, {
        type: "set",
        changes: [
          {
            target: WORKSPACE,
            values: {
              graphical: {
                rules: [{ select: { element: "block" }, set: { fill: "#FFFFFF" } }],
              },
            },
          },
        ],
      });
      const second = drawingOf(block, styled.graphical, metrics, longer);
      expect(second).not.toBe(first);
      expect(second.elements[0]?.style.fill).toBe("#FFFFFF");
    });

    it("keeps the 32 placements drawn last", () => {
      const first = drawingOf(block, view.graphical, metrics, longer);
      for (let length = 801; length <= 832; length += 1) {
        drawingOf(block, view.graphical, metrics, { length });
      }
      const again = drawingOf(block, view.graphical, metrics, longer);
      expect(again).not.toBe(first);
      expect(again).toEqual(first);
      expect(drawingOf(block, view.graphical, metrics, longer)).toBe(again);
    });
  });
});

describe("a block's arrangement", () => {
  const order = ["page", "group_3", "group_1", "group_2"];
  const plain = viewOf({ id: A, fixture: "bundles/bundle_arranged_roots" });
  const arranged = changed(plain, {
    type: "set",
    changes: [
      { target: { block: A }, values: { arrangement: { direction: "horizontal", order } } },
    ],
  });
  const block = blockIn(arranged, A);
  // Core stores a horizontal arrangement's row as its order.
  const row = ["page", "group_1", "group_2", "group_3"];

  it("reaches layout as the placement's", () => {
    expect(block.arrangement).toEqual({ direction: "horizontal", order: row });
    const drawing = drawingOf(block, arranged.graphical, metrics);
    expect(drawing).toEqual(
      draw(
        block.manifest,
        {
          length: 400,
          spacing: 8,
          width: null,
          height: null,
          places: {},
          arrangement: { direction: "horizontal", order: row },
        },
        [DEFAULT_LAYER, arranged.graphical, manifestLayer(block.manifest)],
        metrics,
      ),
    );
    expect(drawing.arrangement).toEqual({
      direction: "horizontal",
      row,
      roots: ["score", "session"],
    });
  });

  it("keys the drawings of a manifest", () => {
    const drawing = drawingOf(block, arranged.graphical, metrics);
    // The same manifest object, drawn with no arrangement.
    const unarranged = blockIn(plain, A);
    expect(unarranged.manifest).toBe(block.manifest);
    const free = drawingOf(unarranged, plain.graphical, metrics);
    expect(free).not.toBe(drawing);
    expect(free.arrangement).toBeUndefined();
    const again = { arrangement: { direction: "horizontal" as const, order: [...row] } };
    expect(drawingOf(block, arranged.graphical, metrics, again)).toBe(drawing);
  });
});
