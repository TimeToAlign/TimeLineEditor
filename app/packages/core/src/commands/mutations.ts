/**
 * The typed edits a command makes to a view: a block replaced, a timeline
 * replaced where it lies in its manifest, an entry of a kind replaced in its
 * timeline's list (`ENTRY_LISTS`). Every edit returns a new value and shares what it leaves
 * unchanged. The change set records what a command changed, for the store's
 * no-op refusal, for `settle`, and for the guard of an open editor.
 */

import type { PathSegment } from "../json.ts";
import { jsonEqual } from "../json.ts";
import type { EntryKind, EntryTypes } from "../manifest/files.ts";
import { ENTRY_LISTS } from "../manifest/files.ts";
import type { Located } from "../manifest/tree.ts";
import type { ChildTimeline, Manifest, TimelineManifest } from "../manifest/types.ts";
import type { Block, BlockId } from "../workspace/blocks.ts";
import type { View, WorkspaceSettings } from "../workspace/view.ts";

/** A value a `set` wrote at one path: the value stored before its first write, and its last. */
export interface Written {
  readonly block: BlockId | null;
  readonly stored: unknown;
  readonly value: unknown;
}

/**
 * What a command changed. `blocks` are the blocks it added, removed or
 * changed; `manifests` those of them whose manifest changed, which `settle`
 * completes, orders and checks; `paths` the `[target, property]` of every
 * value a `set` stored that differs from the one stored before, and for the
 * other commands the address each acted on. `written` holds, by path, each
 * value a `set` wrote that reaches no further than its path; `reaching` the
 * blocks a change reached past its path in (a whole manifest replaced, a
 * timeline moved, placed or grouped), which only the whole block compares.
 */
export interface ChangeSet {
  readonly blocks: Set<BlockId>;
  readonly manifests: Set<BlockId>;
  readonly paths: PathSegment[][];
  readonly written: Map<string, Written>;
  readonly reaching: Set<BlockId>;
}

/**
 * Whether a stored value and a value to store are the same JSON, either of
 * them possibly absent: a setter that would store what is stored writes
 * nothing.
 */
export function sameJson(stored: unknown, value: unknown): boolean {
  return (
    stored === value || (stored !== undefined && value !== undefined && jsonEqual(stored, value))
  );
}

/** A change set recording nothing yet. */
export function emptyChanges(): ChangeSet {
  return {
    blocks: new Set(),
    manifests: new Set(),
    paths: [],
    written: new Map(),
    reaching: new Set(),
  };
}

function noted(
  changes: ChangeSet,
  path: readonly PathSegment[],
  block: BlockId | null,
  manifest: boolean,
): void {
  changes.paths.push([...path]);
  if (block === null) return;
  changes.blocks.add(block);
  if (manifest) changes.manifests.add(block);
}

/**
 * Record a change at `path` that may reach past the value there: of the
 * workspace settings when `block` is null, of the block otherwise, and with
 * `manifest` of its manifest too.
 */
export function record(
  changes: ChangeSet,
  path: readonly PathSegment[],
  block: BlockId | null,
  manifest = false,
): void {
  noted(changes, path, block, manifest);
  if (block !== null) changes.reaching.add(block);
}

/**
 * Record a `set` that wrote `value` at `path` where `stored` was, and changed
 * nothing else: of the workspace settings when `block` is null, of the block
 * otherwise, and with `manifest` of its manifest too.
 */
export function recordValue(
  changes: ChangeSet,
  path: readonly PathSegment[],
  block: BlockId | null,
  manifest: boolean,
  stored: unknown,
  value: unknown,
): void {
  noted(changes, path, block, manifest);
  const key = JSON.stringify(path);
  const first = changes.written.get(key);
  changes.written.set(key, { block, stored: first === undefined ? stored : first.stored, value });
}

export function withSettings(view: View, settings: Partial<WorkspaceSettings>): View {
  return { ...view, settings: { ...view.settings, ...settings } };
}

export function withBlock(view: View, block: Block): View {
  return { ...view, blocks: { ...view.blocks, [block.id]: block } };
}

/**
 * `timeline` as the child `at` locates: its offset, unless it states one,
 * the located child's.
 */
function asChild(at: Located, timeline: TimelineManifest): ChildTimeline {
  const offset = timeline.offset ?? at.timeline.offset;
  if (offset === undefined) throw new Error(`child ${at.timeline.id} carries its offset`);
  return { ...timeline, offset };
}

/** `manifest` with the timeline `at` locates replaced by `timeline`. */
export function replaceTimeline(
  manifest: Manifest,
  at: Located,
  timeline: TimelineManifest,
): Manifest {
  const index = at.path.at(-1);
  const { parent } = at;
  if (parent === undefined) {
    return {
      ...manifest,
      timelines: manifest.timelines.map((item, at) => (at === index ? timeline : item)),
    };
  }
  const child = asChild(at, timeline);
  const children = parent.timeline.children.map((item, at) => (at === index ? child : item));
  return replaceTimeline(manifest, parent, { ...parent.timeline, children });
}

/** The view with the timeline `at` locates in `block`'s manifest replaced by `timeline`. */
export function withTimeline(
  view: View,
  block: Block,
  at: Located,
  timeline: TimelineManifest,
): View {
  return withBlock(view, { ...block, manifest: replaceTimeline(block.manifest, at, timeline) });
}

/** The entry `index` of kind `kind` in `timeline`. */
export function entryAt<K extends EntryKind>(
  timeline: TimelineManifest,
  kind: K,
  index: number,
): EntryTypes[K] | undefined {
  return ENTRY_LISTS[kind].get(timeline)[index];
}

/** `timeline` with the entry `index` of kind `kind` replaced by `entry`. */
export function withEntryAt<K extends EntryKind>(
  timeline: TimelineManifest,
  kind: K,
  index: number,
  entry: EntryTypes[K],
): TimelineManifest {
  const list = ENTRY_LISTS[kind];
  return list.replace(
    timeline,
    list.get(timeline).map((item, at) => (at === index ? entry : item)),
  );
}

/**
 * `timeline` with `member` of the entry `index` of kind `kind` set to
 * `value`; `timeline` itself when the entry holds that value already.
 */
export function withEntryMember<K extends EntryKind, M extends keyof EntryTypes[K] & string>(
  timeline: TimelineManifest,
  kind: K,
  index: number,
  member: M,
  value: EntryTypes[K][M],
): TimelineManifest {
  const entry = entryAt(timeline, kind, index);
  if (entry === undefined) throw new Error(`${timeline.id} lists ${kind} ${index}`);
  if (sameJson(entry[member], value)) return timeline;
  const next: EntryTypes[K] = { ...entry, [member]: value };
  return withEntryAt(timeline, kind, index, next);
}

/** `timeline` with `entry` appended to its list of kind `kind`. */
export function withEntryAdded<K extends EntryKind>(
  timeline: TimelineManifest,
  kind: K,
  entry: EntryTypes[K],
): TimelineManifest {
  const list = ENTRY_LISTS[kind];
  return list.replace(timeline, [...list.get(timeline), entry]);
}

/** `object` with `key` set to `value`, or without `key` when `value` is undefined. */
export function withKey<T>(
  object: { readonly [key: string]: T },
  key: string,
  value: T | undefined,
): { readonly [key: string]: T } {
  if (value !== undefined) return { ...object, [key]: value };
  return Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
}
