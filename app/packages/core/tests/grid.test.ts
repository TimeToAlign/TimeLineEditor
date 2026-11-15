/** Picking a position; the expected values are derived in `README.md` ("Picking a position"). */

import { describe, expect, it } from "vitest";
import { snapPosition } from "../src/number/grid.ts";
import { Rational } from "../src/number/rational.ts";
import type { Granularity } from "../src/workspace/view.ts";
import { DEFAULT_GRANULARITY } from "../src/workspace/view.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

describe("snapPosition on a fraction axis", () => {
  it("re-derives the worked example: 3/4, by divisor 4 and by the fallback", () => {
    expect(snapPosition(0.7499, 0.01, "fraction", null, DEFAULT_GRANULARITY)).toEqual(q(3, 4));
    expect(snapPosition(0.7499, 0.00001, "fraction", null, DEFAULT_GRANULARITY)).toEqual(q(3, 4));
  });

  it("tries the divisors in ascending order", () => {
    expect(snapPosition(0.1, 0.02, "fraction", null, DEFAULT_GRANULARITY)).toEqual(q(1, 9));
    expect(snapPosition(0.1, 0.00001, "fraction", null, DEFAULT_GRANULARITY)).toEqual(q(1, 10));
  });

  it("falls back to the nearest multiple of 1/denominator", () => {
    expect(snapPosition(0.123456, 0.000001, "fraction", null, DEFAULT_GRANULARITY)).toEqual(
      q(311, 2520),
    );
  });

  it("sends a tie up", () => {
    const halves: Granularity = { denominator: 2, decimals: 3 };
    expect(snapPosition(0.25, 0.1, "fraction", null, halves)).toEqual(q(1, 2));
  });
});

describe("snapPosition on a float axis", () => {
  it("takes the fewest decimal places within reach, at most decimals", () => {
    expect(snapPosition(1.23456, 0.004, "float", null, DEFAULT_GRANULARITY)).toEqual(q(247, 200));
    expect(snapPosition(1.23456, 0.005, "float", null, DEFAULT_GRANULARITY)).toEqual(q(123, 100));
    expect(snapPosition(1.23456, 0.0001, "float", null, DEFAULT_GRANULARITY)).toEqual(q(247, 200));
  });

  it("sends a tie up, unlike Python's round", () => {
    const two: Granularity = { denominator: 2520, decimals: 2 };
    expect(snapPosition(0.125, 0.001, "float", null, two)).toEqual(q(13, 100));
  });
});

describe("snapPosition on an int axis", () => {
  it("takes the largest power of ten within reach, else the nearest integer", () => {
    expect(
      [600, 300, 40, 0.2].map((h) => snapPosition(12345.6, h, "int", null, DEFAULT_GRANULARITY)),
    ).toEqual([q(12000), q(12300), q(12350), q(12346)]);
  });
});

describe("snapPosition clamps", () => {
  it("to 0 below and to the length above, an unknown length only below", () => {
    expect(snapPosition(-0.3, 0.01, "fraction", q(32), DEFAULT_GRANULARITY)).toEqual(q(0));
    expect(snapPosition(9, 0.01, "fraction", q(8), DEFAULT_GRANULARITY)).toEqual(q(8));
    expect(snapPosition(7.9, 0.5, "fraction", 7.5, DEFAULT_GRANULARITY)).toEqual(q(15, 2));
    expect(snapPosition(100.2, 0.5, "int", null, DEFAULT_GRANULARITY)).toEqual(q(100));
  });

  it("refuses a position that is not finite and a half pixel that is not finite and positive", () => {
    for (const p of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => snapPosition(p, 0.5, "fraction", null, DEFAULT_GRANULARITY)).toThrow(RangeError);
    }
    for (const h of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => snapPosition(1, h, "fraction", null, DEFAULT_GRANULARITY)).toThrow(RangeError);
    }
  });
});
