/**
 * The inspector's edits of a block's whole manifest from text, as commands
 * on the store, and what the selection names. The store's checks decide;
 * the inspector only reads text and builds the command. The Properties
 * form's edits are `properties.ts`'s.
 */

import type {
  Block,
  BlockId,
  EntryKind,
  Json,
  Problem,
  SetCommand,
  Store,
  TimelineManifest,
  View,
} from "@timetoalign/tilie-core";
import {
  ErrorCode,
  elementOf,
  findEntry,
  findTimeline,
  isCommandError,
  PART_WORDS,
  parseAddress,
  TITLE_ADDRESS,
} from "@timetoalign/tilie-core";
import { complete, dumps, isJsonObject, minimal } from "@timetoalign/timeskeleton";
import type { Format, Text } from "./formats.ts";
import { readText, writeText } from "./formats.ts";
import type { InspectorProblem, Result } from "./problems.ts";
import { InspectorCode, refused } from "./problems.ts";

/** The member a text leaves out unless it includes the styling. */
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

/** A timeline the inspector shows: the block it lies in, its address and its value. */
export interface SelectedTimeline {
  readonly block: Block;
  /** `<block>/<timeline id>`, the target of a command on the timeline. */
  readonly address: string;
  readonly timeline: TimelineManifest;
}

/**
 * The timeline the selection names when it is exactly one address naming a
 * timeline or a part of one, such as its card `<block>/T/card` (the element
 * read with core's `elementOf`); else `null`: no selection, a block, several
 * addresses, a group, the title or any other element.
 */
export function selectedTimeline(view: View, selection: Iterable<string>): SelectedTimeline | null {
  const [address, ...others] = selection;
  if (address === undefined || others.length > 0) return null;
  const parsed = parseAddress(address);
  if (isCommandError(parsed) || parsed.block === null || parsed.element === null) return null;
  const block = view.blocks[parsed.block];
  if (block === undefined) return null;
  const timeline = findTimeline(block.manifest, elementOf(block.manifest, parsed.element));
  return timeline === undefined ? null : { block, address: `${block.id}/${timeline.id}`, timeline };
}

/**
 * What the inspector names beside its heading: the words for the kind of
 * element (and the part of it) the selection names, then the element's
 * name, or its id when it has no name. An anonymous bundle and several
 * selected elements have neither.
 */
export interface InspectedSubject {
  /** `Bundle`, `Card of timeline`, `Anonymous bundle`, `2 selected`, … */
  readonly words: string;
  /** The element's name; `null` when it has none. */
  readonly name: string | null;
  /** The element's id when it has no name; else `null`. */
  readonly id: string | null;
}

/** The word of each kind of element a timeline holds in a list. */
const ENTRY_WORDS: Readonly<Record<EntryKind, string>> = {
  map: "conversion map",
  region: "region",
  break: "break",
  jump: "jump",
  marker: "marker",
};

/** The word of each part an address appends to its element; a title for a bundle or a group. */
function partWord(part: string, titled: boolean): string {
  return part === "name" && titled ? "title" : part;
}

/**
 * The subject the selection names: for one address, what it resolves to in
 * its block's manifest (the manifest itself for the block, a group, a
 * timeline, a map, region, break, jump or marker), read through core's
 * `parseAddress`, `elementOf`, `findTimeline` and `findEntry`, each part
 * the address appends prefixed (`Card of timeline`, `Label of end of
 * timeline`); for several addresses their count; `null` for no selection,
 * an address naming nothing or a part no element has.
 */
export function inspectedSubject(view: View, selection: Iterable<string>): InspectedSubject | null {
  const addresses = [...selection];
  const [address] = addresses;
  if (address === undefined) return null;
  if (addresses.length > 1) return { words: `${addresses.length} selected`, name: null, id: null };
  const parsed = parseAddress(address);
  if (isCommandError(parsed) || parsed.block === null) return null;
  const block = view.blocks[parsed.block];
  if (block === undefined) return null;
  const { manifest } = block;
  const path = parsed.element ?? "";
  const element = elementOf(manifest, path);
  const bundle = { kind: "bundle", name: manifest.name, id: manifest.id ?? null, titled: true };
  // The title is the bundle's part `name`, addressed without the bundle's id.
  const [found, parts] =
    element === TITLE_ADDRESS
      ? [bundle, ["name"]]
      : [
          parsed.element === null || element === manifest.id ? bundle : resolved(manifest, element),
          path === element ? [] : path.slice(element.length + 1).split("/"),
        ];
  if (found === undefined || parts.some((part) => !PART_WORDS.includes(part))) return null;
  const owner = found.name === null && found.id === null ? `anonymous ${found.kind}` : found.kind;
  const words = [...parts.toReversed().map((part) => partWord(part, found.titled)), owner].join(
    " of ",
  );
  return {
    words: words.charAt(0).toUpperCase() + words.slice(1),
    name: found.name,
    id: found.name === null ? found.id : null,
  };
}

/** What a subject names: its kind word, name and id, and whether its part `name` is a title. */
interface Named {
  readonly kind: string;
  readonly name: string | null;
  readonly id: string | null;
  readonly titled: boolean;
}

/** The kind, name and id of the group, timeline or listed element `element` of a manifest. */
function resolved(manifest: Block["manifest"], element: string): Named | undefined {
  const group = manifest.groups.find((item) => item.id === element);
  if (group !== undefined) return { kind: "group", name: group.name, id: group.id, titled: true };
  const timeline = findTimeline(manifest, element);
  if (timeline !== undefined) {
    return { kind: "timeline", name: timeline.name, id: timeline.id, titled: false };
  }
  const listed = findEntry(manifest, element);
  if (listed === undefined) return undefined;
  const { entry } = listed;
  const name = "name" in entry ? entry.name : null;
  return { kind: ENTRY_WORDS[listed.kind], name, id: entry.id, titled: false };
}

/** A block's manifest as the JSON value it is. */
export function manifestOf(block: Block): Json {
  return block.manifest as unknown as Json;
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
export function visibleManifest(manifest: Json, options: TextOptions): Json {
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
export function problemPointer(problem: Pick<InspectorProblem, "path">): string {
  return problem.path
    .map((segment) => `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`)
    .join("");
}

/** What applying a text gives: the text to show next (with its document), or why it was refused. */
export type Applied = Result<Text>;

/**
 * Read `text` in `format` and dispatch ONE `set` replacing the block's
 * manifest with the value read (the store completes it). On acceptance the
 * read document is patched with the manifest the store now holds, as
 * `options` show it (it may differ in order, completed defaults or styles),
 * so the text keeps the user's comments; on refusal nothing is dispatched or
 * the store's single problem is returned. A text whose complete form equals
 * the current manifest dispatches nothing: the store would journal even a
 * `set` that changes nothing.
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
