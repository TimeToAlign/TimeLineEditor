/**
 * TOML has no null. The inspector's rule, read from the manifest's schema:
 *
 * - A member the schema **requires** and whose value **may be null** is
 *   left out of the TOML text when it is null, and put back as null when
 *   the text is read. In schema 0.6.0 these are `name`, `measure_map` and
 *   `metric_hierarchy` of every timeline; `name`, `source_unit` and
 *   `target_unit` of every conversion map; `name` of a region and of a
 *   marker; `name` and `label` of a break; `target` and `label` of a jump.
 * - Any other null cannot be shown: an optional member that may be null (a
 *   measure-map row's `nominal_length`, where absent and null mean different
 *   things) or a null array item. Such a manifest is refused for TOML, with
 *   the null's path.
 * - A required member that may not be null and is missing stays missing;
 *   the schema check then refuses the manifest at that member.
 *
 * Which schema object governs a JSON object is found by walking the schema
 * along the value: `$ref`s are followed, a discriminated `oneOf` contributes
 * the branch whose tag matches, any other `oneOf` or `anyOf` every branch the
 * value's JSON type admits; `if`/`then`/`else` only narrow and are skipped.
 */

import type { Json, PathSegment } from "@timetoalign/tilie-core";
import {
  declaredVersion,
  isJsonFloat,
  isJsonObject,
  SCHEMA_VERSION,
  schemas,
} from "@timetoalign/timeskeleton";
import { InspectorCode, ProblemError } from "./problems.ts";

/** A JSON Schema object, read loosely. */
type Schema = { readonly [keyword: string]: unknown };

type JsonObject = { readonly [key: string]: Json };

/** The schema of the version `value` declares, else of the latest version. */
export function schemaFor(value: unknown): Schema {
  const version = declaredVersion(value);
  const all = schemas as { readonly [version: string]: Schema };
  return all[version ?? SCHEMA_VERSION] ?? (all[SCHEMA_VERSION] as Schema);
}

function asSchema(value: unknown): Schema | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Schema)
    : null;
}

/** `node` with its `$ref` (a local `#/…` pointer) followed, repeatedly. */
function resolve(root: Schema, node: Schema): Schema {
  let current = node;
  while (typeof current.$ref === "string") {
    const pointer = current.$ref;
    if (!pointer.startsWith("#/")) throw new RangeError(`unsupported $ref ${pointer}`);
    let target: unknown = root;
    for (const part of pointer.slice(2).split("/")) {
      target = asSchema(target)?.[part.replaceAll("~1", "/").replaceAll("~0", "~")];
    }
    const next = asSchema(target);
    if (next === null) throw new RangeError(`unresolved $ref ${pointer}`);
    current = next;
  }
  return current;
}

function branches(node: Schema, keyword: "oneOf" | "anyOf"): Schema[] {
  const list = node[keyword];
  return Array.isArray(list) ? list.map(asSchema).filter((item) => item !== null) : [];
}

/** Whether a schema admits `null`. */
export function admitsNull(root: Schema, node: Schema): boolean {
  const resolved = resolve(root, node);
  const type = resolved.type;
  if (type === "null" || (Array.isArray(type) && type.includes("null"))) return true;
  if (resolved.const === null) return true;
  return [...branches(resolved, "oneOf"), ...branches(resolved, "anyOf")].some((branch) =>
    admitsNull(root, branch),
  );
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
function applicable(root: Schema, node: Schema, value: Json): Schema[] {
  const resolved = resolve(root, node);
  if (!typeAdmits(resolved, value)) return [];
  const found = [resolved];
  const discriminator = asSchema(resolved.discriminator);
  const tag = discriminator?.propertyName;
  for (const keyword of ["oneOf", "anyOf"] as const) {
    for (const branch of branches(resolved, keyword)) {
      if (typeof tag === "string" && keyword === "oneOf") {
        const candidate = resolve(root, branch);
        const tagSchema = asSchema(asSchema(candidate.properties)?.[tag]);
        const own = isJsonObject(value) ? (value as JsonObject)[tag] : undefined;
        if (tagSchema?.const !== own) continue;
      }
      found.push(...applicable(root, branch, value));
    }
  }
  return found;
}

/** The members of a schema object that are required and may be null, sorted. */
export function nullableRequired(root: Schema, node: Schema): string[] {
  const resolved = resolve(root, node);
  const properties = asSchema(resolved.properties) ?? {};
  const required = Array.isArray(resolved.required) ? (resolved.required as string[]) : [];
  return required
    .filter((name) => {
      const member = asSchema(properties[name]);
      return member !== null && admitsNull(root, member);
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
 * Rewrite `value` along the schema: at each object, `object(nodes, value,
 * path)` gives the object's own members (its children are then rewritten);
 * a null that `object` keeps is passed to `onNull`.
 */
function rewrite(
  root: Schema,
  nodes: readonly Schema[],
  value: Json,
  path: readonly PathSegment[],
  object: (nodes: readonly Schema[], value: JsonObject) => JsonObject,
): Json {
  const here = nodes.flatMap((node) => applicable(root, node, value));
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      rewrite(root, memberSchemas(here, index), item, [...path, index], object),
    );
  }
  if (!isJsonObject(value)) return value;
  const own = object(here, value as JsonObject);
  return Object.fromEntries(
    Object.entries(own).map(([key, item]) => [
      key,
      rewrite(root, memberSchemas(here, key), item, [...path, key], object),
    ]),
  );
}

/** The members of `value` that may be omitted when null, by the applicable schemas. */
function omissible(root: Schema, nodes: readonly Schema[]): Set<string> {
  return new Set(nodes.flatMap((node) => nullableRequired(root, node)));
}

/**
 * The manifest as TOML can hold it: every null member the schema requires
 * and admits as null left out.
 *
 * @throws {ProblemError} `not_representable` at the first other null.
 */
export function omitNulls(value: Json): Json {
  const root = schemaFor(value);
  const check = (item: Json, path: readonly PathSegment[]): void => {
    if (item === null) {
      throw new ProblemError({
        code: InspectorCode.notRepresentable,
        message: "TOML has no null, and the schema does not require this member",
        path,
      });
    }
    if (Array.isArray(item)) {
      for (const [index, entry] of item.entries()) check(entry, [...path, index]);
    } else if (isJsonObject(item)) {
      for (const [key, entry] of Object.entries(item as JsonObject)) check(entry, [...path, key]);
    }
  };
  const omitted = rewrite(root, [root], value, [], (nodes, object) => {
    const allowed = omissible(root, nodes);
    return Object.fromEntries(
      Object.entries(object).filter(([key, item]) => !(item === null && allowed.has(key))),
    );
  });
  check(omitted, []);
  return omitted;
}

/** The manifest read from TOML: every missing member the schema requires and admits as null set to null. */
export function restoreNulls(value: Json): Json {
  const root = schemaFor(value);
  return rewrite(root, [root], value, [], (nodes, object) => {
    const missing = [...omissible(root, nodes)].filter((key) => !Object.hasOwn(object, key));
    return { ...object, ...Object.fromEntries(missing.map((key) => [key, null])) };
  });
}
