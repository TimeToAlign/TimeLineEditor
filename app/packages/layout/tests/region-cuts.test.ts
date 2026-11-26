import {
  type AxisValue,
  type ElementAddress,
  type Manifest,
  sameAddress,
} from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import {
  brace,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  manifestLayer,
  type RegionElement,
} from "../src/index.ts";
import { at, build, metrics, quarters, target } from "./support.ts";

/** A stored elision on `score` from `start` to `end`, drawn `canvas` wide. */
const elision = (id: string, start: AxisValue, end: AxisValue, canvas: number): object => ({
  type: "add",
  into: target("score"),
  elision: { start, end, width: { canvas } },
  ids: [id],
});

const REGION = {
  type: "add",
  into: target("score"),
  region: { id: "region_1", start: quarters(2), end: quarters(14), name: "theme" },
};

/** The README's case: `score`, its region 2–14 and the stored elisions given. */
function drawn(...elisions: object[]): Drawing {
  const manifest: Manifest = build("score", 16, REGION, ...elisions);
  return draw(manifest, DEFAULT_PLACEMENT, [DEFAULT_LAYER, manifestLayer(manifest)], metrics);
}

function regionOf(drawing: Drawing, address: ElementAddress): RegionElement {
  const found = drawing.elements.find(
    (element): element is RegionElement =>
      element.type === "region" && sameAddress(element.address, address),
  );
  if (found === undefined) throw new Error("no region");
  return found;
}

const ELISIONS = [
  elision("gap_1", quarters(2), quarters(5, 2), 8),
  elision("gap_2", quarters(3), quarters(5), 10),
  elision("gap_3", quarters(5), quarters(6), 5),
  elision("gap_4", quarters(15, 2), quarters(8), 6),
  elision("gap_5", quarters(10), quarters(12), 8),
  elision("gap_6", quarters(14), quarters(15), 4),
];

const x0 = 53.798828125;
const [Yb, Ya, Ym, k] = [63.85546875, 69.85546875, 66.85546875, 3];
/** `h(9)` of the bundled font metrics (section 5.1): 1901 + 483 of 2048. */
const H9 = ((1901 + 483) * 9) / 2048;

describe("a region's brace across gaps", () => {
  const region = regionOf(drawn(...ELISIONS), at("region_1"));
  const [X1, Xm, X2] = [x0 + 50, x0 + 129, x0 + 237];

  it("is drawn at the elided x of its start, end and midpoint", () => {
    expect([region.x1, region.xm, region.x2, region.yb, region.ya]).toEqual([X1, Xm, X2, Yb, Ya]);
  });

  it("holds the edges of the gaps it spans, from the left, not of one starting at its end", () => {
    expect(region.cuts).toEqual([
      [x0 + 50, x0 + 58],
      [x0 + 70.5, x0 + 80.5],
      [x0 + 80.5, x0 + 85.5],
      [x0 + 123, x0 + 129],
      [x0 + 179, x0 + 187],
    ]);
  });

  it("cuts its two straight parts and draws its arms and tip whole", () => {
    expect(brace(region)).toEqual([
      { command: "M", points: [[X1, Yb]] },
      {
        command: "Q",
        points: [
          [X1, Ym],
          [X1 + k, Ym],
        ],
      },
      { command: "M", points: [[x0 + 58, Ym]] },
      { command: "L", points: [[x0 + 70.5, Ym]] },
      { command: "M", points: [[x0 + 85.5, Ym]] },
      { command: "L", points: [[x0 + 123, Ym]] },
      { command: "M", points: [[x0 + 126, Ym]] },
      {
        command: "Q",
        points: [
          [Xm, Ym],
          [Xm, Ya],
        ],
      },
      {
        command: "Q",
        points: [
          [Xm, Ym],
          [Xm + k, Ym],
        ],
      },
      { command: "L", points: [[x0 + 179, Ym]] },
      { command: "M", points: [[x0 + 187, Ym]] },
      { command: "L", points: [[X2 - k, Ym]] },
      {
        command: "Q",
        points: [
          [X2, Ym],
          [X2, Yb],
        ],
      },
    ]);
  });

  it("keeps one line per straight part where it spans no gap", () => {
    const whole = regionOf(drawn(), at("region_1"));
    expect(whole.cuts).toEqual([]);
    const [x1, xm, x2] = [x0 + 50, x0 + 200, x0 + 350];
    expect(brace(whole).map(({ command }) => command)).toEqual(["M", "Q", "L", "Q", "Q", "L", "Q"]);
    expect([whole.x1, whole.xm, whole.x2]).toEqual([x1, xm, x2]);
    // Without the elisions no stack moves to a second line: the brace's middle one line higher.
    const ym = Ym - H9;
    expect(brace(whole)[2]).toEqual({ command: "L", points: [[xm - k, ym]] });
    expect(brace(whole)[5]).toEqual({ command: "L", points: [[x2 - k, ym]] });
  });
});
