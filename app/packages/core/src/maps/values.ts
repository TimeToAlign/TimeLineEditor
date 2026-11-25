/**
 * What a conversion map reads and gives, and Python's arithmetic on it.
 *
 * timetoalign evaluates a map on Python numbers, and the kind of each
 * number is part of the result: an int and a Fraction are exact, an
 * operation with a float is a float (each exact operand correctly rounded
 * first). The same kinds stand here: a `bigint` is an int, a `Rational` a
 * Fraction, a `number` a float.
 */

import type { NumberType } from "@timetoalign/timetoshare";
import type { CoordinateValue } from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import { toFloat, toRational } from "../number/real.ts";

/** A number a map reads or gives: `bigint` an int, `Rational` a Fraction, `number` a float. */
export type MapValue = CoordinateValue;

/** A position a map is evaluated at, as its timeline's number type holds it. */
export type MapInput = MapValue;

/** An exact quarter-note value: `[numerator, denominator]`, both safe integers. */
export type QuarterPair = readonly [number, number];

/**
 * One measure of an expanded MeasureMap, the members the measure views
 * read: a row of the answer of the server's measure-maps route.
 */
export interface MeasureKnot {
  readonly ID: string;
  readonly name: string;
  readonly count: number;
  readonly number: number | null;
  readonly qstamp: QuarterPair | null;
  readonly nominal_length: QuarterPair | null;
  readonly actual_length: QuarterPair | null;
  /** The counts of the rows that may follow this one (`[]` for none). */
  readonly next: readonly number[];
  readonly offset_within_measure: QuarterPair;
}

/** The expanded rows of one MeasureMap of a manifest, named by its ID. */
export interface MeasureKnots {
  readonly id: string;
  readonly rows: readonly MeasureKnot[];
}

/** The answer of a `MeasureRecordMap`: the measure holding the position. */
export interface MeasureRecord {
  readonly record: MeasureKnot;
}

/** The answer of a map with named outputs: a `CombinationMap`, a `MeasureBeatMap`. */
export interface MapOutputs {
  readonly outputs: { readonly [name: string]: MapResult };
}

/** A map's raw result: a number, a string (a label), a measure, or named outputs. */
export type MapResult = MapValue | string | MeasureRecord | MapOutputs;

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** Whether a map's result is a number rather than a label, a measure or named outputs. */
export function isMapValue(result: MapResult): result is MapValue {
  return typeof result === "bigint" || typeof result === "number" || result instanceof Rational;
}

/** The number type a value's kind is. */
export function kindOf(value: MapValue): NumberType {
  return typeof value === "bigint" ? "int" : typeof value === "number" ? "float" : "fraction";
}

/** `float(value)`: the double nearest to an exact value. */
export function floatOf(value: MapValue): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") {
    return value >= -SAFE && value <= SAFE ? Number(value) : toFloat(Rational.fromParts(value, 1n));
  }
  return toFloat(value);
}

function combine(
  left: MapValue,
  right: MapValue,
  ints: (a: bigint, b: bigint) => bigint,
  exact: (a: Rational, b: Rational) => Rational,
  float: (a: number, b: number) => number,
): MapValue {
  if (typeof left === "number" || typeof right === "number") {
    return float(floatOf(left), floatOf(right));
  }
  if (typeof left === "bigint" && typeof right === "bigint") return ints(left, right);
  return exact(toRational(left), toRational(right));
}

/** `left + right` on Python's numeric tower. */
export function addValues(left: MapValue, right: MapValue): MapValue {
  return combine(
    left,
    right,
    (a, b) => a + b,
    (a, b) => a.add(b),
    (a, b) => a + b,
  );
}

/** `left * right` on Python's numeric tower. */
export function multiplyValues(left: MapValue, right: MapValue): MapValue {
  return combine(
    left,
    right,
    (a, b) => a * b,
    (a, b) => a.multiply(b),
    (a, b) => a * b,
  );
}
