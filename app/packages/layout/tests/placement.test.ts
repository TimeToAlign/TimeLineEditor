/** Jump levels and order, a float axis, and the band order, at exact ordinates. */

import type { BandKind } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  type JumpElement,
  manifestLayer,
  type TextElement,
} from "../src/index.ts";
import {
  BLOCK,
  bandOrder,
  build,
  drawFixture,
  edit,
  load,
  metrics,
  quarters,
  set,
} from "./support.ts";

/**
 * A jump origin at `from` with `label` as its id and its label, and the jump
 * target `<label>_to` at `to` that it names, added in that order.
 */
const jump = (from: number, to: number, label: string) => [
  {
    type: "add",
    into: `${BLOCK}/r`,
    flow_control: {
      id: `${label}_to`,
      type: "jump_to",
      manifestation: "repeat_start",
      coordinate: quarters(to),
    },
  },
  {
    type: "add",
    into: `${BLOCK}/r`,
    flow_control: {
      id: label,
      type: "jump_from",
      manifestation: "repeat_end",
      coordinate: quarters(from),
      target: `${label}_to`,
      repeat_count: 2,
      label,
      meta: {},
    },
  },
];

describe("jump placement order and levels", () => {
  it("places five jumps on four exact levels and emits them in placement order", () => {
    const manifest = build(
      "r",
      16,
      ...jump(4, 6, "one"),
      ...jump(8, 10, "two"),
      ...jump(3, 11, "three"),
      ...jump(2, 12, "four"),
      ...jump(1, 13, "five"),
    );
    const drawing = draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    const jumps = drawing.elements.filter((item): item is JumpElement => item.type === "jump_from");
    expect(jumps.map((item) => item.address)).toEqual([
      "r/one",
      "r/two",
      "r/three",
      "r/four",
      "r/five",
    ]);
    const yf = 53.37890625;
    expect(jumps.map((item) => item.start[1])).toEqual([yf, yf, yf, yf, yf]);
    // The factor 4/3 is formed first: on level 4 the binary64 product would give 145.95182291666666.
    expect(jumps.map((item) => item.c1[1])).toEqual([
      64.04557291666666, 64.04557291666666, 91.34765625, 118.64973958333333, 145.95182291666669,
    ]);
    expect(
      drawing.elements
        .filter(
          (item) =>
            item.type === "label" && jumps.some((jump) => item.address === `${jump.address}/label`),
        )
        .map((item) => item.address),
    ).toEqual(["r/one/label", "r/two/label", "r/three/label", "r/four/label", "r/five/label"]);
  });
});

describe("jumps of corpus_score_ms3", () => {
  const drawing = drawFixture("corpus_score_ms3");
  const jump = (address: string) => {
    const found = drawing.elements.find((item) => item.address === address);
    if (found?.type !== "jump_from") throw new Error(`no jump ${address}`);
    return found;
  };

  it("places the jumps on the flow row below the flow-marker label tier", () => {
    expect(drawing.height).toBe(175.3828125);
    expect(drawing.elements.find((item) => item.address === "clt_1")).toMatchObject({ y: 54.5 });
    expect(
      drawing.elements.filter((item) => item.type === "jump_from").map((item) => item.address),
    ).toEqual(["clt_1/jump_2", "clt_1/jump_1", "clt_1/jump_3", "clt_1/jump_4"]);
    expect(drawing.elements.find((item) => item.address === "clt_1/break_1/label")).toMatchObject({
      baseline: 93.83056640625,
    });
  });

  it("arrives steeply on a short jump", () => {
    expect(jump("clt_1/jump_2")).toMatchObject({
      start: [165.3993480785473, 95.953125],
      c1: [157.2912399704392, 106.61979166666667],
      c2: [141.07502375422297, 106.61979166666667],
      tip: [132.96691564611487, 95.953125],
      base: [135.38752148242557, 99.13756645576875],
      corners: [
        [133.7953007545412, 100.3478693739241],
        [136.97974221030995, 97.9272635376134],
      ],
    });
  });

  it("arrives flatly on a long jump", () => {
    expect(jump("clt_1/jump_4")).toMatchObject({
      start: [468.10205078125, 95.953125],
      c1: [368.10205078125, 161.22395833333331],
      c2: [168.10205078125, 161.22395833333331],
      tip: [68.10205078125, 95.953125],
      base: [71.45167385263575, 98.13945189221907],
      corners: [
        [70.35851040652622, 99.81426342791194],
        [72.54483729874529, 96.4646403565262],
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
    expect(root).toMatchObject({ xs: 90.6767578125, xe: 490.6767578125 });
    expect(first).toMatchObject({ xs: 106.6767578125, xe: 242.6767578125 });
    expect(labels.map((item) => item.text)).toEqual(["0.0 s", "12.5 s"]);
  });
});

describe("band order", () => {
  /** `with_region` with the band order of its root `clt_1` holding `above` above its line. */
  const ordered = (above: readonly BandKind[]) => {
    const order = bandOrder("clt_1", above, ["markers", "flow_control"]);
    const manifest = edit("with_region", set("clt_1", { order }));
    return draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, manifestLayer(manifest)], metrics);
  };
  const geometry = (drawing: Drawing) =>
    drawing.elements.flatMap((item) => {
      if (item.type === "timeline" || item.type === "child") return [[item.address, item.y]];
      if (item.type === "region") return [[item.address, item.yb, item.ya]];
      return [];
    });

  it("lays the bands of a side outward in the timeline's band order", () => {
    const outer = ordered(["regions", "children", "conversion_maps"]);
    const inner = ordered(["children", "regions", "conversion_maps"]);
    expect(geometry(outer)).toEqual([
      ["clt_1/region_1", 34.4765625, 28.4765625],
      ["clt_1", 73.4765625],
      ["clt_2", 59.4765625],
      ["clt_3", 45.4765625],
    ]);
    expect(outer.height).toBe(118.453125);
    expect(geometry(inner)).toEqual([
      ["clt_1/region_1", 66.4765625, 60.4765625],
      ["clt_1", 71.9765625],
      ["clt_2", 37],
      ["clt_3", 23],
    ]);
    expect(inner.height).toBe(116.953125);
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
