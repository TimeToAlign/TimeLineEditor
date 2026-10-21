/**
 * Coordinates: a value on one axis, the axis being a unit and a number type.
 *
 * A value on its timeline's own axis is written bare (`readAxisValue`,
 * `toAxisValue`), following timetoalign's `number_to_json` /
 * `number_from_json`: an `int` value is a JSON
 * integer, a `float` value a JSON number, a `fraction` value a `[numerator,
 * denominator]` pair, and every integer is int64-bounded.
 */

import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import { JsonFloat } from "@timetoalign/timetoshare";
import type { PathSegment } from "../json.ts";
import { showJson } from "../json.ts";
import type { AxisValue } from "../manifest/types.ts";
import { Rational } from "./rational.ts";

/** A coordinate's value: `bigint` for `int`, `number` for `float`, `Rational` for `fraction`. */
export type CoordinateValue = bigint | number | Rational;

export interface Coordinate {
  readonly unit: TimeUnit;
  readonly numberType: NumberType;
  readonly value: CoordinateValue;
}

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;
const SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** A coordinate dict the library would refuse to read. `path` is relative to the dict. */
export class CoordinateError extends Error {
  readonly code = "invalid_coordinate";
  readonly path: readonly PathSegment[];

  constructor(message: string, path: readonly PathSegment[]) {
    super(message);
    this.name = "CoordinateError";
    this.path = path;
  }
}

/** Arithmetic or comparison across two axes. */
export class AxisMismatchError extends Error {
  readonly code = "axis_mismatch";

  constructor(left: Coordinate, right: Coordinate) {
    super(
      `coordinates on different axes: ${left.unit}/${left.numberType} and ${right.unit}/${right.numberType}`,
    );
    this.name = "AxisMismatchError";
  }
}

function int64(value: bigint, label: string, path: readonly PathSegment[]): bigint {
  if (value < INT64_MIN || value > INT64_MAX) {
    throw new CoordinateError(`${label} ${value} does not fit in int64`, path);
  }
  return value;
}

/** A JSON integer as `parse` reads it: a bigint, or an integral plain number. */
function integer(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value) && !Object.is(value, -0)) {
    return BigInt(value);
  }
  return undefined;
}

/** A JSON float as `parse` reads it: a `JsonFloat`, or a plain number that is no integer. */
function float(value: unknown): number | undefined {
  if (value instanceof JsonFloat) return value.value;
  if (typeof value === "number" && Number.isFinite(value) && integer(value) === undefined) {
    return value;
  }
  return undefined;
}

/**
 * Read a value under its axis's number type, as `number_from_json` does: an
 * `int` value reads a JSON integer, or an integral JSON number as that
 * integer; a `float` value reads a JSON number, or an integer as the float it
 * equals exactly; a `fraction` value reads only a pair of integers with a
 * positive denominator.
 *
 * @throws {CoordinateError} at `path`.
 */
export function readAxisValue(
  data: unknown,
  numberType: NumberType,
  path: readonly PathSegment[] = [],
): CoordinateValue {
  const shown = showJson(data);
  const asInteger = integer(data);
  const asFloat = float(data);
  let read: CoordinateValue;
  if (asInteger !== undefined) {
    read = int64(asInteger, "integer", path);
  } else if (asFloat !== undefined) {
    read = asFloat;
  } else if (Array.isArray(data)) {
    if (data.length !== 2) {
      throw new CoordinateError(`invalid JSON Fraction ${shown}: expected two items`, path);
    }
    const numerator = integer(data[0]);
    const denominator = integer(data[1]);
    if (numerator === undefined || denominator === undefined) {
      throw new CoordinateError(
        `invalid JSON Fraction ${shown}: components must be integers`,
        path,
      );
    }
    if (denominator <= 0n) {
      throw new CoordinateError(
        `invalid JSON Fraction ${shown}: denominator must be strictly positive`,
        path,
      );
    }
    read = Rational.fromParts(
      int64(numerator, "numerator", path),
      int64(denominator, "denominator", path),
    );
  } else {
    throw new CoordinateError(`invalid coordinate value ${shown}`, path);
  }
  if (numberType === "int") {
    if (typeof read === "bigint") return read;
    if (typeof read === "number" && Number.isInteger(read)) {
      return int64(BigInt(read), "integer", path);
    }
  } else if (numberType === "float") {
    if (typeof read === "number") return read;
    if (typeof read === "bigint" && BigInt(Number(read)) === read) return Number(read);
  } else if (read instanceof Rational) {
    return read;
  }
  throw new CoordinateError(
    `coordinate value ${shown} is not a ${numberType} representation`,
    path,
  );
}

/** An integer as `parse` represents it: a plain number when safe, a bigint beyond. */
export function jsonInteger(value: bigint): number | bigint {
  return value >= -SAFE && value <= SAFE ? Number(value) : value;
}

/** A float as `parse` represents it: a `JsonFloat` when integral, a plain number otherwise. */
export function jsonFloat(value: number): JsonFloat | number {
  return Number.isInteger(value) || Object.is(value, -0) ? new JsonFloat(value) : value;
}

/**
 * Read a bare value on an axis (`readAxisValue`) as a coordinate there.
 *
 * @throws {CoordinateError} at `path`.
 */
export function axisCoordinate(
  value: unknown,
  axis: { readonly unit: TimeUnit; readonly number_type: NumberType },
  path: readonly PathSegment[] = [],
): Coordinate {
  return {
    unit: axis.unit,
    numberType: axis.number_type,
    value: readAxisValue(value, axis.number_type, path),
  };
}

/** A coordinate's bare value as a manifest writes it on its own axis, numbers as `parse` reads them. */
export function toAxisValue(coordinate: Coordinate): AxisValue {
  const { value } = coordinate;
  return value instanceof Rational
    ? [jsonInteger(value.numerator), jsonInteger(value.denominator)]
    : typeof value === "bigint"
      ? jsonInteger(value)
      : jsonFloat(value);
}

/** Whether two coordinates share unit and number type. */
export function sameAxis(left: Coordinate, right: Coordinate): boolean {
  return left.unit === right.unit && left.numberType === right.numberType;
}

function checkAxis(left: Coordinate, right: Coordinate): void {
  if (!sameAxis(left, right)) throw new AxisMismatchError(left, right);
}

/** `-1`, `0` or `1`; both coordinates must be on one axis. */
export function compareCoordinates(left: Coordinate, right: Coordinate): -1 | 0 | 1 {
  checkAxis(left, right);
  const a = left.value;
  const b = right.value;
  if (a instanceof Rational) return a.compare(b as Rational);
  const other = b as typeof a;
  return a < other ? -1 : a > other ? 1 : 0;
}

export function coordinatesEqual(left: Coordinate, right: Coordinate): boolean {
  return compareCoordinates(left, right) === 0;
}

function combine(left: Coordinate, right: Coordinate, sign: 1 | -1): Coordinate {
  checkAxis(left, right);
  const a = left.value;
  const b = right.value;
  let value: CoordinateValue;
  if (a instanceof Rational) value = sign === 1 ? a.add(b as Rational) : a.subtract(b as Rational);
  else if (typeof a === "bigint") value = sign === 1 ? a + (b as bigint) : a - (b as bigint);
  else value = sign === 1 ? a + (b as number) : a - (b as number);
  return { unit: left.unit, numberType: left.numberType, value };
}

export function addCoordinates(left: Coordinate, right: Coordinate): Coordinate {
  return combine(left, right, 1);
}

export function subtractCoordinates(left: Coordinate, right: Coordinate): Coordinate {
  return combine(left, right, -1);
}
