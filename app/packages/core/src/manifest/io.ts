/**
 * The schema boundary: the one path from a value read from text to a
 * `Manifest` (`normalizeManifest`), the one path from a command's map,
 * region, break, jump or marker to its typed form (`readEntry`), and the one
 * path back (`saveManifest`).
 */

import type {
  Declaration,
  Graphical,
  JsonNumber,
  Lossless,
  LosslessTimeSkeleton,
  Selector,
  Statement,
} from "@timetoalign/timeskeleton";
import {
  canonicalOrder,
  complete,
  completeManifest,
  completeStyles,
  dumps,
  isJsonFloat,
  minimal,
  parseJson,
  SCHEMA_VERSION,
  SchemaValidationError,
  UnsupportedVersionError,
  validate,
} from "@timetoalign/timeskeleton";
import type { LoadError, Problem } from "../errors.ts";
import { ErrorCode, InvalidManifestError, isLoadError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import type { EntryKind, EntryTypes } from "./files.ts";
import { ENTRY_LISTS } from "./files.ts";
import { checkOrdered } from "./invariants.ts";
import { withSegmentsUnlocked } from "./locks.ts";
import type { Manifest, ManifestGraphical, TimelineManifest } from "./types.ts";

/** The problem a schema refusal is reported as. */
function schemaProblem(error: unknown): Problem {
  if (error instanceof SchemaValidationError) {
    return problem(ErrorCode.schemaViolation, error.detail, error.path);
  }
  if (error instanceof UnsupportedVersionError) {
    return problem(ErrorCode.schemaViolation, error.message, ["timeskeleton"]);
  }
  throw error;
}

/** `value` as the schema accepts it, or the schema's first problem. */
export function schemaChecked(value: unknown): LosslessTimeSkeleton | Problem {
  try {
    validate(value);
    return value;
  } catch (error) {
    return schemaProblem(error);
  }
}

/** The schema's first problem of `value`, as a list; empty when the schema accepts it. */
export function schemaProblems(value: unknown): Problem[] {
  const checked = schemaChecked(value);
  return "code" in checked ? [checked] : [];
}

function refuse(...problems: Problem[]): LoadError {
  return { problems };
}

/**
 * A number of a graphical declaration as the double the drawing computes
 * with: an integral float read as a `JsonFloat` its double, an integer beyond
 * 2^53 only when a double holds it exactly.
 */
function declarationNumber(value: JsonNumber, path: readonly PathSegment[]): number | Problem {
  if (isJsonFloat(value)) return value.value;
  if (typeof value === "number") return value;
  const double = Number(value);
  return BigInt(double) === value
    ? double
    : problem(ErrorCode.invalidValue, `${value} has no exact double`, path);
}

/**
 * A declaration with its numbers as doubles (`declarationNumber`), its other
 * members, unknown keys included, kept, every key where it was. The members
 * that are numbers are listed here; a numeric member the schema adds fails
 * to compile in `rest`.
 */
export function plainDeclaration(
  declaration: Lossless<Declaration>,
  path: readonly PathSegment[],
): Declaration | Problem {
  const {
    "stroke-width": strokeWidth,
    opacity,
    "font-size": fontSize,
    rx,
    "max-width": maxWidth,
    ...rest
  } = declaration;
  // The whole declaration in its key order, typed by its members that are no number:
  // each number is then written over in its place.
  const kept: typeof rest = declaration;
  const result: { -readonly [P in keyof Declaration]: Declaration[P] } = { ...kept };
  const numbers = [
    ["stroke-width", strokeWidth],
    ["opacity", opacity],
    ["font-size", fontSize],
    ["rx", rx],
    ["max-width", maxWidth],
  ] as const;
  for (const [member, value] of numbers) {
    if (value === undefined) continue;
    if (value === "none") {
      result["max-width"] = value;
      continue;
    }
    const double = declarationNumber(value, [...path, member]);
    if (typeof double !== "number") return double;
    result[member] = double;
  }
  return result;
}

/**
 * A selector read losslessly as the plain `Selector`: it holds no number,
 * only its non-empty `ids`, which the lossless type reads as a list, is
 * given its tuple again, in its place.
 */
export function plainSelector(select: Lossless<Selector>): Selector {
  const { ids, ...rest } = select;
  const kept: typeof rest = select;
  if (ids === undefined) return kept;
  const [first, ...more] = ids;
  if (first === undefined) throw new Error("the schema refuses an empty ids list");
  return { ...kept, ids: [first, ...more] };
}

/**
 * A graphical block read losslessly as the plain `Graphical` the drawing
 * reads: every declaration's numbers doubles (`plainDeclaration`), in the
 * named styles and in the statements; the order kept as it is, and every
 * key of every object where it was.
 */
export function plainGraphical(graphical: Lossless<Graphical>): ManifestGraphical | Problem {
  const { styles, statements, ...rest } = graphical;
  const kept: typeof rest = graphical;
  const result: { -readonly [P in keyof Graphical]: Graphical[P] } = { ...kept };
  if (styles !== undefined) {
    const plain: { [name: string]: Declaration } = {};
    for (const [name, declaration] of Object.entries(styles)) {
      const read = plainDeclaration(declaration, ["graphical", "styles", name]);
      if ("code" in read) return read;
      plain[name] = read;
    }
    result.styles = plain;
  }
  if (statements !== undefined) {
    const plain: Statement[] = [];
    for (const [index, statement] of statements.entries()) {
      const { select, set, ...others } = statement;
      const read =
        typeof set === "string"
          ? set
          : plainDeclaration(set, ["graphical", "statements", index, "set"]);
      if (typeof read !== "string" && "code" in read) return read;
      const kept: typeof others = statement;
      plain.push({ ...kept, select: plainSelector(select), set: read });
    }
    result.statements = plain;
  }
  return result;
}

/**
 * The complete form, in canonical order, of a value the schema accepts,
 * without its graphical block: the generated complete form, read as core's
 * read-only view of it.
 */
function completeTimed(
  value: Omit<LosslessTimeSkeleton, "graphical">,
): Omit<Manifest, "graphical"> {
  const { graphical: _, ...timed } = canonicalOrder(completeManifest(value));
  return timed;
}

/**
 * The complete form of a value the schema accepts, the step of
 * `normalizeManifest` after the schema check, for a value already checked
 * (`schemaChecked`): in canonical order, its segments unlocked (a segment's
 * own lock has no meaning: its segment line's governs it), every other lock
 * as the value states it, its graphical block made plain (`plainGraphical`)
 * and completed; or every invariant problem of it.
 */
export function completed(value: LosslessTimeSkeleton): Manifest | LoadError {
  const { graphical, ...timed } = value;
  const form = completeTimed(timed);
  const manifest: Manifest = {
    ...form,
    timelines: form.timelines.map((root) => withSegmentsUnlocked(root)),
  };
  const problems = checkOrdered(manifest);
  if (problems.length > 0) return refuse(...problems);
  if (graphical === undefined) return manifest;
  const plain = plainGraphical(graphical);
  if ("code" in plain) return refuse(plain);
  return { ...manifest, graphical: complete({ graphical: plain }).graphical };
}

/**
 * The schema problem of a manifest value, else every invariant problem of
 * its complete form; empty for a value `normalizeManifest` accepts.
 */
export function manifestProblems(value: unknown): Problem[] {
  const checked = schemaChecked(value);
  if ("code" in checked) return [checked];
  const result = completed(checked);
  return isLoadError(result) ? [...result.problems] : [];
}

/**
 * A manifest from a value read losslessly (`parseJson`), the one way a
 * value becomes a `Manifest`: the schema validates it, then it is put in its
 * complete form (every default written out, whether it was complete or
 * minimal or anything between), in canonical order, its segments unlocked,
 * its invariants checked, its graphical declarations' numbers made doubles,
 * and its missing styles completed. Every schema or invariant problem
 * refuses it, and so does a declaration's integer that no double holds.
 * Unknown keys are kept.
 */
export function normalizeManifest(value: unknown): Manifest | LoadError {
  const checked = schemaChecked(value);
  if ("code" in checked) return refuse(checked);
  const manifest = completed(checked);
  if (isLoadError(manifest) || manifest.graphical === undefined) return manifest;
  // completeStyles issues the one warning naming every missing style.
  return { ...manifest, graphical: completeStyles(manifest.graphical).graphical };
}

/** `object` with the member at `path` set to `value`, every object on the way copied. */
function withMemberAt(object: object, path: readonly string[], value: unknown): object {
  const [member, ...rest] = path;
  if (member === undefined) throw new Error("a member path names a member");
  const members: { readonly [key: string]: unknown } = { ...object };
  const inner = members[member];
  const held = typeof inner === "object" && inner !== null ? inner : {};
  return { ...members, [member]: rest.length === 0 ? value : withMemberAt(held, rest, value) };
}

/**
 * `value` in its complete form and canonical order, as a command's change
 * is checked; a value that cannot be ordered (an entry whose ordering member
 * is missing or of the wrong type) is refused with the schema's problem of
 * its complete form.
 */
export function completeOrdered<T>(value: T): T | Problem {
  const full = complete(value);
  try {
    return canonicalOrder(full);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const checked = schemaChecked(full);
    if ("code" in checked) return checked;
    throw error;
  }
}

/**
 * A map, region, break, jump or marker given to a command, read through the
 * schema boundary in `host`, the timeline that will list it at `index` of
 * its kind's list (the entry there replaced, or appended at the list's
 * length): `host` alone (its children left out) with the value in place is
 * completed, ordered and checked by the schema as `settle` checks a
 * manifest, and the value is returned in its complete form. A schema
 * problem is returned with its path from `host`, the caller placing it in
 * its manifest.
 */
export function readEntry<K extends EntryKind>(
  kind: K,
  value: JsonObject,
  host: TimelineManifest,
  index: number,
): EntryTypes[K] | Problem {
  const list = ENTRY_LISTS[kind];
  const items: unknown[] = [...list.get(host)];
  items[index] = value;
  // The probe holds the entry alone: without its children a segment line would fail the
  // segment rule (its segments end where it ends), so the probe is no segment line.
  const timeline = withMemberAt(
    { ...host, children: [], is_segment_line: false },
    list.path,
    items,
  );
  const ordered = completeOrdered({ timeskeleton: SCHEMA_VERSION, timelines: [timeline] });
  const checked = "code" in ordered ? ordered : schemaChecked(ordered);
  if ("code" in checked) {
    const [timelines, root, ...path] = checked.path;
    const inHost = timelines === "timelines" && root === 0;
    return { ...checked, path: inHost ? path : [...list.path, index] };
  }
  const { graphical: _, ...timed } = checked;
  const [read] = completeTimed(timed).timelines;
  // Canonical order may move the entry within its list; its id finds it.
  const entry = read === undefined ? undefined : list.get(read).find(({ id }) => id === value.id);
  if (entry === undefined) throw new Error(`the host lists the ${kind} ${String(value.id)}`);
  return entry;
}

/** A manifest from its text (`normalizeManifest`); text that is no JSON is `invalid_json`. */
export function loadManifest(text: string): Manifest | LoadError {
  let parsed: unknown;
  try {
    parsed = parseJson(text);
  } catch (error) {
    return refuse(problem(ErrorCode.invalidJson, error instanceof Error ? error.message : "", []));
  }
  return normalizeManifest(parsed);
}

export interface SaveOptions {
  /** Leave out every key whose value is its default; the complete form otherwise. */
  readonly minimal?: boolean;
}

/** A manifest's text: the complete form, or with `minimal` the minimal one. */
export function saveManifest(manifest: Manifest, options: SaveOptions = {}): string {
  const problems = manifestProblems(manifest);
  if (problems.length > 0) throw new InvalidManifestError(problems);
  return dumps(options.minimal === true ? minimal(manifest) : complete(manifest));
}
