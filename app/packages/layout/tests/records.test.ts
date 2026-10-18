/** `Drawing.bands`, the records of the present bands; every number is derived in tests/README.md. */

import { type Manifest, parseBand } from "@timetoalign/tilie-core";
import { type Graphical, validate } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnBand,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import { BLOCK, build, child, drawFixture, edit, metrics, quarters, scalarMap } from "./support.ts";

const drawn = (
  manifest: Manifest,
  extra: readonly Graphical[] = [],
  placement: Placement = DEFAULT_PLACEMENT,
): Drawing =>
  draw(manifest, placement, [DEFAULT_LAYER, ...extra, manifestLayer(manifest)], metrics);

const record = (
  address: string,
  level: number,
  elements: number,
  line: number,
  rectangle: Pick<DrawnBand, "x" | "y" | "width" | "height">,
): DrawnBand => {
  const [timeline, band] = address.split("/") as [string, string];
  const kind = band.slice(0, -2) as DrawnBand["kind"];
  return { address, timeline, kind, level, line, elements, ...rectangle };
};

describe("a root with bands on both sides (styled__score)", () => {
  it("records each present band top to bottom, from its start to its outer edge", () => {
    const x = 89.951171875;
    const width = 416.2578125;
    const line = 62.640625;
    expect(drawFixture("styled__score").bands).toEqual([
      record("score/children_1", 2, 1, line, { x, y: 16, width, height: 14 }),
      record("score/markers_1", 1, 2, line, { x, y: 34, width, height: 28.640625 }),
      record("score/conversion_maps_1", -1, 1, line, { x, y: 62.640625, width, height: 7 }),
      record("score/regions_1", -2, 1, line, { x, y: 73.640625, width, height: 19.640625 }),
      record("score/flow_control_1", -3, 1, line, { x, y: 97.28125, width, height: 21.640625 }),
    ]);
  });
});

describe("a child's shown regions band", () => {
  const manifest = build("r", 8, child("r", "c", 2, 4), {
    type: "add",
    into: `${BLOCK}/c`,
    region: { id: "region_1", name: null, start: quarters(0), end: quarters(4), meta: {} },
  });
  const shown: Graphical = {
    statements: [{ select: { ids: ["c/regions_1"] }, set: { display: "inline" } }],
  };
  const root = { x: 22.6318359375, width: 414.83203125 };

  it("is hidden by default and then not recorded, taking no room", () => {
    expect(drawn(manifest).bands).toEqual([
      record("r/children_1", 1, 1, 37, { ...root, y: 16, height: 14 }),
      record("r/markers_1", -1, 2, 37, { ...root, y: 37, height: 26.9765625 }),
    ]);
  });

  it("is recorded at its own line, spanning its timeline's extent", () => {
    expect(drawn(manifest, [shown]).bands).toEqual([
      record("r/children_1", 1, 1, 53.9765625, { ...root, y: 16, height: 30.9765625 }),
      record("r/markers_1", -1, 2, 53.9765625, { ...root, y: 53.9765625, height: 26.9765625 }),
      record("c/regions_1", -1, 1, 23, {
        x: 130.0478515625,
        y: 28.5,
        width: 200,
        height: 18.4765625,
      }),
    ]);
  });

  it("goes with a hidden root line, which leaves the root's card alone", () => {
    const hidden: Graphical = {
      statements: [{ select: { ids: ["r"] }, set: { display: "none" } }],
    };
    const drawing = drawn(manifest, [shown, hidden]);
    expect(drawing.bands).toEqual([]);
    expect(drawing.elements.map((item) => [item.type, item.address])).toEqual([
      ["block", null],
      ["card", "r/card"],
    ]);
    expect(drawing.elements[1]).toMatchObject({ x: 8, y: 8, width: 16, height: 28.8046875 });
    expect([drawing.width, drawing.height]).toEqual([34, 46.8046875]);
  });

  it("is placed as its item is, at its scale and shifted by the place origin", () => {
    const placement = { ...DEFAULT_PLACEMENT, places: { r: { x: -12, y: -20, scale: 2 } } };
    const drawing = drawn(manifest, [shown], placement);
    expect(drawing.origin).toEqual({ x: 20, y: 28 });
    expect(drawing.bands[2]).toEqual(
      record("c/regions_1", -1, 1, 38, { x: 252.095703125, y: 49, width: 400, height: 36.953125 }),
    );
    expect(drawing.elements.find((item) => item.address === "c")).toMatchObject({ y: 38 });
  });
});

describe("a segment line's band holding its segments' content", () => {
  it("counts what they join to it, labels not", () => {
    const drawing = drawFixture("unknown_length_segments", [
      {
        statements: [{ select: { element: "band", class: "regions" }, set: { display: "inline" } }],
      },
    ]);
    const span = { x: 42.42431640625, width: 435.916015625 };
    expect(drawing.bands).toEqual([
      record("form/markers_1", -1, 1, 24, { ...span, y: 24, height: 26.9765625 }),
      record("form/regions_1", -2, 2, 24, { ...span, y: 54.9765625, height: 18.4765625 }),
    ]);
  });
});

describe("a present band 0 high", () => {
  it("is recorded with height 0", () => {
    const manifest = build("r", 8, {
      type: "add",
      into: `${BLOCK}/r`,
      break: { id: "fine", name: null, coordinate: quarters(4), label: null, meta: {} },
    });
    expect(drawn(manifest).bands[1]).toEqual(
      record("r/flow_control_1", -2, 1, 22.40234375, {
        x: 21.1064453125,
        y: 53.37890625,
        width: 414.83203125,
        height: 0,
      }),
    );
  });
});

describe("a timeline drawn twice: a child in one card, a member in another", () => {
  const source = edit("with_region", scalarMap("clt_2", "tempo"));
  const manifest: Manifest = {
    ...source,
    groups: [
      { id: "g1", name: null, meta: {}, members: ["clt_1"] },
      { id: "g2", name: null, meta: {}, members: ["clt_2"] },
    ],
  };
  validate(manifest);
  const bands = drawn(manifest).bands;

  it("records each drawing's bands at its own line, in drawing order", () => {
    expect(bands.map((band) => [band.address, band.line])).toEqual([
      ["clt_1/children_1", 75.8046875],
      ["clt_1/markers_1", 75.8046875],
      ["clt_1/regions_1", 75.8046875],
      ["clt_2/conversion_maps_1", 61.8046875],
      ["clt_2/conversion_maps_1", 226.5390625],
      ["clt_2/markers_1", 226.5390625],
    ]);
  });

  it("gives the same address two rectangles", () => {
    expect(bands.filter((band) => band.address === "clt_2/conversion_maps_1")).toEqual([
      record("clt_2/conversion_maps_1", 1, 1, 61.8046875, {
        x: 93.02663845486111,
        y: 55.3046875,
        width: 133.33333333333331,
        height: 6.5,
      }),
      record("clt_2/conversion_maps_1", 1, 1, 226.5390625, {
        x: 74.49951171875,
        y: 220.0390625,
        width: 414.83203125,
        height: 6.5,
      }),
    ]);
  });
});

describe("bands draw nothing", () => {
  it("adds no element for a band", () => {
    const drawing = drawFixture("styled__score");
    expect(drawing.bands).toHaveLength(5);
    expect(
      drawing.elements.filter((item) => item.address !== null && parseBand(item.address) !== null),
    ).toEqual([]);
  });
});
