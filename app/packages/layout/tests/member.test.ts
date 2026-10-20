/** The arithmetic of one member drawing; every number is derived in tests/README.md. */

import { Rational } from "@timetoalign/tilie-core/numbers";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  type Placement,
  type RectElement,
} from "../src/index.ts";
import { build, drawFixture, element, metrics } from "./support.ts";

/** The member drawing's elements in descriptor order: no block, no card, no styles. */
function member(drawing: Drawing): unknown[] {
  return drawing.elements
    .filter((item) => item.type !== "block" && item.type !== "card")
    .map(({ style: _, ...rest }) => rest);
}

/** The member drawing's height `Hm`: its card's height. */
const height = (drawing: Drawing, root: string) =>
  (element(drawing, `${root}/card`) as RectElement).height;

/** The default placement at `length` with `places`. */
const at = (length: number, places: Placement["places"] = {}): Placement => ({
  ...DEFAULT_PLACEMENT,
  length,
  places,
});
const q = (value: number) => ({ unit: "quarters", value: Rational.of(value) });
const root = { type: "timeline", start: "circle", end: "arrowhead" } as const;
const child = { type: "child", start: "circle", end: "diamond" } as const;
const name = (address: string, baseline: number, text: string) => ({
  type: "name",
  address,
  x: 16,
  baseline,
  anchor: "start",
  text,
});
const label = (address: string, x: number, baseline: number, text: string) => ({
  type: "label",
  address,
  x,
  baseline,
  anchor: "middle",
  text,
});

describe("styled__score", () => {
  const x0 = 98.080078125;
  const xe = 498.080078125;
  type Ordinates = Record<
    | "map"
    | "arms"
    | "tip"
    | "flow"
    | "root"
    | "b"
    | "tipW"
    | "baseW"
    | "bName"
    | "scoreName"
    | "wedgeLabel"
    | "regionLabel"
    | "jumpLabel",
    number
  >;
  type JumpPoints = Record<"c1" | "c2" | "base" | "left" | "right", [number, number]>;
  /** The member drawing at card spacing `S`, its ordinates given (README). */
  const expected = (y: Ordinates, jump: JumpPoints) => [
    { type: "map", address: "score/ticks", xs: x0, xe, yc: y.map, spacing: 2 },
    {
      type: "region",
      address: "score/intro",
      x1: x0,
      x2: 198.080078125,
      xm: 148.080078125,
      yb: y.arms,
      ya: y.tip,
    },
    {
      type: "jump_from",
      address: "score/da-capo",
      start: [xe, y.flow],
      c1: jump.c1,
      c2: jump.c2,
      tip: [x0, y.flow],
      base: jump.base,
      corners: [jump.left, jump.right],
    },
    { ...root, address: "score", xs: x0, xe, y: y.root },
    { ...child, address: "b", xs: 298.080078125, xe, y: y.b },
    { type: "wedge", address: "score/start", x: x0, yt: y.tipW, yb: y.baseW, base: 6 },
    { type: "wedge", address: "score/end", x: xe, yt: y.tipW, yb: y.baseW, base: 6 },
    name("b/name", y.bName, "b"),
    name("score/name", y.scoreName, "Styled score"),
    { ...label("score/start/label", x0, y.wedgeLabel, "0 ♩"), coordinate: q(0) },
    { ...label("score/end/label", xe, y.wedgeLabel, "8 ♩"), coordinate: q(8) },
    label("score/intro/label", 148.080078125, y.regionLabel, "intro"),
    label("score/da-capo/label", 298.080078125, y.jumpLabel, "D.C."),
  ];

  it("draws the hand-derived member drawing", () => {
    const drawing = drawFixture("styled__score");
    expect(member(drawing)).toEqual(
      expected(
        {
          map: 68.640625,
          arms: 73.640625,
          tip: 79.640625,
          flow: 97.28125,
          root: 62.640625,
          b: 23,
          tipW: 60.640625,
          baseW: 47.640625,
          bName: 26.80810546875,
          scoreName: 66.794921875,
          wedgeLabel: 43.2822265625,
          regionLabel: 90.9228515625,
          jumpLabel: 116.5634765625,
        },
        {
          c1: [398.080078125, 107.94791666666667],
          c2: [198.080078125, 107.94791666666667],
          base: [106.03495172941543, 98.12976985113765],
          left: [105.6106918038466, 102.10720665334537],
          right: [106.45921165498424, 94.15233304892993],
        },
      ),
    );
    expect(height(drawing, "score")).toBe(118.921875);
  });

  it("sums each distance outwards whole before it becomes an ordinate (card spacing 2.63)", () => {
    const drawing = drawFixture("styled__score", [], at(400, { score: { spacing: 2.63 } }));
    expect(member(drawing)).toEqual(
      expected(
        {
          map: 66.0753125,
          arms: 69.70531249999999,
          tip: 75.70531249999999,
          flow: 91.97593749999999,
          root: 60.075312499999995,
          b: 22.40234375,
          tipW: 58.075312499999995,
          baseW: 45.075312499999995,
          bName: 26.21044921875,
          scoreName: 64.229609375,
          wedgeLabel: 40.716914062499995,
          regionLabel: 86.98753906249999,
          jumpLabel: 109.8881640625,
        },
        {
          c1: [398.080078125, 100.8159375],
          c2: [198.080078125, 100.8159375],
          base: [106.04900190210854, 92.68039036189639],
          left: [105.69677547116035, 96.66485225045066],
          right: [106.40122833305674, 88.69592847334211],
        },
      ),
    );
    expect(height(drawing, "score")).toBe(112.2465625);
  });

  it("sums each band's width before adding its start (card spacing 0.7)", () => {
    const drawing = drawFixture("styled__score", [], at(400, { score: { spacing: 0.7 } }));
    expect(member(drawing)).toEqual(
      expected(
        {
          map: 64.1453125,
          arms: 65.8453125,
          tip: 71.8453125,
          flow: 86.1859375,
          root: 58.1453125,
          b: 22.40234375,
          tipW: 56.1453125,
          baseW: 43.1453125,
          bName: 26.21044921875,
          scoreName: 62.299609375,
          wedgeLabel: 38.7869140625,
          regionLabel: 83.1275390625,
          jumpLabel: 102.16816406250001,
        },
        {
          c1: [398.080078125, 92.45260416666669],
          c2: [198.080078125, 92.45260416666669],
          base: [106.0644157962673, 86.68628932739941],
          left: [105.81423988256759, 90.67845816303306],
          right: [106.314591709967, 82.69412049176576],
        },
      ),
    );
    expect(height(drawing, "score")).toBe(104.5265625);
  });
});

