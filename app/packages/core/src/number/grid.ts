/**
 * The position a pointer picks on a timeline: the simplest value inside its
 * device pixel, never finer than the granularity.
 *
 * The pointer gives a double `p`, the units from the line's start, and `h`,
 * half a device pixel in units. A fraction axis tries the divisors of the
 * granularity's denominator from the smallest, a float axis 0 to
 * `decimals` decimal places, an int axis the powers of ten from the largest
 * that fits in the pixel down to 1; the first value within `h` of `p` wins,
 * and where none is, the finest is taken. Every comparison is exact on the
 * doubles' exact values (`fromFloat`), so no float constructs the position.
 */

import type { NumberType } from "@timetoalign/timetoshare";
import type { Granularity } from "../workspace/view.ts";
import { Rational } from "./rational.ts";
import type { Real } from "./real.ts";
import { fromFloat, toRational } from "./real.ts";

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
  position: Rational,
  reach: Rational,
  numberType: NumberType,
  granularity: Granularity,
): { readonly tried: Iterable<Rational>; readonly finest: Rational } {
  if (numberType === "fraction") {
    const denominator = BigInt(granularity.denominator);
    return {
      tried: (function* () {
        for (const d of divisors(granularity.denominator)) yield nearest(position, d);
      })(),
      finest: nearest(position, denominator),
    };
  }
  if (numberType === "float") {
    const places = granularity.decimals;
    return {
      tried: (function* () {
        for (let n = 0; n <= places; n += 1) yield nearest(position, 10n ** BigInt(n));
      })(),
      finest: nearest(position, 10n ** BigInt(places)),
    };
  }
  const pixel = reach.add(reach);
  let power = 1n;
  while (Rational.fromParts(power * 10n, 1n).compare(pixel) <= 0) power *= 10n;
  return {
    tried: (function* () {
      for (let step = power; step >= 1n; step /= 10n) yield nearestMultiple(position, step);
    })(),
    finest: nearestMultiple(position, 1n),
  };
}

/**
 * The position the pointer picks at `p` units from the line's start, `h`
 * units being half a device pixel, on an axis of `numberType`, held to
 * `[0, length]` (`null`, an unknown length, holds only below):
 *
 * - fraction: for each divisor `d` of `granularity.denominator`, ascending,
 *   the nearest `k/d` to `p` (a tie going up); the first within `h` of `p`
 *   wins; none: the nearest multiple of `1 / denominator`.
 * - float: for `n` from 0 to `granularity.decimals`, `p` rounded to `n`
 *   decimal places (a tie going up), as an exact decimal; the first within
 *   `h` wins; none: `decimals` places.
 * - int: for `10^m` from the largest power of ten not above `2h` (at least
 *   1) down to 1, the nearest multiple of `10^m` (a tie going up); the first
 *   within `h` wins; none: the nearest integer.
 *
 * @throws {RangeError} if `p` is not finite or `h` is not finite and positive.
 */
export function snapPosition(
  p: number,
  h: number,
  numberType: NumberType,
  length: Real | null,
  granularity: Granularity,
): Rational {
  if (!Number.isFinite(p)) throw new RangeError(`the position ${p} is not finite`);
  if (!Number.isFinite(h) || h <= 0) {
    throw new RangeError(`half a pixel of ${h} units is not finite and positive`);
  }
  const position = fromFloat(p);
  const reach = fromFloat(h);
  const { tried, finest } = candidates(position, reach, numberType, granularity);
  let picked = finest;
  for (const candidate of tried) {
    const distance = candidate.subtract(position);
    const magnitude = distance.numerator < 0n ? ZERO.subtract(distance) : distance;
    if (magnitude.compare(reach) <= 0) {
      picked = candidate;
      break;
    }
  }
  if (picked.numerator < 0n) return ZERO;
  if (length === null) return picked;
  const end = toRational(length);
  return picked.compare(end) > 0 ? end : picked;
}
