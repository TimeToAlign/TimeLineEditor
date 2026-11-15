import { describe, expect, it } from "vitest";
import { gridStep, gridText, snapPosition } from "../src/number/grid.ts";
import { Rational } from "../src/number/rational.ts";
import type { Granularity } from "../src/workspace/view.ts";
import { DEFAULT_GRANULARITY } from "../src/workspace/view.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

function granularity(change: Partial<Granularity>): Granularity {
  return { ...DEFAULT_GRANULARITY, ...change };
}

describe("gridStep", () => {
  it("refines a fraction base by halving while a step stays one device pixel wide", () => {
    expect(gridStep("fraction", DEFAULT_GRANULARITY, 75)).toEqual(q(1, 64));
    const quintuplets = granularity({ fraction: { denominator: 5, refine: true } });
    expect(gridStep("fraction", quintuplets, 75)).toEqual(q(1, 40));
    const fixed = granularity({ fraction: { denominator: 20, refine: false } });
    for (const pixels of [0.01, 75, 1e6]) {
      expect(gridStep("fraction", fixed, pixels)).toEqual(q(1, 20));
    }
  });

  it("reads a float step exactly and refines it by 1, 2, 5, 10, …", () => {
    const fifth = granularity({ float: { step: "0.2", refine: true } });
    expect(gridStep("float", fifth, 1.92)).toEqual(q(1, 5));
    expect(gridStep("float", DEFAULT_GRANULARITY, 120)).toEqual(q(1, 100));
  });

  it("coarsens an int step by 1, 2, 5, 10, … and never refines it", () => {
    expect(gridStep("int", DEFAULT_GRANULARITY, 0.04)).toEqual(q(50));
    expect(gridStep("int", DEFAULT_GRANULARITY, 3)).toEqual(q(1));
  });

  it("keeps the base grid inside a refined fraction or float grid, a refined int grid inside the base grid", () => {
    const settings = granularity({
      fraction: { denominator: 5, refine: true },
      float: { step: "0.2", refine: true },
      int: { step: 3, refine: true },
    });
    for (const pixels of [0.5, 3, 75, 1000, 1e6]) {
      expect(q(1, 5).divide(gridStep("fraction", settings, pixels)).denominator).toBe(1n);
      expect(q(1, 5).divide(gridStep("float", settings, pixels)).denominator).toBe(1n);
      expect(gridStep("int", settings, pixels).divide(q(3)).denominator).toBe(1n);
    }
  });

  it("refuses a pixel density that is not finite and positive, and a step that is no decimal text", () => {
    for (const pixels of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => gridStep("fraction", DEFAULT_GRANULARITY, pixels)).toThrow(RangeError);
    }
    for (const step of ["0", "1e-3", ".5", "-1"]) {
      const settings = granularity({ float: { step, refine: false } });
      expect(() => gridStep("float", settings, 10)).toThrow(RangeError);
    }
  });
});

describe("snapPosition", () => {
  it("is the exact multiple of the step nearest to the pointer, clamped to the timeline", () => {
    expect(snapPosition(2.62, q(1, 5), q(8))).toEqual(q(13, 5));
    expect(snapPosition(-0.3, q(1, 5), q(8))).toEqual(q(0));
    expect(snapPosition(9, q(1, 2), q(8))).toEqual(q(8));
    expect(snapPosition(7.9, q(1), 7.5)).toEqual(q(15, 2));
    expect(snapPosition(0.5, q(1), q(8))).toEqual(q(1));
    expect(snapPosition(100.2, q(1), null)).toEqual(q(100));
  });
});

describe("gridText", () => {
  it("writes the step with its unit's symbol, then the base and whether it refines", () => {
    const fixed = granularity({
      fraction: { denominator: 5, refine: false },
      float: { step: "0.2", refine: false },
    });
    expect([
      gridText({
        step: q(1, 32),
        numberType: "fraction",
        unit: "quarters",
        granularity: DEFAULT_GRANULARITY,
      }),
      gridText({ step: q(1, 5), numberType: "fraction", unit: "quarters", granularity: fixed }),
      gridText({
        step: q(1, 200),
        numberType: "float",
        unit: "seconds",
        granularity: DEFAULT_GRANULARITY,
      }),
      gridText({ step: q(1, 5), numberType: "float", unit: "seconds", granularity: fixed }),
      gridText({
        step: q(200),
        numberType: "int",
        unit: "samples",
        granularity: DEFAULT_GRANULARITY,
      }),
    ]).toEqual([
      "grid 1/32 ♩ (fraction base 1, refining)",
      "grid 1/5 ♩ (fraction base 1/5, fixed)",
      "grid 0.005 s (float base 1, refining)",
      "grid 0.2 s (float base 0.2, fixed)",
      "grid 200 smp (int base 1, refining)",
    ]);
  });
});
