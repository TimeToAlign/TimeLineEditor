/**
 * The rotation of a wedge about its tip: the rounded sines and cosines of
 * every whole degree, the corners at the seven stops, and both sides of a
 * line in a drawing; every number is derived in tests/README.md ("Wedge
 * rotation").
 */

import { sameAddress } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { type Drawing, type DrawnAxis, type MarkerElement, wedgePoints } from "../src/index.ts";
import { sineCosine, wedgeCorners, wedgeSpan } from "../src/rotation.ts";
import { at, boxAt, drawFixture } from "./support.ts";

/**
 * The sines of 0 to 90 degrees, computed to 60 digits (Machin's π, the
 * sine's series) and rounded half to even to four decimal places, written
 * in ten-thousandths: `n / 10000` is the double nearest the decimal.
 */
const REFERENCE: readonly number[] = [
  0, 175, 349, 523, 698, 872, 1045, 1219, 1392, 1564, 1736, 1908, 2079, 2250, 2419, 2588, 2756,
  2924, 3090, 3256, 3420, 3584, 3746, 3907, 4067, 4226, 4384, 4540, 4695, 4848, 5000, 5150, 5299,
  5446, 5592, 5736, 5878, 6018, 6157, 6293, 6428, 6561, 6691, 6820, 6947, 7071, 7193, 7314, 7431,
  7547, 7660, 7771, 7880, 7986, 8090, 8192, 8290, 8387, 8480, 8572, 8660, 8746, 8829, 8910, 8988,
  9063, 9135, 9205, 9272, 9336, 9397, 9455, 9511, 9563, 9613, 9659, 9703, 9744, 9781, 9816, 9848,
  9877, 9903, 9925, 9945, 9962, 9976, 9986, 9994, 9998, 10000,
].map((tenThousandths) => tenThousandths / 10_000);

/** `S(d)`, the reference sine of `d` degrees. */
function S(degrees: number): number {
  const value = REFERENCE[degrees];
  if (value === undefined) throw new Error(`no reference sine of ${degrees}`);
  return value;
}

/** The sine and cosine of `r` from the reference, by quadrant (README, case 2). */
function expected(r: number): readonly [number, number] {
  const d = Math.abs(r);
  const sign = r < 0 ? -1 : 1;
  const [sine, cosine] = d <= 90 ? [S(d), S(90 - d)] : [S(180 - d), -S(d - 90)];
  return [sine === 0 ? 0 : sign * sine, cosine];
}

/** The corners of section 6.6 over the sine `s` and cosine `k`. */
const formula = (s: number, k: number) =>
  [
    { dx: 13 * s - 3 * k, out: 13 * k + 3 * s },
    { dx: 13 * s + 3 * k, out: 13 * k - 3 * s },
  ] as const;

const ANGLES = Array.from({ length: 361 }, (_, index) => index - 180);

describe("the rounded sines", () => {
  it("equal the reference at every whole degree from 0 to 90", () => {
    expect(REFERENCE).toHaveLength(91);
    expect(Array.from({ length: 91 }, (_, d) => sineCosine(d)[0])).toEqual(REFERENCE);
  });

  it("break no tie: no sine lies within 1e-9 of a halfway point", () => {
    const distances = Array.from({ length: 91 }, (_, d) => {
      const scaled = Math.sin((d * Math.PI) / 180) * 10_000;
      return Math.abs(scaled - Math.floor(scaled) - 0.5) / 10_000;
    });
    expect(distances.filter((distance) => distance <= 1e-9)).toEqual([]);
  });
});

describe("every whole angle", () => {
  it("takes its sine and cosine from the table by quadrant, never −0", () => {
    for (const r of ANGLES) {
      const [s, k] = sineCosine(r);
      expect([s, k], `${r}`).toEqual(expected(r));
      expect([Object.is(s, -0), Object.is(k, -0)], `${r}`).toEqual([false, false]);
    }
  });

  it("draws the same wedge at −180 and 180", () => {
    expect(sineCosine(-180)).toEqual(sineCosine(180));
    expect(wedgeCorners(-180)).toEqual(wedgeCorners(180));
  });

  it("refuses a rotation that is no whole number from −180 to 180", () => {
    for (const r of [181, -181, 45.5, Number.NaN]) {
      expect(() => sineCosine(r), `${r}`).toThrow(RangeError);
    }
  });
});

