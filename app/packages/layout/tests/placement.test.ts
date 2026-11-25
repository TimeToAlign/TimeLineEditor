/** Jump levels and order, a float axis, and the band order, at exact ordinates. */

import { type ElementAddress, type Facet, sameAddress } from "@timetoalign/tilie-core";
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
  at,
  bandOrder,
  build,
  drawFixture,
  edit,
  load,
  metrics,
  quarters,
  set,
  target,
} from "./support.ts";

/**
 * A jump at `from` with `label` as its id and its label, and the jump
 * target `<label>_to` at `to` that it names, added in that order.
 */
const jump = (from: number, to: number, label: string) => [
  {
    type: "add",
    into: target("r"),
    flow_control: {
      id: `${label}_to`,
      role: "jump_target",
      manifestation: "repeat_start",
      coordinate: quarters(to),
    },
  },
  {
    type: "add",
    into: target("r"),
    flow_control: {
      id: label,
      role: "jump",
      coordinate: quarters(from),
      targets: [{ to: `${label}_to`, manifestation: "repeat_end", repeat_count: 2 }],
      label,
      meta: {},
    },
  },
];

describe("jump placement order and rows", () => {
  it("places five jumps in four exact rows and emits them in placement order", () => {
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
    const jumps = drawing.elements.filter((item): item is JumpElement => item.type === "jump");
    const ids = ["one", "two", "three", "four", "five"];
    expect(jumps.map((item) => item.address)).toEqual(ids.map((id) => at(id)));
    const yf = 53.37890625;
    expect(jumps.map((item) => item.start[1])).toEqual([yf, yf, yf, yf, yf]);
    // The factor 4/3 is formed first: on level 4 the binary64 product would give 145.95182291666666.
    expect(jumps.map((item) => item.c1[1])).toEqual([
      64.04557291666666, 64.04557291666666, 91.34765625, 118.64973958333333, 145.95182291666669,
    ]);
    const labels = ids.map((id) => at(id, "label"));
    expect(
      drawing.elements
        .filter(
          (item) =>
            item.type === "label" && labels.some((label) => sameAddress(item.address, label)),
        )
        .map((item) => item.address),
    ).toEqual(labels);
  });
});

describe("jumps of corpus_score_ms3", () => {
  const drawing = drawFixture("corpus_score_ms3");
  const jumps = drawing.elements.filter((item): item is JumpElement => item.type === "jump");
  /** The first arc drawn at `address`, the one of its smallest span. */
  const jump = (address: ElementAddress) => {
    const found = jumps.find((item) => sameAddress(item.address, address));
    if (found === undefined) throw new Error(`no jump ${JSON.stringify(address)}`);
    return found;
  };

  it("places the arcs by span in six rows beyond the flow row, no flow line carrying a label", () => {
    expect(drawing.height).toBe(205.859375);
    expect(drawing.elements.find((item) => sameAddress(item.address, at("clt_1")))).toMatchObject({
      y: 59.5,
    });
    expect(jumps.map((item) => item.address)).toEqual(
      ["jump_2", "jump_7", "jump_2", "jump_3", "jump_5", "jump_1"]
        .concat(["jump_11", "jump_6", "jump_9", "jump_4", "jump_8", "jump_10"])
        .map((id) => at(id)),
    );
    expect(jumps.map((item) => item.start[1])).toEqual(jumps.map(() => 65));
    const yc = [
      75.66666666666667, 102.96875, 130.27083333333331, 157.57291666666669, 184.875,
      212.17708333333334,
    ];
    const rows = [1, 1, 2, 3, 1, 1, 2, 3, 4, 4, 5, 6];
    expect(jumps.map((item) => item.c1[1])).toEqual(rows.map((row) => yc[row - 1]));
    expect(
      drawing.elements.filter(
        (item) => item.type === "label" && item.address.id?.startsWith("break") === true,
      ),
    ).toEqual([]);
  });

  it("arrives steeply on a short jump", () => {
    expect(jump(at("jump_2"))).toMatchObject({
      start: [143.77772645692568, 65],
      c1: [149.1831318623311, 75.66666666666667],
      c2: [159.99394267314187, 75.66666666666667],
      tip: [165.3993480785473, 65],
      base: [163.59123312957058, 68.568013499314],
      corners: [
        [161.80722637991357, 67.66395602482567],
        [165.3752398792276, 69.47207097380235],
      ],
    });
  });

  it("arrives flatter on the longest jump", () => {
    expect(jump(at("jump_10"))).toMatchObject({
      start: [468.10205078125, 65],
      c1: [368.10205078125, 212.17708333333334],
      c2: [168.10205078125, 212.17708333333334],
      tip: [68.10205078125, 65],
      base: [70.3500545434396, 68.30854637041426],
      corners: [
        [68.69578135823247, 69.43254825150906],
        [72.00432772864673, 67.18454448931946],
      ],
    });
  });
});

describe("float axis", () => {
  it("uses binary64 proportions and float coordinate text", () => {
    const drawing = drawFixture("continuous_physical");
    const root = drawing.elements.find((item) => sameAddress(item.address, at("cpt_1")));
    const first = drawing.elements.find((item) => sameAddress(item.address, at("cpt_2")));
    // The coordinate labels of the root's `origin` and `length`.
    const labels = drawing.elements.filter(
      (item): item is TextElement =>
        item.type === "label" && item.address.part?.[0] === "coordinate",
    );
    expect(root).toMatchObject({ xs: 90.6767578125, xe: 490.6767578125 });
    expect(first).toMatchObject({ xs: 106.6767578125, xe: 242.6767578125 });
    expect(labels.map((item) => item.text)).toEqual(["0″", "12.5″"]);
  });

  it("labels a float rounded to three places, carrying the exact coordinate", () => {
    const labelled = (length: number) => {
      const manifest = edit(
        "continuous_physical",
        { type: "remove", targets: [target("cpt_2"), target("cpt_3")] },
        set("cpt_1", { length }),
      );
      const drawing = draw(
        manifest,
        DEFAULT_PLACEMENT,
        [DEFAULT_LAYER, manifestLayer(manifest)],
        metrics,
      );
      return drawing.elements
        .filter((item): item is TextElement => item.type === "label")
        .map((item) => [item.text, item.coordinate?.value]);
    };
    expect(labelled(312.48979591836735)).toEqual([
      ["0″", 0],
      ["5′12.49″", 312.48979591836735],
    ]);
    expect(labelled(6)).toEqual([
      ["0″", 0],
      ["6″", 6],
    ]);
    expect(labelled(6.71875)[1]).toEqual(["6.719″", 6.71875]);
    expect(labelled(0.0625)[1]).toEqual(["0.062″", 0.0625]);
    expect(labelled(1e-5)[1]).toEqual(["0″", 1e-5]);
  });
});

describe("band order", () => {
  /** `with_region` with the band order of its root `clt_1` holding `above` above its line. */
  const ordered = (above: readonly Facet[]) => {
    const order = bandOrder(above, ["markers", "flow_control"]);
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
      [at("region_1"), 34.4765625, 28.4765625],
      [at("clt_1"), 73.4765625],
      [at("clt_2"), 59.4765625],
      [at("clt_3"), 45.4765625],
    ]);
    expect(outer.height).toBe(118.453125);
    expect(geometry(inner)).toEqual([
      [at("region_1"), 66.4765625, 60.4765625],
      [at("clt_1"), 71.9765625],
      [at("clt_2"), 37],
      [at("clt_3"), 23],
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
        { rules: [{ select: { element: "name" }, set: { content: "a very wide row name" } }] },
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
