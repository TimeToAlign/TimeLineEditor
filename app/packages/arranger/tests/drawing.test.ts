import { WORKSPACE } from "@timetoalign/tilie-core";
import { DEFAULT_LAYER, draw } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { drawingOf } from "../src/drawing.ts";
import { A, blockIn, changed, metrics, mixedPlain, placed, viewOf } from "./support.ts";

describe("drawingOf", () => {
  const view = viewOf({ id: A, fixture: "bare", x: 40, y: 80 });
  const block = blockIn(view, A);

  it("draws with the default layer, the settings and the manifest, in that order", () => {
    const expected = draw(
      block.manifest,
      {
        length: 400,
        spacing: 8,
        width: null,
        height: null,
        places: {},
      },
      [DEFAULT_LAYER, view.settings.graphical, block.manifest.graphical],
      metrics,
    );
    expect(drawingOf(block, view.settings, metrics)).toEqual(expected);
    expect(expected.width).toBe(476.5771484375);
  });

  it("memoizes by block and settings", () => {
    expect(drawingOf(block, view.settings, metrics)).toBe(drawingOf(block, view.settings, metrics));
  });

  it("redraws when the settings change", () => {
    const first = drawingOf(block, view.settings, metrics);
    const styled = changed(view, {
      type: "set",
      changes: [
        {
          target: WORKSPACE,
          values: {
            graphical: { statements: [{ select: { element: "block" }, set: { fill: "#FFFFFF" } }] },
          },
        },
      ],
    });
    expect(blockIn(styled, A)).toBe(block);
    const second = drawingOf(block, styled.settings, metrics);
    expect(second).not.toBe(first);
    expect(second.elements[0]?.style.fill).toBe("#FFFFFF");
  });

  it("draws overridden placement members, leaving the block's own drawing", () => {
    const memoized = drawingOf(block, view.settings, metrics);
    expect(drawingOf(block, view.settings, metrics, { length: 800 }).width).toBe(876.5771484375);
    expect(drawingOf(block, view.settings, metrics)).toBe(memoized);
  });

  it("draws a block's places, and overridden places", () => {
    const moved = placed(mixedPlain(), A, "annotations", { x: -30 });
    const mixed = blockIn(moved, A);
    const drawing = drawingOf(mixed, moved.settings, metrics);
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
        [DEFAULT_LAYER, moved.settings.graphical, mixed.manifest.graphical],
        metrics,
      ),
    );
    expect(drawing.origin).toEqual({ x: 38, y: 0 });
    expect(drawingOf(mixed, moved.settings, metrics, { places: {} }).origin).toEqual({
      x: 0,
      y: 0,
    });
    expect(drawingOf(mixed, moved.settings, metrics)).toBe(drawing);
  });

  describe("equal placements share a drawing", () => {
    const longer = { length: 800 };

    it("draws one override once", () => {
      const first = drawingOf(block, view.settings, metrics, longer);
      expect(drawingOf(block, view.settings, metrics, longer)).toBe(first);
    });

    it("serves a block set to that placement", () => {
      const first = drawingOf(block, view.settings, metrics, longer);
      const set = changed(view, {
        type: "set",
        changes: [{ target: { block: A }, values: longer }],
      });
      expect(blockIn(set, A)).not.toBe(block);
      expect(drawingOf(blockIn(set, A), set.settings, metrics)).toBe(first);
    });

    it("compares places by value", () => {
      const once = blockIn(placed(mixedPlain(), A, "annotations", { x: -30 }), A);
      const again = placed(mixedPlain(), A, "annotations", { x: -30 });
      const twice = blockIn(again, A);
      expect(twice.places).not.toBe(once.places);
      const drawing = drawingOf(once, again.settings, metrics, { places: once.places });
      expect(drawingOf(once, again.settings, metrics, { places: twice.places })).toBe(drawing);
      const apart = blockIn(placed(mixedPlain(), A, "annotations", { x: -31 }), A);
      expect(drawingOf(once, again.settings, metrics, { places: apart.places })).not.toBe(drawing);
    });

    it("redraws under other settings", () => {
      const first = drawingOf(block, view.settings, metrics, longer);
      const styled = changed(view, {
        type: "set",
        changes: [
          {
            target: WORKSPACE,
            values: {
              graphical: {
                statements: [{ select: { element: "block" }, set: { fill: "#FFFFFF" } }],
              },
            },
          },
        ],
      });
      const second = drawingOf(block, styled.settings, metrics, longer);
      expect(second).not.toBe(first);
      expect(second.elements[0]?.style.fill).toBe("#FFFFFF");
    });

    it("keeps the 32 placements drawn last", () => {
      const first = drawingOf(block, view.settings, metrics, longer);
      for (let length = 801; length <= 832; length += 1) {
        drawingOf(block, view.settings, metrics, { length });
      }
      const again = drawingOf(block, view.settings, metrics, longer);
      expect(again).not.toBe(first);
      expect(again).toEqual(first);
      expect(drawingOf(block, view.settings, metrics, longer)).toBe(again);
    });
  });
});
