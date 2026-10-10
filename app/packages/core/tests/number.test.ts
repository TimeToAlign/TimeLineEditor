import { JsonFloat } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { Coordinate } from "../src/index.ts";
import {
  AxisMismatchError,
  addCoordinates,
  CoordinateError,
  compareCoordinates,
  coordinateFromDict,
  coordinatesEqual,
  coordinateToDict,
  Rational,
  subtractCoordinates,
} from "../src/index.ts";
import { addReal, compareReal, exactCoordinate, realOf } from "../src/number/real.ts";

const parts = (value: Rational) => [value.numerator, value.denominator];

describe("Rational", () => {
  it("normalizes every constructor result", () => {
    expect(parts(Rational.of([2, 4]))).toEqual([1n, 2n]);
    expect(parts(Rational.of([3, -6]))).toEqual([-1n, 2n]);
    expect(parts(Rational.of([0, 5]))).toEqual([0n, 1n]);
    expect(parts(Rational.of("-12"))).toEqual([-12n, 1n]);
    expect(parts(Rational.of(3))).toEqual([3n, 1n]);
    expect(parts(Rational.of(2n ** 60n))).toEqual([2n ** 60n, 1n]);
    expect(Rational.of([2, 4]).equals(Rational.of([1n, 2n]))).toBe(true);
    expect(Rational.of([2, 4]).equals(Rational.of([1n, 3n]))).toBe(false);
  });

  it("is never built from a float", () => {
    expect(() => Rational.of(0.5)).toThrow(TypeError);
    expect(() => Rational.of(2 ** 53)).toThrow(TypeError);
    expect(() => Rational.of(Number.NaN)).toThrow(TypeError);
    expect(() => Rational.of([1, 0.5])).toThrow(TypeError);
    expect(() => Rational.of("1.5")).toThrow(TypeError);
    expect(() => Rational.of("1/2")).toThrow(TypeError);
    expect(() => Rational.of([1, 0])).toThrow(RangeError);
  });

  it("adds, subtracts and compares exactly", () => {
    expect(
      Rational.of([1, 3])
        .add(Rational.of([1, 6]))
        .toFraction(),
    ).toEqual([1n, 2n]);
    expect(
      Rational.of([1, 2])
        .subtract(Rational.of([3, 4]))
        .toFraction(),
    ).toEqual([-1n, 4n]);
    expect(Rational.of([-1, 2]).compare(Rational.of([1, 3]))).toBe(-1);
    expect(Rational.of([1, 3]).compare(Rational.of([1, 2]))).toBe(-1);
    expect(Rational.of([1, 2]).compare(Rational.of([2, 4]))).toBe(0);
    expect(Rational.of([1, 2]).compare(Rational.of([1, 3]))).toBe(1);
    expect(
      Rational.of(2n ** 62n + 1n)
        .add(Rational.of(1))
        .toFraction(),
    ).toEqual([2n ** 62n + 2n, 1n]);
    expect(Rational.of([7, 2]).toString()).toBe("7/2");
  });
});

