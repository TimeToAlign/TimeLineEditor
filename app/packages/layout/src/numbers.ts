/**
 * Positions on the root's axis, the one step from an exact value to a double,
 * and the text of a coordinate (`docs/drawing.md` in TimeToShare, sections
 * 3 and 5.2).
 */

import {
  type AxisValue,
  type Manifest,
  prettyText,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import { namedTimestamps } from "@timetoalign/tilie-core/drawing";
import {
  addReal,
  compareReal,
  fromFloat,
  Rational,
  type Real,
  toFloat,
} from "@timetoalign/tilie-core/numbers";
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

/** The larger of two values, compared exactly; of two equal ones, an exact one before a float. */
function larger(left: Real, right: Real): Real {
  const order = compareReal(left, right);
  if (order !== 0) return order > 0 ? left : right;
  return typeof left === "number" ? right : left;
}

/**
 * The reach of a timeline on its own axis (section 3.4): the largest of its
 * number type's zero and every coordinate its content reaches, displayed or
 * not. A child counts its offset plus its length, or plus its own reach when
 * its length is not known; regions their start and end; every flow-control
 * element its coordinate; every named timestamp of it in `manifest`'s
 * `graphical` object its coordinate. Maps are not content, and a measure map
 * belongs to no timeline.
 * `reaches` holds the reach of every timeline already walked, so one traversal
 * walks each subtree once.
 */
export function reachOf(
  timeline: TimelineManifest,
  manifest: Manifest,
  reaches: WeakMap<TimelineManifest, Real> = new WeakMap(),
): Real {
  const cached = reaches.get(timeline);
  if (cached !== undefined) return cached;
  const own = (value: AxisValue) => coordinateValue(value, timeline.number_type);
  let reach = zero(timeline.number_type);
  const take = (value: Real) => {
    reach = larger(reach, value);
  };
  for (const child of timeline.children) {
    take(add(own(child.offset), lengthValue(child) ?? reachOf(child, manifest, reaches)));
  }
  for (const region of timeline.regions) {
    take(own(region.start));
    take(own(region.end));
  }
  for (const item of timeline.flow_control) take(own(item.coordinate));
  for (const timestamp of namedTimestamps(manifest, timeline.id)) take(own(timestamp.coordinate));
  reaches.set(timeline, reach);
  return reach;
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

/** The places a float label is rounded to (section 5.2). */
const LABEL_DECIMALS = 3;

/**
 * A coordinate label (section 5.2): the pretty text of a value on an axis of
 * `numberType` and `unit`, rounded as a label is, to three places. An exact
 * value is an int on an int axis where it is integral, else a fraction; a
 * float value, a sum involving a float, is a float whatever the axis.
 */
export function coordinateText(value: Real, numberType: NumberType, unit: TimeUnit): string {
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
