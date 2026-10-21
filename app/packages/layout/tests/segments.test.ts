/** Segment lines: boundaries, segment labels and their tiers; every number is derived in tests/README.md. */

import { apply, createView, isCommandError, type Manifest } from "@timetoalign/tilie-core";
import type { Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
} from "../src/index.ts";
import {
  BLOCK,
  bandOrder,
  drawFixture,
  edit,
  element,
  linearMap,
  load,
  metrics,
  set as setOf,
} from "./support.ts";

const set = (select: object, declaration: object): Graphical => ({
  statements: [{ select, set: declaration }],
});

const ofType = (drawing: Drawing, ...types: DrawnElement["type"][]) =>
  drawing.elements.filter((item) => types.includes(item.type));

/** The segment labels, as `[address, x, baseline]`. */
const segmentLabels = (drawing: Drawing) =>
  ofType(drawing, "label").flatMap((item) =>
    item.type === "label" && !/\/(start|end)\/label$/.test(item.address)
      ? [[item.address, item.x, item.baseline]]
      : [],
  );

/** The boundaries, as `[address, x, y1, y2]`. */
const boundaries = (drawing: Drawing) =>
  ofType(drawing, "boundary").flatMap((item) =>
    item.type === "boundary" ? [[item.address, item.x, item.y1, item.y2]] : [],
  );

/** The lines, as `[address, type, xs, xe, y, end]`. */
const lines = (drawing: Drawing) =>
  ofType(drawing, "timeline", "child").flatMap((item) =>
    item.type === "timeline" || item.type === "child"
      ? [[item.address, item.type, item.xs, item.xe, item.y, item.end]]
      : [],
  );

describe("segment_line", () => {
  const drawing = drawFixture("segment_line");

  it("draws the box of its derivation", () => {
    expect([drawing.width, drawing.height]).toEqual([479.573974609375, 113.9296875]);
  });

  it("lists its elements in the descriptor order", () => {
    expect(drawing.elements.map((item) => item.address)).toEqual([
      null,
      "form/card",
      "form",
      "a",
      "b",
      "c",
      "b/start",
      "b2/start",
      "c/start",
      "form/start",
      "form/end",
      "form/name",
      "form/start/label",
      "form/end/label",
      "a/label",
      "b/label",
      "b1/label",
      "b2/label",
      "c/label",
    ]);
  });

  it("draws the root with an open arrowhead and its segment lines as children in row 1", () => {
    expect(lines(drawing)).toEqual([
      ["form", "timeline", 52.294921875, 452.294921875, 68.953125, "open"],
      ["a", "child", 52.294921875, 152.294921875, 36.4765625, "diamond"],
      ["b", "child", 152.294921875, 302.294921875, 36.4765625, "diamond"],
      ["c", "child", 302.294921875, 452.294921875, 36.4765625, "diamond"],
    ]);
  });

  it("draws each boundary on its segment line's line", () => {
    expect(boundaries(drawing)).toEqual([
      ["b/start", 152.294921875, 60.953125, 76.953125],
      ["b2/start", 227.294921875, 28.4765625, 44.4765625],
      ["c/start", 302.294921875, 60.953125, 76.953125],
    ]);
    expect(element(drawing, "b2/start").style).toMatchObject({
      stroke: "#000000",
      "stroke-width": 1,
      "stroke-dasharray": "none",
    });
  });

  it("draws each segment label above its segment line, centred on the segment", () => {
    expect(segmentLabels(drawing)).toEqual([
      ["a/label", 102.294921875, 56.83056640625],
      ["b/label", 227.294921875, 56.83056640625],
      ["b1/label", 189.794921875, 24.35400390625],
      ["b2/label", 264.794921875, 24.35400390625],
      ["c/label", 377.294921875, 56.83056640625],
    ]);
    expect(element(drawing, "b1/label")).toMatchObject({ text: "b1", anchor: "middle" });
  });

  it("names only the root's row", () => {
    expect(ofType(drawing, "name")).toMatchObject([
      { address: "form/name", text: "Form", x: 16, baseline: 72.76123046875 },
    ]);
  });
});

