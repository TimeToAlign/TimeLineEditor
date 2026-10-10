/**
 * @timetoalign/tilie-core/yjs: the document as a Yjs document, edited only
 * through the command reducers.
 *
 * Representation: one root `Y.Map` named `document` holding `meta` and
 * `manifest`; `manifest.timelines` is a `Y.Map` by id; each timeline is a
 * `Y.Map` of its members, with `children` a `Y.Map` by id of `Y.Map`s
 * `{offset, timeline}`, `conversion_maps` a `Y.Map` by map id, `regions` a
 * `Y.Map` by name, and `flow_control` a `Y.Map` whose `markers` is a
 * `Y.Map` by name and whose `breaks` and `jumps` are `Y.Map`s keyed by an
 * insertion key unique to the replica and the moment of insertion. Every
 * coordinate dict, map payload, region, break and jump entry, and `meta`,
 * `measure_map` and `metric_hierarchy`, is one atomic value: it is replaced
 * whole, never merged member by member. Lists carry no order; the canonical
 * order is derived when the document is materialized.
 *
 * Breaks and jumps are keyed rather than held in `Y.Array`s because Yjs
 * 13.6 mis-redoes array deletions: once the creation of the array's parent
 * has been undone and redone, redoing the removal of one entry also removes
 * the entry inserted after it (adjacent array items are merged, and the
 * redo deletes the merged item whole). Map entries are never merged.
 *
 * Yjs merges concurrent edits without the reducers, so a merged document
 * can break an invariant (two replicas moving one timeline under different
 * parents leave it twice). `checkDocument` reports that, and `saveDocument`
 * refuses to write it.
 */

import { canonicalOrder, compactJson, parseJson } from "@timetoalign/timeskeleton";
import * as Y from "yjs";
import { apply } from "../commands/apply.ts";
import type { Command } from "../commands/types.ts";
import type {
  ChildEntry,
  ConversionMap,
  Document,
  FlowControl,
  Region,
  TimelineManifest,
} from "../document/types.ts";
import { TIMELINE_KEYS } from "../document/types.ts";
import type { CommandError } from "../errors.ts";
import { isCommandError } from "../errors.ts";
import { canonicalText, jsonEqual } from "../json.ts";

/** The transaction origin of every edit made by `applyCommand`. */
export const LOCAL_ORIGIN: unique symbol = Symbol("@timetoalign/tilie-core local edit");

const ROOT = "document";

type Keyed<T> = { readonly [key: string]: T };

/**
 * An atomic value as Yjs stores it: one string, its compact lossless JSON
 * text, so integral floats, integers beyond 2^53 and the order of members
 * survive every replica.
 */
function encode(value: unknown): string {
  return compactJson(value as never);
}

function decode(text: unknown): unknown {
  return parseJson(text as string);
}

/** The timeline members held as atoms; the others are plain strings and booleans. */
const ATOM_KEYS: ReadonlySet<string> = new Set([
  "length",
  "meta",
  "measure_map",
  "metric_hierarchy",
]);

function byKey<T>(items: readonly T[], key: (item: T) => string): Keyed<T> {
  return Object.fromEntries(items.map((item) => [key(item), item]));
}

function filled(entries: Keyed<unknown>): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(entries)) map.set(key, value);
  return map;
}

function atoms(entries: Keyed<unknown>): Y.Map<unknown> {
  return filled(
    Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, encode(value)])),
  );
}

/** A source of keys for break and jump entries, unique within one replica. */
type Keys = () => string;

function keysFor(ydoc: Y.Doc): Keys {
  const prefix = `${ydoc.clientID}:${Y.getState(ydoc.store, ydoc.clientID)}`;
  let next = 0;
  return () => `${prefix}:${next++}`;
}

function entries(items: readonly unknown[], keys: Keys): Y.Map<unknown> {
  return filled(Object.fromEntries(items.map((item) => [keys(), encode(item)])));
}

function childMap(entry: ChildEntry, keys: Keys): Y.Map<unknown> {
  return filled({ offset: encode(entry.offset), timeline: timelineMap(entry.timeline, keys) });
}

function flowMap(flow: FlowControl, keys: Keys): Y.Map<unknown> {
  return filled({
    breaks: entries(flow.breaks, keys),
    jumps: entries(flow.jumps, keys),
    markers: atoms(flow.markers),
  });
}

