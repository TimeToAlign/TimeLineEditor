/** Picking a value; the expected values are derived in `README.md` ("Picking a value"). */

import type { NumberType } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { clampValue, snapValue } from "../src/number/grid.ts";
import { Rational } from "../src/number/rational.ts";
import { fromFloat } from "../src/number/real.ts";
import type { Granularity } from "../src/workspace/view.ts";
import { DEFAULT_GRANULARITY } from "../src/workspace/view.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

/** `snapValue` at the exact values of the doubles `value` and `reach`. */
function pick(
  value: number,
  reach: number,
  numberType: NumberType,
  granularity: Granularity = DEFAULT_GRANULARITY,
): Rational {
  return snapValue(fromFloat(value), fromFloat(reach), numberType, granularity);
}

describe("snapValue on a fraction axis", () => {
  it("re-derives the worked example: 3/4, by divisor 4 and by the fallback", () => {
    expect(pick(0.7499, 0.01, "fraction")).toEqual(q(3, 4));
    expect(pick(0.7499, 0.00001, "fraction")).toEqual(q(3, 4));
  });

  it("tries the divisors in ascending order", () => {
    expect(pick(0.1, 0.02, "fraction")).toEqual(q(1, 9));
    expect(pick(0.1, 0.00001, "fraction")).toEqual(q(1, 10));
  });

  it("falls back to the nearest multiple of 1/denominator", () => {
    expect(pick(0.123456, 0.000001, "fraction")).toEqual(q(311, 2520));
  });

  it("sends a tie up", () => {
    expect(pick(0.25, 0.1, "fraction", { denominator: 2, decimals: 3 })).toEqual(q(1, 2));
  });
});

describe("snapValue on a float axis", () => {
  it("takes the fewest decimal places within reach, at most decimals", () => {
    expect(pick(1.23456, 0.004, "float")).toEqual(q(247, 200));
    expect(pick(1.23456, 0.005, "float")).toEqual(q(123, 100));
    expect(pick(1.23456, 0.0001, "float")).toEqual(q(247, 200));
  });

  it("sends a tie up, unlike Python's round", () => {
    expect(pick(0.125, 0.001, "float", { denominator: 2520, decimals: 2 })).toEqual(q(13, 100));
  });
});

describe("snapValue on an int axis", () => {
  it("takes the largest power of ten within reach, else the nearest integer", () => {
    expect([600, 300, 40, 0.2].map((reach) => pick(12345.6, reach, "int"))).toEqual([
      q(12000),
      q(12300),
      q(12350),
      q(12346),
    ]);
  });
});

describe("clampValue", () => {
  it("holds below to the start and above to the end, an unknown end only below", () => {
    expect(pick(-0.3, 0.01, "fraction")).toEqual(q(-3, 10));
    expect(clampValue(pick(-0.3, 0.01, "fraction"), q(0), q(32))).toEqual(q(0));
    expect(clampValue(q(3), q(4), q(8))).toEqual(q(4));
    expect(clampValue(pick(9, 0.01, "fraction"), q(0), q(8))).toEqual(q(8));
    expect(clampValue(pick(7.9, 0.5, "fraction"), q(0), 7.5)).toEqual(q(15, 2));
    expect(clampValue(pick(100.2, 0.5, "int"), q(0), null)).toEqual(q(100));
  });
});

describe("snapValue refuses", () => {
  it("a reach that is not positive", () => {
    for (const reach of [q(0), q(-1)]) {
      expect(() => snapValue(q(1), reach, "fraction", DEFAULT_GRANULARITY)).toThrow(RangeError);
    }
  });
});