describe("segment_pages_accolades", () => {
  const drawing = drawFixture("segment_pages_accolades");

  it("draws the box and lines of its derivation", () => {
    expect([drawing.width, drawing.height]).toEqual([493.257080078125, 113.9296875]);
    expect(lines(drawing)).toEqual([
      ["pages", "timeline", 56.85498046875, 456.85498046875, 68.953125, "open"],
      ["page_1", "child", 56.85498046875, 156.85498046875, 36.4765625, "diamond"],
      ["page_2", "child", 156.85498046875, 256.85498046875, 36.4765625, "diamond"],
      ["page_3", "child", 256.85498046875, 356.85498046875, 36.4765625, "diamond"],
      ["page_4", "child", 356.85498046875, 456.85498046875, 36.4765625, "diamond"],
    ]);
  });

  it("draws the boundaries in the traversal order of their segments", () => {
    const page = (x: number) => [x, 28.4765625, 44.4765625];
    const root = (x: number) => [x, 60.953125, 76.953125];
    expect(boundaries(drawing)).toEqual([
      ["page_1_accolade_2/start", ...page(79.65999757251282)],
      ["page_1_accolade_3/start", ...page(105.315641814246)],
      ["page_1_accolade_4/start", ...page(131.08531114149798)],
      ["page_2/start", ...root(156.85498046875)],
      ["page_2_accolade_2/start", ...page(179.65999757251285)],
      ["page_2_accolade_3/start", ...page(205.315641814246)],
      ["page_2_accolade_4/start", ...page(231.085311141498)],
      ["page_3/start", ...root(256.85498046875)],
      ["page_3_accolade_2/start", ...page(279.6599975725128)],
      ["page_3_accolade_3/start", ...page(305.31564181424596)],
      ["page_3_accolade_4/start", ...page(331.085311141498)],
      ["page_4/start", ...root(356.85498046875)],
      ["page_4_accolade_2/start", ...page(379.6599975725128)],
      ["page_4_accolade_3/start", ...page(405.315641814246)],
      ["page_4_accolade_4/start", ...page(431.085311141498)],
    ]);
  });

  it("draws the segment labels in the traversal order of their segments", () => {
    const pageLabel = (n: number, x: number) => [`page_${n}/label`, x, 56.83056640625];
    const accolade = (n: number, m: number, x: number) => [
      `page_${n}_accolade_${m}/label`,
      x,
      24.35400390625,
    ];
    expect(segmentLabels(drawing)).toEqual([
      pageLabel(1, 106.85498046875),
      accolade(1, 1, 68.25748902063141),
      accolade(1, 2, 92.48781969337942),
      accolade(1, 3, 118.200476477872),
      accolade(1, 4, 143.970145805124),
      pageLabel(2, 206.85498046875),
      accolade(2, 1, 168.2574890206314),
      accolade(2, 2, 192.4878196933794),
      accolade(2, 3, 218.200476477872),
      accolade(2, 4, 243.970145805124),
      pageLabel(3, 306.85498046875),
      accolade(3, 1, 268.2574890206314),
      accolade(3, 2, 292.4878196933794),
      accolade(3, 3, 318.20047647787203),
      accolade(3, 4, 343.97014580512405),
      pageLabel(4, 406.85498046875),
      accolade(4, 1, 368.2574890206314),
      accolade(4, 2, 392.48781969337944),
      accolade(4, 3, 418.20047647787203),
      accolade(4, 4, 443.97014580512405),
    ]);
  });

  it("names only the root's row", () => {
    expect(ofType(drawing, "name").map((item) => item.address)).toEqual(["pages/name"]);
  });
});

