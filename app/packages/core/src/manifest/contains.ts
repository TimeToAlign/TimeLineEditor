/** Containment of a manifest's elements: what an editor on a timeline or a group edits. */

import { elementOf, indexOf } from "../workspace/address.ts";
import { partAddress } from "./files.ts";
import type { Manifest } from "./types.ts";

/** `contains` of one manifest and one container, for many elements. */
export function containsIn(manifest: Manifest, container: string): (element: string) => boolean {
  const { ancestry, owners } = indexOf(manifest);
  const within = (timeline: string) => (element: string) => {
    const owner = owners.get(elementOf(manifest, element));
    return owner !== undefined && (ancestry.get(owner) ?? []).includes(timeline);
  };
  if (ancestry.has(container)) return within(container);
  const group = manifest.groups.find((item) => item.id === container);
  if (group === undefined) return () => false;
  const members = group.members.map(within);
  const title = partAddress(container, "name");
  return (element) =>
    element === container || element === title || members.some((member) => member(element));
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
