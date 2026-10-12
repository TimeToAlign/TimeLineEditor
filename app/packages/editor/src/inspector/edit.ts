/**
 * The inspector's edits, as commands on the store: the block's whole
 * manifest from text, and one placement property from the form. The store's
 * checks decide; the inspector only reads text and builds the command.
 */

import type {
  Block,
  BlockId,
  Json,
  Problem,
  SetCommand,
  Store,
  View,
} from "@timetoalign/tilie-core";
import { ErrorCode, isCommandError, parseAddress } from "@timetoalign/tilie-core";
import { dumps, isJsonObject } from "@timetoalign/timeskeleton";
import type { Format, Text } from "./formats.ts";
import { readText, writeText } from "./formats.ts";
import type { InspectorProblem, Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";

/** The member the styling toggle hides. */
export const STYLING = "graphical";

/** The block every selected address lies in, when it is exactly one; else `null`. */
export function selectedBlock(view: View, selection: Iterable<string>): Block | null {
  let found: BlockId | null = null;
  for (const address of selection) {
    const parsed = parseAddress(address);
    if (isCommandError(parsed) || parsed.block === null) return null;
    if (found !== null && found !== parsed.block) return null;
    found = parsed.block;
  }
  return found === null ? null : (view.blocks[found] ?? null);
}

/** A block's manifest as the JSON value it is. */
export function manifestOf(block: Block): Json {
  return block.manifest as unknown as Json;
}

/** The manifest as the text shows it: without its styling unless `showStyling`. */
export function visibleManifest(manifest: Json, showStyling: boolean): Json {
  if (showStyling || !isJsonObject(manifest)) return manifest;
  const { [STYLING]: _hidden, ...rest } = manifest as { readonly [key: string]: Json };
  return rest;
}

/** The text of a block's manifest in `format`. */
export function manifestText(manifest: Json, format: Format, showStyling: boolean): Result<Text> {
  return writeText(format, visibleManifest(manifest, showStyling));
}

/**
 * The manifest the text stands for: with the styling hidden, the block's
 * current `graphical` is put back (or stays absent); a `graphical` typed in
 * the hidden text is refused rather than silently dropped.
 */
function withHidden(edited: Json, current: Json, showStyling: boolean): Result<Json> {
  if (showStyling || !isJsonObject(edited)) return { ok: true, value: edited };
  if (Object.hasOwn(edited, STYLING)) {
    return refused(
      InspectorCode.hiddenMember,
      "the styling is hidden; check Show styling to edit graphical",
      [STYLING],
    );
  }
  const styling = (current as { readonly [key: string]: Json })[STYLING];
  return { ok: true, value: styling === undefined ? edited : { ...edited, [STYLING]: styling } };
}

/** The one command that replaces a block's manifest. */
export function manifestCommand(block: BlockId, manifest: Json): SetCommand {
  return { type: "set", changes: [{ target: block, values: { manifest } }] };
}

/**
 * A refusal of the store as the inspector shows it: a path into the block's
 * manifest (`[<block>, "manifest", …]`) loses that prefix, so it points into
 * the text; any other path is kept.
 */
export function asInspectorProblem(problem: Problem, block: BlockId): InspectorProblem {
  const { path } = problem;
  const inManifest = path[0] === block && path[1] === "manifest";
  return { ...problem, path: inManifest ? path.slice(2) : path };
}

/** A problem's path as a JSON pointer (RFC 6901; `""` for the whole text). */
export function problemPointer(problem: InspectorProblem): string {
  return problem.path
    .map((segment) => `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`)
    .join("");
}

/** What applying a text gives: the text to show next (with its document), or why it was refused. */
export type Applied = Result<Text>;

/**
 * Read `text` in `format` and dispatch ONE `set` replacing the block's
 * manifest. On acceptance the read document is patched with the manifest
 * the store now holds (which may differ in order or completed styles), so
 * the text keeps the user's comments; on refusal nothing is dispatched or the
 * store's single problem is returned. A text equal to the current manifest
 * dispatches nothing.
 */
export function applyText(
  store: Store,
  block: BlockId,
  format: Format,
  text: string,
  showStyling: boolean,
): Applied {
  const current = store.view.blocks[block];
  if (current === undefined) {
    return refused(ErrorCode.unknownTarget, `there is no block ${block}`, [block]);
  }
  const read = readText(format, text);
  if (!read.ok) return read;
  const manifest = withHidden(read.value.value, manifestOf(current), showStyling);
  if (!manifest.ok) return manifest;
  if (sameText(manifest.value, manifestOf(current))) {
    return follow(read.value.source, manifestOf(current), showStyling);
  }
  const refusal = store.dispatch(manifestCommand(block, manifest.value));
  if (refusal !== null) return { ok: false, problems: [asInspectorProblem(refusal, block)] };
  return follow(read.value.source, manifestOf(store.view.blocks[block] as Block), showStyling);
}

/** Whether two values have the same standard text; a value `dumps` refuses equals nothing. */
function sameText(left: Json, right: Json): boolean {
  try {
    return dumps(left) === dumps(right);
  } catch {
    return false;
  }
}

/** The text after the manifest changed: the document patched in place, so its comments survive. */
export function follow(source: Text["source"], manifest: Json, showStyling: boolean): Applied {
  const patched = source.patch(visibleManifest(manifest, showStyling));
  return patched.ok ? { ok: true, value: { text: patched.value, source } } : patched;
}

/** The block properties the form edits, in order. */
export const PROPERTIES = ["x", "y", "scale", "length", "spacing", "width", "height"] as const;
export type Property = (typeof PROPERTIES)[number];

/** Properties that take an empty field as null. */
const NULLABLE: ReadonlySet<Property> = new Set(["width", "height"]);

/**
 * The command setting one block property from the field's text: a number,
 * or null for an empty `width` or `height`; anything else is refused before
 * dispatch. The store's checks decide everything else.
 */
export function propertyCommand(
  block: BlockId,
  property: Property,
  input: string,
): Result<SetCommand> {
  const trimmed = input.trim();
  let value: number | null;
  if (trimmed === "") {
    if (!NULLABLE.has(property)) {
      return refused(InspectorCode.invalidValue, `${property} needs a number`, [block, property]);
    }
    value = null;
  } else {
    value = Number(trimmed);
    if (!Number.isFinite(value)) {
      return refused(InspectorCode.invalidValue, `${trimmed} is not a number`, [block, property]);
    }
  }
  return {
    ok: true,
    value: { type: "set", changes: [{ target: block, values: { [property]: value } }] },
  };
}
