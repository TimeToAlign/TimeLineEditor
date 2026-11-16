/**
 * A map's result written on its target axis, as timetoalign writes it.
 *
 * The target decides alone: a number landing on a unit is written in the
 * unit's number type (`express_as`), whatever kind of number the map's
 * arithmetic gave. An int axis rounds an inexact value half to even, a
 * fraction axis takes a float's exact binary value, a float axis the double
 * nearest to an exact value. A result without a target unit keeps its kind;
 * a string, a measure and named outputs are not numbers on an axis and pass
 * as they are (each output keeping its kind).
 */

import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import { numberTypeOf } from "@timetoalign/timetoshare";
import type { CoordinateValue } from "../number/coordinate.ts";
import { roundHalfEven } from "../number/rational.ts";
import { toRational } from "../number/real.ts";
import type { MapResult, MapValue, MeasureRecord } from "./values.ts";
import { floatOf, isMapValue, kindOf } from "./values.ts";

/** A number a map gives, in a number type; `unit` null where the map names no target unit. */
export interface ExpressedNumber {
  readonly unit: TimeUnit | null;
  readonly numberType: NumberType;
  readonly value: CoordinateValue;
}

/** Named outputs, each expressed. */
export interface ExpressedOutputs {
  readonly outputs: { readonly [name: string]: Expressed };
}

export type Expressed = ExpressedNumber | string | MeasureRecord | ExpressedOutputs;

/**
 * A value in a number type, as timetoalign's `express_as` writes it;
 * `undefined` where it raises (an infinite float onto an int or fraction
 * axis).
 */
export function expressAs(value: MapValue, numberType: NumberType): CoordinateValue | undefined {
  if (numberType === "float") return floatOf(value);
  if (typeof value === "number" && !Number.isFinite(value)) return undefined;
  const exact = toRational(value);
  if (numberType === "fraction") return exact;
  return exact.denominator === 1n
    ? exact.numerator
    : roundHalfEven(exact.numerator, exact.denominator);
}

/**
 * A map's result on its target unit (`null` for none); `undefined` where
 * timetoalign raises.
 */
export function express(result: MapResult, targetUnit: TimeUnit | null): Expressed | undefined {
  if (isMapValue(result)) {
    if (targetUnit === null) return { unit: null, numberType: kindOf(result), value: result };
    const numberType = numberTypeOf({ unit: targetUnit });
    const value = expressAs(result, numberType);
    return value === undefined ? undefined : { unit: targetUnit, numberType, value };
  }
  if (typeof result === "string" || "record" in result) return result;
  const outputs: { [name: string]: Expressed } = {};
  for (const [name, output] of Object.entries(result.outputs)) {
    const expressed = express(output, null);
    if (expressed === undefined) return undefined;
    outputs[name] = expressed;
  }
  return { outputs };
}
