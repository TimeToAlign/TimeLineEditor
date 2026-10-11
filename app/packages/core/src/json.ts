/**
 * JSON values as `@timetoalign/timeskeleton`'s `parse` returns them.
 *
 * Every number is a `JsonNumber`: a plain `number` for a safe integer or a
 * float with a fractional part, a `bigint` for an integer beyond the safe
 * range, a `JsonFloat` for an integral float (`2.0`). Reading and writing
 * text, and the canonical order, belong to that package; `core` writes no
 * JSON of its own.
 */

import type { JsonNumber } from "@timetoalign/timeskeleton";
import { canonicalJson, isJsonObject as isObject } from "@timetoalign/timeskeleton";

/** One step of a path into a JSON value: an object key or an array index. */
export type PathSegment = string | number;

export type Json = null | boolean | string | JsonNumber | JsonArray | JsonObject;
export type JsonArray = readonly Json[];
export type JsonObject = { readonly [key: string]: Json };

/** Whether `value` is a JSON object: not an array, not a `JsonFloat`. */
export function isJsonObject(value: unknown): value is JsonObject {
  return isObject(value);
}

/** The canonical JSON text of a value (keys sorted by code point, no whitespace). */
export function canonicalText(value: unknown): string {
  return canonicalJson(value as never);
}

/** A short text of any value for a message: its canonical JSON when it has one. */
export function showJson(value: unknown): string {
  try {
    return canonicalText(value);
  } catch {
    return String(value);
  }
}

/**
 * Whether two JSON values are equal: same members, same numbers of the same
 * kind (an integer never equals a float), whatever the order of keys.
 */
export function jsonEqual(left: unknown, right: unknown): boolean {
  return left === right || canonicalText(left) === canonicalText(right);
}

/** `-1`, `0` or `1` by Unicode code points, not by UTF-16 units as JavaScript's `<` compares. */
export function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0) as number);
  const b = Array.from(right, (character) => character.codePointAt(0) as number);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index] as number) - (b[index] as number);
    if (difference !== 0) return Math.sign(difference);
  }
  return Math.sign(a.length - b.length);
}
