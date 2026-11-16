/**
 * The typed edits a command makes to a view: a block replaced, a timeline
 * replaced where it lies in its manifest (its timestamps at its end
 * following a new length), an entry of a kind replaced in its
 * timeline's list (`ENTRY_LISTS`). Every edit returns a new value and shares what it leaves
 * unchanged. The change set records what a command changed, for the store's
 * no-op refusal, for `settle`, and for the guard of an open editor.
 */

import type { PathSegment } from "../json.ts";
import { jsonEqual } from "../json.ts";
import { namedTimestamps } from "../manifest/elements.ts";
import type { EntryKind, EntryTypes } from "../manifest/files.ts";
import { ENTRY_LISTS } from "../manifest/files.ts";
import { lengthOf } from "../manifest/invariants.ts";
import type { Located } from "../manifest/tree.ts";
import type {
  ChildTimeline,
  Manifest,
  NamedTimestamp,
  TimelineManifest,
} from "../manifest/types.ts";
import { axisCoordinate } from "../number/coordinate.ts";
import { compareReal, realOf } from "../number/real.ts";
import type { Address } from "../workspace/address.ts";
import type { Block, BlockId } from "../workspace/blocks.ts";
import type { View } from "../workspace/view.ts";

/** A value a `set` wrote at one path: the value stored before its first write, and its last. */
export interface Written {
  readonly block: BlockId | null;
  readonly stored: unknown;
  readonly value: unknown;
}

/**
 * What a command changed. `blocks` are the blocks it added, removed or
 * changed; `manifests` those of them whose manifest changed, which `settle`
 * completes, orders and checks; `paths` the `[<target's address key>,
 * property]` of every value a `set` stored that differs from the one stored
 * before, and for the other commands the path each acted on; `targets` the
 * address of every target a change was made at. `written` holds, by path, each
 * value a `set` wrote that reaches no further than its path; `reaching` the
 * blocks a change reached past its path in (a whole manifest replaced, a
 * timeline moved, placed or grouped), which only the whole block compares.
 */
export interface ChangeSet {
  readonly blocks: Set<BlockId>;
  readonly manifests: Set<BlockId>;
  readonly paths: PathSegment[][];
  readonly targets: Address[];
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
    targets: [],
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
 * workspace when `block` is null, of the block otherwise, and with
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
 * nothing else: of the workspace when `block` is null, of the block
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

/** `manifest` with the timeline `at` locates replaced by `timeline`, where it lies. */
function placedTimeline(manifest: Manifest, at: Located, timeline: TimelineManifest): Manifest {
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
  return placedTimeline(manifest, parent, { ...parent.timeline, children });
}

/**
 * The named timestamps of `timeline` lying exactly at its end, in
 * canonical order; none where its length is unknown.
 */
export function timestampsAtEnd(
  manifest: Manifest,
  timeline: TimelineManifest,
): readonly NamedTimestamp[] {
  const length = lengthOf(timeline);
  if (length === null) return [];
  const end = realOf(length);
  return namedTimestamps(manifest, timeline.id).filter(
    ({ coordinate }) => compareReal(realOf(axisCoordinate(coordinate, timeline)), end) === 0,
  );
}

/**
 * `manifest` with the timeline `at` locates replaced by `timeline`. Where
 * the new timeline's length is known and another than the old one's, the
 * named timestamps lying at the old end move to the new one: a timestamp
 * at a timeline's end stays at its end whatever changes the length.
 */
export function replaceTimeline(
  manifest: Manifest,
  at: Located,
  timeline: TimelineManifest,
): Manifest {
  const placed = placedTimeline(manifest, at, timeline);
  const { length } = timeline;
  if (length === null || sameJson(at.timeline.length, length)) return placed;
  const following = timestampsAtEnd(placed, at.timeline);
  if (following.length === 0) return placed;
  const timestamps = placed.graphical?.timestamps ?? [];
  return withTimestamps(
    placed,
    timestamps.map((item) => (following.includes(item) ? { ...item, coordinate: length } : item)),
  );
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

/**
 * `manifest` with its named timestamps replaced by `timestamps`, its
 * `graphical` object's other members kept (and created when it has none).
 */
export function withTimestamps(
  manifest: Manifest,
  timestamps: readonly NamedTimestamp[],
): Manifest {
  return { ...manifest, graphical: { ...manifest.graphical, timestamps } };
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
