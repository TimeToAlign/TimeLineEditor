import { describe, expect, it } from "vitest";
import { DEFAULT_LAYER, DEFAULT_PLACEMENT, draw, type TextElement } from "../src/index.ts";
import { build, child, metrics } from "./support.ts";

describe("row names", () => {
  it("replaces, cuts and sizes a row from displayed and hidden names", () => {
    const manifest = build("r", 8, child("r", "a", 0, 2), child("r", "b", 4, 2));
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [
        DEFAULT_LAYER,
        {
          statements: [
            { select: { ids: ["a/name"] }, set: { content: "AAAA", "max-width": 20 } },
            {
              select: { ids: ["b/name"] },
              set: { display: "none", "font-size": 20 },
            },
          ],
        },
      ],
      metrics,
    );
    const names = drawing.elements.filter((item): item is TextElement => item.type === "name");
    expect(names.map((item) => [item.address, item.text])).toEqual([
      ["a/name", "A…"],
      ["r/name", "r"],
    ]);
    expect(drawing.elements.find((item) => item.address === "a")).toMatchObject({
      y: 19.640625,
    });
    expect(drawing.elements.find((item) => item.address === "b")).toMatchObject({
      y: 19.640625,
    });
  });

  it("uses P plus x0 when no non-block element is drawn", () => {
    const manifest = build("r", 8);
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, { statements: [{ select: {}, set: { display: "none" } }] }],
      metrics,
    );
    expect(drawing).toMatchObject({ width: 16, height: 28.8046875 });
    expect(drawing.elements).toHaveLength(1);
    expect(drawing.elements[0]).toMatchObject({ type: "block", width: 16, height: 28.8046875 });
  });
});
