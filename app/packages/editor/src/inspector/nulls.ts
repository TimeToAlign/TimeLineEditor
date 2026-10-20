/**
 * TOML has no null. The inspector's rule, read from the schema:
 *
 * - A member whose value **may be null** and that the schema either
 *   **requires** or gives the **default null** is left out of the TOML text
 *   when it is null, and put back as null when the text is read. A reader
 *   would supply the default null anyway; putting it back keeps the
 *   manifest in its complete form. In schema 0.7.0 these are `length`
 *   (required, may be null) and `name` of every timeline; `name`,
 *   `source_unit` and `target_unit` of every conversion map; `name` of a
 *   region; `name` and `label` of a flow-control element; `name` of a
 *   group, of a measure map and of the manifest.
 * - Any other null cannot be shown: an optional member without the default
 *   null that may be null (a measure-map row's `nominal_length`, where
 *   absent and null mean different things) or a null array item. Such a
 *   manifest is refused for TOML, with the null's path.
 * - A required member that may not be null and is missing stays missing;
 *   the schema check then refuses the manifest at that member.
 *
 * Which schema object governs a JSON object is found by walking the schema
 * along the value: `$ref`s are followed, a discriminated `oneOf` contributes
 * the branch whose tag matches, an `allOf` (a conversion map's shared base)
 * every branch, any other `oneOf` or `anyOf` every branch the value's JSON
 * type admits; `if`/`then`/`else` only narrow and are skipped.
 */

import type { Json, PathSegment } from "@timetoalign/tilie-core";
import { isJsonFloat, isJsonObject, schema } from "@timetoalign/timeskeleton";
import { InspectorCode, ProblemError } from "./problems.ts";

/** A JSON Schema object, read loosely. */
type Schema = { readonly [keyword: string]: unknown };

type JsonObject = { readonly [key: string]: Json };

/** The schema document of the current version, whose `$ref`s are all local. */
export const DOCUMENT: Schema = schema;

function asSchema(value: unknown): Schema | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Schema)
    : null;
}

/** `node` with its `$ref` followed, repeatedly, as a JSON pointer into the document. */
function resolve(node: Schema): Schema {
  let current = node;
  while (typeof current.$ref === "string") {
    const reference = current.$ref;
    const pointer = reference.startsWith("#") ? decodeURIComponent(reference.slice(1)) : null;
    if (pointer === null || (pointer !== "" && !pointer.startsWith("/"))) {
      throw new RangeError(`unsupported $ref ${reference}`);
    }
    let target: unknown = DOCUMENT;
    for (const part of pointer === "" ? [] : pointer.slice(1).split("/")) {
      target = asSchema(target)?.[part.replaceAll("~1", "/").replaceAll("~0", "~")];
    }
    const next = asSchema(target);
    if (next === null) throw new RangeError(`unresolved $ref ${reference}`);
    current = next;
  }
  return current;
}

function branches(node: Schema, keyword: "oneOf" | "anyOf" | "allOf"): Schema[] {
  const list = node[keyword];
  return Array.isArray(list) ? list.map(asSchema).filter((item) => item !== null) : [];
}

/** Whether a schema admits `null`. */
export function admitsNull(node: Schema): boolean {
  const resolved = resolve(node);
  const type = resolved.type;
  if (type === "null" || (Array.isArray(type) && type.includes("null"))) return true;
  if (resolved.const === null) return true;
  return [...branches(resolved, "oneOf"), ...branches(resolved, "anyOf")].some(admitsNull);
}

/** The JSON Schema type name of a value. */
function typeOf(value: Json): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return "array";
  if (isJsonObject(value)) return "object";
  if (isJsonFloat(value) || typeof value === "bigint") return "number";
  return Number.isInteger(value) ? "integer" : "number";
}

/** Whether a schema's own `type` (if any) admits `value`'s JSON type. */
function typeAdmits(node: Schema, value: Json): boolean {
  const type = node.type;
  if (type === undefined) return true;
  const types = Array.isArray(type) ? type : [type];
  const actual = typeOf(value);
  return types.includes(actual) || (actual === "integer" && types.includes("number"));
}

