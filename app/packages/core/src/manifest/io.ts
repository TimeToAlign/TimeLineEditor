/**
 * The schema boundary: the one path from a value read from text to a
 * `Manifest` (`normalizeManifest`), the one path from a command's map,
 * region or flow-control element to its typed form (`readEntry`), and the
 * one path back (`saveManifest`).
 */

import type {
  CompleteManifest,
  Declaration,
  Graphical,
  JsonNumber,
  Lossless,
  LosslessManifest,
  Selector,
  Serialization,
  Statement,
} from "@timetoalign/timetoshare";
import {
  canonicalOrder,
  complete,
  completeManifest,
  completeStyles,
  dumps,
  isJsonFloat,
  isJsonObject,
  loads,
  minimal,
  SCHEMA_VERSION,
  SchemaValidationError,
  serializationOf,
  UnsupportedVersionError,
  validate,
  YamlSyntaxError,
} from "@timetoalign/timetoshare";
import type { LoadError, Problem } from "../errors.ts";
import {
  ErrorCode,
  InvalidManifestError,
  isCommandError,
  isLoadError,
  problem,
} from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import { withValueAt } from "../json.ts";
import type { Part } from "./address.ts";
import type { EntryKind, EntryTypes } from "./files.ts";
import { ENTRY_LISTS } from "./files.ts";
import { checkOrdered } from "./invariants.ts";
import { withSegmentsUnlocked } from "./locks.ts";
import type { Located } from "./tree.ts";
import { findTimeline } from "./tree.ts";
import type { Manifest, MeasureMap } from "./types.ts";

/** The problem a schema refusal is reported as. */
function schemaProblem(error: unknown): Problem {
  if (error instanceof SchemaValidationError) {
    return problem(ErrorCode.schemaViolation, error.detail, error.path);
  }
  if (error instanceof UnsupportedVersionError) {
    return problem(ErrorCode.schemaViolation, error.message, ["timetoshare"]);
  }
  throw error;
}

