/**
 * The two texts of a coordinate, and its coordinate dict.
 *
 * The **raw** text is the exact value and its unit's schema name: the value
 * as Copy writes it (`copyValue`: a fraction as `n/d`, or `n` when the
 * denominator is 1, a float as TimeToShare spells it, an int its plain
 * digits), a space
 * and the unit spelled out (`219/16 quarters`, `0.1 seconds`, `514041
 * samples`).
 *
 * The **pretty** text is written with symbols and abbreviations
 * (`prettyUnit`): a fraction as a mixed fraction (`13 11/16 ♩`), an int in
 * groups of three digits (`514 041 smp`), a float as TimeToShare spells it.
 * Seconds are split into hours `h`, minutes `′` and seconds `″`, with no
 * unit after (`1h02′05″`); the split is exact, on the rational or on the
 * decimal digits of a float's spelling, never in float arithmetic.
 *
 * TimeToShare spells a float as Python's `repr` does, a mantissa in
 * exponent form given a fractional digit (`1.0e-05`), so a value reads as
 * its manifest writes it.
 *
 * Rounding is the reader's. Without `decimals` the pretty text is exact.
 * With `decimals` it is rounded as the coordinate flag and the drawing's
 * labels show it: a float rounded to `decimals` places as Python's `round`
 * rounds it; a fraction mixed while its denominator is at most 2520, else
 * its exact decimal where that ends, else `≈` and 12 decimal places; an int
 * as it is. Seconds are split after rounding. A pretty text is never
 * signed zero: a float −0.0, or a value that rounds to zero, is written
 * unsigned (`0″`, `0.0 ♩`), while Copy and the raw text keep the float's
 * spelling (`-0.0`).
 */

import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import { compactJson, JsonFloat } from "@timetoalign/timetoshare";
import type { AxisValue } from "../manifest/types.ts";
import type { CoordinateValue } from "./coordinate.ts";
import { toAxisValue } from "./coordinate.ts";
import { parseAxisValue } from "./parse.ts";
import { Rational, roundHalfEven } from "./rational.ts";
import { roundFloat } from "./real.ts";

/** The largest denominator a rounded fraction is shown mixed with: lcm(1, …, 10), the default granularity's. */
const MIXED_DENOMINATOR = 2520n;
/** The decimal places of an approximate fraction. */
const APPROXIMATE_PLACES = 12;

/** The pretty unit of every unit: a symbol, an abbreviation, else the unit's name. */
const PRETTY_UNITS: { readonly [unit in TimeUnit]: string } = {
  number: "number",
  floating_measures: "floating_measures",
  whole_notes: "𝅝",
  quarters: "♩",
  ticks: "ticks",
  milliseconds: "ms",
  seconds: "s",
  minutes: "min",
  samples: "smp",
  frames: "frames",
  pixels: "px",
  meters: "m",
  centimeters: "cm",
  millimeters: "mm",
  inches: "in",
  points: "pt",
  css_pixels: "css_pixels",
  user_units: "uu",
};

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

/** A float as TimeToShare's writers spell it. */
function spelled(value: number): string {
  return compactJson(new JsonFloat(value));
}

/**
 * A float rounded to `decimals` places as Python's `round`, or as it is
 * without `decimals`; a zero, negative or not, is +0, so that no pretty
 * text is signed zero.
 */
function roundedFloat(value: CoordinateValue, decimals: number | undefined): number {
  const float = floatOf(value);
  const rounded = decimals === undefined ? float : roundFloat(float, decimals);
  return rounded === 0 ? 0 : rounded;
}

function magnitudeOf(value: Rational): Rational {
  return value.numerator < 0n ? Rational.fromParts(-value.numerator, value.denominator) : value;
}

/** The decimal places a denominator's decimal ends after; `undefined` where it never ends. */
function placesOf(denominator: bigint): number | undefined {
  let rest = denominator;
  let twos = 0;
  let fives = 0;
  while (rest % 2n === 0n) {
    rest /= 2n;
    twos += 1;
  }
  while (rest % 5n === 0n) {
    rest /= 5n;
    fives += 1;
  }
  return rest === 1n ? Math.max(twos, fives) : undefined;
}

