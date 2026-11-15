/**
 * The grid a position on a timeline is picked from, and the text that
 * names it.
 *
 * A position is an exact count of steps from the timeline's start, never a
 * ratio read off a pointer's float. The step is the base the workspace's
 * granularity states for the timeline's number type; with "Refine when
 * zooming" it is the finest step of the base's sequence that is still at
 * least one device pixel wide (the base itself when even the base is
 * narrower): `1/(D·2^k)` for a fraction axis, `s/m` for a float axis and
 * `n·m` for an int axis, `m` in 1, 2, 5, 10, 20, 50, …. A refined fraction
 * or float grid contains its base grid; a refined int grid is coarser, a
 * subset of its base grid.
 */

import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import type { Granularity } from "../workspace/view.ts";
import { exactDecimal, unitSymbol } from "./display.ts";
import { positiveDecimal, Rational } from "./rational.ts";
import type { Real } from "./real.ts";
import { fromFloat, toRational } from "./real.ts";

const ONE = Rational.of(1);
const HALF = Rational.of([1, 2]);

/**
 * The exact value of a float step's decimal text.
 *
 * @throws {RangeError} if the text is not positive decimal text.
 */
function decimalStep(text: string): Rational {
  const value = positiveDecimal(text);
  if (value === undefined)
    throw new RangeError(`${JSON.stringify(text)} is no positive decimal text`);
  return value;
}

/** The multipliers 1, 2, 5, 10, 20, 50, … in turn. */
function* multipliers(): Generator<Rational> {
  for (let power = 1n; ; power *= 10n) {
    for (const digit of [1n, 2n, 5n]) yield Rational.fromParts(digit * power, 1n);
  }
}

/**
 * The step of the grid on an axis of `numberType` where one unit covers
 * `devicePxPerUnit` device pixels.
 *
 * @throws {RangeError} if `devicePxPerUnit` is not finite and positive, or a float step is no positive decimal text.
 */
export function gridStep(
  numberType: NumberType,
  granularity: Granularity,
  devicePxPerUnit: number,
): Rational {
  if (!Number.isFinite(devicePxPerUnit) || devicePxPerUnit <= 0) {
    throw new RangeError(`${devicePxPerUnit} device pixels per unit is not finite and positive`);
  }
  const pixels = fromFloat(devicePxPerUnit);
  const wide = (step: Rational) => step.multiply(pixels).compare(ONE) >= 0;
  if (numberType === "fraction") {
    const { denominator, refine } = granularity.fraction;
    let step = Rational.fromParts(1n, BigInt(denominator));
    if (!refine) return step;
    for (let finer = step.multiply(HALF); wide(finer); finer = finer.multiply(HALF)) step = finer;
    return step;
  }
  if (numberType === "float") {
    const base = decimalStep(granularity.float.step);
    if (!granularity.float.refine) return base;
    let step = base;
    for (const multiplier of multipliers()) {
      const finer = base.divide(multiplier);
      if (!wide(finer)) return step;
      step = finer;
    }
    return step;
  }
  const base = Rational.of(granularity.int.step);
  if (!granularity.int.refine) return base;
  let step = base;
  for (const multiplier of multipliers()) {
    step = base.multiply(multiplier);
    if (wide(step)) return step;
  }
  return step;
}

/**
 * The grid point for a pointer `unitsFromStart` units from the line's
 * start: `n·step` for the integer `n` nearest to `unitsFromStart / step`
 * (ties upward), clamped to `[0, length]`; a float length is read as its
 * exact value, `null` (an unknown length) clamps only below.
 */
export function snapPosition(
  unitsFromStart: number,
  step: Rational,
  length: Real | null,
): Rational {
  const count = fromFloat(unitsFromStart).divide(step).add(HALF).floor();
  const position = step.multiply(Rational.fromParts(count, 1n));
  if (position.numerator < 0n) return Rational.of(0);
  if (length === null) return position;
  const end = toRational(length);
  return position.compare(end) > 0 ? end : position;
}

/** The grid a position was picked on: its step, the axis's number type and unit, and the granularity that gave the step. */
export interface GridInUse {
  readonly step: Rational;
  readonly numberType: NumberType;
  readonly unit: TimeUnit;
  readonly granularity: Granularity;
}

/** A step as the grid text writes it: a fraction as `n/d`, a float's as its exact decimal, an int's digits. */
function stepText(step: Rational, numberType: NumberType): string {
  return numberType === "float" ? (exactDecimal(step) ?? step.toString()) : step.toString();
}

/**
 * The grid in use as text: the step with its unit's symbol, then the base
 * the granularity states for the number type and whether it refines, as
 * `grid 1/32 ♩ (fraction base 1, refining)`, `grid 0.005 s (float base 1,
 * refining)`, `grid 200 smp (int base 1, refining)`.
 */
export function gridText(grid: GridInUse): string {
  const { step, numberType, unit, granularity } = grid;
  const base =
    numberType === "fraction"
      ? Rational.fromParts(1n, BigInt(granularity.fraction.denominator)).toString()
      : numberType === "float"
        ? granularity.float.step
        : String(granularity.int.step);
  const refine = granularity[numberType].refine ? "refining" : "fixed";
  return `grid ${stepText(step, numberType)} ${unitSymbol(unit)} (${numberType} base ${base}, ${refine})`;
}
