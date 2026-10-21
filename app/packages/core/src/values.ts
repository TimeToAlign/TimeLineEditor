/**
 * Readers of the values a workspace holds and a command carries: each returns
 * the value as stored, or a problem at the given path.
 */

import type { Declaration, Selector } from "@timetoalign/timetoshare";
import { JsonFloat, SCHEMA_VERSION } from "@timetoalign/timetoshare";
import type { Problem } from "./errors.ts";
import { ErrorCode, isCommandError, problem } from "./errors.ts";
import type { Json, JsonObject, PathSegment } from "./json.ts";
import { isJsonObject, showJson } from "./json.ts";
import type { CardPlace, ItemPlace, Place, Places } from "./manifest/containers.ts";
import { ITEM_PLACE_MEMBERS } from "./manifest/containers.ts";
import { plainDeclaration, plainGraphical, plainSelector, schemaChecked } from "./manifest/io.ts";
import type { ManifestGraphical } from "./manifest/types.ts";
import { jsonInteger } from "./number/coordinate.ts";
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

/** A string holding at least one character: the workspace's name. */
export function readName(value: unknown, path: readonly PathSegment[]): string | Problem {
  return typeof value === "string" && value !== ""
    ? value
    : invalid("a name is a non-empty string", path);
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

/** A gap in canvas units, a container's spacing: a finite number at least 0. */
export function readNonNegative(value: unknown, path: readonly PathSegment[]): number | Problem {
  const read = readFinite(value, path);
  if (isCommandError(read)) return read;
  return read >= 0 ? read : invalid("the number must not be negative", path);
}

export function readNullablePositive(
  value: unknown,
  path: readonly PathSegment[],
): number | null | Problem {
  return value === null ? null : readPositive(value, path);
}

/**
 * The rule of each member of a place: a position is finite, a size and the
 * scale positive, the spacing, a gap, finite and at least 0.
 */
export const PLACE_READERS = {
  x: readFinite,
  y: readFinite,
  length: readPositive,
  scale: readPositive,
  spacing: readNonNegative,
  width: readPositive,
  height: readPositive,
} as const satisfies { readonly [member in keyof ItemPlace]-?: unknown };

/**
 * A place: an object of only the members an item's place may state, each
 * by its rule, and with `cards` also `cards`; at least one member.
 */
function readPlace(value: unknown, path: readonly PathSegment[], cards: boolean): Place | Problem {
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const allowed = cards ? [...ITEM_PLACE_MEMBERS, "cards"] : ITEM_PLACE_MEMBERS;
  const extra = unknownMember(object, allowed, path);
  if (extra !== undefined) return extra;
  const place: { -readonly [M in keyof Place]: Place[M] } = {};
  for (const member of ITEM_PLACE_MEMBERS) {
    if (!Object.hasOwn(object, member)) continue;
    const read = PLACE_READERS[member](object[member], [...path, member]);
    if (isCommandError(read)) return read;
    place[member] = read;
  }
  if (cards && Object.hasOwn(object, "cards")) {
    const read = readCards(object.cards, [...path, "cards"]);
    if (isCommandError(read)) return read;
    place.cards = read;
  }
  return Object.keys(place).length > 0
    ? place
    : invalid("a place states at least one member", path);
}

/**
 * The `cards` of an item's place: an object of at least one card place by
 * member ID, each read as a place; which members a card takes is
 * `placeProblems`'s.
 */
function readCards(
  value: unknown,
  path: readonly PathSegment[],
): { readonly [member: string]: CardPlace } | Problem {
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const result: { [member: string]: CardPlace } = {};
  for (const [member, item] of Object.entries(object)) {
    const place = readPlace(item, [...path, member], false);
    if (isCommandError(place)) return place;
    result[member] = place;
  }
  return Object.keys(result).length > 0
    ? result
    : invalid("cards holds at least one card's place", path);
}

/**
 * A block's places: an object of places by item ID, keys any string, each
 * read as an item's place with its members' `cards`; which keys and members
 * a manifest's containers take is `placeProblems`'s.
 */
export function readPlaces(value: unknown, path: readonly PathSegment[]): Places | Problem {
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const result: { [key: string]: Place } = {};
  for (const [key, item] of Object.entries(object)) {
    const place = readPlace(item, [...path, key], true);
    if (isCommandError(place)) return place;
    result[key] = place;
  }
  return result;
}

export function readIndex(value: unknown, path: readonly PathSegment[]): string | Problem {
  return typeof value === "string" && isIndex(value)
    ? value
    : problem(ErrorCode.invalidIndex, `invalid fractional index ${showJson(value)}`, path);
}

/**
 * `found`, a schema problem of a host manifest holding a fragment at `at`,
 * reported at `path` followed by its location inside the fragment.
 */
function located(
  found: Problem,
  at: readonly PathSegment[],
  path: readonly PathSegment[],
): Problem {
  const inside = at.every((segment, index) => found.path[index] === segment);
  return { ...found, path: [...path, ...(inside ? found.path.slice(at.length) : [])] };
}

/** A `graphical` block, as a manifest's or the workspace settings'. */
export function readGraphical(
  value: unknown,
  path: readonly PathSegment[],
): ManifestGraphical | Problem {
  const read = readObject(value, path);
  if (isCommandError(read)) return read;
  const checked = schemaChecked({ timetoshare: SCHEMA_VERSION, timelines: [], graphical: read });
  if ("code" in checked) return located(checked, ["graphical"], path);
  const plain = plainGraphical(checked.graphical ?? {});
  return "code" in plain ? located(plain, ["graphical"], path) : plain;
}

/**
 * A selector and a declaration, checked as one statement of a `graphical`
 * block and read as the plain `Selector` and `Declaration` (its numbers
 * doubles), or the first problem at `path`.
 */
export function readStatement(
  select: Json,
  set: Json,
  path: readonly PathSegment[],
): { readonly select: Selector; readonly set: Declaration } | Problem {
  const graphical = { statements: [{ select, set }] };
  const checked = schemaChecked({ timetoshare: SCHEMA_VERSION, timelines: [], graphical });
  const at = ["graphical", "statements", 0] as const;
  if ("code" in checked) return located(checked, at, path);
  const [statement] = checked.graphical?.statements ?? [];
  if (statement === undefined || typeof statement.set === "string") {
    throw new Error("the schema checked one statement with a declaration");
  }
  const declaration = plainDeclaration(statement.set, [...at, "set"]);
  if ("code" in declaration) return located(declaration, at, path);
  return { select: plainSelector(statement.select), set: declaration };
}
