/**
 * JSON values as `@timetoalign/timetoshare`'s `parse` returns them.
 *
 * Every number is a `JsonNumber`: a plain `number` for a safe integer or a
 * float with a fractional part, a `bigint` for an integer beyond the safe
 * range, a `JsonFloat` for an integral float (`2.0`). Reading and writing
 * text, and the canonical order, belong to that package; `core` writes no
 * JSON of its own.
 */

import type { JsonNumber } from "@timetoalign/timetoshare";
import { compactJson, isJsonObject as isObject } from "@timetoalign/timetoshare";

/** One step of a path into a JSON value: an object key or an array index. */
export type PathSegment = string | number;

export type Json = null | boolean | string | JsonNumber | JsonArray | JsonObject;
type JsonArray = readonly Json[];
export type JsonObject = { readonly [key: string]: Json };

/** Whether `value` is a JSON object: not an array, not a `JsonFloat`. */
export function isJsonObject(value: unknown): value is JsonObject {
  return isObject(value);
}

/**
 * The canonical text of a value, which equal values share: its compact JSON
 * (no whitespace, strings and numbers spelled as the schema package's
 * writers spell them, an integer and a float of equal value apart) with
 * every object's keys sorted by code point. The writer refuses, with a
 * `TypeError`, any value that is not JSON, whatever its declared type.
 */
export function canonicalText(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalText).join(",")}]`;
  if (!isObject(value)) return compactJson(value);
  const members = Object.keys(value)
    .sort(compareCodePoints)
    .map((key) => `${compactJson(key)}:${canonicalText(value[key])}`);
  return `{${members.join(",")}}`;
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
 * kind (an integer never equals a float), whatever the order of keys. An
 * absent value (`undefined`) equals only an absent value.
 */
export function jsonEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  return canonicalText(left) === canonicalText(right);
}

/**
 * `value` with what lies at `path` replaced by `replacement`, every object
 * and list on the way copied and the rest kept as it is; a member missing on
 * the way becomes an empty object. An index names an item of a list, or the
 * place after its last item.
 *
 * @throws {TypeError} if an index meets no list, or lies beyond its end.
 */
export function withValueAt(
  value: unknown,
  path: readonly PathSegment[],
  replacement: unknown,
): unknown {
  const [step, ...rest] = path;
  if (step === undefined) return replacement;
  if (typeof step === "number") {
    if (!Array.isArray(value) || step > value.length) {
      throw new TypeError(`no place ${step} in a list`);
    }
    const items: unknown[] = [...value];
    items[step] = withValueAt(items[step], rest, replacement);
    return items;
  }
  const members: { readonly [key: string]: unknown } =
    typeof value === "object" && value !== null ? { ...value } : {};
  return { ...members, [step]: withValueAt(members[step], rest, replacement) };
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
