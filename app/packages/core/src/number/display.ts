/**
 * A value as the editor shows it, copies it and writes it as a coordinate.
 *
 * A fraction shows as a mixed fraction while its denominator is at most 64,
 * else as its exact decimal where that ends, else as `≈` and 12 decimal
 * places; a float shows Python's `round(x, 3)` spelled as Python's `repr`;
 * an int shows its digits in groups of three. Copy carries the whole value:
 * `n/d` for a fraction, the full `repr` of a float, the plain digits of an
 * int.
 */

import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import { compactJson, JsonFloat } from "@timetoalign/timetoshare";
import type { AxisValue } from "../manifest/types.ts";
import type { CoordinateValue } from "./coordinate.ts";
import { toAxisValue } from "./coordinate.ts";
import { Rational, roundHalfEven } from "./rational.ts";
import { roundFloat } from "./real.ts";

/** The largest denominator a fraction is shown with. */
const MIXED_DENOMINATOR = 64n;
/** The decimal places of an approximate fraction. */
const APPROXIMATE_PLACES = 12;

/** A coordinate dict: a value on an axis, its value written as the number type selects. */
export interface CoordinateDict {
  readonly unit: TimeUnit;
  readonly number_type: NumberType;
  readonly value: AxisValue;
}

function kindError(value: CoordinateValue, numberType: NumberType): TypeError {
  return new TypeError(`${String(value)} is not a ${numberType} value`);
}

function fractionOf(value: CoordinateValue): Rational {
  if (value instanceof Rational) return value;
  throw kindError(value, "fraction");
}

function floatOf(value: CoordinateValue): number {
  if (typeof value === "number") return value;
  throw kindError(value, "float");
}

function intOf(value: CoordinateValue): bigint {
  if (typeof value === "bigint") return value;
  throw kindError(value, "int");
}

/** A float as Python's `repr` spells it. */
function repr(value: number): string {
  return compactJson(new JsonFloat(value));
}

/** Whether a denominator has no prime factor but 2 and 5, so the decimal ends. */
function terminates(denominator: bigint): boolean {
  let rest = denominator;
  while (rest % 2n === 0n) rest /= 2n;
  while (rest % 5n === 0n) rest /= 5n;
  return rest === 1n;
}

/** `magnitude / 10^places` written with exactly `places` decimals. */
function decimals(magnitude: bigint, places: number): string {
  const digits = magnitude.toString().padStart(places + 1, "0");
  const point = digits.length - places;
  return places === 0 ? digits : `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** The magnitude of `value` scaled by `10^places`, rounded half to even. */
function scaledHalfEven(value: Rational, places: number): bigint {
  const magnitude = value.numerator < 0n ? -value.numerator : value.numerator;
  return roundHalfEven(magnitude * 10n ** BigInt(places), value.denominator);
}

/**
 * An exact value written out as its decimal (`1/200` is `0.005`, `-3/8`
 * is `-0.375`), where the decimal ends; `undefined` where it does not.
 */
export function exactDecimal(value: Rational): string | undefined {
  const { denominator } = value;
  if (!terminates(denominator)) return undefined;
  const sign = value.numerator < 0n ? "-" : "";
  const magnitude = value.numerator < 0n ? -value.numerator : value.numerator;
  let places = 0;
  while (10n ** BigInt(places) % denominator !== 0n) places += 1;
  return `${sign}${decimals((magnitude * 10n ** BigInt(places)) / denominator, places)}`;
}

function showFraction(value: Rational): string {
  const sign = value.numerator < 0n ? "-" : "";
  const magnitude = value.numerator < 0n ? -value.numerator : value.numerator;
  const { denominator } = value;
  if (denominator <= MIXED_DENOMINATOR) {
    const whole = magnitude / denominator;
    const rest = magnitude % denominator;
    if (rest === 0n) return `${sign}${whole}`;
    return whole === 0n
      ? `${sign}${rest}/${denominator}`
      : `${sign}${whole} ${rest}/${denominator}`;
  }
  const decimal = exactDecimal(value);
  if (decimal !== undefined) return decimal;
  return `≈ ${sign}${decimals(scaledHalfEven(value, APPROXIMATE_PLACES), APPROXIMATE_PLACES)}`;
}

function groupDigits(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value).toString();
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
}

/** The symbols of TimeToShare's drawing specification (section 5.2); a unit not listed is its own name. */
const UNIT_SYMBOLS: Partial<Readonly<Record<TimeUnit, string>>> = {
  quarters: "♩",
  seconds: "s",
  samples: "smp",
  ticks: "ticks",
  pixels: "px",
};

/** The symbol a coordinate of `unit` is shown with: `♩` for quarters, `s`, `smp`, `ticks`, `px`, any other unit its name. */
export function unitSymbol(unit: TimeUnit): string {
  return UNIT_SYMBOLS[unit] ?? unit;
}

/**
 * The text a value of `numberType` is shown with.
 *
 * @throws {TypeError} if the value is not of the number type's kind (a `bigint` for `int`, a `number` for `float`, a `Rational` for `fraction`).
 */
export function displayValue(value: CoordinateValue, numberType: NumberType): string {
  if (numberType === "fraction") return showFraction(fractionOf(value));
  if (numberType === "float") return repr(roundFloat(floatOf(value), 3));
  return groupDigits(intOf(value));
}

/**
 * The text Copy puts on the clipboard: the whole value.
 *
 * @throws {TypeError} as `displayValue`.
 */
export function copyValue(value: CoordinateValue, numberType: NumberType): string {
  if (numberType === "fraction") return fractionOf(value).toString();
  if (numberType === "float") return repr(floatOf(value));
  return intOf(value).toString();
}

/**
 * The coordinate dict `{unit, number_type, value}` of a value, the value
 * written as a bare value of its number type (a Fraction as its pair).
 *
 * @throws {TypeError} as `displayValue`.
 */
export function coordinateDict(
  value: CoordinateValue,
  unit: TimeUnit,
  numberType: NumberType,
): CoordinateDict {
  const checked =
    numberType === "fraction"
      ? fractionOf(value)
      : numberType === "float"
        ? floatOf(value)
        : intOf(value);
  return {
    unit,
    number_type: numberType,
    value: toAxisValue({ unit, numberType, value: checked }),
  };
}