/** `scaled / 10^places` written with exactly `places` decimals, its integer part padded to two digits when `padded`. */
function decimalDigits(scaled: bigint, places: number, padded: boolean): string {
  const digits = scaled.toString().padStart(places + (padded ? 2 : 1), "0");
  const point = digits.length - places;
  return places === 0 ? digits : `${digits.slice(0, point)}.${digits.slice(point)}`;
}

/** How a magnitude is written; `padded`: its integer part in two digits, after a higher part of the seconds' split. */
type Writer = (magnitude: Rational, padded: boolean) => string;

/** A magnitude as a mixed fraction: its integer part when not zero (or when padded), then the rest `n/d`. */
const mixed: Writer = (magnitude, padded) => {
  const { numerator, denominator } = magnitude;
  const whole = numerator / denominator;
  const rest = numerator % denominator;
  const wholeText = padded ? `${whole}`.padStart(2, "0") : `${whole}`;
  if (rest === 0n) return wholeText;
  return whole === 0n && !padded ? `${rest}/${denominator}` : `${wholeText} ${rest}/${denominator}`;
};

/** A magnitude whose decimal ends, written out with exactly the places it needs. */
const decimal: Writer = (magnitude, padded) => {
  const places = placesOf(magnitude.denominator);
  if (places === undefined) throw new RangeError(`${magnitude} has no decimal that ends`);
  const scaled = (magnitude.numerator * 10n ** BigInt(places)) / magnitude.denominator;
  return decimalDigits(scaled, places, padded);
};

/** A magnitude that is a multiple of `10^−12`, written with all twelve places. */
const approximate: Writer = (magnitude, padded) => {
  const scaled = (magnitude.numerator * 10n ** BigInt(APPROXIMATE_PLACES)) / magnitude.denominator;
  return decimalDigits(scaled, APPROXIMATE_PLACES, padded);
};

/** A value as it is written: a prefix (`≈ `, the sign), its exact magnitude, already rounded, and its writer. */
interface Spelling {
  readonly prefix: string;
  readonly magnitude: Rational;
  readonly write: Writer;
}

/**
 * The spelling of an exact value: mixed when exact (no `decimals`) or when
 * its denominator is at most 2520, else its decimal where that ends, else
 * `≈` and the value rounded to 12 places, half to even.
 */
function exactSpelling(value: Rational, decimals: number | undefined): Spelling {
  const sign = value.numerator < 0n ? "-" : "";
  const magnitude = magnitudeOf(value);
  if (decimals === undefined || magnitude.denominator <= MIXED_DENOMINATOR) {
    return { prefix: sign, magnitude, write: mixed };
  }
  if (placesOf(magnitude.denominator) !== undefined) {
    return { prefix: sign, magnitude, write: decimal };
  }
  const power = 10n ** BigInt(APPROXIMATE_PLACES);
  const rounded = roundHalfEven(magnitude.numerator * power, magnitude.denominator);
  return {
    prefix: `≈ ${rounded === 0n ? "" : sign}`,
    magnitude: Rational.fromParts(rounded, power),
    write: approximate,
  };
}

/** The spelling of any value of `numberType`; a float's magnitude is the decimal its spelling writes. */
function spelling(
  value: CoordinateValue,
  numberType: NumberType,
  decimals: number | undefined,
): Spelling {
  if (numberType === "fraction") return exactSpelling(fractionOf(value), decimals);
  if (numberType === "int") return exactSpelling(Rational.of(intOf(value)), decimals);
  const text = spelled(roundedFloat(value, decimals));
  const negative = text.startsWith("-");
  const magnitude = parseAxisValue(negative ? text.slice(1) : text, "float");
  if (!(magnitude instanceof Rational)) throw new RangeError(`${text} is not a finite float`);
  return { prefix: negative ? "-" : "", magnitude, write: decimal };
}