function timelineMap(timeline: TimelineManifest, keys: Keys): Y.Map<unknown> {
  const children = new Y.Map<unknown>();
  for (const [id, entry] of Object.entries(timeline.children))
    children.set(id, childMap(entry, keys));
  return filled({
    id: timeline.id,
    name: timeline.name,
    class: timeline.class,
    unit: timeline.unit,
    number_type: timeline.number_type,
    length: encode(timeline.length),
    locked: timeline.locked,
    meta: encode(timeline.meta),
    children,
    conversion_maps: atoms(byKey(timeline.conversion_maps, (map) => map.id)),
    regions: atoms(byKey(timeline.regions, (region) => region.name)),
    flow_control: flowMap(timeline.flow_control, keys),
    measure_map: encode(timeline.measure_map),
    metric_hierarchy: encode(timeline.metric_hierarchy),
  });
}

/** Build a Yjs document holding `document`. The load is not an undoable edit. */
export function createYDoc(document: Document): Y.Doc {
  const ydoc = new Y.Doc();
  const root = ydoc.getMap<unknown>(ROOT);
  ydoc.transact(() => {
    const keys = keysFor(ydoc);
    const timelines = new Y.Map<unknown>();
    for (const [id, timeline] of Object.entries(document.manifest.timelines)) {
      timelines.set(id, timelineMap(timeline, keys));
    }
    root.set("meta", encode(document.meta));
    root.set("manifest", filled({ timelines }));
  });
  return ydoc;
}

function values<T>(map: Y.Map<unknown>): T[] {
  return [...map.values()].map((value) => decode(value) as T);
}

function readTimeline(map: Y.Map<unknown>): TimelineManifest {
  const children = map.get("children") as Y.Map<Y.Map<unknown>>;
  const flow = map.get("flow_control") as Y.Map<unknown>;
  const read: Record<string, unknown> = {
    children: Object.fromEntries(
      [...children.entries()].map(([id, entry]) => [
        id,
        {
          offset: decode(entry.get("offset")),
          timeline: readTimeline(entry.get("timeline") as Y.Map<unknown>),
        },
      ]),
    ),
    conversion_maps: values<ConversionMap>(map.get("conversion_maps") as Y.Map<unknown>),
    regions: values<Region>(map.get("regions") as Y.Map<unknown>),
    flow_control: {
      breaks: values(flow.get("breaks") as Y.Map<unknown>),
      jumps: values(flow.get("jumps") as Y.Map<unknown>),
      markers: Object.fromEntries(
        [...(flow.get("markers") as Y.Map<unknown>).entries()].map(([name, value]) => [
          name,
          decode(value),
        ]),
      ),
    },
  };
  return Object.fromEntries(
    TIMELINE_KEYS.map((key) => [
      key,
      key in read ? read[key] : ATOM_KEYS.has(key) ? decode(map.get(key)) : map.get(key),
    ]),
  ) as TimelineManifest;
}

/** Materialize the document held by a Yjs document, in canonical order. */
export function toDocument(ydoc: Y.Doc): Document {
  const root = ydoc.getMap<unknown>(ROOT);
  const manifest = root.get("manifest") as Y.Map<unknown> | undefined;
  if (manifest === undefined) throw new Error("the Yjs document holds no TimeSkeleton document");
  const timelines = manifest.get("timelines") as Y.Map<Y.Map<unknown>>;
  return canonicalOrder<Document>({
    meta: decode(root.get("meta")) as Document["meta"],
    manifest: {
      timelines: Object.fromEntries(
        [...timelines.entries()].map(([id, map]) => [id, readTimeline(map)]),
      ),
    },
  });
}

/** Write the difference between two keyed collections into a `Y.Map`. */
function syncKeyed<T>(
  map: Y.Map<unknown>,
  before: Keyed<T>,
  after: Keyed<T>,
  create: (value: T) => unknown,
  update: (key: string, before: T, after: T) => void,
): void {
  for (const key of Object.keys(before)) {
    if (!Object.hasOwn(after, key)) map.delete(key);
  }
  for (const [key, value] of Object.entries(after)) {
    if (!Object.hasOwn(before, key)) map.set(key, create(value));
    else if (before[key] !== value) update(key, before[key] as T, value);
  }
}

function syncAtoms<T>(map: Y.Map<unknown>, before: Keyed<T>, after: Keyed<T>): void {
  syncKeyed(map, before, after, encode, (key, old, value) => {
    if (!jsonEqual(old, value)) map.set(key, encode(value));
  });
}