describe("nested at length 800 and card spacing 8", () => {
  it("draws the hand-derived member drawing", () => {
    const drawing = drawFixture("nested", [], at(800, { clt_1: { spacing: 8 } }));
    const x0 = 49.91552734375;
    const xe = 849.91552734375;
    expect(member(drawing)).toEqual([
      { ...root, address: "clt_1", xs: x0, xe, y: 62 },
      { ...child, address: "clt_3", xs: 249.91552734375, xe: 649.91552734375, y: 43.5 },
      { ...child, address: "clt_2", xs: 324.91552734375, xe: 424.91552734375, y: 25 },
      { type: "wedge", address: "clt_1/start", x: x0, yt: 63.5, yb: 76.5, base: 6 },
      { type: "wedge", address: "clt_1/end", x: xe, yt: 63.5, yb: 76.5, base: 6 },
      name("clt_2/name", 28.80810546875, "clt_2"),
      name("clt_3/name", 47.30810546875, "clt_3"),
      name("clt_1/name", 65.80810546875, "clt_1"),
      { ...label("clt_1/start/label", x0, 86.85400390625, "0 ♩"), coordinate: q(0) },
      { ...label("clt_1/end/label", xe, 86.85400390625, "16 ♩"), coordinate: q(16) },
    ]);
    expect(height(drawing, "clt_1")).toBe(88.9765625);
  });
});

describe("wedge-label tiers", () => {
  const labels = (drawing: Drawing) =>
    ["bare/start/label", "bare/end/label"].map((address) => {
      const item = element(drawing, address) as { x: number; baseline: number };
      return [item.x, item.baseline];
    });

  it("shares tier 1 when the end label's extent starts where the start label's ends", () => {
    const drawing = drawFixture("bare", [], at(14.83203125));
    expect(labels(drawing)).toEqual([
      [49.5771484375, 47.25634765625],
      [64.4091796875, 47.25634765625],
    ]);
    expect(height(drawing, "bare")).toBe(49.37890625);
  });

  it("puts the end label in tier 2 when the extents overlap, placing start before end", () => {
    const drawing = drawFixture("bare", [], at(10));
    expect(labels(drawing)).toEqual([
      [49.5771484375, 47.25634765625],
      [59.5771484375, 57.73291015625],
    ]);
    expect(height(drawing, "bare")).toBe(59.85546875);
  });
});

describe("names", () => {
  it("names a timeline whose name is null by its id after the last colon", () => {
    const drawing = draw(build("piece:score", 8), DEFAULT_PLACEMENT, [DEFAULT_LAYER], metrics);
    expect(element(drawing, "piece:score/name")).toMatchObject({ x: 16, text: "score" });
    expect(element(drawing, "piece:score")).toMatchObject({ xs: 53.798828125 });
  });
});
