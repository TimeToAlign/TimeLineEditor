/**
 * Numbers between the lossless manifest value and the YAML and TOML
 * libraries.
 *
 * A manifest value holds every number as TimeToShare's `parseJson` reads
 * it: a plain integral `number` for a safe integer, a `bigint` beyond the
 * safe range, a `JsonFloat` for an integral float and a plain `number` for
 * any other float. Both libraries are run with every integer as a `bigint`,
 * so a library `bigint` is always an integer and a library `number` always a
 * float, and nothing is lost in either direction.
 */

import type { Json, PathSegment } from "@timetoalign/tilie-core";
import { isJsonFloat, JsonFloat } from "@timetoalign/timetoshare";
import { InspectorCode, ProblemError } from "./problems.ts";

/** A value as the libraries hold it: integers as `bigint`, floats as `number`. */
export type LibraryValue =
  | null
  | boolean
  | string
  | bigint
  | number
  | LibraryValue[]
  | { [key: string]: LibraryValue };

/**
 * The manifest value of a value read by a library: a `bigint` within the
 * safe range becomes a plain number, an integral float a `JsonFloat`; an
 * object of any plain prototype becomes a plain object.
 *
 * @throws {ProblemError} for a non-finite float, or a value without a JSON
 *   form (a TOML date), at its path.
 */
export function fromLibrary(value: unknown, path: readonly PathSegment[] = []): Json {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "bigint") {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ProblemError({
        code: InspectorCode.nonFiniteNumber,
        message: `${value} is not a finite number`,
        path,
      });
    }
    return Number.isInteger(value) ? new JsonFloat(value) : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => fromLibrary(item, [...path, index]));
  const prototype = typeof value === "object" ? Object.getPrototypeOf(value) : undefined;
  if (prototype === Object.prototype || prototype === null) {
    return Object.fromEntries(
      Object.entries(value as object).map(([key, item]) => [
        key,
        fromLibrary(item, [...path, key]),
      ]),
    );
  }
  throw new ProblemError({
    code: InspectorCode.invalidValue,
    message: `${String(value)} has no JSON form`,
    path,
  });
}

/** The value for a library: every integer a `bigint`, every float a `number`. */
export function toLibrary(value: Json): LibraryValue {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "bigint") return value;
  if (isJsonFloat(value)) return value.value;
  if (typeof value === "number") return Number.isInteger(value) ? BigInt(value) : value;
  if (Array.isArray(value)) return value.map(toLibrary);
  return Object.fromEntries(
    Object.entries(value as { readonly [key: string]: Json }).map(([key, item]) => [
      key,
      toLibrary(item),
    ]),
  );
}
