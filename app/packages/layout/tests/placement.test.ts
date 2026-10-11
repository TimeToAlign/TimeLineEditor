/** Jump levels and order, a float axis, and the band order, at exact ordinates. */

import type { Graphical } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  type JumpElement,
  type TextElement,
} from "../src/index.ts";
import { BLOCK, build, drawFixture, load, metrics, quarters } from "./support.ts";

const jump = (from: number, to: number, label: string) => ({
  type: "add",
  into: `${BLOCK}/r`,
  jump: {
    id: label,
    from_coordinate: quarters(from),
    to_coordinate: quarters(to),
    control_type: "repeat_end",
    condition: "first_n",
    repeat_count: 2,
    target: null,
    label,
    meta: {},
  },
});

describe("jump placement order and levels", () => {
  it("places four jumps on three exact levels and emits them in placement order", () => {
    const manifest = build(
      "r",
      16,
      jump(4, 6, "one"),
      jump(8, 10, "two"),
      jump(3, 11, "three"),
      jump(2, 12, "four"),
    );
    const drawing = draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    const jumps = drawing.elements.filter((item): item is JumpElement => item.type === "jump");
    expect(jumps.map((item) => item.address)).toEqual(["one", "two", "three", "four"]);
    const yf = 45.37890625;
    expect(jumps.map((item) => item.start[1])).toEqual([yf, yf, yf, yf]);
    expect(jumps.map((item) => item.c1[1])).toEqual([
      yf + (4 / 3) * 8,
      yf + (4 / 3) * 8,
      yf + (4 / 3) * 28.4765625,
      yf + (4 / 3) * 48.953125,
    ]);
    expect(
      drawing.elements
        .filter(
          (item) =>
            item.type === "label" && jumps.some((jump) => item.address === `${jump.address}/label`),
        )
        .map((item) => item.address),
    ).toEqual(["one/label", "two/label", "three/label", "four/label"]);
  });
});

describe("jumps of corpus_score_ms3", () => {
  const drawing = drawFixture("corpus_score_ms3");
  const jump = (address: string) => {
    const found = drawing.elements.find((item) => item.address === address);
    if (found?.type !== "jump") throw new Error(`no jump ${address}`);
    return found;
  };

  it("places the jumps on the flow row below the break-label tier", () => {
    expect(drawing.height).toBe(157.3828125);
    expect(drawing.elements.find((item) => item.address === "clt_1")).toMatchObject({ y: 46.5 });
    expect(
      drawing.elements.filter((item) => item.type === "jump").map((item) => item.address),
    ).toEqual(["jump_2", "jump_1", "jump_3", "jump_4"]);
    expect(drawing.elements.find((item) => item.address === "break_1/label")).toMatchObject({
      baseline: 85.83056640625,
    });
  });

  it("arrives steeply on a short jump", () => {
    expect(jump("jump_2")).toMatchObject({
      start: [157.3993480785473, 87.953125],
      c1: [149.2912399704392, 98.61979166666667],
      c2: [133.07502375422297, 98.61979166666667],
      tip: [124.96691564611487, 87.953125],
      base: [128.59782440058092, 92.72978718365312],
      corners: [
        [126.20949330875436, 94.54524156088614],
        [130.98615549240748, 90.91433280642009],
      ],
    });
  });

  it("arrives flatly on a long jump", () => {
    expect(jump("jump_4")).toMatchObject({
      start: [460.10205078125, 87.953125],
      c1: [360.10205078125, 153.22395833333331],
      c2: [160.10205078125, 153.22395833333331],
      tip: [60.10205078125, 87.953125],
      base: [65.12648538832862, 91.23261533832861],
      corners: [
        [63.48674021916431, 93.74483264186793],
        [66.76623055749292, 88.7203980347893],
      ],
    });
  });
});

describe("float axis", () => {
  it("uses binary64 proportions and float coordinate text", () => {
    const drawing = drawFixture("continuous_physical");
    const root = drawing.elements.find((item) => item.address === "cpt_1");
    const first = drawing.elements.find((item) => item.address === "cpt_2");
    const labels = drawing.elements.filter(
      (item): item is TextElement => item.type === "label" && item.address.startsWith("cpt_1/"),
    );
    expect(root).toMatchObject({ xs: 82.6767578125, xe: 482.6767578125 });
    expect(first).toMatchObject({ xs: 98.6767578125, xe: 234.6767578125 });
    expect(labels.map((item) => item.text)).toEqual(["0.0 s", "12.5 s"]);
  });
});

describe("band order", () => {
  const regionAbove: Graphical = {
    statements: [{ select: { element: "region" }, set: { side: "above" } }],
  };
  const geometry = (drawing: Drawing) =>
    drawing.elements.flatMap((item) => {
      if (item.type === "timeline" || item.type === "child") return [[item.address, item.y]];
      if (item.type === "region") return [[item.address, item.yb, item.ya]];
      return [];
    });

  it("lays groups outward in the requested order", () => {
    const normal = drawFixture("with_region", [regionAbove]);
    const reversed = drawFixture("with_region", [regionAbove], {
      ...DEFAULT_PLACEMENT,
      order: ["flow", "regions", "children"],
    });
    expect(geometry(normal)).toEqual([
      ["region_1", 26.4765625, 20.4765625],
      ["clt_1", 65.4765625],
      ["clt_2", 51.4765625],
      ["clt_3", 37.4765625],
    ]);
    expect(normal.height).toBe(100.453125);
    expect(geometry(reversed)).toEqual([
      ["region_1", 58.4765625, 52.4765625],
      ["clt_1", 58.4765625],
      ["clt_2", 29],
      ["clt_3", 15],
    ]);
    expect(reversed.height).toBe(93.453125);
  });

  it("keeps first-fit rows independent of name width and x0", () => {
    const manifest = load("map");
    const narrow = draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    const wide = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [
        DEFAULT_LAYER,
        { statements: [{ select: { element: "name" }, set: { content: "a very wide row name" } }] },
      ],
      metrics,
    );
    const rows = (drawing: typeof narrow) =>
      drawing.elements.flatMap((item) =>
        item.type === "child"
          ? [[item.address, item.y]]
          : item.type === "map"
            ? [[item.address, item.yc]]
            : [],
      );
    expect(rows(wide)).toEqual(rows(narrow));
  });
});
