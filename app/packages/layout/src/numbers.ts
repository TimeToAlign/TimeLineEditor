/**
 * Numbers of the geometry: positions on the root's axis, heights in rows and
 * the text of a coordinate (`docs/geometry.md` in timeskeleton, sections 3
 * and 5).
 */

import { addReal, type CoordinateDict, Rational, type Real } from "@timetoalign/tilie-core";
import type { NumberType, TimeUnit } from "@timetoalign/timeskeleton";
import { compactJson, isJsonFloat, JsonFloat, type JsonNumber } from "@timetoalign/timeskeleton";

/** A number of the geometry as the standard writer writes it: an integer, a float or a pair. */
export type GeometryNumber = JsonNumber | readonly [number | bigint, number | bigint];

const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** An integer as `parseJson` represents it: a plain number when safe, a bigint beyond. */
export function jsonInteger(value: bigint): number | bigint {
  return value >= -SAFE && value <= SAFE ? Number(value) : value;
}

/** A float as `parseJson` represents it: a `JsonFloat` when integral, a plain number otherwise. */
export function jsonFloat(value: number): JsonFloat | number {
  return Number.isInteger(value) || Object.is(value, -0) ? new JsonFloat(value) : value;
}

/** A rational as a Fraction pair in lowest terms. */
export function pair(value: Rational): readonly [number | bigint, number | bigint] {
  return [jsonInteger(value.numerator), jsonInteger(value.denominator)];
}

/**
 * A position on the root's axis in the JSON number forms: a float as a float;
 * an exact value as an integer on an `int` root when it is one, else as a pair.
 */
export function position(value: Real, rootNumberType: NumberType): GeometryNumber {
  if (typeof value === "number") return jsonFloat(value);
  if (rootNumberType === "int" && value.denominator === 1n) return jsonInteger(value.numerator);
  return pair(value);
}

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

/** `(left + right) / 2` in the tower: the sum, then an exact halving. */
export function midpoint(left: Real, right: Real): Real {
  const sum = addReal(left, right);
  return typeof sum === "number" ? sum / 2 : sum.multiply(Rational.of([1n, 2n]));
}

/** The text of a JSON number form: `96`, `3/2` (or `3` for `[3, 1]`), `1.5`, `6.0`. */
export function numberText(value: GeometryNumber | readonly unknown[]): string {
  if (Array.isArray(value)) {
    const [numerator, denominator] = value as unknown as readonly [
      number | bigint,
      number | bigint,
    ];
    return BigInt(denominator) === 1n ? `${numerator}` : `${numerator}/${denominator}`;
  }
  return compactJson(value as JsonNumber);
}

const UNIT_SYMBOLS: Partial<Readonly<Record<TimeUnit, string>>> = {
  quarters: "♩",
  seconds: "s",
  samples: "smp",
  ticks: "ticks",
  pixels: "px",
};

/** A coordinate label: the value's text, a space and the unit's symbol. */
export function coordinateText(value: GeometryNumber | readonly unknown[], unit: TimeUnit): string {
  return `${numberText(value)} ${UNIT_SYMBOLS[unit] ?? unit}`;
}
