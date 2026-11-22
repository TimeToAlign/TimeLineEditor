/** Inverting a map; the expected values are derived in `README.md` ("Inverting a map"). */

import type { TimeUnit } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import type { ConversionMap } from "../src/manifest/types.ts";
import { compileMap } from "../src/maps/compile.ts";
import type { InversionContext } from "../src/maps/invert.ts";
import { invert, invertible } from "../src/maps/invert.ts";
import type { MapValue } from "../src/maps/values.ts";
import { Rational } from "../src/number/rational.ts";
import type { Real } from "../src/number/real.ts";

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

type Parameter = readonly [number, number] | number;

function linear(
  id: string,
  scalar: Parameter,
  offset: Parameter,
  target: TimeUnit = "seconds",
  source: TimeUnit = "quarters",
): ConversionMap {
  return {
    type: "LinearMap",
    id,
    name: null,
    source_unit: source,
    target_unit: target,
    scalar,
    offset,
  };
}

function table(
  xs: readonly [number, number, ...number[]],
  ys: readonly [number, number, ...number[]],
  extrapolate: "none" | "constant" | "linear" = "none",
  kind: "linear" | "previous" = "linear",
  source: TimeUnit = "quarters",
): ConversionMap {
  return {
    type: "TableMap",
    id: "table",
    name: null,
    source_unit: source,
    target_unit: "seconds",
    x_values: xs,
    y_values: ys,
    kind,
    extrapolate,
  };
}

function piecewise(second: ConversionMap): ConversionMap {
  return {
    type: "PiecewiseMap",
    id: "pieces",
    name: null,
    source_unit: "quarters",
    target_unit: "seconds",
    breaks: [0, 4, 16],
    maps: [linear("first", [1, 2], 0), second],
  };
}

function over(start: number, end: number | null): InversionContext {
  return { span: { start: q(start), end: end === null ? null : q(end) } };
}

const SPAN = over(0, 32);

/** The inverse, then the map evaluated there: the value given back, for an exact inverse. */
function roundTrip(map: ConversionMap, value: MapValue, context: InversionContext): Real | null {
  const x = invert(map, value, context);
  expect(x).toBeInstanceOf(Rational);
  expect(compileMap(map, context).evaluate(x as Rational)).toEqual(
    typeof value === "bigint" ? q(Number(value)) : value,
  );
  return x;
}

describe("a LinearMap", () => {
  const samples = linear("samples", [165375, 8], 507150, "samples");

  it("inverts exactly on exact operands", () => {
    expect(invertible(samples, SPAN)).toBe(true);
    expect(roundTrip(samples, q(4112325, 8), SPAN)).toEqual(q(1, 3));
    expect(invert(samples, 514041n, SPAN)).toEqual(q(18376, 55125));
    expect(roundTrip(linear("falling", -2, 10), q(4), SPAN)).toEqual(q(3));
  });

  it("inverts on doubles where a float takes part", () => {
    const half = linear("half", 0.5, 0);
    expect(invert(half, 1.5, SPAN)).toBe(3);
    expect(invert(half, q(3, 2), SPAN)).toBe(3);
  });

  it("is not invertible with a scalar of 0", () => {
    const flat = linear("flat", 0, 4);
    expect([invertible(flat, SPAN), invert(flat, q(4), SPAN)]).toEqual([false, null]);
  });
});

describe("a TableMap", () => {
  const rising = table([0, 4, 8], [0, 2, 10]);

  it("inverts its intervals exactly, and gives nothing where nothing is", () => {
    const span = over(0, 8);
    expect(invertible(rising, span)).toBe(true);
    expect([q(1), q(2), q(6), q(1, 3)].map((y) => roundTrip(rising, y, span))).toEqual([
      q(2),
      q(4),
      q(6),
      q(2, 3),
    ]);
    expect(invert(rising, q(11), span)).toBeNull();
  });

  it("continues a linear extrapolation and refuses a constant one the span reaches", () => {
    expect(roundTrip(table([0, 4, 8], [0, 2, 10], "linear"), q(14), over(0, 12))).toEqual(q(10));
    const constant = table([0, 4, 8], [0, 2, 10], "constant");
    expect([invertible(constant, over(0, 12)), invertible(constant, over(0, 8))]).toEqual([
      false,
      true,
    ]);
  });

  it("inverts a falling table and refuses one that turns where the span reaches", () => {
    expect(roundTrip(table([0, 4], [10, 2]), q(6), over(0, 4))).toEqual(q(2));
    const turning = table([0, 4, 8], [0, 2, 1]);
    expect(invertible(turning, over(0, 8))).toBe(false);
    expect(invertible(turning, over(0, 4))).toBe(true);
    expect(roundTrip(turning, q(1), over(0, 4))).toEqual(q(2));
  });

  it("is never invertible as a step function, and inverts float anchors on doubles", () => {
    expect(invertible(table([0, 4, 8], [0, 2, 10], "none", "previous"), over(0, 8))).toBe(false);
    expect(invert(table([0.5, 4.5], [0.25, 2.25]), 1.25, over(0, 5))).toBe(2.5);
  });
});