describe("coordinate dicts mirror coordinate_from_dict and coordinate_to_dict", () => {
  const read = (unit: string, numberType: string, value: unknown) =>
    coordinateFromDict({ unit, number_type: numberType, value });

  it("reads an int value from a JSON integer or an integral JSON number", () => {
    expect(read("ticks", "int", 480n)).toEqual({ unit: "ticks", numberType: "int", value: 480n });
    expect(read("ticks", "int", 480)).toEqual({ unit: "ticks", numberType: "int", value: 480n });
    expect(read("ticks", "int", 2 ** 60)).toEqual({
      unit: "ticks",
      numberType: "int",
      value: 2n ** 60n,
    });
    expect(() => read("ticks", "int", 1.5)).toThrow(CoordinateError);
    expect(() => read("ticks", "int", [1n, 2n])).toThrow(CoordinateError);
  });

  it("reads a float value from a JSON number or an integer it equals", () => {
    expect(read("seconds", "float", 0.5)).toEqual({
      unit: "seconds",
      numberType: "float",
      value: 0.5,
    });
    expect(read("seconds", "float", 3n)).toEqual({
      unit: "seconds",
      numberType: "float",
      value: 3,
    });
    expect(() => read("seconds", "float", 2n ** 53n + 1n)).toThrow(CoordinateError);
    expect(() => read("seconds", "float", [1n, 2n])).toThrow(CoordinateError);
  });

  it("reads a fraction value only from a pair of integers with a positive denominator", () => {
    const value = read("quarters", "fraction", [2n, 4n]).value as Rational;
    expect(value.toFraction()).toEqual([1n, 2n]);
    expect((read("quarters", "fraction", [3, 1]).value as Rational).toFraction()).toEqual([3n, 1n]);
    expect(() => read("quarters", "fraction", 3n)).toThrow(CoordinateError);
    expect(() => read("quarters", "fraction", [1n, 0n])).toThrow(CoordinateError);
    expect(() => read("quarters", "fraction", [1n, -2n])).toThrow(CoordinateError);
    expect(() => read("quarters", "fraction", [1n, 2n, 3n])).toThrow(CoordinateError);
    expect(() => read("quarters", "fraction", [0.5, 1n])).toThrow(CoordinateError);
  });

  it("bounds every integer to int64", () => {
    expect(read("ticks", "int", 2n ** 63n - 1n).value).toBe(2n ** 63n - 1n);
    expect(read("ticks", "int", -(2n ** 63n)).value).toBe(-(2n ** 63n));
    expect(() => read("ticks", "int", 2n ** 63n)).toThrow(CoordinateError);
    expect(() => read("quarters", "fraction", [1n, 2n ** 63n])).toThrow(CoordinateError);
  });

  it("refuses unknown units and number types at their member", () => {
    const refusal = (entry: unknown) => {
      try {
        coordinateFromDict(entry);
      } catch (error) {
        return [(error as CoordinateError).code, (error as CoordinateError).path];
      }
      return undefined;
    };
    expect(refusal({ unit: "bars", number_type: "int", value: 1n })).toEqual([
      "invalid_coordinate",
      ["unit"],
    ]);
    expect(refusal({ unit: "ticks", number_type: "decimal", value: 1n })).toEqual([
      "invalid_coordinate",
      ["number_type"],
    ]);
    expect(refusal({ unit: "ticks", number_type: "int" })).toEqual(["invalid_coordinate", []]);
    expect(refusal({ unit: "ticks", number_type: "int", value: "1" })).toEqual([
      "invalid_coordinate",
      ["value"],
    ]);
  });

  it("writes a bigint, a number or a normalized pair", () => {
    expect(coordinateToDict(read("ticks", "int", 480n))).toEqual({
      unit: "ticks",
      number_type: "int",
      value: 480,
    });
    expect(coordinateToDict(read("ticks", "int", 2n ** 60n)).value).toBe(2n ** 60n);
    expect(coordinateToDict(read("seconds", "float", 3n))).toEqual({
      unit: "seconds",
      number_type: "float",
      value: new JsonFloat(3),
    });
    expect(coordinateToDict(read("seconds", "float", 2.5)).value).toBe(2.5);
    expect(coordinateToDict(read("quarters", "fraction", [6n, 4n]))).toEqual({
      unit: "quarters",
      number_type: "fraction",
      value: [3, 2],
    });
  });
});

describe("coordinate arithmetic stays on one axis", () => {
  const fraction = (n: number, d: number): Coordinate => ({
    unit: "quarters",
    numberType: "fraction",
    value: Rational.of([n, d]),
  });

  it("adds, subtracts and compares within an axis", () => {
    expect(coordinateToDict(addCoordinates(fraction(1, 3), fraction(1, 6))).value).toEqual([1, 2]);
    expect(coordinateToDict(subtractCoordinates(fraction(1, 2), fraction(3, 4))).value).toEqual([
      -1, 4,
    ]);
    const ticks = (value: bigint): Coordinate => ({ unit: "ticks", numberType: "int", value });
    expect(addCoordinates(ticks(2n ** 62n), ticks(2n ** 62n)).value).toBe(2n ** 63n);
    const seconds = (value: number): Coordinate => ({
      unit: "seconds",
      numberType: "float",
      value,
    });
    expect(addCoordinates(seconds(0.1), seconds(0.2)).value).toBe(0.30000000000000004);
    expect(compareCoordinates(seconds(0.5), seconds(0.25))).toBe(1);
    expect(coordinatesEqual(fraction(2, 4), fraction(1, 2))).toBe(true);
  });

  it("throws on another unit or number type", () => {
    const other: Coordinate = { unit: "quarters", numberType: "float", value: 0.5 };
    const seconds: Coordinate = { unit: "seconds", numberType: "fraction", value: Rational.of(1) };
    expect(() => addCoordinates(fraction(1, 2), other)).toThrow(AxisMismatchError);
    expect(() => compareCoordinates(fraction(1, 2), seconds)).toThrow(AxisMismatchError);
    let caught: unknown;
    try {
      subtractCoordinates(fraction(1, 2), other);
    } catch (error) {
      caught = error;
    }
    expect((caught as AxisMismatchError).code).toBe("axis_mismatch");
  });
});

