import {
  BUNDLE_ADDRESS,
  isLoadError,
  loadManifest,
  sameAddress,
  TITLE_ADDRESS,
} from "@timetoalign/tilie-core";
import { dumps } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  draw,
  type TextElement,
  TextMeasure,
} from "../src/index.ts";
import { at, build, child, drawFixture, loadFile, metrics } from "./support.ts";

describe("row names", () => {
  it("replaces, cuts and sizes a row from displayed and hidden names", () => {
    const manifest = build("r", 8, child("r", "a", 0, 2), child("r", "b", 4, 2));
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [
        DEFAULT_LAYER,
        {
          rules: [
            { select: { addresses: [at("a", "name")] }, set: { content: "AAAA", "max-width": 20 } },
            {
              select: { addresses: [at("b", "name")] },
              set: { display: "none", "font-size": 20 },
            },
          ],
        },
      ],
      metrics,
    );
    const names = drawing.elements.filter((item): item is TextElement => item.type === "name");
    expect(names.map((item) => [item.address, item.text])).toEqual([
      [at("a", "name"), "A…"],
      [at("r", "name"), "r"],
    ]);
    expect(names.map((item) => item.whole)).toEqual(["AAAA", undefined]);
    expect(drawing.elements.find((item) => sameAddress(item.address, at("a")))).toMatchObject({
      y: 27.640625,
    });
    expect(drawing.elements.find((item) => sameAddress(item.address, at("b")))).toMatchObject({
      y: 27.640625,
    });
  });

  it("cuts every virtual card's whole name as one text, the column ending before every line", () => {
    const drawing = drawFixture("flow/virtual_cards", [], {
      ...DEFAULT_PLACEMENT,
      places: { allegro_by_hand: {}, allegro_default: {}, allegro_single: {} },
    });
    const names = drawing.elements.filter((item): item is TextElement => item.type === "name");
    expect(names.map((item) => [item.address, item.text, item.whole])).toEqual([
      [{ part: ["name"] }, "Virtual cards", undefined],
      [at("allegro", "name"), "Allegro", undefined],
      [
        at("allegro_default", "name"),
        "Allegro, default · unfolded …",
        "Allegro, default · unfolded from Allegro",
      ],
      [
        at("allegro_by_hand", "name"),
        "Allegro, practice · unfolded…",
        "Allegro, practice · unfolded from Allegro",
      ],
      [
        at("allegro_single", "name"),
        "Allegro, single · unfolded fr…",
        "Allegro, single · unfolded from Allegro",
      ],
    ]);
    const measure = new TextMeasure(metrics);
    const N = (29777 * 11) / 2048;
    expect(N).toBe(159.93505859375);
    const rows = names.slice(1);
    expect(rows.map((item) => measure.advances(item.text).prefixes.at(-1))).toEqual([
      7194, 29353, 29777, 29773,
    ]);
    // Each width is its sum × 11 / 2048, the widest N, so every name ends by n + N.
    const widths = rows.map((item) => measure.width(item.text, 11));
    expect(widths).toEqual([38.6396484375, 157.65771484375, N, 159.91357421875]);
    expect(Math.max(...widths)).toBe(N);
    expect(rows.map((item) => item.x)).toEqual([16, 16, 16, 16]);
    const lines = drawing.elements.flatMap((item) =>
      item.type === "timeline" ? [[item.address.id, item.xs]] : [],
    );
    expect(lines).toEqual(
      ["allegro", "allegro_default", "allegro_by_hand", "allegro_single"].map((id) => [
        id,
        183.93505859375,
      ]),
    );
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
      [DEFAULT_LAYER, { rules: [{ select: {}, set: { display: "none" } }] }],
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

  it("sizes a block holding only the manifest's title by that title", () => {
    // A manifest without timelines or groups holds only its title "Mixed"
    // at font size 11, drawn from x = P = 8. Its advances are M 1767, i 569,
    // x 1212, e 1260, d 1300, summing to 6108 units of 2048 per em, so
    // w = 6108 * 11 / 2048 = 32.806640625 and its right edge is 8 +
    // 32.806640625 = 40.806640625; h(11) = (1901 + 483) * 11 / 2048 =
    // 12.8046875, so its slot ends at 8 + 12.8046875 = 20.8046875. The block
    // is Wb = 8 + 40.806640625 = 48.806640625 wide and Hb = 8 + 20.8046875 =
    // 28.8046875 high.
    const drawing = emptyBundle([DEFAULT_LAYER]);
    expect(drawing).toMatchObject({ width: 48.806640625, height: 28.8046875 });
    expect(drawing.elements.map((item) => [item.type, item.address])).toEqual([
      ["block", BUNDLE_ADDRESS],
      ["name", TITLE_ADDRESS],
    ]);
    expect(drawing.elements[0]).toMatchObject({ width: 48.806640625, height: 28.8046875 });
  });

  it("draws the manifest's title whole, wider than a name's max-width", () => {
    // The defaults cut every name at 160 but the manifest's title, whose rule sets no
    // max-width (README): its text is the whole name, and the block is as wide as it needs.
    const name = "LayerIt, Clair de lune mm. 1–6 (Pires)";
    const source = loadFile("bundles/bundle_mixed");
    const manifest = loadManifest(
      dumps({ ...source, name, timelines: [], groups: [], graphical: {} }),
    );
    if (isLoadError(manifest)) throw new Error(manifest.problems[0]?.message);
    const drawing = draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    const [, title] = drawing.elements;
    expect(title?.type === "name" && [title.address, title.text]).toEqual([TITLE_ADDRESS, name]);
    const cut = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, { rules: [{ select: { element: "name" }, set: { "max-width": 160 } }] }],
      metrics,
    );
    const [, shortened] = cut.elements;
    expect(shortened?.type === "name" && shortened.text).toBe("LayerIt, Clair de lune mm. …");
  });

  it("is P plus x0 wide and P high when the block holds no frame, no card and no title", () => {
    // The same manifest with its title hidden: xn = P + K = 16, no row name,
    // so x0 = 16, the block P + x0 = 24 wide and P = 8 high.
    const drawing = emptyBundle([
      DEFAULT_LAYER,
      { rules: [{ select: { addresses: [{ part: ["name"] }] }, set: { display: "none" } }] },
    ]);
    expect(drawing).toMatchObject({ width: 24, height: 8 });
    expect(drawing.elements.map((item) => [item.type, item.address])).toEqual([
      ["block", BUNDLE_ADDRESS],
    ]);
  });
});
