/** Containment of a manifest's elements: what an editor on a timeline or a group edits. */

import { indexOf } from "../workspace/address.ts";
import type { ElementAddress } from "./address.ts";
import type { Manifest } from "./types.ts";

/** `contains` of one manifest and one container, for many elements. */
export function containsIn(
  manifest: Manifest,
  container: string,
): (element: ElementAddress) => boolean {
  const { ancestry, owners } = indexOf(manifest);
  const within = (timeline: string) => (element: ElementAddress) => {
    const owner = element.id === undefined ? undefined : owners.get(element.id);
    return owner !== undefined && (ancestry.get(owner) ?? []).includes(timeline);
  };
  if (ancestry.has(container)) return within(container);
  const group = manifest.groups.find((item) => item.id === container);
  if (group === undefined) return () => false;
  const members = group.members.map(within);
  return (element) => element.id === container || members.some((member) => member(element));
}

/**
 * Whether `element`, an element address of `manifest` (it may name a part,
 * a band or a card), lies inside `container`, the ID of a timeline or a
 * group. A timeline contains itself, every element belonging to it or to a
 * descendant, and their parts; an ancestor line's address names the
 * ancestor and lies outside. A group contains its frame, its title and
 * whatever a member contains. Any other element contains nothing.
 */
export function contains(manifest: Manifest, container: string, element: ElementAddress): boolean {
  return containsIn(manifest, container)(element);
}
