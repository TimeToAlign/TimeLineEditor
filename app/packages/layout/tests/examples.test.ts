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
      { type: "block", address: null, width: 455.9931640625, height: 49.37890625 },
      { type: "timeline", address: "bare", xs: x0, xe, y: 14.40234375 },
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
    expect(drawing.width).toBe(455.9931640625);
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
    const x0 = 41.072265625;
    expect(geometry(drawing)).toEqual([
      { type: "block", address: null, width: 458.351318359375, height: 77.37890625 },
      { type: "timeline", address: "tl:24", xs: x0, xe: 441.072265625, y: 42.40234375 },
      { type: "child", address: "tl:23", xs: 141.072265625, xe: 341.072265625, y: 29 },
      { type: "child", address: "tl:22", xs: 178.572265625, xe: 228.572265625, y: 15 },
      ...wedges(x0, 441.072265625, "tl:24").map((item) => ({
        ...item,
        yt: 43.90234375,
        yb: 56.90234375,
      })),
      {
        type: "name",
        address: "tl:22/name",
        x: 8,
        baseline: 18.80810546875,
        anchor: "start",
        text: "tl:22",
      },
      {
        type: "name",
        address: "tl:23/name",
        x: 8,
        baseline: 32.80810546875,
        anchor: "start",
        text: "tl:23",
      },
      {
        type: "name",
        address: "tl:24/name",
        x: 8,
        baseline: 46.21044921875,
        anchor: "start",
        text: "tl:24",
      },
      {
        type: "label",
        address: "tl:24/start/label",
        x: x0,
        baseline: 67.25634765625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "tl:24/end/label",
        x: 441.072265625,
        baseline: 67.25634765625,
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
    const yRoot = 18.4765625;
    expect(geometry(drawing)).toEqual([
      { type: "block", address: null, width: 500.256591796875, height: 77.9296875 },
      { type: "break", address: "flow:quarters/break/0", x: 382.9775390625, y1: 49.453125, y2: 8 },
      {
        type: "jump",
        address: "flow:quarters/jump/0",
        xFrom: 282.9775390625,
        xTo: 132.9775390625,
        yf: 49.453125,
        yc: 49.453125 + (4 / 3) * 8,
        yo: 55.453125,
      },
      { type: "timeline", address: "flow:quarters", xs: x0, xe: 482.9775390625, y: yRoot },
      ...wedges(x0, 482.9775390625, "flow:quarters").map((item) => ({
        ...item,
        yt: 19.9765625,
        yb: 32.9765625,
      })),
      {
        type: "name",
        address: "flow:quarters/name",
        x: 8,
        baseline: 22.28466796875,
        anchor: "start",
        text: "Flow control",
      },
      {
        type: "label",
        address: "flow:quarters/start/label",
        x: x0,
        baseline: 43.33056640625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "flow:quarters/end/label",
        x: 482.9775390625,
        baseline: 43.33056640625,
        anchor: "middle",
        text: "16 ♩",
        coordinate: q(16),
      },
      {
        type: "label",
        address: "flow:quarters/jump/0/label",
        x: 207.9775390625,
        baseline: 67.80712890625,
        anchor: "middle",
        text: "Repeat",
      },
      {
        type: "label",
        address: "flow:quarters/break/0/label",
        x: 385.9775390625,
        baseline: 16.35400390625,
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
      { type: "block", address: null, width: 469.95263671875, height: 93.37890625 },
      { type: "map", address: "melody/map/tempo", xs: x0, xe: 455.53662109375, y: 27.5 },
      {
        type: "map",
        address: "phrase/map/ticks",
        xs: 155.53662109375,
        xe: 355.53662109375,
        y: 14.5,
      },
      { type: "timeline", address: "melody", xs: x0, xe: 455.53662109375, y: 58.40234375 },
      { type: "child", address: "phrase", xs: 155.53662109375, xe: 355.53662109375, y: 45 },
      ...wedges(x0, 455.53662109375, "melody").map((item) => ({
        ...item,
        yt: 59.90234375,
        yb: 72.90234375,
      })),
      {
        type: "name",
        address: "phrase/map/ticks/name",
        x: 8,
        baseline: 18.30810546875,
        anchor: "start",
        text: "Ticks",
      },
      {
        type: "name",
        address: "melody/map/tempo/name",
        x: 8,
        baseline: 31.30810546875,
        anchor: "start",
        text: "Tempo",
      },
      {
        type: "name",
        address: "phrase/name",
        x: 8,
        baseline: 48.80810546875,
        anchor: "start",
        text: "Phrase",
      },
      {
        type: "name",
        address: "melody/name",
        x: 8,
        baseline: 62.21044921875,
        anchor: "start",
        text: "Melody",
      },
      {
        type: "label",
        address: "melody/start/label",
        x: x0,
        baseline: 83.25634765625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "melody/end/label",
        x: 455.53662109375,
        baseline: 83.25634765625,
        anchor: "middle",
        text: "8 ♩",
        coordinate: q(8),
      },
    ]);
    expect(element(drawing, "melody/map/tempo").style).toMatchObject({
      stroke: "#0050EF",
      "stroke-width": 1,
      "stroke-dasharray": "none",
    });
    expect(element(drawing, "phrase/map/ticks").style).toMatchObject({
      stroke: "#00CC00",
      "stroke-width": 1,
      "stroke-dasharray": "3 3",
    });
  });
});

describe("with_region", () => {
  it("draws the hand-derived geometry", () => {
    const drawing = drawFixture("with_region");
    const x0 = 41.072265625;
    const x = (u: number) => x0 + 400 * u;
    expect(geometry(drawing)).toEqual([
      { type: "block", address: null, width: 458.351318359375, height: 99.85546875 },
      {
        type: "region",
        address: "tl:19/region/0",
        x1: x(1 / 6),
        x2: 241.072265625,
        xm: 174.40559895833331,
        yb: 73.37890625,
        ya: 79.37890625,
      },
      { type: "timeline", address: "tl:19", xs: x0, xe: 441.072265625, y: 42.40234375 },
      { type: "child", address: "tl:20", xs: x(1 / 36), xe: x(13 / 36), y: 29 },
      { type: "child", address: "tl:21", xs: x(1 / 6), xe: x(5 / 12), y: 15 },
      ...wedges(x0, 441.072265625, "tl:19").map((item) => ({
        ...item,
        yt: 43.90234375,
        yb: 56.90234375,
      })),
      {
        type: "name",
        address: "tl:21/name",
        x: 8,
        baseline: 18.80810546875,
        anchor: "start",
        text: "tl:21",
      },
      {
        type: "name",
        address: "tl:20/name",
        x: 8,
        baseline: 32.80810546875,
        anchor: "start",
        text: "tl:20",
      },
      {
        type: "name",
        address: "tl:19/name",
        x: 8,
        baseline: 46.21044921875,
        anchor: "start",
        text: "tl:19",
      },
      {
        type: "label",
        address: "tl:19/start/label",
        x: x0,
        baseline: 67.25634765625,
        anchor: "middle",
        text: "0 ♩",
        coordinate: q(0),
      },
      {
        type: "label",
        address: "tl:19/end/label",
        x: 441.072265625,
        baseline: 67.25634765625,
        anchor: "middle",
        text: "12 ♩",
        coordinate: q(12),
      },
      {
        type: "label",
        address: "tl:19/region/0/label",
        x: 174.40559895833331,
        baseline: 89.73291015625,
        anchor: "middle",
        text: "theme",
      },
    ]);
  });
});
