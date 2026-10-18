/**
 * The tree of a manifest's timelines: its roots and their descendants, and
 * the one search through them.
 */

import type { PathSegment } from "../json.ts";
import type { Manifest, TimelineManifest } from "./types.ts";

/** A root timeline of a manifest and its path from the manifest's top. */
export interface RootPath {
  readonly timeline: TimelineManifest;
  readonly path: readonly PathSegment[];
}

/** The root timelines of a manifest with their paths, `["timelines", <index>]`. */
export function rootPaths(manifest: Manifest): RootPath[] {
  return manifest.timelines.map((timeline, index) => ({ timeline, path: ["timelines", index] }));
}

/** A timeline inside a manifest: its value, its path from the manifest's top, its parent. */
export interface Located extends RootPath {
  readonly parent: Located | undefined;
}

/**
 * The first value `pick` gives for `here` or a timeline of its subtree,
 * searched depth first in `children` order.
 */
export function searchTree<T>(here: Located, pick: (at: Located) => T | undefined): T | undefined {
  const own = pick(here);
  if (own !== undefined) return own;
  for (const [index, timeline] of here.timeline.children.entries()) {
    const child = { timeline, path: [...here.path, "children", index], parent: here };
    const found = searchTree(child, pick);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The timeline carrying `id` among a manifest's roots and their descendants, located. */
export function locateTimeline(manifest: Manifest, id: string): Located | undefined {
  for (const root of rootPaths(manifest)) {
    const found = searchTree({ ...root, parent: undefined }, (at) =>
      at.timeline.id === id ? at : undefined,
    );
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The timeline carrying `id` among a manifest's roots and their descendants;
 * `undefined` for an id no timeline carries, such as a group's, the
 * manifest's or an element address `<root>/<id>`.
 */
export function findTimeline(manifest: Manifest, id: string): TimelineManifest | undefined {
  return locateTimeline(manifest, id)?.timeline;
}
