/**
 * A block's manifest as text and back: the text a manifest is shown as in
 * a format and with options, the one `set` an applied text dispatches, and
 * the text after the manifest changed, patched in place so its comments
 * survive. The store's checks decide; this module only reads text and
 * builds the command.
 */

import type {
  Block,
  BlockId,
  Json,
  Manifest,
  Problem,
  SetCommand,
  Store,
} from "@timetoalign/tilie-core";
import { ErrorCode } from "@timetoalign/tilie-core";
import { complete, dumps, isJsonFloat, isJsonObject, minimal } from "@timetoalign/timetoshare";
import type { Format, Text } from "./formats.svelte.ts";
import { readText, writeText } from "./formats.svelte.ts";
import type { InspectorProblem, Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";

/** The member a text leaves out unless it includes the styling. */
const STYLING = "graphical";

/** Whether `value` is JSON as a lossless reader gives it, at every depth. */
function isJson(value: unknown): value is Json {
  switch (typeof value) {
    case "boolean":
    case "string":
    case "number":
    case "bigint":
      return true;
    case "object":
      if (value === null || isJsonFloat(value)) return true;
      return Array.isArray(value)
        ? value.every(isJson)
        : isJsonObject(value) && Object.values(value).every(isJson);
    default:
      return false;
  }
}

/** The manifests already read as JSON. */
const checked = new WeakMap<Manifest, Json>();

/**
 * A block's manifest as the JSON value it is. The manifest's type leaves
 * `meta` free (`unknown`), so its JSON is checked, once per manifest; a
 * manifest holding anything else throws a `TypeError`.
 */
export function manifestOf(block: Block): Json {
  const { manifest } = block;
  let found = checked.get(manifest);
  if (found === undefined) {
    if (!isJson(manifest)) throw new TypeError(`the manifest of block ${block.id} is no JSON`);
    found = manifest;
    checked.set(manifest, found);
  }
  return found;
}

/**
 * How a text shows a manifest: with or without its styling (`graphical`),
 * and in the complete form (every default written out) or the minimal one.
 */
export interface TextOptions {
  readonly includeStyling: boolean;
  readonly minimal: boolean;
}

/**
 * The manifest as the text shows it: without its styling unless
 * `includeStyling`, then in the minimal form when `minimal`.
 */
function visibleManifest(manifest: Json, options: TextOptions): Json {
  let visible = manifest;
  if (!options.includeStyling && isJsonObject(manifest)) {
    const { [STYLING]: _excluded, ...rest } = manifest as { readonly [key: string]: Json };
    visible = rest;
  }
  return options.minimal ? minimal(visible) : visible;
}

/** The text of a block's manifest in `format`. */
export function manifestText(manifest: Json, format: Format, options: TextOptions): Result<Text> {
  return writeText(format, visibleManifest(manifest, options));
}

/**
 * The manifest the text stands for: with the styling excluded, the block's
 * current `graphical` is put back (or stays absent); a `graphical` typed in
 * a text that excludes it is refused rather than silently dropped.
 */
function withExcluded(edited: Json, current: Json, options: TextOptions): Result<Json> {
  if (options.includeStyling || !isJsonObject(edited)) return { ok: true, value: edited };
  if (Object.hasOwn(edited, STYLING)) {
    return refused(
      InspectorCode.hiddenMember,
      "the styling is excluded; check Include styling to edit graphical",
      [STYLING],
    );
  }
  const styling = (current as { readonly [key: string]: Json })[STYLING];
  return { ok: true, value: styling === undefined ? edited : { ...edited, [STYLING]: styling } };
}

/** The one command that replaces a block's manifest. */
function manifestCommand(block: BlockId, manifest: Json): SetCommand {
  return { type: "set", changes: [{ target: block, values: { manifest } }] };
}

/**
 * A refusal of the store as the inspector shows it: a path into the block's
 * manifest (`[<block>, "manifest", …]`) loses that prefix, so it points into
 * the text; any other path is kept.
 */
function asInspectorProblem(problem: Problem, block: BlockId): InspectorProblem {
  const { path } = problem;
  const inManifest = path[0] === block && path[1] === "manifest";
  return { ...problem, path: inManifest ? path.slice(2) : path };
}

/** What applying a text gives: the text to show next (with its document), or why it was refused. */
type Applied = Result<Text>;

/**
 * Read `text` in `format` and dispatch ONE `set` replacing the block's
 * manifest with the value read (the store completes it). On acceptance the
 * read document is patched with the manifest the store now holds, as
 * `options` show it (it may differ in order, completed defaults or styles),
 * so the text keeps the user's comments; on refusal nothing is dispatched or
 * the store's single problem is returned. A text whose complete form equals
 * the current manifest dispatches nothing and is no refusal: the store
 * refuses a `set` that changes nothing.
 */
export function applyText(
  store: Store,
  block: BlockId,
  format: Format,
  text: string,
  options: TextOptions,
): Applied {
  const current = store.view.blocks[block];
  if (current === undefined) {
    return refused(ErrorCode.unknownTarget, `there is no block ${block}`, [block]);
  }
  const read = readText(format, text);
  if (!read.ok) return read;
  const manifest = withExcluded(read.value.value, manifestOf(current), options);
  if (!manifest.ok) return manifest;
  if (sameManifest(manifest.value, manifestOf(current))) {
    return follow(read.value.source, manifestOf(current), options);
  }
  const refusal = store.dispatch(manifestCommand(block, manifest.value));
  if (refusal !== null) return { ok: false, problems: [asInspectorProblem(refusal, block)] };
  return follow(read.value.source, manifestOf(store.view.blocks[block] as Block), options);
}

/**
 * Whether an edited value is the stored manifest: its complete form has the
 * stored manifest's standard text. A value `complete` or `dumps` refuses
 * equals nothing; the store's checks report it.
 */
function sameManifest(edited: Json, stored: Json): boolean {
  try {
    return dumps(complete(edited)) === dumps(stored);
  } catch {
    return false;
  }
}

/**
 * The text after the manifest changed: the document patched in place with
 * the manifest as `options` show it, so its comments survive.
 */
export function follow(source: Text["source"], manifest: Json, options: TextOptions): Applied {
  const patched = source.patch(visibleManifest(manifest, options));
  return patched.ok ? { ok: true, value: { text: patched.value, source } } : patched;
}