describe("segment lines among ordinary children (segment_children)", () => {
  const drawing = drawFixture("segment_children");

  it("places them by first fit in two rows, each with its own name", () => {
    expect(drawing.height).toBe(124.9296875);
    expect(lines(drawing)).toEqual([
      ["piece", "timeline", 84.908203125, 484.908203125, 79.953125, "arrowhead"],
      ["intro", "child", 109.908203125, 184.908203125, 64.953125, "diamond"],
      ["theme", "child", 159.908203125, 309.908203125, 36.4765625, "diamond"],
      ["coda", "child", 359.908203125, 459.908203125, 64.953125, "diamond"],
    ]);
    expect(ofType(drawing, "name")).toMatchObject([
      { address: "theme/name", text: "Theme", baseline: 40.28466796875 },
      { address: "intro/name", text: "Intro, Coda", baseline: 68.76123046875 },
      { address: "piece/name", text: "Piece", baseline: 83.76123046875 },
    ]);
  });

  it("draws only the boundaries and labels of their segments, on their own lines", () => {
    expect(boundaries(drawing)).toEqual([
      ["i2/start", 147.408203125, 56.953125, 72.953125],
      ["t2/start", 209.908203125, 28.4765625, 44.4765625],
      ["t3/start", 259.908203125, 28.4765625, 44.4765625],
      ["c2/start", 422.408203125, 56.953125, 72.953125],
    ]);
    expect(segmentLabels(drawing)).toEqual([
      ["i1/label", 128.658203125, 52.83056640625],
      ["i2/label", 166.158203125, 52.83056640625],
      ["t1/label", 184.908203125, 24.35400390625],
      ["t2/label", 234.908203125, 24.35400390625],
      ["t3/label", 284.908203125, 24.35400390625],
      ["c1/label", 391.158203125, 52.83056640625],
      ["c2/label", 441.158203125, 52.83056640625],
    ]);
  });
});

describe("a segment line whose segments are no lines", () => {
  it("keeps its segments on the root's line, with no children band", () => {
    const drawing = drawFixture("segment_pages");
    expect(drawing.height).toBe(81.453125);
    expect(lines(drawing)).toEqual([
      ["pages", "timeline", 56.85498046875, 456.85498046875, 36.4765625, "open"],
    ]);
    expect(boundaries(drawing)).toEqual([
      ["page_2/start", 156.85498046875, 28.4765625, 44.4765625],
      ["page_3/start", 256.85498046875, 28.4765625, 44.4765625],
      ["page_4/start", 356.85498046875, 28.4765625, 44.4765625],
    ]);
    expect(segmentLabels(drawing)).toEqual([
      ["page_1/label", 106.85498046875, 24.35400390625],
      ["page_2/label", 206.85498046875, 24.35400390625],
      ["page_3/label", 306.85498046875, 24.35400390625],
      ["page_4/label", 406.85498046875, 24.35400390625],
    ]);
  });

  it("ends with the end circle when the root is locked", () => {
    expect(element(drawFixture("segment_pages_locked"), "pages")).toMatchObject({
      end: "circle",
    });
  });
});

describe("segment-label tiers", () => {
  it("fills two tiers when the labels conflict at length 100", () => {
    const drawing = drawFixture("segment_pages", [], { ...DEFAULT_PLACEMENT, length: 100 });
    expect(drawing.height).toBe(91.9296875);
    expect(element(drawing, "pages")).toMatchObject({ y: 46.953125 });
    expect(segmentLabels(drawing)).toEqual([
      ["page_1/label", 69.35498046875, 34.83056640625],
      ["page_2/label", 94.35498046875, 24.35400390625],
      ["page_3/label", 119.35498046875, 34.83056640625],
      ["page_4/label", 144.35498046875, 24.35400390625],
    ]);
  });
});

