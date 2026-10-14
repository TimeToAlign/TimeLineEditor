/**
 * TOML has no null. The inspector's rule, read from the manifest's schema:
 *
 * - A member the schema **requires** and whose value **may be null** is
 *   left out of the TOML text when it is null, and put back as null when
 *   the text is read. In schema 0.7.0 these are `name`, `measure_map` and
 *   `metric_hierarchy` of every timeline; `name`, `source_unit` and
 *   `target_unit` of every conversion map; `name` of a region and of a
 *   marker; `name` and `label` of a break; `target` and `label` of a jump;
 *   `name` of a group and of a bundle.
 * - Any other null cannot be shown: an optional member that may be null (a
 *   measure-map row's `nominal_length`, where absent and null mean different
 *   things) or a null array item. Such a manifest is refused for TOML, with
 *   the null's path.
 * - A required member that may not be null and is missing stays missing;
 *   the schema check then refuses the manifest at that member.
 *
 * Which schema object governs a JSON object is found by walking the schema
 * of the value's file kind along the value: `$ref`s are followed, into the
 * version's other documents too, a discriminated `oneOf` contributes
 * the branch whose tag matches, any other `oneOf` or `anyOf` every branch the
 * value's JSON type admits; `if`/`then`/`else` only narrow and are skipped.
 */

import type { Json, PathSegment } from "@timetoalign/tilie-core";
import {
  declaredVersion,
  fileKind,
  isJsonFloat,
  isJsonObject,
  SCHEMA_VERSION,
  schemaDocuments,
} from "@timetoalign/timeskeleton";
import { InspectorCode, ProblemError } from "./problems.ts";

/** A JSON Schema object, read loosely. */
type Schema = { readonly [keyword: string]: unknown };

type JsonObject = { readonly [key: string]: Json };

/**
 * A schema object and the document it lies in: its `$ref`s are resolved
 * against that document's `$id`, so a relative reference may name another
 * document of the same version (`core.schema.json#/$defs/Id`).
 */
export interface Located {
  readonly document: Schema;
  readonly schema: Schema;
}

/** The documents of one schema version, by `$id`. */
export type Documents = ReadonlyMap<string, Schema>;

/** Every version's documents by name: `timeline`, and from 0.7.0 on `core`, `group` and `bundle`. */
const VERSIONS = schemaDocuments as unknown as {
  readonly [version: string]: { readonly [name: string]: Schema };
};

/** The documents of one schema version (the latest for an unknown one), by `$id`. */
export function documentsOf(version: string): Documents {
  const named = VERSIONS[version] ?? (VERSIONS[SCHEMA_VERSION] as Record<string, Schema>);
  return new Map(Object.values(named).map((document) => [String(document.$id), document]));
}

/**
 * The documents of the version `value` declares (else of the latest version)
 * and the document of its file kind (`timeline`, `group` or `bundle`; a
 * value of no single kind is read as a timeline file).
 */
export function schemaFor(value: unknown): { documents: Documents; root: Located } {
  const declared = declaredVersion(value);
  const version =
    declared !== null && Object.hasOwn(VERSIONS, declared) ? declared : SCHEMA_VERSION;
  const named = VERSIONS[version] as Record<string, Schema>;
  const document = (named[fileKind(value) ?? "timeline"] ?? named.timeline) as Schema;
  return { documents: documentsOf(version), root: { document, schema: document } };
}

function asSchema(value: unknown): Schema | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Schema)
    : null;
}

/** A schema object of the same document as `at`. */
function within(at: Located, schema: Schema): Located {
  return { document: at.document, schema };
}

/**
 * `node` with its `$ref` followed, repeatedly: the reference is resolved
 * against its document's `$id`, the document found among `documents`, and
 * the fragment read as a JSON pointer into it.
 */
function resolve(documents: Documents, node: Located): Located {
  let current = node;
  while (typeof current.schema.$ref === "string") {
    const reference = current.schema.$ref;
    const url = new URL(reference, String(current.document.$id));
    const pointer = decodeURIComponent(url.hash.slice(1));
    url.hash = "";
    const document = documents.get(url.href);
    if (document === undefined || (pointer !== "" && !pointer.startsWith("/"))) {
      throw new RangeError(`unsupported $ref ${reference}`);
    }
    let target: unknown = document;
    for (const part of pointer === "" ? [] : pointer.slice(1).split("/")) {
      target = asSchema(target)?.[part.replaceAll("~1", "/").replaceAll("~0", "~")];
    }
    const next = asSchema(target);
    if (next === null) throw new RangeError(`unresolved $ref ${reference}`);
    current = { document, schema: next };
  }
  return current;
}

