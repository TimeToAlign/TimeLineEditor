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
          target: "workspace",
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

  it("draws overridden placement members without caching them", () => {
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
});