describe("the seven stops", () => {
  it("turn the corners as section 6.6 gives them", () => {
    expect(wedgeCorners(0)).toEqual([
      { dx: -3, out: 13 },
      { dx: 3, out: 13 },
    ]);
    expect(wedgeCorners(90)).toEqual([
      { dx: 13, out: 3 },
      { dx: 13, out: -3 },
    ]);
    expect(wedgeCorners(-90)).toEqual([
      { dx: -13, out: -3 },
      { dx: -13, out: 3 },
    ]);
    expect(wedgeCorners(180)).toEqual([
      { dx: 3, out: -13 },
      { dx: -3, out: -13 },
    ]);
    expect(wedgeCorners(-180)).toEqual(wedgeCorners(180));
    expect(wedgeCorners(45)).toEqual(formula(S(45), S(45)));
    expect(wedgeCorners(-45)).toEqual(formula(-S(45), S(45)));
    expect(wedgeCorners(135)).toEqual(formula(S(45), -S(45)));
    expect(wedgeCorners(-135)).toEqual(formula(-S(45), -S(45)));
  });

  it("span from the smallest to the largest of 0 and the offsets across", () => {
    expect([wedgeSpan(0), wedgeSpan(90), wedgeSpan(-90)]).toEqual([
      [-3, 3],
      [0, 13],
      [-13, 0],
    ]);
  });
});

describe("both sides of a line", () => {
  const drawing = drawFixture("timestamp_wedge_rotation");

  /** The marked line of the timeline `id` (not an ancestor line). */
  function axisOf(id: string): DrawnAxis {
    const found = drawing.axes.find((axis) => axis.address.id === id && axis.marker !== null);
    if (found === undefined) throw new Error(`no marked line of ${id}`);
    return found;
  }

  function wedgeOf(id: string): MarkerElement {
    const found = drawing.elements.find(
      (item) => item.type === "wedge" && sameAddress(item.address, at(id)),
    );
    if (found?.type !== "wedge") throw new Error(`no wedge of ${id}`);
    return found;
  }

  /** The wedge of `id` as README case 4 derives it on the line of `line`, `outwards` its side. */
  function derived(
    from: Drawing,
    line: string,
    id: string,
    rotation: number,
    outwards: 1 | -1,
  ): readonly (readonly [number, number])[] {
    const axis = from.axes.find((item) => item.address.id === line && item.marker !== null);
    const x = axis?.marker?.timestamps.find((timestamp) => timestamp.id === id)?.x;
    if (axis === undefined || x === undefined) throw new Error(`no abscissa of ${id}`);
    // Every ordinate is summed in item coordinates and drawn the card's `y` plus it (8.6).
    const origin = boxAt(from, at("melody", "card")).y;
    const y = axis.line - origin;
    const ordinate = (distance: number) => origin + (outwards === 1 ? y + distance : y - distance);
    const corner = ({ dx, out }: { dx: number; out: number }) =>
      [x + dx, ordinate(1.5 + out)] as const;
    const [first, second] = formula(...expected(rotation));
    return [[x, ordinate(1.5)], corner(first), corner(second)];
  }

  const below: readonly (readonly [string, number])[] = [
    ["timestamp_10", 0],
    ["timestamp_1", -135],
    ["timestamp_2", -45],
    ["timestamp_3", 0],
    ["timestamp_4", 45],
    ["timestamp_5", 135],
    ["timestamp_6", 180],
    ["timestamp_11", 0],
  ];
  const above: readonly (readonly [string, number])[] = [
    ["timestamp_7", -45],
    ["timestamp_8", 45],
    ["timestamp_9", 90],
  ];

  it("turns each wedge of melody below its line", () => {
    expect(axisOf("melody").line).toBeLessThan(wedgeOf("timestamp_3").yt);
    for (const [id, rotation] of below) {
      const wedge = wedgeOf(id);
      expect(wedgePoints(wedge), id).toEqual(derived(drawing, "melody", id, rotation, 1));
      expect(wedge.style.rotation, id).toBe(rotation);
    }
  });

  it("mirrors each wedge of phrase above its line", () => {
    expect(axisOf("phrase").line).toBeGreaterThan(wedgeOf("timestamp_7").yt);
    for (const [id, rotation] of above) {
      const wedge = wedgeOf(id);
      expect(wedgePoints(wedge), id).toEqual(derived(drawing, "phrase", id, rotation, -1));
      expect(wedge.style.rotation, id).toBe(rotation);
    }
  });

  it("puts a −45 base left of the tip, below it on melody and above it on phrase", () => {
    const [[x2, y2], ...base2] = wedgePoints(wedgeOf("timestamp_2"));
    const [[x7, y7], ...base7] = wedgePoints(wedgeOf("timestamp_7"));
    expect(base2.map(([x, y]) => [x < x2, y > y2])).toEqual([
      [true, true],
      [true, true],
    ]);
    expect(base7.map(([x, y]) => [x < x7, y < y7])).toEqual([
      [true, true],
      [true, true],
    ]);
  });
});