/** `value` as the schema accepts it, or the schema's first problem. */
export function schemaChecked(value: unknown): LosslessManifest | Problem {
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
 * only its non-empty `addresses` and each address's non-empty `part`, which
 * the lossless type reads as lists, are given their tuples again, in their
 * places.
 */
export function plainSelector(select: Lossless<Selector>): Selector {
  const { addresses, ...rest } = select;
  const kept: typeof rest = select;
  if (addresses === undefined) return kept;
  const plain = addresses.map((address) => {
    const { part, ...own } = address;
    if (part === undefined) return own;
    const [word, ...words] = part;
    if (word === undefined) throw new Error("the schema refuses an empty part");
    return { ...own, part: [word, ...words] satisfies [Part, ...Part[]] };
  });
  const [first, ...more] = plain;
  if (first === undefined) throw new Error("the schema refuses an empty addresses list");
  return { ...kept, addresses: [first, ...more] };
}

/** A graphical block without its named timestamps, which hold no declaration. */
export type Styling = Omit<Graphical, "timestamps">;

/**
 * The styling of a graphical block read losslessly, its declarations as the
 * drawing reads them: every declaration's numbers doubles
 * (`plainDeclaration`), in the named styles and in the statements; the
 * orders kept as they are, and every key of every object where it was. The
 * named timestamps, whose coordinates are own-axis values, are left to the
 * caller.
 */
export function plainGraphical(graphical: Lossless<Styling>): Styling | Problem {
  const { styles, statements, ...rest } = graphical;
  const kept: typeof rest = graphical;
  const result: { -readonly [P in keyof Styling]: Styling[P] } = { ...kept };
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
 * The complete form, in canonical order, of a value the schema accepts: the
 * generated complete form, every named timestamp's `display` stated in
 * canonical order among the rest.
 */
function completeForm(value: LosslessManifest): CompleteManifest {
  return canonicalOrder(completeManifest(value));
}

/**
 * The complete form of a value the schema accepts, the step of
 * `normalizeManifest` after the schema check, for a value already checked
 * (`schemaChecked`): completed and in canonical order, its segments
 * unlocked (a segment's own lock has no meaning: its segment line's governs
 * it), every other lock as the value states it, its graphical block's
 * declarations made plain (`plainGraphical`); or every invariant problem of
 * it.
 */
export function completed(value: LosslessManifest): Manifest | LoadError {
  const { graphical, ...form } = completeForm(value);
  const manifest: Manifest = {
    ...form,
    timelines: form.timelines.map((root) => withSegmentsUnlocked(root)),
  };
  const problems = checkOrdered(manifest);
  if (problems.length > 0) return refuse(...problems);
  if (graphical === undefined) return manifest;
  const { timestamps, ...styling } = graphical;
  const plain = plainGraphical(styling);
  if ("code" in plain) return refuse(plain);
  return { ...manifest, graphical: { ...plain, timestamps } };
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
 * A manifest from a value read losslessly (`loads`), the one way a
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
  // completeStyles issues the one warning naming every missing style. It clones what it is
  // given structurally, which would turn a coordinate's `JsonFloat` into a plain object, so
  // the named timestamps, which name no style, stay out of it.
  const { timestamps, ...styled } = manifest.graphical;
  const { timestamps: _, ...styling } = completeStyles(styled).graphical;
  return {
    ...manifest,
    graphical: timestamps === undefined ? styling : { ...styling, timestamps },
  };
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
 * A value given to a command, read where it will lie: `probe`, the manifest
 * with the value in place, completed, ordered and checked whole by the
 * schema as `settle` checks a manifest, so that what the value names (a
 * measure map, a scheme, a timeline or region a part slot names) is found
 * wherever it lies in the manifest. The complete form, or the schema's first
 * problem with its path from the manifest.
 */
export function readInPlace(probe: unknown): CompleteManifest | Problem {
  const ordered = completeOrdered(probe);
  if (isCommandError(ordered)) return ordered;
  const checked = schemaChecked(ordered);
  return "code" in checked ? checked : completeForm(checked);
}

/**
 * A map, region or flow-control element given to a command, read through
 * the schema boundary where it will lie: in the timeline `at` locates in
 * `manifest`, at `index` of its kind's list (the entry there replaced, or
 * appended at the list's length), the whole manifest read with the value in
 * place (`readInPlace`), and the value returned in its complete form. A
 * schema problem is returned with its path from the timeline, or at the
 * entry's place in it where the problem lies elsewhere; the caller places it
 * in its manifest.
 */
export function readEntry<K extends EntryKind>(
  kind: K,
  value: JsonObject,
  at: Located,
  index: number,
  manifest: Manifest,
): EntryTypes[K] | Problem {
  const list = ENTRY_LISTS[kind];
  const items: unknown[] = [...list.get(at.timeline)];
  items[index] = value;
  const read = readInPlace(withValueAt(manifest, [...at.path, ...list.path], items));
  if ("code" in read) {
    const inHost = at.path.every((step, position) => read.path[position] === step);
    return { ...read, path: inHost ? read.path.slice(at.path.length) : [...list.path, index] };
  }
  const host = findTimeline(read, at.timeline.id);
  // Canonical order may move the entry within its list; its id finds it.
  const entry = host === undefined ? undefined : list.get(host).find(({ id }) => id === value.id);
  if (entry === undefined) throw new Error(`the host lists the ${kind} ${String(value.id)}`);
  return entry;
}

/**
 * A measure map given to a command, read through the schema boundary as the
 * one measure map of an empty manifest of its own and returned in its
 * complete form, its unknown keys kept; or the first problem, with its path
 * from the measure map.
 */
export function readMeasureMap(value: JsonObject): MeasureMap | Problem {
  const read = normalizeManifest({
    timetoshare: SCHEMA_VERSION,
    timelines: [],
    measure_maps: [value],
  });
  if (isLoadError(read)) {
    const [first] = read.problems;
    if (first === undefined) throw new Error("a refused manifest names its problem");
    const [list, index, ...path] = first.path;
    return { ...first, path: list === "measure_maps" && index === 0 ? path : [] };
  }
  const [map] = read.measure_maps;
  if (map === undefined) throw new Error("the host holds the measure map");
  return map;
}

/**
 * How a manifest is written to a file: in the minimal form or the complete
 * one, with its styling (the `graphical` object) or without, and in which of
 * TimeToShare's serializations.
 */
export interface ManifestFile {
  readonly minimal: boolean;
  readonly styling: boolean;
  readonly serialization: Serialization;
}

/** How a manifest not read from a file is written: minimal, with its styling, in canonical YAML. */
export const NEW_MANIFEST_FILE: ManifestFile = {
  minimal: true,
  styling: true,
  serialization: "yaml",
};

/**
 * The value of a manifest file's text in any of TimeToShare's
 * serializations (`loads`); a text that cannot be read is `invalid_json`
 * when it is read as JSON and `invalid_yaml` when it is read as YAML.
 */
function readValue(text: string): unknown {
  try {
    return loads(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = error instanceof YamlSyntaxError ? ErrorCode.invalidYaml : ErrorCode.invalidJson;
    return refuse(problem(code, message, []));
  }
}

/** A manifest from its text in any serialization (`normalizeManifest`). */
export function loadManifest(text: string): Manifest | LoadError {
  const value = readValue(text);
  return isLoadError(value) ? value : normalizeManifest(value);
}

/** A manifest read from a file, and how the file writes it. */
export interface ReadManifestFile {
  readonly manifest: Manifest;
  readonly file: ManifestFile;
}

/**
 * A manifest from a file's text (`loadManifest`) and how the text writes
 * it, so that the manifest is written back as it came: minimal when the
 * value states no key at its default (its minimal form has the same text),
 * with its styling when it holds a `graphical` object, and in the
 * serialization `serializationOf` names.
 */
export function readManifestFile(text: string): ReadManifestFile | LoadError {
  const value = readValue(text);
  if (isLoadError(value)) return value;
  const manifest = normalizeManifest(value);
  if (isLoadError(manifest)) return manifest;
  const file: ManifestFile = {
    minimal: dumps(minimal(value)) === dumps(value),
    styling: isJsonObject(value) && Object.hasOwn(value, "graphical"),
    serialization: serializationOf(text),
  };
  return { manifest, file };
}

/**
 * A manifest's text as `file` writes it, each member not given as
 * `NEW_MANIFEST_FILE` says: in the minimal or the complete form, with or
 * without its `graphical` object, in the serialization named.
 *
 * @throws {InvalidManifestError} for a manifest the schema or the invariants refuse.
 */
export function saveManifest(manifest: Manifest, file: Partial<ManifestFile> = {}): string {
  const problems = manifestProblems(manifest);
  if (problems.length > 0) throw new InvalidManifestError(problems);
  const { minimal: asMinimal, styling, serialization } = { ...NEW_MANIFEST_FILE, ...file };
  const { graphical: _styling, ...unstyled } = manifest;
  const written = styling ? manifest : unstyled;
  return dumps(asMinimal ? minimal(written) : complete(written), { serialization });
}