/** Every resolved schema object that applies to `value` at `node`. */
function applicable(node: Schema, value: Json): Schema[] {
  const resolved = resolve(node);
  if (!typeAdmits(resolved, value)) return [];
  const found = [resolved];
  const discriminator = asSchema(resolved.discriminator);
  const tag = discriminator?.propertyName;
  for (const keyword of ["oneOf", "anyOf", "allOf"] as const) {
    for (const branch of branches(resolved, keyword)) {
      if (typeof tag === "string" && keyword === "oneOf") {
        const tagSchema = asSchema(asSchema(resolve(branch).properties)?.[tag]);
        const own = isJsonObject(value) ? (value as JsonObject)[tag] : undefined;
        if (tagSchema?.const !== own) continue;
      }
      found.push(...applicable(branch, value));
    }
  }
  return found;
}

/**
 * The members of a schema object that may be null and are required or
 * default to null, by their own default or by that of the definition they
 * refer to, sorted: the members TOML leaves out when null.
 */
export function omissibleNulls(node: Schema): string[] {
  const resolved = resolve(node);
  const properties = asSchema(resolved.properties) ?? {};
  const required = Array.isArray(resolved.required) ? (resolved.required as string[]) : [];
  return Object.keys(properties)
    .filter((name) => {
      const member = asSchema(properties[name]);
      if (member === null || !admitsNull(member)) return false;
      // A member's own default wins over the one of the definition it refers to (`Name`).
      const stated = Object.hasOwn(member, "default") ? member : resolve(member);
      return (
        required.includes(name) || (Object.hasOwn(stated, "default") && stated.default === null)
      );
    })
    .sort();
}

/** The schemas of member `key` (or of item `index`) under the applicable `nodes`. */
function memberSchemas(nodes: readonly Schema[], key: string | number): Schema[] {
  const found: Schema[] = [];
  for (const node of nodes) {
    if (typeof key === "string") {
      const property = asSchema(asSchema(node.properties)?.[key]);
      const additional = asSchema(node.additionalProperties);
      if (property !== null) found.push(property);
      else if (additional !== null) found.push(additional);
    } else {
      const prefix = Array.isArray(node.prefixItems) ? node.prefixItems : [];
      const item = asSchema(key < prefix.length ? prefix[key] : node.items);
      if (item !== null) found.push(item);
    }
  }
  return found;
}

/**
 * Rewrite `value` along the schema: at each object, `object(nodes, value)`
 * gives the object's own members, whose values are then rewritten in turn.
 */
function rewrite(
  nodes: readonly Schema[],
  value: Json,
  object: (nodes: readonly Schema[], value: JsonObject) => JsonObject,
): Json {
  const here = nodes.flatMap((node) => applicable(node, value));
  if (Array.isArray(value)) {
    return value.map((item, index) => rewrite(memberSchemas(here, index), item, object));
  }
  if (!isJsonObject(value)) return value;
  const own = object(here, value as JsonObject);
  return Object.fromEntries(
    Object.entries(own).map(([key, item]) => [
      key,
      rewrite(memberSchemas(here, key), item, object),
    ]),
  );
}

/** The members of `value` that may be omitted when null, by the applicable schemas. */
function omissible(nodes: readonly Schema[]): Set<string> {
  return new Set(nodes.flatMap(omissibleNulls));
}

/**
 * The manifest as TOML can hold it: every null member the schema requires
 * or defaults to null, and admits as null, left out.
 *
 * @throws {ProblemError} `not_representable` at the first other null.
 */
export function omitNulls(value: Json): Json {
  const check = (item: Json, path: readonly PathSegment[]): void => {
    if (item === null) {
      throw new ProblemError({
        code: InspectorCode.notRepresentable,
        message:
          "TOML has no null, and the schema neither requires this member nor defaults it to null",
        path,
      });
    }
    if (Array.isArray(item)) {
      for (const [index, entry] of item.entries()) check(entry, [...path, index]);
    } else if (isJsonObject(item)) {
      for (const [key, entry] of Object.entries(item as JsonObject)) check(entry, [...path, key]);
    }
  };
  const omitted = rewrite([DOCUMENT], value, (nodes, object) => {
    const allowed = omissible(nodes);
    return Object.fromEntries(
      Object.entries(object).filter(([key, item]) => !(item === null && allowed.has(key))),
    );
  });
  check(omitted, []);
  return omitted;
}

/** The manifest read from TOML: every missing member `omitNulls` would leave out set to null. */
export function restoreNulls(value: Json): Json {
  return rewrite([DOCUMENT], value, (nodes, object) => {
    const missing = [...omissible(nodes)].filter((key) => !Object.hasOwn(object, key));
    return { ...object, ...Object.fromEntries(missing.map((key) => [key, null])) };
  });
}
