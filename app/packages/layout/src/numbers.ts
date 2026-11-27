/**
 * Positions on the root's axis, the one step from an exact value to a double,
 * and the text of a coordinate (`docs/drawing.md` in TimeToShare, sections
 * 3 and 5.2).
 */

import { type AxisValue, prettyText, type TimelineManifest } from "@timetoalign/tilie-core";
import { addReal, fromFloat, Rational, type Real, toFloat } from "@timetoalign/tilie-core/numbers";
import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import { isJsonFloat } from "@timetoalign/timetoshare";

function integerValue(value: unknown): bigint {
  if (isJsonFloat(value)) return BigInt(value.value);
  if (typeof value === "number" || typeof value === "bigint") return BigInt(value);
  throw new TypeError("an axis integer is not numeric");
}

/**
 * A bare value on an axis of number type `numberType` as Python's numeric
 * tower holds it: a `float` value as a float, an `int` or `fraction` value
 * as an exact rational. The manifest is schema-valid, so the value has the
 * form its number type selects.
 */
export function coordinateValue(value: AxisValue, numberType: NumberType): Real {
  if (numberType === "float") return isJsonFloat(value) ? value.value : Number(value);
  // An integral JSON number counts as the integer it equals, as the library reads it.
  if (Array.isArray(value)) {
    return Rational.fromParts(integerValue(value[0]), integerValue(value[1]));
  }
  return Rational.fromParts(integerValue(value), 1n);
}

/** A timeline's length on its own axis, or null when the length is not known. */
export function lengthValue(timeline: TimelineManifest): Real | null {
  return timeline.length === null ? null : coordinateValue(timeline.length, timeline.number_type);
}

/** Zero in a number type: an exact 0, or the float 0.0. */
export function zero(numberType: NumberType): Real {
  return numberType === "float" ? 0 : Rational.of(0n);
}

/** `left + right` in the tower: exact when both are exact, otherwise a float. */
export const add = addReal;

/** `−value` in the tower: exact for an exact value, a float's negation for a float. */
export function negate(value: Real): Real {
  return typeof value === "number" ? -value : Rational.of(0n).subtract(value);
}

/** `(left + right) / 2` in the tower: the sum, then an exact halving. */
export function midpoint(left: Real, right: Real): Real {
  const sum = addReal(left, right);
  return typeof sum === "number" ? sum / 2 : sum.multiply(Rational.of([1n, 2n]));
}

/** `|left − right|` exactly, a float read as its exact binary value. */
export function exactDistance(left: Real, right: Real): Rational {
  const a = typeof left === "number" ? fromFloat(left) : left;
  const b = typeof right === "number" ? fromFloat(right) : right;
  const difference = a.subtract(b);
  return difference.numerator < 0n ? Rational.of(0n).subtract(difference) : difference;
}

/** 2^53: every integer of smaller magnitude is a double, exactly. */
const EXACT_BOUND = 2 ** 53;

/** `value` as a double when it is an integer of magnitude below 2^53, which a double holds exactly; else `null`. */
function exactInteger(value: bigint): number | null {
  const double = Number(value);
  // Number() rounds monotonically and 2^53 is a double, so a magnitude below it is exact.
  return Math.abs(double) < EXACT_BOUND ? double : null;
}

/**
 * The double nearest `(a × b) / (c × d)`, ties to even, by one binary64
 * division where both products are integers a double holds exactly (IEEE 754
 * rounds a quotient once, as `toFloat` rounds an exact one); `null` where
 * either is not, or the quotient is 0 (an exact 0 is +0, a division may
 * give −0). `c × d` is never 0.
 */
function fastQuotient(a: bigint, b: bigint, c: bigint, d: bigint): number | null {
  const [na, nb, nc, nd] = [exactInteger(a), exactInteger(b), exactInteger(c), exactInteger(d)];
  if (na === null || nb === null || nc === null || nd === null) return null;
  const numerator = na * nb;
  const denominator = nc * nd;
  if (numerator === 0) return null;
  if (Math.abs(numerator) >= EXACT_BOUND || Math.abs(denominator) >= EXACT_BOUND) return null;
  return numerator / denominator;
}

/** The double nearest an exact value (`toFloat`), by one division where its parts allow (`fastQuotient`). */
function nearestDouble(value: Rational): number {
  return fastQuotient(value.numerator, 1n, value.denominator, 1n) ?? toFloat(value);
}

/**
 * The proportion `u = t / λ`: an exact quotient rounded once to the nearest
 * double, a binary64 division when either is a float, 0 when `λ` is 0. An
 * exact quotient whose cross products are integers below 2^53 is rounded by
 * one binary64 division of them, the same double without building it.
 */
export function proportion(t: Real, length: Real): number {
  const isZero = typeof length === "number" ? length === 0 : length.numerator === 0n;
  if (isZero) return 0;
  if (t instanceof Rational && length instanceof Rational) {
    return (
      fastQuotient(t.numerator, length.denominator, t.denominator, length.numerator) ??
      toFloat(t.divide(length))
    );
  }
  const a = t instanceof Rational ? nearestDouble(t) : t;
  const b = length instanceof Rational ? nearestDouble(length) : length;
  return a / b;
}

/** The places a float label is rounded to (section 5.2). */
const LABEL_DECIMALS = 3;

/**
 * A coordinate label (section 5.2): the pretty text of a value on an axis of
 * `numberType` and `unit`, rounded as a label is, to three places. An exact
 * value is an int on an int axis where it is integral, else a fraction; a
 * float value, a sum involving a float, is a float whatever the axis. Without
 * a unit, the text has no pretty unit.
 */
export function coordinateText(value: Real, numberType: NumberType, unit: TimeUnit | null): string {
  if (typeof value === "number") return prettyText(value, "float", unit, LABEL_DECIMALS);
  return numberType === "int" && value.denominator === 1n
    ? prettyText(value.numerator, "int", unit, LABEL_DECIMALS)
    : prettyText(value, "fraction", unit, LABEL_DECIMALS);
}

/**
 * A constant factor `n/d` formed before it multiplies (section 3.3): the
 * double nearest the exact product of `n/d` and the double `value`, so
 * `1.2w` is the double nearest 6/5 × w, never the binary64 product `1.2 * w`.
 */
export function times(numerator: bigint, denominator: bigint, value: number): number {
  return toFloat(Rational.fromParts(numerator, denominator).multiply(fromFloat(value)));
}
