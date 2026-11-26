/**
 * The tree of a manifest's timelines: its roots and their descendants, the
 * one search through them, and what a timeline's place in it makes it (a
 * segment, its ancestry, the groups it lies in).
 */

import type { PathSegment } from "../json.ts";
import type { Manifest, TimelineManifest } from "./types.ts";

/** What the search reads of a manifest: its root timelines. */
export type Roots = Pick<Manifest, "timelines">;

/** A root timeline of a manifest and its path from the manifest's top. */
export interface RootPath {
  readonly timeline: TimelineManifest;
  readonly path: readonly PathSegment[];
}

/** The root timelines of a manifest with their paths, `["timelines", <index>]`. */
export function rootPaths(manifest: Roots): RootPath[] {
  return manifest.timelines.map((timeline, index) => ({ timeline, path: ["timelines", index] }));
}

/** A timeline inside a manifest: its value, its path from the manifest's top, its parent. */
export interface Located extends RootPath {
  readonly parent: Located | undefined;
}

/** Every timeline of a manifest located once: in pre-order, and by ID. */
interface LocatedTimelines {
  readonly inOrder: readonly Located[];
  readonly byId: ReadonlyMap<string, Located>;
}

const locatedTimelines = new WeakMap<Roots, LocatedTimelines>();

/**
 * Every timeline of a manifest, located, built in one walk and memoised by
 * identity: `inOrder` root by root, each timeline before its children in
 * `children` order; `byId` the first of them carrying each ID.
 */
function locatedOf(manifest: Roots): LocatedTimelines {
  const known = locatedTimelines.get(manifest);
  if (known !== undefined) return known;
  const inOrder: Located[] = [];
  const byId = new Map<string, Located>();
  const visit = (at: Located) => {
    inOrder.push(at);
    if (!byId.has(at.timeline.id)) byId.set(at.timeline.id, at);
    at.timeline.children.forEach((timeline, index) => {
      visit({ timeline, path: [...at.path, "children", index], parent: at });
    });
  };
  for (const root of rootPaths(manifest)) visit({ ...root, parent: undefined });
  const located = { inOrder, byId };
  locatedTimelines.set(manifest, located);
  return located;
}

/**
 * Every timeline of a manifest, located: root by root, each timeline before
 * its children, in `children` order.
 */
export function timelinesInOrder(manifest: Roots): readonly Located[] {
  return locatedOf(manifest).inOrder;
}

/**
 * The timeline carrying `id` among a manifest's roots and their
 * descendants, located: the first in `timelinesInOrder`.
 */
export function locateTimeline(manifest: Roots, id: string): Located | undefined {
  return locatedOf(manifest).byId.get(id);
}

/** Whether the timeline at `at` is a segment: a child of a segment line. */
export function isSegmentAt(at: Located): boolean {
  return at.parent?.timeline.is_segment_line === true;
}

/** Whether timeline `id` of `manifest` is a segment (`isSegmentAt`); false for an id no timeline carries. */
export function isSegment(manifest: Manifest, id: string): boolean {
  const at = locateTimeline(manifest, id);
  return at !== undefined && isSegmentAt(at);
}

/**
 * The timeline carrying `id` among a manifest's roots and their descendants;
 * `undefined` for an id no timeline carries, such as a group's, the
 * manifest's or an element address `<root>/<id>`.
 */
export function findTimeline(manifest: Roots, id: string): TimelineManifest | undefined {
  return locateTimeline(manifest, id)?.timeline;
}

/**
 * Every timeline id mapped to the ids from its root down to it, for every
 * root of the manifest; the length of the list is the timeline's depth.
 */
export function timelineAncestry(manifest: Manifest): Map<string, readonly string[]> {
  const ancestry = new Map<string, readonly string[]>();
  const collect = (timeline: TimelineManifest, path: readonly string[]) => {
    const own = [...path, timeline.id];
    ancestry.set(timeline.id, own);
    for (const child of timeline.children) collect(child, own);
  };
  for (const root of manifest.timelines) collect(root, []);
  return ancestry;
}

/**
 * `timelineAncestry` with every virtual timeline of `manifest` added as its
 * own ancestry: it lies in no tree, so it contains what belongs to it and
 * nothing holds it, and a group naming it holds it as any member.
 */
export function memberAncestry(manifest: Manifest): Map<string, readonly string[]> {
  const ancestry = timelineAncestry(manifest);
  for (const { id } of manifest.virtual_timelines ?? [])
    if (!ancestry.has(id)) ancestry.set(id, [id]);
  return ancestry;
}

/**
 * The groups of `manifest` having the timeline `timeline` as a member, in
 * the order of `groups`: those whose `members` list it or one of its
 * ancestors, since a member's descendants are drawn inside the member's
 * card in the group's frame; a virtual timeline, which has no ancestors,
 * is in those listing it. An ancestor of a listed member is in none of
 * them; a timeline the manifest does not hold is in none. `ancestry` is
 * the manifest's `memberAncestry`, given where the caller holds it.
 */
export function groupsHolding(
  manifest: Manifest,
  timeline: string,
  ancestry: ReadonlyMap<string, readonly string[]> = memberAncestry(manifest),
): Manifest["groups"] {
  const lineage = ancestry.get(timeline);
  if (lineage === undefined) return [];
  return manifest.groups.filter((group) => lineage.some((id) => group.members.includes(id)));
}
