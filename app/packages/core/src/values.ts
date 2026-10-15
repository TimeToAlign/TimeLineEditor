/**
 * Readers of the values a workspace holds and a command carries: each returns
 * the value as stored, or a problem at the given path.
 */

import { JsonFloat, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import type { Problem } from "./errors.ts";
import { ErrorCode, isCommandError, problem } from "./errors.ts";
import type { Json, JsonObject, PathSegment } from "./json.ts";
import { isJsonObject, showJson } from "./json.ts";
import { schemaProblems } from "./manifest/io.ts";
import { jsonInteger } from "./number/coordinate.ts";
import type { BlockPlacement } from "./workspace/blocks.ts";
import { BAND_GROUPS } from "./workspace/blocks.ts";
import { isIndex } from "./workspace/order.ts";

function invalid(message: string, path: readonly PathSegment[]): Problem {
  return problem(ErrorCode.invalidValue, message, path);
}

/**
 * A value as the JSON `parse` would read: plain objects and arrays, strings,
 * booleans, null and `JsonNumber`s. A non-finite number is
 * `non_finite_number`; anything else without a JSON form is `invalid_value`.
 */
export function toJson(value: unknown, path: readonly PathSegment[]): Json | Problem {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "bigint") return jsonInteger(value);
  if (value instanceof JsonFloat) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return problem(ErrorCode.nonFiniteNumber, `${value} is not a finite number`, path);
    }
    if (Object.is(value, -0)) return new JsonFloat(-0);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      return invalid(`${value} is beyond 2^53; pass an integer as a bigint`, path);
    }
    return value;
  }
  if (Array.isArray(value)) {
    const items: Json[] = [];
    for (const [index, item] of value.entries()) {
      const converted = toJson(item, [...path, index]);
      if (isCommandError(converted)) return converted;
      items.push(converted);
    }
    return items;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalid("expected a plain JSON object", path);
    }
    const entries: [string, Json][] = [];
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      const converted = toJson(item, [...path, key]);
      if (isCommandError(converted)) return converted;
      entries.push([key, converted]);
    }
    return Object.fromEntries(entries);
  }
  return invalid(`${typeof value} is not a JSON value`, path);
}

/** A JSON object. */
export function readObject(value: unknown, path: readonly PathSegment[]): JsonObject | Problem {
  const converted = toJson(value, path);
  if (isCommandError(converted)) return converted;
  return isJsonObject(converted) ? converted : invalid("expected an object", path);
}

/** The first member of `value` that `allowed` does not list, as an `unknown_member` problem. */
export function unknownMember(
  value: JsonObject,
  allowed: readonly string[],
  path: readonly PathSegment[],
  code: ErrorCode = ErrorCode.unknownMember,
): Problem | undefined {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  return extra === undefined
    ? undefined
    : problem(code, `unknown member ${extra}`, [...path, extra]);
}

export function readString(value: unknown, path: readonly PathSegment[]): string | Problem {
  return typeof value === "string" ? value : invalid("expected a string", path);
}

export function readNullableString(
  value: unknown,
  path: readonly PathSegment[],
): string | null | Problem {
  return value === null ? null : readString(value, path);
}

export function readBoolean(value: unknown, path: readonly PathSegment[]): boolean | Problem {
  return typeof value === "boolean" ? value : invalid("expected a boolean", path);
}

/** A canvas number: a finite double (an integral float read as `JsonFloat` becomes its double). */
export function readFinite(value: unknown, path: readonly PathSegment[]): number | Problem {
  const number = value instanceof JsonFloat ? value.value : value;
  if (typeof number !== "number") return invalid("expected a number", path);
  if (!Number.isFinite(number)) {
    return problem(ErrorCode.nonFiniteNumber, "a canvas number must be finite", path);
  }
  return number;
}

export function readPositive(value: unknown, path: readonly PathSegment[]): number | Problem {
  const read = readFinite(value, path);
  if (isCommandError(read)) return read;
  return read > 0
    ? read
    : problem(ErrorCode.nonPositiveNumber, "the number must be positive", path);
}

export function readNullablePositive(
  value: unknown,
  path: readonly PathSegment[],
): number | null | Problem {
  return value === null ? null : readPositive(value, path);
}

/** Whether a value is a permutation of the three band groups. */
export function isBandOrder(value: unknown): value is BlockPlacement["order"] {
  return (
    Array.isArray(value) &&
    value.length === BAND_GROUPS.length &&
    BAND_GROUPS.every((group) => value.includes(group))
  );
}

export function readOrder(
  value: unknown,
  path: readonly PathSegment[],
): BlockPlacement["order"] | Problem {
  return isBandOrder(value)
    ? ([...value] as unknown as BlockPlacement["order"])
    : problem(ErrorCode.invalidOrder, "order must hold children, regions and flow once each", path);
}

export function readIndex(value: unknown, path: readonly PathSegment[]): string | Problem {
  return typeof value === "string" && isIndex(value)
    ? value
    : problem(ErrorCode.invalidIndex, `invalid fractional index ${showJson(value)}`, path);
}

/** A manifest of the current schema version holding nothing, to validate a `graphical` block inside. */
function host(graphical: Json): Json {
  return { timeskeleton: SCHEMA_VERSION, timelines: [], graphical };
}

/**
 * The first schema problem of `value` placed at `at` inside a host manifest,
 * reported at `path` followed by its location inside `value`.
 */
function fragmentProblem(
  container: Json,
  at: readonly PathSegment[],
  path: readonly PathSegment[],
): Problem | undefined {
  const [found] = schemaProblems(container);
  if (found === undefined) return undefined;
  const inside = at.every((segment, index) => found.path[index] === segment);
  return { ...found, path: [...path, ...(inside ? found.path.slice(at.length) : [])] };
}

/** A `graphical` block, as a manifest's or the workspace settings'. */
export function readGraphical(value: unknown, path: readonly PathSegment[]): JsonObject | Problem {
  const read = readObject(value, path);
  if (isCommandError(read)) return read;
  return fragmentProblem(host(read), ["graphical"], path) ?? read;
}

/** A selector and a declaration, checked as one statement of a `graphical` block. */
export function statementProblem(
  select: Json,
  set: Json,
  path: readonly PathSegment[],
): Problem | undefined {
  return fragmentProblem(
    host({ statements: [{ select, set }] }),
    ["graphical", "statements", 0],
    path,
  );
}
