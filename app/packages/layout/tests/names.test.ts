import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import { dumps } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { DEFAULT_LAYER, DEFAULT_PLACEMENT, draw, type TextElement } from "../src/index.ts";
import { build, child, loadFile, metrics } from "./support.ts";

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
      y: 27.640625,
    });
    expect(drawing.elements.find((item) => item.address === "b")).toMatchObject({
      y: 27.640625,
    });
  });

  it("keeps a hidden card's box when nothing but the block is drawn", () => {
    // xn = P + K = 16 and nothing draws, so x0 = R = 16; the card spans 8 to
    // R + K = 24, so Wb = 8 + 24 = 32. y_root = 8 + h(11) / 2 = 14.40234375,
    // Hc = 14.40234375 + 6.40234375 + 8 = 28.8046875 from the card's top at
    // 8, so Hb = 8 + 8 + 28.8046875 = 44.8046875.
    const manifest = build("r", 8);
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, { statements: [{ select: {}, set: { display: "none" } }] }],
      metrics,
    );
    expect(drawing).toMatchObject({ width: 32, height: 44.8046875 });
    expect(drawing.elements).toHaveLength(1);
    expect(drawing.elements[0]).toMatchObject({
      type: "block",
      width: 32,
      height: 44.8046875,
    });
  });

  /** A manifest built from `bundle_mixed` without timelines or groups, at some layers. */
  const emptyBundle = (layers: Parameters<typeof draw>[2]) => {
    const source = loadFile("bundles/bundle_mixed");
    const manifest = loadManifest(dumps({ ...source, timelines: [], groups: [], graphical: {} }));
    if (isLoadError(manifest)) throw new Error(manifest.problems[0]?.message);
    return draw(manifest, DEFAULT_PLACEMENT, layers, metrics);
  };

  it("sizes a box holding only the manifest's title by that title", () => {
    // A manifest without timelines or groups holds only its title "Mixed"
    // at font size 11, drawn from x = P = 8. Its advances are M 1767, i 569,
    // x 1212, e 1260, d 1300, summing to 6108 units of 2048 per em, so
    // w = 6108 * 11 / 2048 = 32.806640625 and its right edge is 8 +
    // 32.806640625 = 40.806640625; h(11) = (1901 + 483) * 11 / 2048 =
    // 12.8046875, so its slot ends at 8 + 12.8046875 = 20.8046875. The box
    // is Wb = 8 + 40.806640625 = 48.806640625 wide and Hb = 8 + 20.8046875 =
    // 28.8046875 high.
    const drawing = emptyBundle([DEFAULT_LAYER]);
    expect(drawing).toMatchObject({ width: 48.806640625, height: 28.8046875 });
    expect(drawing.elements.map((item) => [item.type, item.address])).toEqual([
      ["block", null],
      ["name", "name"],
    ]);
    expect(drawing.elements[0]).toMatchObject({ width: 48.806640625, height: 28.8046875 });
  });

  it("is P plus x0 wide and P high when the box holds no frame, no card and no title", () => {
    // The same manifest with its title hidden: xn = P + K = 16, no row name,
    // so x0 = 16, the box P + x0 = 24 wide and P = 8 high.
    const drawing = emptyBundle([
      DEFAULT_LAYER,
      { statements: [{ select: { ids: ["name"] }, set: { display: "none" } }] },
    ]);
    expect(drawing).toMatchObject({ width: 24, height: 8 });
    expect(drawing.elements.map((item) => [item.type, item.address])).toEqual([["block", null]]);
  });
});