describe("a line's reach", () => {
  it("counts k only for a drawn boundary", () => {
    const drawing = drawFixture("segment_line", [set({ ids: ["b2/start"] }, { display: "none" })]);
    expect(drawing.height).toBe(104.9296875);
    expect(boundaries(drawing)).toEqual([
      ["b/start", 152.294921875, 51.953125, 67.953125],
      ["c/start", 302.294921875, 51.953125, 67.953125],
    ]);
    expect(element(drawing, "b")).toMatchObject({ y: 28.4765625 });
    expect(segmentLabels(drawing)).toEqual([
      ["a/label", 102.294921875, 47.83056640625],
      ["b/label", 227.294921875, 47.83056640625],
      ["b1/label", 189.794921875, 24.35400390625],
      ["b2/label", 264.794921875, 24.35400390625],
      ["c/label", 377.294921875, 47.83056640625],
    ]);
  });

  it("drops the boundaries and labels of a hidden line, which take no room", () => {
    const drawing = drawFixture("segment_line", [set({ ids: ["b"] }, { display: "none" })]);
    expect([drawing.width, drawing.height]).toEqual([479.573974609375, 99.453125]);
    expect(lines(drawing)).toEqual([
      ["form", "timeline", 52.294921875, 452.294921875, 54.4765625, "open"],
      ["a", "child", 52.294921875, 152.294921875, 23, "diamond"],
      ["c", "child", 302.294921875, 452.294921875, 23, "diamond"],
    ]);
    expect(boundaries(drawing)).toEqual([
      ["b/start", 152.294921875, 46.4765625, 62.4765625],
      ["c/start", 302.294921875, 46.4765625, 62.4765625],
    ]);
    expect(segmentLabels(drawing)).toEqual([
      ["a/label", 102.294921875, 42.35400390625],
      ["b/label", 227.294921875, 42.35400390625],
      ["c/label", 377.294921875, 42.35400390625],
    ]);
  });

  it("takes the stack of a segment line and of its segments", () => {
    let view = apply(createView(), {
      type: "add",
      into: "workspace",
      block: { id: BLOCK, manifest: load("segment_line"), x: 0, y: 0 },
    });
    for (const command of [linearMap("b", "b_map"), linearMap("b1", "b1_map")]) {
      if (!isCommandError(view)) view = apply(view, command);
    }
    if (isCommandError(view)) throw new Error(`${view.code}: ${view.message}`);
    const manifest = (view.blocks[BLOCK] as { readonly manifest: Manifest }).manifest;
    const drawing = draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    expect(drawing.height).toBe(117.4296875);
    expect(element(drawing, "form")).toMatchObject({ y: 72.453125 });
    expect(element(drawing, "b")).toMatchObject({ y: 39.9765625 });
    expect(element(drawing, "form/b_map")).toMatchObject({
      xs: 152.294921875,
      xe: 302.294921875,
      yc: 34.4765625,
    });
    expect(element(drawing, "form/b1_map")).toMatchObject({
      xs: 152.294921875,
      xe: 227.294921875,
      yc: 29.4765625,
    });
    expect(element(drawing, "b1/label")).toMatchObject({ baseline: 24.35400390625 });
    expect(element(drawing, "b2/start")).toMatchObject({ y1: 31.9765625, y2: 47.9765625 });
  });

  it("keeps segment labels above a line below the root", () => {
    const manifest = edit(
      "segment_line",
      setOf("form", {
        order: bandOrder(
          "form",
          ["conversion_maps"],
          ["markers", "children", "regions", "flow_control"],
        ),
      }),
    );
    const drawing = draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    expect(drawing.height).toBe(113.9296875);
    expect(element(drawing, "form")).toMatchObject({ y: 36.4765625 });
    expect(element(drawing, "b")).toMatchObject({ y: 87.9296875 });
    expect(element(drawing, "b1/label")).toMatchObject({ baseline: 75.80712890625 });
    expect(element(drawing, "b2/start")).toMatchObject({ y1: 79.9296875, y2: 95.9296875 });
    expect(element(drawing, "a/label")).toMatchObject({ baseline: 24.35400390625 });
  });

  it("keeps k fixed at another card spacing", () => {
    const placement = { ...DEFAULT_PLACEMENT, places: { form: { spacing: 8 } } };
    const drawing = drawFixture("segment_line", [], placement);
    expect(drawing.height).toBe(118.9296875);
    expect(element(drawing, "form")).toMatchObject({ y: 73.953125 });
    expect(element(drawing, "b")).toMatchObject({ y: 36.4765625 });
    expect(element(drawing, "b/start")).toMatchObject({ y1: 65.953125, y2: 81.953125 });
    expect(element(drawing, "b2/start")).toMatchObject({ y1: 28.4765625, y2: 44.4765625 });
  });
});

