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
/** The block and the root's card, `P = 8` from the box's top left, `Hm` high. */
const box = (root: string, W: number, H: number, cardWidth: number, Hm: number) => [
  { type: "block", address: null, width: W, height: H },
  { type: "card", address: `${root}/card`, x: 8, y: 8, width: cardWidth, height: Hm },
];
const root = { type: "timeline", start: "circle", end: "arrowhead" } as const;
const child = { type: "child", start: "circle", end: "diamond" } as const;

describe("bare", () => {
  const drawing = drawFixture("bare");
  it("draws the hand-derived geometry", () => {
    const x0 = 49.5771484375;
    const xe = 449.5771484375;
    const tips = wedges(x0, xe, "bare").map((item) => ({
      ...item,
      yt: 23.90234375,
      yb: 36.90234375,
    }));
    expect(geometry(drawing)).toEqual([
      ...box("bare", 476.5771484375, 67.37890625, 458.5771484375, 49.37890625),
      { ...root, address: "bare", xs: x0, xe, y: 22.40234375 },
      ...tips,
      {
        type: "name",
        address: "bare/name",
        x: 16,
        baseline: 26.21044921875,
        anchor: "start",
        text: "Bare",
      },
      {
        type: "label",
        address: "bare/start/label",
        x: x0,
        baseline: 47.25634765625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "bare/end/label",
        x: xe,
        baseline: 47.25634765625,
        anchor: "middle",
        text: "8 ♩",
        coordinate: q(8),
      },
    ]);
    expect(drawing.width).toBe(476.5771484375);
    expect(drawing.height).toBe(67.37890625);
    expect(drawing.unmapped).toEqual([]);
  });

  it("styles with the default layer", () => {
    expect(element(drawing, null).style).toMatchObject({ fill: "#F3F4F6", rx: 10 });
    expect(element(drawing, "bare/card").style).toMatchObject({
      fill: "#FFFFFF",
      stroke: "#C4C9D1",
      "stroke-width": 0.75,
      "stroke-dasharray": "none",
      rx: 5,
      shadow: "#B8BEC8",
    });
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
    const x0 = 49.91552734375;
    const xe = 449.91552734375;
    expect(geometry(drawing)).toEqual([
      ...box("clt_1", 477.194580078125, 95.9765625, 459.194580078125, 77.9765625),
      { ...root, address: "clt_1", xs: x0, xe, y: 51 },
      { ...child, address: "clt_3", xs: 149.91552734375, xe: 349.91552734375, y: 37 },
      { ...child, address: "clt_2", xs: 187.41552734375, xe: 237.41552734375, y: 23 },
      ...wedges(x0, xe, "clt_1").map((item) => ({ ...item, yt: 52.5, yb: 65.5 })),
      ...[
        ["clt_2", 26.80810546875],
        ["clt_3", 40.80810546875],
        ["clt_1", 54.80810546875],
      ].map(([id, baseline]) => ({
        type: "name",
        address: `${id}/name`,
        x: 16,
        baseline,
        anchor: "start",
        text: id,
      })),
      {
        type: "label",
        address: "clt_1/start/label",
        x: x0,
        baseline: 75.85400390625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "clt_1/end/label",
        x: xe,
        baseline: 75.85400390625,
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
    const x0 = 90.9775390625;
    const xe = 490.9775390625;
    const yf = 63.85546875;
    const yc = 74.52213541666667;
    expect(geometry(drawing)).toEqual([
      ...box("flow:quarters", 518.256591796875, 102.33203125, 500.256591796875, 84.33203125),
      { type: "break", address: "flow:quarters/break_1", x: 390.9775390625, y1: yf, y2: 16 },
      {
        type: "jump",
        address: "flow:quarters/jump_1",
        start: [290.9775390625, yf],
        c1: [253.4775390625, yc],
        c2: [178.4775390625, yc],
        tip: [140.9775390625, yf],
        base: [144.82492272779294, 64.94983565923889],
        corners: [
          [144.2777392731735, 66.87352749188535],
          [145.37210618241238, 63.02614382659242],
        ],
      },
      { ...root, address: "flow:quarters", xs: x0, xe, y: 22.40234375 },
      ...wedges(x0, xe, "flow:quarters").map((item) => ({
        ...item,
        yt: 23.90234375,
        yb: 36.90234375,
      })),
      {
        type: "name",
        address: "flow:quarters/name",
        x: 16,
        baseline: 26.21044921875,
        anchor: "start",
        text: "Flow control",
      },
      {
        type: "label",
        address: "flow:quarters/start/label",
        x: x0,
        baseline: 47.25634765625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "flow:quarters/end/label",
        x: xe,
        baseline: 47.25634765625,
        anchor: "middle",
        text: "16 ♩",
        coordinate: q(16),
      },
      {
        type: "label",
        address: "flow:quarters/jump_1/label",
        x: 215.9775390625,
        baseline: 82.20947265625,
        anchor: "middle",
        text: "Repeat",
      },
      {
        type: "label",
        address: "flow:quarters/break_1/label",
        x: 393.9775390625,
        baseline: 61.73291015625,
        anchor: "start",
        text: "Fine",
      },
    ]);
    expect(element(drawing, "flow:quarters/jump_1").style).toMatchObject({
      stroke: "#000000",
      fill: "#000000",
      "stroke-width": 1,
      "stroke-dasharray": "1 1",
    });
  });
});

describe("map", () => {
  it("draws the hand-derived geometry", () => {
    const drawing = drawFixture("map");
    const x0 = 63.53662109375;
    const xe = 463.53662109375;
    expect(geometry(drawing)).toEqual([
      ...box("melody", 490.53662109375, 85.4765625, 472.53662109375, 67.4765625),
      { type: "map", address: "melody/tempo", xs: x0, xe, yc: 35 },
      { type: "map", address: "melody/ticks", xs: 163.53662109375, xe: 363.53662109375, yc: 17.5 },
      { ...root, address: "melody", xs: x0, xe, y: 40.5 },
      { ...child, address: "phrase", xs: 163.53662109375, xe: 363.53662109375, y: 23 },
      ...wedges(x0, xe, "melody").map((item) => ({ ...item, yt: 42, yb: 55 })),
      {
        type: "name",
        address: "phrase/name",
        x: 16,
        baseline: 26.80810546875,
        anchor: "start",
        text: "Phrase",
      },
      {
        type: "name",
        address: "melody/name",
        x: 16,
        baseline: 44.30810546875,
        anchor: "start",
        text: "Melody",
      },
      {
        type: "label",
        address: "melody/start/label",
        x: x0,
        baseline: 65.35400390625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "melody/end/label",
        x: xe,
        baseline: 65.35400390625,
        anchor: "middle",
        text: "8 ♩",
        coordinate: q(8),
      },
    ]);
    expect(element(drawing, "melody/tempo").style).toMatchObject({
      stroke: "#0050EF",
      "stroke-width": 1,
      "stroke-dasharray": "none",
    });
    expect(element(drawing, "melody/ticks").style).toMatchObject({
      stroke: "#00CC00",
      "stroke-width": 1,
      "stroke-dasharray": "1 1",
    });
  });
});

describe("with_region", () => {
  it("draws the hand-derived geometry", () => {
    const drawing = drawFixture("with_region");
    const x0 = 49.91552734375;
    const xe = 449.91552734375;
    const x = (u: number) => x0 + 400 * u;
    expect(geometry(drawing)).toEqual([
      ...box("clt_1", 477.194580078125, 118.453125, 459.194580078125, 100.453125),
      {
        type: "region",
        address: "clt_1/region_1",
        x1: x(1 / 6),
        x2: 249.91552734375,
        xm: 183.24886067708331,
        yb: 81.9765625,
        ya: 87.9765625,
      },
      { ...root, address: "clt_1", xs: x0, xe, y: 51 },
      { ...child, address: "clt_2", xs: x(1 / 36), xe: x(13 / 36), y: 37 },
      { ...child, address: "clt_3", xs: x(1 / 6), xe: x(5 / 12), y: 23 },
      ...wedges(x0, xe, "clt_1").map((item) => ({ ...item, yt: 52.5, yb: 65.5 })),
      ...[
        ["clt_3", 26.80810546875],
        ["clt_2", 40.80810546875],
        ["clt_1", 54.80810546875],
      ].map(([id, baseline]) => ({
        type: "name",
        address: `${id}/name`,
        x: 16,
        baseline,
        anchor: "start",
        text: id,
      })),
      {
        type: "label",
        address: "clt_1/start/label",
        x: x0,
        baseline: 75.85400390625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "clt_1/end/label",
        x: xe,
        baseline: 75.85400390625,
        anchor: "middle",
        text: "12 ♩",
        coordinate: q(12),
      },
      {
        type: "label",
        address: "clt_1/region_1/label",
        x: 183.24886067708331,
        baseline: 98.33056640625,
        anchor: "middle",
        text: "theme",
      },
    ]);
  });
});
