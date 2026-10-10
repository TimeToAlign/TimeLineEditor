/**
 * Values compared across number types, as Python compares them.
 *
 * A parent and its child share a unit but may differ in number type. Where
 * timetoalign computes a child's end (offset plus child length) and compares
 * it with a length, Python's numeric tower decides: an int or a Fraction is
 * exact, a sum with a float is a float (each exact operand correctly rounded
 * first), and a comparison between a float and an exact value is exact.
 * These values exist only for comparison; a stored coordinate is never
 * re-expressed through them.
 */

import type { NumberType, TimeUnit } from "@timetoalign/timeskeleton";
import type { Coordinate } from "./coordinate.ts";
import { Rational } from "./rational.ts";

/** An exact value (int or Fraction) or a float. */
export type Real = Rational | number;

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

function bitLength(value: bigint): number {
  return value === 0n ? 0 : (value < 0n ? -value : value).toString(2).length;
}

/** The double nearest to an exact value, ties to even, as Python's `float(Fraction)`. */
function toFloat(value: Rational): number {
  const { numerator, denominator } = value;
  if (denominator === 1n) return Number(numerator);
  // Scale so the integer quotient carries at least 66 significant bits, and
  // fold a non-zero remainder into its lowest bit: Number() then rounds the
  // quotient exactly as the infinitely precise value would round.
  const magnitude = numerator < 0n ? -numerator : numerator;
  const shift = Math.max(0, 66 - (bitLength(magnitude) - bitLength(denominator)));
  const scaled = magnitude * 2n ** BigInt(shift);
  let quotient = scaled / denominator;
  if (scaled % denominator !== 0n) quotient |= 1n;
  const result = Number(quotient) * 2 ** -shift;
  return numerator < 0n ? -result : result;
}

/** The exact value of a double. */
function fromFloat(value: number): Rational {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const sign = bits >> 63n === 1n ? -1n : 1n;
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & 0xfffffffffffffn;
  const mantissa = exponent === 0 ? fraction : fraction | (1n << 52n);
  const power = (exponent === 0 ? 1 : exponent) - 1075;
  return power >= 0
    ? Rational.fromParts(sign * mantissa * 2n ** BigInt(power), 1n)
    : Rational.fromParts(sign * mantissa, 2n ** BigInt(-power));
}

/** A coordinate's value as Python holds it. */
export function realOf(coordinate: Coordinate): Real {
  const { value } = coordinate;
  if (value instanceof Rational || typeof value === "number") return value;
  return Rational.fromParts(value, 1n);
}

/** `left + right`: exact when both are exact, otherwise a float. */
export function addReal(left: Real, right: Real): Real {
  if (left instanceof Rational && right instanceof Rational) return left.add(right);
  const a = left instanceof Rational ? toFloat(left) : left;
  const b = right instanceof Rational ? toFloat(right) : right;
  return a + b;
}

/** `-1`, `0` or `1`; a float and an exact value compare exactly. */
export function compareReal(left: Real, right: Real): -1 | 0 | 1 {
  if (typeof left === "number" && typeof right === "number") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  const a = left instanceof Rational ? left : fromFloat(left);
  const b = right instanceof Rational ? right : fromFloat(right);
  return a.compare(b);
}

/**
 * A value as a coordinate on an axis, only when the axis's number type holds
 * it exactly (and within int64); otherwise `undefined`.
 */
export function exactCoordinate(
  value: Real,
  unit: TimeUnit,
  numberType: NumberType,
): Coordinate | undefined {
  const exact = value instanceof Rational ? value : fromFloat(value);
  const fits = (n: bigint) => n >= INT64_MIN && n <= INT64_MAX;
  if (numberType === "float") {
    const float = value instanceof Rational ? toFloat(value) : value;
    return fromFloat(float).equals(exact) ? { unit, numberType, value: float } : undefined;
  }
  if (!fits(exact.numerator) || !fits(exact.denominator)) return undefined;
  if (numberType === "fraction") return { unit, numberType, value: exact };
  return exact.denominator === 1n ? { unit, numberType, value: exact.numerator } : undefined;
}
