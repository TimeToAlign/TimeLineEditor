/** Containment of a manifest's elements: what an editor on a timeline or a group edits. */

import { timelineAncestry } from "./elements.ts";
import { ENTRY_KINDS, elementAddress, elementOfIn, entriesOf } from "./files.ts";
import type { Located } from "./tree.ts";
import { rootPaths, searchTree } from "./tree.ts";
import type { Manifest } from "./types.ts";

/**
 * The timeline an element belongs to (drawing.md section 2.2): a timeline
 * itself, the timeline holding a map, region, break, jump or marker, the
 * owner of a part; `undefined` for a group, its title, the manifest's title
 * and any address the manifest does not hold.
 */
function ownersIn(
  manifest: Manifest,
  ancestry: ReadonlyMap<string, readonly string[]>,
): (element: string) => string | undefined {
  const entries = new Map<string, string>();
  for (const root of rootPaths(manifest)) {
    searchTree({ ...root, parent: undefined }, (at: Located) => {
      for (const kind of ENTRY_KINDS) {
        for (const entry of entriesOf(at.timeline, kind)) {
          entries.set(elementAddress(root.timeline.id, entry.id as string), at.timeline.id);
        }
      }
      return undefined;
    });
  }
  const elementOf = elementOfIn(manifest);
  return (element) => {
    const own = elementOf(element);
    return ancestry.has(own) ? own : entries.get(own);
  };
}

/** `contains` of one manifest and one container, its timelines read once for many elements. */
export function containsIn(manifest: Manifest, container: string): (element: string) => boolean {
  const ancestry = timelineAncestry(manifest);
  const owner = ownersIn(manifest, ancestry);
  const within = (timeline: string) => (element: string) => {
    const own = owner(element);
    return own !== undefined && (ancestry.get(own) as readonly string[]).includes(timeline);
  };
  if (ancestry.has(container)) return within(container);
  const group = manifest.groups.find((item) => item.id === container);
  if (group === undefined) return () => false;
  const members = group.members.map(within);
  return (element) =>
    element === container ||
    element === `${container}/name` ||
    members.some((member) => member(element));
}

/**
 * Whether `element` lies inside `container`, both element addresses of
 * `manifest` (`element` may name a part). A timeline contains itself, every
 * element belonging to it or to a descendant, and their parts; an ancestor
 * line's address names the ancestor and lies outside. A group contains
 * itself, its name and whatever a member contains. Any other element
 * contains nothing.
 */
export function contains(manifest: Manifest, container: string, element: string): boolean {
  return containsIn(manifest, container)(element);
}