describe("a child's end compares across number types as Python compares it", () => {
  const on = (numberType: "int" | "float" | "fraction", value: unknown): Coordinate =>
    coordinateFromDict({ unit: "number", number_type: numberType, value });
  const end = (offset: Coordinate, length: Coordinate) => addReal(realOf(offset), realOf(length));
  const show = (value: ReturnType<typeof addReal>) =>
    value instanceof Rational ? value.toFraction() : value;

  it("int parent, Fraction child: exact", () => {
    const childEnd = end(on("int", 3n), on("fraction", [3n, 2n]));
    expect(show(childEnd)).toEqual([9n, 2n]);
    expect(compareReal(childEnd, realOf(on("int", 4n)))).toBe(1);
    expect(compareReal(childEnd, realOf(on("int", 5n)))).toBe(-1);
  });

  it("Fraction parent, int child: exact", () => {
    const childEnd = end(on("fraction", [7n, 2n]), on("int", 2n));
    expect(show(childEnd)).toEqual([11n, 2n]);
    expect(compareReal(childEnd, realOf(on("fraction", [11n, 2n])))).toBe(0);
  });

  it("float parent, int child: a float", () => {
    const childEnd = end(on("float", 3.5), on("int", 2n));
    expect(childEnd).toBe(5.5);
    expect(compareReal(childEnd, realOf(on("float", 5.5)))).toBe(0);
    expect(compareReal(childEnd, realOf(on("float", 5.25)))).toBe(1);
  });

  it("compares a float with an exact value exactly", () => {
    expect(compareReal(0.1, Rational.of([1, 10]))).toBe(1);
    expect(compareReal(0.5, Rational.of([1, 2]))).toBe(0);
    expect(compareReal(-0.5, Rational.of([-1, 3]))).toBe(-1);
  });

  it("rounds an exact value to the nearest float, as Python's float(Fraction)", () => {
    const rounded = (n: bigint, d: bigint) => addReal(Rational.fromParts(n, d), 0);
    expect(rounded(1n, 3n)).toBe(0.3333333333333333);
    expect(rounded(2n ** 62n + 1n, 3n)).toBe(1.5372286728091292e18);
    expect(rounded(-(2n ** 62n + 1n), 3n)).toBe(-1.5372286728091292e18);
    // Number(n) / Number(d) gives 0.8611121019002627 here.
    expect(rounded(6402900570728149493n, 7435617913856420575n)).toBe(0.8611121019002628);
  });

  it("expresses a value on an axis only when the number type holds it exactly", () => {
    const shown = (coordinate: Coordinate | undefined) =>
      coordinate === undefined ? undefined : coordinateToDict(coordinate).value;
    expect(shown(exactCoordinate(Rational.of([9, 2]), "number", "int"))).toBe(undefined);
    expect(shown(exactCoordinate(Rational.of([8, 2]), "number", "int"))).toBe(4);
    expect(shown(exactCoordinate(Rational.of([9, 2]), "number", "fraction"))).toEqual([9, 2]);
    expect(shown(exactCoordinate(5.5, "number", "fraction"))).toEqual([11, 2]);
    expect(shown(exactCoordinate(Rational.of([1, 3]), "number", "float"))).toBe(undefined);
    expect(shown(exactCoordinate(Rational.of([1, 2]), "number", "float"))).toBe(0.5);
    expect(shown(exactCoordinate(1e-300, "number", "fraction"))).toBe(undefined);
  });
});