/** A value of `numberType` as a pretty number: a float as spelled, an int grouped by three, a fraction as spelled. */
function prettyNumber(
  value: CoordinateValue,
  numberType: NumberType,
  decimals: number | undefined,
): string {
  if (numberType === "float") return spelled(roundedFloat(value, decimals));
  if (numberType === "int") {
    const integer = intOf(value);
    const digits = (integer < 0n ? -integer : integer).toString();
    return `${integer < 0n ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
  }
  const { prefix, magnitude, write } = spelling(value, numberType, decimals);
  return `${prefix}${write(magnitude, false)}`;
}

/**
 * A value of seconds split into hours `h`, minutes `′` and seconds `″`:
 * hours only when not 0, minutes when not 0 or after hours, seconds always,
 * a part after a shown one padded to two digits.
 */
function clock(
  value: CoordinateValue,
  numberType: NumberType,
  decimals: number | undefined,
): string {
  const { prefix, magnitude, write } = spelling(value, numberType, decimals);
  const whole = magnitude.floor();
  const hours = whole / 3600n;
  const minutes = (whole % 3600n) / 60n;
  const seconds = magnitude.subtract(Rational.of(hours * 3600n + minutes * 60n));
  let higher = hours === 0n ? "" : `${hours}h`;
  if (higher !== "" || minutes !== 0n) {
    higher += `${higher === "" ? `${minutes}` : `${minutes}`.padStart(2, "0")}′`;
  }
  return `${prefix}${higher}${write(seconds, higher !== "")}″`;
}

/**
 * The pretty unit of `unit`: `♩` for quarters, `𝅝` for whole notes, `ms`,
 * `s`, `min`, `smp`, `ticks`, `px`, `pt`, `m`, `cm`, `mm`, `in`, any other
 * unit its name.
 */
export function prettyUnit(unit: TimeUnit): string {
  return PRETTY_UNITS[unit];
}

/**
 * The text Copy puts on the clipboard: the whole value, a fraction `n/d`
 * (`n` when the denominator is 1), a float as spelled, an int its digits.
 *
 * @throws {TypeError} if the value is not of the number type's kind (a `bigint` for `int`, a `number` for `float`, a `Rational` for `fraction`).
 */
export function copyValue(value: CoordinateValue, numberType: NumberType): string {
  if (numberType === "fraction") return fractionOf(value).toString();
  if (numberType === "float") return spelled(floatOf(value));
  return intOf(value).toString();
}

/**
 * The raw text of a coordinate: `copyValue`, a space and the unit's schema
 * name (`219/16 quarters`, `0.1 seconds`, `514041 samples`).
 *
 * @throws {TypeError} as `copyValue`.
 */
export function rawText(value: CoordinateValue, numberType: NumberType, unit: TimeUnit): string {
  return `${copyValue(value, numberType)} ${unit}`;
}

/**
 * The pretty text of a coordinate: its pretty number, a space and its
 * pretty unit (`13 11/16 ♩`, `514 041 smp`), seconds split as `1′15.5″`, a
 * value without a unit (`null`) its number alone. Exact without `decimals`;
 * with `decimals`, rounded as the module states.
 *
 * @throws {TypeError} as `copyValue`.
 */
export function prettyText(
  value: CoordinateValue,
  numberType: NumberType,
  unit: TimeUnit | null,
  decimals?: number,
): string {
  if (unit === "seconds") return clock(value, numberType, decimals);
  const number = prettyNumber(value, numberType, decimals);
  return unit === null ? number : `${number} ${prettyUnit(unit)}`;
}

/**
 * An exact value written out as its decimal (`1/200` is `0.005`, `-3/8`
 * is `-0.375`), where the decimal ends; `undefined` where it does not.
 */
export function exactDecimal(value: Rational): string | undefined {
  if (placesOf(value.denominator) === undefined) return undefined;
  return `${value.numerator < 0n ? "-" : ""}${decimal(magnitudeOf(value), false)}`;
}

/**
 * The coordinate dict `{unit, number_type, value}` of a value, the value
 * written as a bare value of its number type (a Fraction as its pair).
 *
 * @throws {TypeError} as `copyValue`.
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
