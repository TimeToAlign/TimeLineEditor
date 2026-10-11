/** Hand-derived drawings; every number is derived in tests/README.md. */

import { Rational } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import type { Drawing } from "../src/index.ts";
import { drawFixture, element } from "./support.ts";

/** The elements without their styles, for comparison with hand-derived geometry. */
function geometry(drawing: Drawing): unknown[] {
  return drawing.elements.map(({ style: _, ...rest }) => rest);
}

const q = (value: number) => ({ unit: "quarters", value: Rational.of(value) });
const wedges = (x0: number, xe: number, root: string) => [
  { type: "wedge", address: `${root}/start`, x: x0, yt: 0, yb: 0 },
  { type: "wedge", address: `${root}/end`, x: xe, yt: 0, yb: 0 },
];

describe("bare", () => {
  const drawing = drawFixture("bare");
  it("draws the hand-derived geometry", () => {
    const x0 = 41.5771484375;
    const xe = 441.5771484375;
    const tips = wedges(x0, xe, "bare").map((item) => ({
      ...item,
      yt: 15.90234375,
      yb: 28.90234375,
    }));
    expect(geometry(drawing)).toEqual([
      { type: "block", address: null, width: 458.5771484375, height: 49.37890625 },
      { type: "timeline", address: "bare", xs: x0, xe, y: 14.40234375, locked: false },
      ...tips,
      {
        type: "name",
        address: "bare/name",
        x: 8,
        baseline: 18.21044921875,
        anchor: "start",
        text: "Bare",
      },
      {
        type: "label",
        address: "bare/start/label",
        x: x0,
        baseline: 39.25634765625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "bare/end/label",
        x: xe,
        baseline: 39.25634765625,
        anchor: "middle",
        text: "8 ♩",
        coordinate: q(8),
      },
    ]);
    expect(drawing.width).toBe(458.5771484375);
    expect(drawing.height).toBe(49.37890625);
    expect(drawing.unmapped).toEqual([]);
  });

  it("styles with the default layer", () => {
    expect(element(drawing, null).style).toMatchObject({ fill: "#F3F4F6", rx: 10 });
    expect(element(drawing, "bare").style).toMatchObject({
      stroke: "#00CC00",
      fill: "#00CC00",
      "stroke-width": 3,
      "stroke-dasharray": "none",
    });
    expect(element(drawing, "bare/start").style).toMatchObject({
      fill: "#000000",
      stroke: "#00CC00",
      "stroke-width": 3,
    });
    expect(element(drawing, "bare/name").style).toMatchObject({ fill: "#000000", "font-size": 11 });
    expect(element(drawing, "bare/end/label").style).toMatchObject({
      fill: "#000000",
      "font-size": 9,
    });
  });
});

describe("nested", () => {
  it("draws the hand-derived geometry", () => {
    const drawing = drawFixture("nested");
    const x0 = 41.91552734375;
    expect(geometry(drawing)).toEqual([
      { type: "block", address: null, width: 459.194580078125, height: 77.9765625 },
      { type: "timeline", address: "clt_1", xs: x0, xe: 441.91552734375, y: 43, locked: false },
      {
        type: "child",
        address: "clt_3",
        xs: 141.91552734375,
        xe: 341.91552734375,
        y: 29,
        locked: true,
      },
      {
        type: "child",
        address: "clt_2",
        xs: 179.41552734375,
        xe: 229.41552734375,
        y: 15,
        locked: true,
      },
      ...wedges(x0, 441.91552734375, "clt_1").map((item) => ({ ...item, yt: 44.5, yb: 57.5 })),
      {
        type: "name",
        address: "clt_2/name",
        x: 8,
        baseline: 18.80810546875,
        anchor: "start",
        text: "clt_2",
      },
      {
        type: "name",
        address: "clt_3/name",
        x: 8,
        baseline: 32.80810546875,
        anchor: "start",
        text: "clt_3",
      },
      {
        type: "name",
        address: "clt_1/name",
        x: 8,
        baseline: 46.80810546875,
        anchor: "start",
        text: "clt_1",
      },
      {
        type: "label",
        address: "clt_1/start/label",
        x: x0,
        baseline: 67.85400390625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "clt_1/end/label",
        x: 441.91552734375,
        baseline: 67.85400390625,
        anchor: "middle",
        text: "16 ♩",
        coordinate: q(16),
      },
    ]);
  });
});

