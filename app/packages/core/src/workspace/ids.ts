/** Block ids, element ids and addresses. */

import type { TimelineClass } from "@timetoalign/timeskeleton";
import type { Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import { elementAddress, manifestGroups, manifestKind, manifestRoots } from "../manifest/files.ts";
import type { BundleFile, Manifest, TimelineManifest } from "../manifest/types.ts";
import type { BlockId } from "./blocks.ts";
import { BLOCK_ID } from "./blocks.ts";
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

export type TimelinePrefix = (typeof TIMELINE_PREFIX)[TimelineClass];

/** Every id of a timeline tree, timelines and the elements they hold alike. */
function treeIds(timeline: TimelineManifest, ids: Set<string>, timelinesOnly = false): Set<string> {
  ids.add(timeline.id);
  if (!timelinesOnly) {
    const { breaks, jumps, markers } = timeline.flow_control;
    for (const items of [timeline.conversion_maps, timeline.regions, breaks, jumps, markers]) {
      for (const item of items) ids.add(item.id);
    }
  }
  for (const child of Object.values(timeline.children)) {
    treeIds(child.timeline, ids, timelinesOnly);
  }
  return ids;
}

/** The ids of a manifest's groups and of its bundle. */
function frameIds(manifest: Manifest): string[] {
  const ids = manifestGroups(manifest).map((group) => group.id);
  if (manifestKind(manifest) === "bundle") ids.push((manifest as BundleFile).bundle.id);
  return ids;
}

/**
 * The address of every element a manifest carries (`elementAddress`): in a
 * timeline file the ids of its timelines, maps, regions, breaks, jumps and
 * markers; in a group or bundle file the ids of its timelines, groups and
 * bundle, and `<root>/<id>` for every other element of a root's tree.
 */
export function manifestIds(manifest: Manifest): Set<string> {
  const ids = new Set<string>();
  const qualified = manifestKind(manifest) !== "timeline";
  for (const timeline of manifestRoots(manifest)) {
    const timelines = treeIds(timeline, new Set(), true);
    for (const id of treeIds(timeline, new Set())) {
      ids.add(timelines.has(id) || !qualified ? id : elementAddress(timeline.id, id));
    }
  }
  for (const id of frameIds(manifest)) ids.add(id);
  return ids;
}

/**
 * The ids a new element of a manifest may not carry. In a timeline file,
 * every id of any kind. In a group or bundle file, every id of the tree the
 * element goes into (the tree holding the timeline `into`, or every tree when
 * `into` is omitted) and every group and bundle id, and for a new timeline
 * also every timeline id of the file.
 */
export function takenIds(manifest: Manifest, timeline: boolean, into?: string): Set<string> {
  const ids = new Set<string>(frameIds(manifest));
  const roots = manifestRoots(manifest);
  const tree = roots.find((root) => into !== undefined && treeIds(root, new Set(), true).has(into));
  for (const root of tree === undefined ? roots : [tree]) treeIds(root, ids);
  if (timeline) for (const root of roots) treeIds(root, ids, true);
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

/**
 * The workspace-wide name of what a command targets: `workspace`, a block
 * id, or `<block id>/<element address>`, split at the first slash; the
 * element address is root-qualified in a group or bundle block
 * (`elementAddress`).
 */
export type Address = string;

export const WORKSPACE = "workspace";

export interface ParsedAddress {
  /** `null` for the workspace. */
  readonly block: BlockId | null;
  /** `null` for the workspace or a block. */
  readonly element: string | null;
}

export function parseAddress(text: Address): ParsedAddress | Problem {
  if (text === WORKSPACE) return { block: null, element: null };
  const slash = text.indexOf("/");
  const block = slash < 0 ? text : text.slice(0, slash);
  const element = slash < 0 ? null : text.slice(slash + 1);
  if (!BLOCK_ID.test(block)) {
    return problem(ErrorCode.invalidAddress, "an address is workspace or starts with a block id", [
      text,
    ]);
  }
  if (element === "") {
    return problem(ErrorCode.invalidAddress, "an address element cannot be empty", [text]);
  }
  return { block, element };
}

export function formatAddress(value: ParsedAddress): Address {
  if (value.block === null) return WORKSPACE;
  return value.element === null ? value.block : `${value.block}/${value.element}`;
}
