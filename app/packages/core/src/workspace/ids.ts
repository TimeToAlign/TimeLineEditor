/** Minting block ids and element ids. */

import type { TimelineClass } from "../manifest/elements.ts";
import { elementAddress } from "../manifest/files.ts";
import type { Manifest, TimelineManifest } from "../manifest/types.ts";
import type { BlockId } from "./blocks.ts";
import type { View } from "./view.ts";

declare const crypto: { getRandomValues(bytes: Uint8Array): Uint8Array };

const ID_DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

/** A fresh block id: ten random base-36 characters, so concurrent peers never collide. */
export function mintBlockId(
  fill: (bytes: Uint8Array) => void = (bytes) => crypto.getRandomValues(bytes),
): BlockId {
  let id = "";
  const byte = new Uint8Array(1);
  while (id.length < 10) {
    fill(byte);
    const value = byte[0] as number;
    if (value < 252) id += ID_DIGITS[value % 36];
  }
  return id;
}

export const TIMELINE_PREFIX = {
  ContinuousLogicalTimeline: "clt",
  DiscreteLogicalTimeline: "dlt",
  ContinuousPhysicalTimeline: "cpt",
  DiscretePhysicalTimeline: "dpt",
  ContinuousGraphicalTimeline: "cgt",
  DiscreteGraphicalTimeline: "dgt",
} as const satisfies Readonly<Record<TimelineClass, string>>;

/** Every id of a timeline tree, timelines and the elements they hold alike. */
function treeIds(timeline: TimelineManifest, ids: Set<string>, timelinesOnly = false): Set<string> {
  ids.add(timeline.id);
  if (!timelinesOnly) {
    const { breaks, jumps, markers } = timeline.flow_control;
    for (const items of [timeline.conversion_maps, timeline.regions, breaks, jumps, markers]) {
      for (const item of items) ids.add(item.id);
    }
  }
  for (const child of timeline.children) treeIds(child, ids, timelinesOnly);
  return ids;
}

/** The ids of a manifest's groups and the manifest's own id. */
function frameIds(manifest: Manifest): string[] {
  const ids = manifest.groups.map((group) => group.id);
  if (manifest.id !== undefined) ids.push(manifest.id);
  return ids;
}

/**
 * The address of every element a manifest carries (`elementAddress`): the
 * ids of its timelines, its groups and the manifest's own, and `<root>/<id>`
 * for every map, region, break, jump and marker of a root's tree.
 */
export function manifestIds(manifest: Manifest): Set<string> {
  const ids = new Set<string>();
  for (const timeline of manifest.timelines) {
    const timelines = treeIds(timeline, new Set(), true);
    for (const id of treeIds(timeline, new Set())) {
      ids.add(timelines.has(id) ? id : elementAddress(timeline.id, id));
    }
  }
  for (const id of frameIds(manifest)) ids.add(id);
  return ids;
}

/**
 * The ids a new element of a manifest may not carry, as the manifest scopes
 * them: every id of the tree the element goes into (the tree holding the
 * timeline `into`, or every tree when `into` is omitted); for a new timeline
 * also every timeline id of the manifest, every group id and the manifest's
 * id. A map, region, break, jump or marker may carry a group's id, the
 * manifest's id or an id of another tree.
 */
export function takenIds(manifest: Manifest, timeline: boolean, into?: string): Set<string> {
  const ids = new Set<string>();
  const roots = manifest.timelines;
  const tree = roots.find((root) => into !== undefined && treeIds(root, new Set(), true).has(into));
  for (const root of tree === undefined ? roots : [tree]) treeIds(root, ids);
  if (timeline) {
    for (const root of roots) treeIds(root, ids, true);
    for (const id of frameIds(manifest)) ids.add(id);
  }
  return ids;
}

/**
 * The smallest `{prefix}_{N}`, `N` from 1, free for a new element of the
 * block's manifest (`takenIds`): a timeline when `prefix` is one of
 * `TIMELINE_PREFIX`, added into the tree of the timeline `into`.
 */
export function nextId(view: View, block: BlockId, prefix: string, into?: string): string {
  const manifest = view.blocks[block]?.manifest;
  const timeline = (Object.values(TIMELINE_PREFIX) as string[]).includes(prefix);
  const ids = manifest === undefined ? new Set<string>() : takenIds(manifest, timeline, into);
  let suffix = 1;
  while (ids.has(`${prefix}_${suffix}`)) suffix += 1;
  return `${prefix}_${suffix}`;
}