/** Remove and add entries, equal by value, of a keyed collection so it holds `after`. */
function syncEntries(
  map: Y.Map<unknown>,
  before: readonly unknown[],
  after: readonly unknown[],
  keys: Keys,
): void {
  const surplus = new Map<string, number>();
  for (const item of before) {
    const text = canonicalText(item);
    surplus.set(text, (surplus.get(text) ?? 0) + 1);
  }
  const added: unknown[] = [];
  for (const item of after) {
    const text = canonicalText(item);
    const count = surplus.get(text) ?? 0;
    if (count > 0) surplus.set(text, count - 1);
    else added.push(item);
  }
  for (const [key, value] of [...map.entries()]) {
    const text = canonicalText(decode(value));
    const count = surplus.get(text) ?? 0;
    if (count > 0) {
      map.delete(key);
      surplus.set(text, count - 1);
    }
  }
  for (const item of added) map.set(keys(), encode(item));
}

function syncTimeline(
  map: Y.Map<unknown>,
  before: TimelineManifest,
  after: TimelineManifest,
  keys: Keys,
): void {
  for (const key of TIMELINE_KEYS) {
    const old = before[key];
    const value = after[key];
    if (old === value) continue;
    if (key === "children") {
      const children = map.get(key) as Y.Map<unknown>;
      const create = (entry: ChildEntry) => childMap(entry, keys);
      syncKeyed(children, before.children, after.children, create, (id, oldEntry, entry) => {
        const child = children.get(id) as Y.Map<unknown>;
        if (!jsonEqual(oldEntry.offset, entry.offset)) {
          child.set("offset", encode(entry.offset));
        }
        syncTimeline(
          child.get("timeline") as Y.Map<unknown>,
          oldEntry.timeline,
          entry.timeline,
          keys,
        );
      });
    } else if (key === "conversion_maps") {
      const id = (item: ConversionMap) => item.id;
      syncAtoms(
        map.get(key) as Y.Map<unknown>,
        byKey(before.conversion_maps, id),
        byKey(after.conversion_maps, id),
      );
    } else if (key === "regions") {
      const name = (item: Region) => item.name;
      syncAtoms(
        map.get(key) as Y.Map<unknown>,
        byKey(before.regions, name),
        byKey(after.regions, name),
      );
    } else if (key === "flow_control") {
      const flow = map.get(key) as Y.Map<unknown>;
      const { breaks, jumps, markers } = after.flow_control;
      const old = before.flow_control;
      syncEntries(flow.get("breaks") as Y.Map<unknown>, old.breaks, breaks, keys);
      syncEntries(flow.get("jumps") as Y.Map<unknown>, old.jumps, jumps, keys);
      syncAtoms(flow.get("markers") as Y.Map<unknown>, old.markers, markers);
    } else if (!jsonEqual(old, value)) {
      map.set(key, ATOM_KEYS.has(key) ? encode(value) : value);
    }
  }
}

function sync(root: Y.Map<unknown>, before: Document, after: Document, keys: Keys): void {
  if (!jsonEqual(before.meta, after.meta)) root.set("meta", encode(after.meta));
  const manifest = root.get("manifest") as Y.Map<unknown>;
  const timelines = manifest.get("timelines") as Y.Map<unknown>;
  syncKeyed(
    timelines,
    before.manifest.timelines,
    after.manifest.timelines,
    (timeline) => timelineMap(timeline, keys),
    (id, old, timeline) => syncTimeline(timelines.get(id) as Y.Map<unknown>, old, timeline, keys),
  );
}

/**
 * Apply a command to a Yjs document.
 *
 * The command runs through the pure reducer on the materialized document;
 * an accepted command is written as the minimal change in one transaction
 * whose origin is `LOCAL_ORIGIN`, a refused one writes nothing and its
 * `CommandError` is returned.
 */
export function applyCommand(ydoc: Y.Doc, command: Command): CommandError | undefined {
  const before = toDocument(ydoc);
  const after = apply(before, command);
  if (isCommandError(after)) return after;
  ydoc.transact(() => sync(ydoc.getMap<unknown>(ROOT), before, after, keysFor(ydoc)), LOCAL_ORIGIN);
  return undefined;
}

/**
 * An undo manager over the commands applied locally: one command that
 * changes the document is one undo step, and steps never merge.
 */
export function createUndoManager(ydoc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager(ydoc.getMap<unknown>(ROOT), {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    captureTimeout: 0,
  });
}
