/**
 * The schema boundary: the one path from a manifest file's text to a
 * `Manifest` (`loadManifest`) and from a value with bare IDs to one
 * (`normalizeManifest`), the one path from a command's map, region or
 * flow-control element to its typed form (`readEntry`), and the one path
 * back to a file (`saveManifest`). A file writes every ID `#id` and the
 * full JSON-LD `@context`; TiLiE holds every ID bare and only the prefixes a
 * manifest declares itself (`withStatementContext`), and its one schema
 * check of what it holds (`schemaChecked`) checks the file form.
 */

import type {
  CompleteManifest,
  Declaration,
  FileForm,
  Graphical,
  JsonNumber,
  Lossless,
  LosslessManifest,
  ManifestWarning,
  Rule,
  Selector,
  UnknownKey,
} from "@timetoalign/timetoshare";
import {
  canonicalOrder,
  complete,
  completeManifest,
  completeStyles,
  dumpsFile,
  FileIdError,
  fileForm,
  manifestWarnings as fileManifestWarnings,
  unknownKeys as fileUnknownKeys,
  fromFileId,
  isJsonFloat,
  loads,
  SCHEMA_VERSION,
  SchemaValidationError,
  toFileId,
  UnsupportedVersionError,
  validate,
  withBareIds,
  withFileIds,
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
import { isJsonObject, withValueAt } from "../json.ts";
import type { Part } from "./address.ts";
import type { EntryKind, EntryTypes } from "./files.ts";
import { ENTRY_LISTS } from "./files.ts";
import { checkOrdered } from "./invariants.ts";
import { withSegmentsUnlocked } from "./locks.ts";
import { withContextOf, withFullContext, withStatementContext } from "./statements.ts";
import type { Located } from "./tree.ts";
import { findTimeline } from "./tree.ts";
import type { Manifest, MeasureMap } from "./types.ts";

/**
 * The problem a schema refusal is reported as, at the path the validators
 * give: the schema itself (code `schema`) and the reading of IDs
 * (`FileIdError`) read the value as the file writes it, every later check
 * reads it with bare IDs and names a key of `graphical.order` bare. For a
 * manifest TiLiE holds (`held`), a path into the file form leads into the
 * manifest itself (`idFormPath`); an ID the file form does not write is
 * refused as the schema refuses it.
 */
function schemaProblem(error: unknown, held: boolean): Problem {
  const found = refusalOf(error);
  const inFileForm = !(error instanceof SchemaValidationError) || error.code === "schema";
  return held && inFileForm ? { ...found, path: idFormPath(found.path, false) } : found;
}

function refusalOf(error: unknown): Problem {
  if (error instanceof SchemaValidationError) {
    return problem(ErrorCode.schemaViolation, error.detail, error.path);
  }
  if (error instanceof UnsupportedVersionError) {
    return problem(ErrorCode.schemaViolation, error.message, ["timetoshare"]);
  }
  if (error instanceof FileIdError) {
    return problem(ErrorCode.schemaViolation, error.message, error.path);
  }
  throw error;
}

/** The members of a manifest whose keys are IDs: `graphical.order`. */
const KEYED_BY_ID = ["graphical", "order"] as const;

/**
 * A path into a manifest written with bare IDs as the same path into its
 * file form (`toFile`), or back: the one segment that is an ID, a key of
 * `graphical.order`, gains its `#`, or loses it where it has one. Every
 * other segment is a key or an index, the same in both forms.
 */
export function idFormPath(path: readonly PathSegment[], toFile: boolean): PathSegment[] {
  const [first, second, key, ...rest] = path;
  if (first !== KEYED_BY_ID[0] || second !== KEYED_BY_ID[1] || typeof key !== "string") {
    return [...path];
  }
  if (toFile) return [first, second, toFileId(key), ...rest];
  return [first, second, key.startsWith("#") ? fromFileId(key) : key, ...rest];
}

/**
 * A value TiLiE holds, its IDs bare, as a file writes it: every ID `#id`
 * (`withFileIds`) and the full context (`withFullContext`). The one file
 * boundary: `saveManifest` writes this value, the schema checks, the
 * warnings and the unknown keys read it, and a host showing a manifest as
 * its file shows it (before leaving the styling out or writing the minimal
 * form, as the file says).
 */
export function manifestFileValue<T>(value: T): T {
  const file = withFileIds(value);
  return isJsonObject(file) ? withFullContext(file) : file;
}

/**
 * A manifest written with bare IDs, as TiLiE holds every manifest, as the
 * schema accepts it, or the schema's first problem: the value as a file
 * writes it (`manifestFileValue`) is checked, and the problem's path leads into the
 * value itself (`idFormPath`). The value is returned as TiLiE holds it, its
 * `@context` cut to the prefixes it declares itself
 * (`withStatementContext`). The one schema check of a manifest TiLiE holds.
 *
 * The file form differs from the value only in its IDs, written `#id`, and
 * its full context, so the value itself is returned with the context core
 * holds of the checked file form (`withContextOf`), its IDs never read back
 * from the file form. A value without `@context` declares no prefix, so it
 * is held without one as it is.
 */
export function schemaChecked(value: unknown): LosslessManifest | Problem {
  try {
    const file = manifestFileValue(value);
    validate(file);
    checkedThrough(value);
    if (!Object.hasOwn(value, "@context")) return value;
    return withContextOf(value, withStatementContext(file));
  } catch (error) {
    return schemaProblem(error, true);
  }
}

/**
 * Asserts that `value` is a manifest the schema accepts, its IDs bare: its
 * file form (`manifestFileValue`), which writes the same members, is one.
 * Only an object has a file form the schema accepts.
 */
function checkedThrough(value: unknown): asserts value is LosslessManifest {
  if (!isJsonObject(value)) throw new Error("the schema accepts no manifest that is no object");
}

/**
 * A manifest file's value, its IDs written `#id`, as the schema accepts it
 * and with every ID bare (`withBareIds`), or the schema's first problem at
 * the path the validators give.
 */
function fileChecked(value: unknown): LosslessManifest | Problem {
  try {
    validate(value);
    return withBareIds(value);
  } catch (error) {
    return schemaProblem(error, false);
  }
}

/**
 * A manifest value in the file form, its IDs written `#id`, with every ID
 * bare (`withBareIds`), unchecked otherwise: what TiLiE holds of a value read
 * from outside that its commands check, such as a manifest text applied to a
 * block. A text that writes no ID where one stands is refused at its path.
 */
export function withHeldIds<T>(value: T): T | LoadError {
  try {
    return withBareIds(value);
  } catch (error) {
    return refuse(schemaProblem(error, false));
  }
}

/**
 * The keys of a manifest TiLiE holds, its IDs bare, that its schema does not
 * declare (TimeToShare's `unknownKeys` of its file form with the full
 * context a file writes, `manifestFileValue`), each path into the manifest itself.
 *
 * @throws {SchemaValidationError} for a manifest the schema refuses.
 */
export function unknownKeys(manifest: unknown): UnknownKey[] {
  return fileUnknownKeys(manifestFileValue(manifest)).map(({ path, key }) => ({
    path: idFormPath(path, false),
    key,
  }));
}

/**
 * The warnings of a manifest TiLiE holds, its IDs bare (TimeToShare's
 * `manifestWarnings` of its file form with the full context a file writes,
 * `manifestFileValue`: a manifest with statements but no ID), each path into the
 * manifest itself.
 *
 * @throws {SchemaValidationError} for a manifest the schema refuses.
 */
export function manifestWarnings(manifest: unknown): ManifestWarning[] {
  return fileManifestWarnings(manifestFileValue(manifest)).map((warning) => ({
    ...warning,
    path: idFormPath(warning.path, false),
  }));
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
    rotation,
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
    ["rotation", rotation],
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

/** A graphical block without its named timestamps and MatchStamps, which hold no declaration. */
export type Styling = Omit<Graphical, "timestamps" | "matchstamps">;

/**
 * The styling of a graphical block read losslessly, its declarations as the
 * drawing reads them: every declaration's numbers doubles
 * (`plainDeclaration`), in the named styles and in the rules; the
 * orders kept as they are, and every key of every object where it was. The
 * named timestamps, whose coordinates are own-axis values, and the named
 * MatchStamps are left to the caller.
 */
export function plainGraphical(graphical: Lossless<Styling>): Styling | Problem {
  const { styles, rules, ...rest } = graphical;
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
  if (rules !== undefined) {
    const plain: Rule[] = [];
    for (const [index, rule] of rules.entries()) {
      const { select, set, ...others } = rule;
      const read =
        typeof set === "string" ? set : plainDeclaration(set, ["graphical", "rules", index, "set"]);
      if (typeof read !== "string" && "code" in read) return read;
      const kept: typeof others = rule;
      plain.push({ ...kept, select: plainSelector(select), set: read });
    }
    result.rules = plain;
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
 * (`schemaChecked`): its `@context` cut to the prefixes it declares itself
 * and uses (`withStatementContext`), completed and in canonical order, its segments
 * unlocked (a segment's own lock has no meaning: its segment line's governs
 * it), every other lock as the value states it, its graphical block's
 * declarations made plain (`plainGraphical`); or every invariant problem of
 * it.
 */
export function completed(value: LosslessManifest): Manifest | LoadError {
  const { graphical, ...form } = completeForm(withStatementContext(value));
  const manifest: Manifest = {
    ...form,
    timelines: form.timelines.map((root) => withSegmentsUnlocked(root)),
  };
  const problems = checkOrdered(manifest);
  if (problems.length > 0) return refuse(...problems);
  if (graphical === undefined) return manifest;
  // The whole block is read as its styling, so that every key keeps its place; the named
  // timestamps and MatchStamps, which `plainGraphical` passes over, are put back in theirs.
  const { timestamps, matchstamps } = graphical;
  const styling: Lossless<Styling> = graphical;
  const plain = plainGraphical(styling);
  if ("code" in plain) return refuse(plain);
  return { ...manifest, graphical: { ...plain, timestamps, matchstamps } };
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
 * A manifest from a value with bare IDs, the one way such a value becomes a
 * `Manifest`: its `@context` cut to the prefixes it declares itself and uses
 * (`withStatementContext`), as every value a command gives or leaves is, the
 * schema validates it (`schemaChecked`), then it is put in its
 * complete form (every default written out, whether it was complete or
 * minimal or anything between), in canonical order, its segments unlocked,
 * its invariants checked, its graphical declarations' numbers made doubles,
 * and its missing styles completed. Every schema or invariant problem
 * refuses it, and so does a declaration's integer that no double holds.
 * Unknown keys are kept.
 */
export function normalizeManifest(value: unknown): Manifest | LoadError {
  const checked = schemaChecked(isJsonObject(value) ? withStatementContext(value) : value);
  return "code" in checked ? refuse(checked) : normalized(checked);
}

/** A value the schema accepts, its IDs bare, as `normalizeManifest` reads it after the check. */
function normalized(checked: LosslessManifest): Manifest | LoadError {
  const manifest = completed(checked);
  if (isLoadError(manifest) || manifest.graphical === undefined) return manifest;
  // completeStyles issues the one warning naming every missing style and adds it to the
  // styles, the one member it changes; it reads the styling alone, never the named timestamps
  // and MatchStamps.
  const { timestamps: _, matchstamps: __, ...styling } = manifest.graphical;
  const { styles } = completeStyles(styling).graphical;
  return styles === undefined
    ? manifest
    : { ...manifest, graphical: { ...manifest.graphical, styles } };
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
 * with the value in place, its `@context` as core holds it (`withStatementContext`),
 * completed, ordered and checked whole by the schema as `settle` checks a
 * manifest, so that what the value names (a measure map, an element a
 * statement names) is found wherever it lies in the manifest. The complete form, or the schema's first
 * problem with its path from the manifest.
 */
export function readInPlace(probe: unknown): CompleteManifest | Problem {
  const ordered = completeOrdered(isJsonObject(probe) ? withStatementContext(probe) : probe);
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

/** How a manifest not read from a file is written: minimal, with its styling, in canonical YAML. */
export const NEW_MANIFEST_FILE: FileForm = {
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

/**
 * A manifest from the text of a manifest file in any serialization, its
 * IDs written `#id`: the schema checks the value as the file writes it, then
 * every ID is made bare (`withBareIds`) and the manifest read as
 * `normalizeManifest` reads one. A problem's path leads into the file.
 */
export function loadManifest(text: string): Manifest | LoadError {
  const value = readValue(text);
  if (isLoadError(value)) return value;
  const checked = fileChecked(value);
  return "code" in checked ? refuse(checked) : normalized(checked);
}

/** A manifest read from a file, and how the file writes it. */
export interface ReadManifestFile {
  readonly manifest: Manifest;
  readonly file: FileForm;
}

/**
 * A manifest from a file's text (`loadManifest`) and how the text writes
 * it (TimeToShare's `fileForm`), so that the manifest is written back as it
 * came.
 */
export function readManifestFile(text: string): ReadManifestFile | LoadError {
  const manifest = loadManifest(text);
  return isLoadError(manifest) ? manifest : { manifest, file: fileForm(text) };
}

/**
 * A manifest's text as a file of the form `file` writes it (TimeToShare's
 * `dumpsFile`), each member not given as `NEW_MANIFEST_FILE` says, every ID
 * written `#id` (`withFileIds`) and the full context a file writes
 * (`withFullContext`): the format's terms and every prefix the statements
 * use.
 *
 * @throws {InvalidManifestError} for a manifest the schema or the invariants refuse.
 */
export function saveManifest(manifest: Manifest, file: Partial<FileForm> = {}): string {
  const problems = manifestProblems(manifest);
  if (problems.length > 0) throw new InvalidManifestError(problems);
  return dumpsFile(manifestFileValue(manifest), { ...NEW_MANIFEST_FILE, ...file });
}
