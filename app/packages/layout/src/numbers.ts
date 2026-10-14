/**
 * Positions on the root's axis, the one step from an exact value to a double,
 * and the text of a coordinate (`docs/drawing.md` in timeskeleton, sections
 * 3 and 5.2).
 */

import {
  addReal,
  type CoordinateDict,
  fromFloat,
  Rational,
  type Real,
  toFloat,
} from "@timetoalign/tilie-core";
import type { NumberType, TimeUnit } from "@timetoalign/timeskeleton";
import { compactJson, isJsonFloat, JsonFloat } from "@timetoalign/timeskeleton";

/**
 * The value of a coordinate dict as Python's numeric tower holds it: a
 * `float` value as a float, an `int` or `fraction` value as an exact
 * rational. The dict is schema-valid, so its value has the form its number
 * type selects.
 */
export function coordinateValue(dict: CoordinateDict): Real {
  const value: unknown = dict.value;
  if (dict.number_type === "float") return isJsonFloat(value) ? value.value : Number(value);
  // An integral JSON number counts as the integer it equals, as the library reads it.
  const integer = (item: unknown): bigint =>
    isJsonFloat(item) ? BigInt(item.value) : BigInt(item as number | bigint);
  if (Array.isArray(value)) return Rational.fromParts(integer(value[0]), integer(value[1]));
  return Rational.fromParts(integer(value), 1n);
}

/** Zero in a number type: an exact 0, or the float 0.0. */
export function zero(numberType: NumberType): Real {
  return numberType === "float" ? 0 : Rational.of(0n);
}

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

/**
 * The proportion `u = t / λ`: an exact quotient rounded once to the nearest
 * double, a binary64 division when either is a float, 0 when `λ` is 0.
 */
export function proportion(t: Real, length: Real): number {
  const isZero = typeof length === "number" ? length === 0 : length.numerator === 0n;
  if (isZero) return 0;
  if (t instanceof Rational && length instanceof Rational) return toFloat(t.divide(length));
  const a = t instanceof Rational ? toFloat(t) : t;
  const b = length instanceof Rational ? toFloat(length) : length;
  return a / b;
}

/** The text of a value: `96`, `3/2`, `3` for 3/1; a float as Python's `repr` (`1.5`, `6.0`). */
function valueText(value: Real): string {
  if (value instanceof Rational) return value.toString();
  return compactJson(
    Number.isInteger(value) || Object.is(value, -0) ? new JsonFloat(value) : value,
  );
}

const UNIT_SYMBOLS: Partial<Readonly<Record<TimeUnit, string>>> = {
  quarters: "♩",
  seconds: "s",
  samples: "smp",
  ticks: "ticks",
  pixels: "px",
};

/** A coordinate label: the value's text, a space and the unit's symbol. */
export function coordinateText(value: Real, unit: TimeUnit): string {
  return `${valueText(value)} ${UNIT_SYMBOLS[unit] ?? unit}`;
}

/**
 * A constant factor `n/d` formed before it multiplies (section 3.3): the
 * double nearest the exact product of `n/d` and the double `value`, so
 * `1.2w` is the double nearest 6/5 × w, never the binary64 product `1.2 * w`.
 */
export function times(numerator: bigint, denominator: bigint, value: number): number {
  return toFloat(Rational.fromParts(numerator, denominator).multiply(fromFloat(value)));
}

/** The name of a timeline, group or bundle without its own: its id after the last `:` (section 5.3). */
export function unscoped(id: string): string {
  return id.slice(id.lastIndexOf(":") + 1);
}
