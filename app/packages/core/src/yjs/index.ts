/**
 * One manifest as nested Y.Maps.
 *
 * Coordinates, map payloads, regions, flow entries, metadata, graphical
 * rules, measure maps and metric hierarchies are atomic compact-JSON strings.
 * Breaks and jumps use keyed maps because Yjs 13.6 can merge adjacent array
 * entries across undo and redo. The caller owns the Y.Doc transaction.
 */

import { canonicalOrder, compactJson, parseJson } from "@timetoalign/timeskeleton";
import * as Y from "yjs";
import { canonicalText, jsonEqual } from "../json.ts";
import type {
  ChildEntry,
  ConversionMap,
  FlowControl,
  Manifest,
  Region,
  TimelineManifest,
} from "../manifest/types.ts";
import { TIMELINE_KEYS } from "../manifest/types.ts";

type Keyed<T> = { readonly [key: string]: T };
type Keys = () => string;

function encode(value: unknown): string {
  return compactJson(value as never);
}

function decode(text: unknown): unknown {
  return parseJson(text as string);
}

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

let detachedKeySource = 0;

function keysFor(map: Y.Map<unknown>): Keys {
  const ydoc = map.doc;
  const prefix =
    ydoc === null
      ? `detached:${detachedKeySource++}`
      : `${ydoc.clientID}:${Y.getState(ydoc.store, ydoc.clientID)}`;
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
  for (const [id, entry] of Object.entries(timeline.children)) {
    children.set(id, childMap(entry, keys));
  }
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
    conversion_maps: atoms(byKey(timeline.conversion_maps, (entry) => entry.id)),
    regions: atoms(byKey(timeline.regions, (entry) => entry.name)),
    flow_control: flowMap(timeline.flow_control, keys),
    measure_map: encode(timeline.measure_map),
    metric_hierarchy: encode(timeline.metric_hierarchy),
  });
}

/** Build an unattached Y.Map holding one manifest. */
export function manifestMap(manifest: Manifest): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  const keys = keysFor(map);
  map.set("meta", encode(manifest.meta));
  map.set("timeline", timelineMap(manifest.timeline, keys));
  if (manifest.graphical !== undefined) map.set("graphical", encode(manifest.graphical));
  return map;
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

/** Read one manifest in canonical order. */
export function readManifest(map: Y.Map<unknown>): Manifest {
  const base: Manifest = {
    meta: decode(map.get("meta")) as Manifest["meta"],
    timeline: readTimeline(map.get("timeline") as Y.Map<unknown>),
  };
  const graphical = map.get("graphical");
  return canonicalOrder<Manifest>(
    graphical === undefined
      ? base
      : { ...base, graphical: decode(graphical) as NonNullable<Manifest["graphical"]> },
  );
}

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
      syncKeyed(
        children,
        before.children,
        after.children,
        (entry) => childMap(entry, keys),
        (id, oldEntry, entry) => {
          const child = children.get(id) as Y.Map<unknown>;
          if (!jsonEqual(oldEntry.offset, entry.offset)) child.set("offset", encode(entry.offset));
          syncTimeline(
            child.get("timeline") as Y.Map<unknown>,
            oldEntry.timeline,
            entry.timeline,
            keys,
          );
        },
      );
    } else if (key === "conversion_maps") {
      const id = (entry: ConversionMap) => entry.id;
      syncAtoms(
        map.get(key) as Y.Map<unknown>,
        byKey(before.conversion_maps, id),
        byKey(after.conversion_maps, id),
      );
    } else if (key === "regions") {
      const name = (entry: Region) => entry.name;
      syncAtoms(
        map.get(key) as Y.Map<unknown>,
        byKey(before.regions, name),
        byKey(after.regions, name),
      );
    } else if (key === "flow_control") {
      const flow = map.get(key) as Y.Map<unknown>;
      const next = after.flow_control;
      syncEntries(
        flow.get("breaks") as Y.Map<unknown>,
        before.flow_control.breaks,
        next.breaks,
        keys,
      );
      syncEntries(flow.get("jumps") as Y.Map<unknown>, before.flow_control.jumps, next.jumps, keys);
      syncAtoms(flow.get("markers") as Y.Map<unknown>, before.flow_control.markers, next.markers);
    } else if (!jsonEqual(old, value)) {
      map.set(key, ATOM_KEYS.has(key) ? encode(value) : value);
    }
  }
}

/** Write only the changed nested values. The caller owns the Y.Doc transaction. */
export function syncManifest(map: Y.Map<unknown>, manifest: Manifest): void {
  const before = readManifest(map);
  const keys = keysFor(map);
  if (!jsonEqual(before.meta, manifest.meta)) map.set("meta", encode(manifest.meta));
  if (manifest.graphical === undefined) {
    if (before.graphical !== undefined) map.delete("graphical");
  } else if (before.graphical === undefined || !jsonEqual(before.graphical, manifest.graphical)) {
    map.set("graphical", encode(manifest.graphical));
  }
  syncTimeline(map.get("timeline") as Y.Map<unknown>, before.timeline, manifest.timeline, keys);
}