describe("the name size of a row of segment lines", () => {
  it("is the cascaded font size of its first line's name", () => {
    const drawing = drawFixture("segment_line", [set({ ids: ["a/name"] }, { "font-size": 40 })]);
    expect(drawing.height).toBe(132.015625);
    expect(element(drawing, "form")).toMatchObject({ y: 87.0390625 });
    expect(element(drawing, "a")).toMatchObject({ y: 39.28125 });
    expect(ofType(drawing, "name").map((item) => item.address)).toEqual(["form/name"]);
  });

  it("ignores the name of any other line of the row", () => {
    expect(
      drawFixture("segment_line", [set({ ids: ["b/name"] }, { "font-size": 40 })]).elements,
    ).toEqual(drawFixture("segment_line").elements);
  });
});

describe("a segment that is no line", () => {
  const manifest = load("segment_pages");
  const strokes = (layer: Graphical) => {
    const drawing = draw(manifest, DEFAULT_PLACEMENT, [layer], metrics);
    return ["page_2/start", "page_2/label", "page_3/start"].map(
      (address) => element(drawing, address).style.stroke,
    );
  };

  it("is never matched by a selector naming element", () => {
    expect(strokes(set({ element: "child" }, { stroke: "#654321" }))).toEqual([
      "none",
      "none",
      "none",
    ]);
  });

  it("leaves its boundary and label to its segment line, which holds them", () => {
    expect(strokes(set({ ids: ["page_2"] }, { stroke: "#123456" }))).toEqual([
      "none",
      "none",
      "none",
    ]);
    expect(strokes(set({ ids: ["pages"] }, { stroke: "#123456" }))).toEqual([
      "#123456",
      "#123456",
      "#123456",
    ]);
    expect(strokes(set({ within: "page_2" }, { stroke: "#123456" }))).toEqual([
      "#123456",
      "#123456",
      "none",
    ]);
  });

  it("passes a segment line's style to its segments' boundaries and labels, not its own", () => {
    const drawing = draw(
      load("segment_line"),
      DEFAULT_PLACEMENT,
      [set({ ids: ["b"] }, { stroke: "#123456" })],
      metrics,
    );
    expect(
      ["b/start", "b2/start", "b1/label", "c/start"].map(
        (address) => element(drawing, address).style.stroke,
      ),
    ).toEqual(["none", "#123456", "#123456", "none"]);
  });
});

describe("a markers band at level 1 above a segment line", () => {
  it("lies against the line, the segment labels beyond it", () => {
    const manifest = edit(
      "segment_pages",
      setOf("pages", {
        order: bandOrder(
          "pages",
          ["children", "conversion_maps", "markers"],
          ["regions", "flow_control"],
        ),
      }),
    );
    const drawing = draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    expect(drawing.height).toBe(81.453125);
    expect(element(drawing, "pages")).toMatchObject({ y: 55.453125 });
    expect(segmentLabels(drawing).map((item) => item[2])).toEqual([
      24.35400390625, 24.35400390625, 24.35400390625, 24.35400390625,
    ]);
    expect(element(drawing, "pages/start")).toMatchObject({ yt: 53.953125, yb: 40.953125 });
    expect(element(drawing, "pages/end/label")).toMatchObject({ baseline: 36.83056640625 });
    expect(element(drawing, "page_2/start")).toMatchObject({ y1: 47.453125, y2: 63.453125 });
  });
});

describe("the regions of segments without a line", () => {
  it("join their segment line's regions band when shown", () => {
    const drawing = drawFixture("unknown_length_segments", [
      set({ element: "band", class: "regions" }, { display: "inline" }),
    ]);
    expect(drawing.height).toBe(91.453125);
    expect(
      ofType(drawing, "region").flatMap((item) =>
        item.type === "region" ? [[item.address, item.x1, item.x2, item.xm, item.yb, item.ya]] : [],
      ),
    ).toEqual([
      [
        "form/region_1",
        49.84033203125,
        143.95797909007354,
        96.89915556066177,
        54.9765625,
        60.9765625,
      ],
      [
        "form/region_2",
        379.2520967371323,
        449.84033203125,
        414.54621438419116,
        54.9765625,
        60.9765625,
      ],
    ]);
  });

  it("are hidden by default with the bands of every timeline held by a band", () => {
    expect(ofType(drawFixture("unknown_length_segments"), "region")).toEqual([]);
  });
});