function branches(node: Located, keyword: "oneOf" | "anyOf"): Located[] {
  const list = node.schema[keyword];
  return Array.isArray(list)
    ? list
        .map(asSchema)
        .filter((item) => item !== null)
        .map((item) => within(node, item))
    : [];
}

/** Whether a schema admits `null`. */
export function admitsNull(documents: Documents, node: Located): boolean {
  const resolved = resolve(documents, node);
  const type = resolved.schema.type;
  if (type === "null" || (Array.isArray(type) && type.includes("null"))) return true;
  if (resolved.schema.const === null) return true;
  return [...branches(resolved, "oneOf"), ...branches(resolved, "anyOf")].some((branch) =>
    admitsNull(documents, branch),
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
function applicable(documents: Documents, node: Located, value: Json): Located[] {
  const resolved = resolve(documents, node);
  if (!typeAdmits(resolved.schema, value)) return [];
  const found = [resolved];
  const discriminator = asSchema(resolved.schema.discriminator);
  const tag = discriminator?.propertyName;
  for (const keyword of ["oneOf", "anyOf"] as const) {
    for (const branch of branches(resolved, keyword)) {
      if (typeof tag === "string" && keyword === "oneOf") {
        const candidate = resolve(documents, branch).schema;
        const tagSchema = asSchema(asSchema(candidate.properties)?.[tag]);
        const own = isJsonObject(value) ? (value as JsonObject)[tag] : undefined;
        if (tagSchema?.const !== own) continue;
      }
      found.push(...applicable(documents, branch, value));
    }
  }
  return found;
}

/** The members of a schema object that are required and may be null, sorted. */
export function nullableRequired(documents: Documents, node: Located): string[] {
  const resolved = resolve(documents, node);
  const properties = asSchema(resolved.schema.properties) ?? {};
  const required = Array.isArray(resolved.schema.required)
    ? (resolved.schema.required as string[])
    : [];
  return required
    .filter((name) => {
      const member = asSchema(properties[name]);
      return member !== null && admitsNull(documents, within(resolved, member));
    })
    .sort();
}

/** The schemas of member `key` (or of item `index`) under the applicable `nodes`. */
function memberSchemas(nodes: readonly Located[], key: string | number): Located[] {
  const found: Located[] = [];
  for (const node of nodes) {
    const { schema } = node;
    if (typeof key === "string") {
      const property = asSchema(asSchema(schema.properties)?.[key]);
      const additional = asSchema(schema.additionalProperties);
      if (property !== null) found.push(within(node, property));
      else if (additional !== null) found.push(within(node, additional));
    } else {
      const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
      const item = asSchema(key < prefix.length ? prefix[key] : schema.items);
      if (item !== null) found.push(within(node, item));
    }
  }
  return found;
}

/**
 * Rewrite `value` along the schema: at each object, `object(nodes, value)`
 * gives the object's own members, whose values are then rewritten in turn.
 */
function rewrite(
  documents: Documents,
  nodes: readonly Located[],
  value: Json,
  object: (nodes: readonly Located[], value: JsonObject) => JsonObject,
): Json {
  const here = nodes.flatMap((node) => applicable(documents, node, value));
  if (Array.isArray(value)) {
    return value.map((item, index) => rewrite(documents, memberSchemas(here, index), item, object));
  }
  if (!isJsonObject(value)) return value;
  const own = object(here, value as JsonObject);
  return Object.fromEntries(
    Object.entries(own).map(([key, item]) => [
      key,
      rewrite(documents, memberSchemas(here, key), item, object),
    ]),
  );
}

/** The members of `value` that may be omitted when null, by the applicable schemas. */
function omissible(documents: Documents, nodes: readonly Located[]): Set<string> {
  return new Set(nodes.flatMap((node) => nullableRequired(documents, node)));
}

/**
 * The manifest as TOML can hold it: every null member the schema requires
 * and admits as null left out.
 *
 * @throws {ProblemError} `not_representable` at the first other null.
 */
export function omitNulls(value: Json): Json {
  const { documents, root } = schemaFor(value);
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
  const omitted = rewrite(documents, [root], value, (nodes, object) => {
    const allowed = omissible(documents, nodes);
    return Object.fromEntries(
      Object.entries(object).filter(([key, item]) => !(item === null && allowed.has(key))),
    );
  });
  check(omitted, []);
  return omitted;
}

/** The manifest read from TOML: every missing member the schema requires and admits as null set to null. */
export function restoreNulls(value: Json): Json {
  const { documents, root } = schemaFor(value);
  return rewrite(documents, [root], value, (nodes, object) => {
    const missing = [...omissible(documents, nodes)].filter((key) => !Object.hasOwn(object, key));
    return { ...object, ...Object.fromEntries(missing.map((key) => [key, null])) };
  });
}