describe("flow_control", () => {
  it("draws the hand-derived geometry", () => {
    const drawing = drawFixture("flow_control");
    const x0 = 82.9775390625;
    const yRoot = 14.40234375;
    const yf = 55.85546875;
    const yc = 66.52213541666667;
    expect(geometry(drawing)).toEqual([
      { type: "block", address: null, width: 500.256591796875, height: 84.33203125 },
      { type: "break", address: "break_1", x: 382.9775390625, y1: yf, y2: 8 },
      {
        type: "jump",
        address: "jump_1",
        start: [282.9775390625, yf],
        c1: [245.4775390625, yc],
        c2: [170.4775390625, yc],
        tip: [132.9775390625, yf],
        base: [138.74861456043942, 57.49701911385832],
        corners: [
          [137.92783937851027, 60.382556862828025],
          [139.56938974236857, 54.61148136488862],
        ],
      },
      {
        type: "timeline",
        address: "flow:quarters",
        xs: x0,
        xe: 482.9775390625,
        y: yRoot,
        locked: false,
      },
      ...wedges(x0, 482.9775390625, "flow:quarters").map((item) => ({
        ...item,
        yt: 15.90234375,
        yb: 28.90234375,
      })),
      {
        type: "name",
        address: "flow:quarters/name",
        x: 8,
        baseline: 18.21044921875,
        anchor: "start",
        text: "Flow control",
      },
      {
        type: "label",
        address: "flow:quarters/start/label",
        x: x0,
        baseline: 39.25634765625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "flow:quarters/end/label",
        x: 482.9775390625,
        baseline: 39.25634765625,
        anchor: "middle",
        text: "16 ♩",
        coordinate: q(16),
      },
      {
        type: "label",
        address: "jump_1/label",
        x: 207.9775390625,
        baseline: 74.20947265625,
        anchor: "middle",
        text: "Repeat",
      },
      {
        type: "label",
        address: "break_1/label",
        x: 385.9775390625,
        baseline: 53.73291015625,
        anchor: "start",
        text: "Fine",
      },
    ]);
  });
});

describe("map", () => {
  it("draws the hand-derived geometry", () => {
    const drawing = drawFixture("map");
    const x0 = 55.53662109375;
    expect(geometry(drawing)).toEqual([
      { type: "block", address: null, width: 472.53662109375, height: 67.4765625 },
      { type: "map", address: "tempo", xs: x0, xe: 455.53662109375, yc: 27 },
      {
        type: "map",
        address: "ticks",
        xs: 155.53662109375,
        xe: 355.53662109375,
        yc: 9.5,
      },
      { type: "timeline", address: "melody", xs: x0, xe: 455.53662109375, y: 32.5, locked: false },
      {
        type: "child",
        address: "phrase",
        xs: 155.53662109375,
        xe: 355.53662109375,
        y: 15,
        locked: true,
      },
      ...wedges(x0, 455.53662109375, "melody").map((item) => ({ ...item, yt: 34, yb: 47 })),
      {
        type: "name",
        address: "phrase/name",
        x: 8,
        baseline: 18.80810546875,
        anchor: "start",
        text: "Phrase",
      },
      {
        type: "name",
        address: "melody/name",
        x: 8,
        baseline: 36.30810546875,
        anchor: "start",
        text: "Melody",
      },
      {
        type: "label",
        address: "melody/start/label",
        x: x0,
        baseline: 57.35400390625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "melody/end/label",
        x: 455.53662109375,
        baseline: 57.35400390625,
        anchor: "middle",
        text: "8 ♩",
        coordinate: q(8),
      },
    ]);
    expect(element(drawing, "tempo").style).toMatchObject({
      stroke: "#0050EF",
      "stroke-width": 1,
      "stroke-dasharray": "none",
    });
    expect(element(drawing, "ticks").style).toMatchObject({
      stroke: "#00CC00",
      "stroke-width": 1,
      "stroke-dasharray": "1 1",
    });
  });
});

describe("with_region", () => {
  it("draws the hand-derived geometry", () => {
    const drawing = drawFixture("with_region");
    const x0 = 41.91552734375;
    const x = (u: number) => x0 + 400 * u;
    expect(geometry(drawing)).toEqual([
      { type: "block", address: null, width: 459.194580078125, height: 100.453125 },
      {
        type: "region",
        address: "region_1",
        x1: x(1 / 6),
        x2: 241.91552734375,
        xm: 175.24886067708331,
        yb: 73.9765625,
        ya: 79.9765625,
      },
      { type: "timeline", address: "clt_1", xs: x0, xe: 441.91552734375, y: 43, locked: false },
      { type: "child", address: "clt_2", xs: x(1 / 36), xe: x(13 / 36), y: 29, locked: true },
      { type: "child", address: "clt_3", xs: x(1 / 6), xe: x(5 / 12), y: 15, locked: true },
      ...wedges(x0, 441.91552734375, "clt_1").map((item) => ({ ...item, yt: 44.5, yb: 57.5 })),
      {
        type: "name",
        address: "clt_3/name",
        x: 8,
        baseline: 18.80810546875,
        anchor: "start",
        text: "clt_3",
      },
      {
        type: "name",
        address: "clt_2/name",
        x: 8,
        baseline: 32.80810546875,
        anchor: "start",
        text: "clt_2",
      },
      {
        type: "name",
        address: "clt_1/name",
        x: 8,
        baseline: 46.80810546875,
        anchor: "start",
        text: "clt_1",
      },
      {
        type: "label",
        address: "clt_1/start/label",
        x: x0,
        baseline: 67.85400390625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "clt_1/end/label",
        x: 441.91552734375,
        baseline: 67.85400390625,
        anchor: "middle",
        text: "12 ♩",
        coordinate: q(12),
      },
      {
        type: "label",
        address: "region_1/label",
        x: 175.24886067708331,
        baseline: 90.33056640625,
        anchor: "middle",
        text: "theme",
      },
    ]);
  });
});