describe("a PiecewiseMap", () => {
  it("inverts when its pieces rise together without stepping back", () => {
    const pieces = piecewise(linear("second", [3, 5], [-2, 5]));
    const span = over(0, 16);
    expect(invertible(pieces, span)).toBe(true);
    expect([q(1), q(16, 5), q(2)].map((y) => roundTrip(pieces, y, span))).toEqual([
      q(2),
      q(6),
      q(4),
    ]);
  });

  it("is not invertible when a piece falls or a break steps back", () => {
    expect(invertible(piecewise(linear("second", -1, 10)), over(0, 16))).toBe(false);
    expect(invertible(piecewise(linear("second", 1, -4)), over(0, 16))).toBe(false);
  });

  it("is decided once per map object and span", () => {
    /** Item 3's rising map with a getter on `breaks` counting each read in `reads`. */
    const counted = (reads: { count: number }): ConversionMap => {
      const map = piecewise(linear("second", [3, 5], [-2, 5]));
      if (map.type !== "PiecewiseMap") throw new Error("a PiecewiseMap");
      const { breaks } = map;
      const copy = { ...map };
      Object.defineProperty(copy, "breaks", {
        get() {
          reads.count += 1;
          return breaks;
        },
        enumerable: true,
      });
      return copy;
    };
    const reads = { count: 0 };
    const pieces = counted(reads);
    expect(invertible(pieces, over(0, 16))).toBe(true);
    const n = reads.count;
    expect(n).toBeGreaterThan(0);
    expect(invertible(pieces, over(0, 16))).toBe(true);
    expect(reads.count).toBe(n);
    const copyReads = { count: 0 };
    expect(invertible(counted(copyReads), over(0, 16))).toBe(true);
    expect(copyReads.count).toBe(n);
    expect(invertible(pieces, over(0, 4))).toBe(true);
    expect(reads.count).toBe(2 * n);
  });
});

describe("a ChainMap", () => {
  const ticks = linear("ticks", 480, 0, "ticks");

  it("inverts link by link over the span each link is read over", () => {
    const chain: ConversionMap = {
      type: "ChainMap",
      id: "chain",
      name: null,
      source_unit: "quarters",
      target_unit: "seconds",
      maps: [ticks, table([0, 1920], [0, 2], "none", "linear", "ticks")],
    };
    expect(invertible(chain, SPAN)).toBe(true);
    expect(roundTrip(chain, q(1), SPAN)).toEqual(q(2));
  });

  it("is not invertible when a link is not", () => {
    const chain: ConversionMap = {
      type: "ChainMap",
      id: "chain",
      name: null,
      source_unit: "quarters",
      target_unit: "seconds",
      maps: [
        ticks,
        {
          type: "ConstantMap",
          id: "fixed",
          name: null,
          source_unit: "ticks",
          target_unit: "seconds",
          value: 3,
        },
      ],
    };
    expect(invertible(chain, SPAN)).toBe(false);
  });
});

describe("maps never invertible", () => {
  it("are a ConstantMap, a CombinationMap and a measure view", () => {
    const maps: ConversionMap[] = [
      {
        type: "ConstantMap",
        id: "fixed",
        name: null,
        source_unit: "quarters",
        target_unit: "seconds",
        value: 3,
      },
      {
        type: "CombinationMap",
        id: "both",
        name: null,
        source_unit: "quarters",
        target_unit: null,
        maps: { seconds: linear("inner", [1, 2], 0) },
      },
      {
        type: "MeasureNumberMap",
        id: "bars",
        name: null,
        source_unit: "quarters",
        target_unit: null,
        measure_map: "measures",
      },
    ];
    expect(maps.map((map) => [invertible(map, SPAN), invert(map, q(3), SPAN)])).toEqual(
      maps.map(() => [false, null]),
    );
  });
});
