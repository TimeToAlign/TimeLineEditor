/**
 * The simplest value inside a reach, never finer than the granularity.
 *
 * A pointer picks a value on an axis: a position on a line, or the value of
 * a map at that position. It gives the value and a reach, half a device
 * pixel measured on the same axis; the value picked is the simplest of the
 * axis's number type within that reach. A fraction axis tries the divisors
 * of the granularity's denominator from the smallest, a float axis 0 to
 * `decimals` decimal places, an int axis the powers of ten from the largest
 * that fits in the pixel down to 1; the first value within reach wins, and
 * where none is, the finest is taken. Every value is exact, so a pointer's
 * doubles enter by their exact values (`fromFloat`) and no float constructs
 * the result. Holding a value to a span is a separate step (`clampValue`).
 */

import type { NumberType } from "@timetoalign/timetoshare";
import type { Granularity } from "../workspace/view.ts";
import { Rational } from "./rational.ts";
import type { Real } from "./real.ts";
import { toRational } from "./real.ts";

const HALF = Rational.fromParts(1n, 2n);
const ZERO = Rational.fromParts(0n, 1n);

/** The nearest multiple of `1 / denominator` to `value`, a tie going up. */
export function nearest(value: Rational, denominator: bigint): Rational {
  const scaled = value.multiply(Rational.fromParts(denominator, 1n));
  return Rational.fromParts(scaled.add(HALF).floor(), denominator);
}

/** The nearest multiple of `step` to `value`, a tie going up. */
function nearestMultiple(value: Rational, step: bigint): Rational {
  const count = value.divide(Rational.fromParts(step, 1n)).add(HALF).floor();
  return Rational.fromParts(count * step, 1n);
}

const divisorsOf = new Map<number, readonly bigint[]>();

/** The divisors of a positive safe integer, ascending; computed once per integer. */
function divisors(denominator: number): readonly bigint[] {
  const known = divisorsOf.get(denominator);
  if (known !== undefined) return known;
  const low: bigint[] = [];
  const high: bigint[] = [];
  for (let d = 1; d * d <= denominator; d += 1) {
    if (denominator % d !== 0) continue;
    low.push(BigInt(d));
    if (d * d !== denominator) high.push(BigInt(denominator / d));
  }
  const found = [...low, ...high.reverse()];
  divisorsOf.set(denominator, found);
  return found;
}

/** The candidates of `numberType` in turn, simplest first, and the finest, taken where none is within reach. */
function candidates(
  value: Rational,
  reach: Rational,
  numberType: NumberType,
  granularity: Granularity,
): { readonly tried: Iterable<Rational>; readonly finest: Rational } {
  if (numberType === "fraction") {
    const denominator = BigInt(granularity.denominator);
    return {
      tried: (function* () {
        for (const d of divisors(granularity.denominator)) yield nearest(value, d);
      })(),
      finest: nearest(value, denominator),
    };
  }
  if (numberType === "float") {
    const places = granularity.decimals;
    return {
      tried: (function* () {
        for (let n = 0; n <= places; n += 1) yield nearest(value, 10n ** BigInt(n));
      })(),
      finest: nearest(value, 10n ** BigInt(places)),
    };
  }
  const pixel = reach.add(reach);
  let power = 1n;
  while (Rational.fromParts(power * 10n, 1n).compare(pixel) <= 0) power *= 10n;
  return {
    tried: (function* () {
      for (let step = power; step >= 1n; step /= 10n) yield nearestMultiple(value, step);
    })(),
    finest: nearestMultiple(value, 1n),
  };
}

/**
 * The value a pointer picks at `value` on an axis of `numberType`, `reach`
 * being half a device pixel on that axis:
 *
 * - fraction: for each divisor `d` of `granularity.denominator`, ascending,
 *   the nearest `k/d` to `value` (a tie going up); the first within `reach`
 *   wins; none: the nearest multiple of `1 / denominator`.
 * - float: for `n` from 0 to `granularity.decimals`, `value` rounded to `n`
 *   decimal places (a tie going up), as an exact decimal; the first within
 *   `reach` wins; none: `decimals` places.
 * - int: for `10^m` from the largest power of ten not above `2·reach` (at
 *   least 1) down to 1, the nearest multiple of `10^m` (a tie going up); the
 *   first within `reach` wins; none: the nearest integer.
 *
 * @throws {RangeError} if `reach` is not positive.
 */
export function snapValue(
  value: Rational,
  reach: Rational,
  numberType: NumberType,
  granularity: Granularity,
): Rational {
  if (reach.compare(ZERO) <= 0) throw new RangeError(`the reach ${reach} is not positive`);
  const { tried, finest } = candidates(value, reach, numberType, granularity);
  for (const candidate of tried) {
    const distance = candidate.subtract(value);
    const magnitude = distance.numerator < 0n ? ZERO.subtract(distance) : distance;
    if (magnitude.compare(reach) <= 0) return candidate;
  }
  return finest;
}

/** `value` held to `[start, end]`; an `end` of `null` (unknown) holds only below. */
export function clampValue(value: Rational, start: Rational, end: Real | null): Rational {
  if (value.compare(start) < 0) return start;
  if (end === null) return value;
  const last = toRational(end);
  return value.compare(last) > 0 ? last : value;
}
