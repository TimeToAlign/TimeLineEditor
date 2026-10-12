/** What removing a selection takes away besides the selection itself. */

import type { Manifest, TimelineManifest } from "@timetoalign/tilie-core";
import { manifestElements, orderedChildren, timelineAncestry } from "@timetoalign/tilie-core";

/** The element an element address names: its parts (`T/name`, `R/label`, …) stand for it. */
export function ownerOf(address: string): string {
  const slash = address.indexOf("/");
  return slash < 0 ? address : address.slice(0, slash);
}

/**
 * The addresses that removing the selected elements of `manifest` would
 * also take away: every timeline below a selected one, every map, region,
 * break, jump and marker those timelines and the selected elements own, and
 * the parts of all of them. A selected part stands for its element; the
 * root is never removed. The selected addresses, and the parts of a
 * selected element, are left out: they show as selected.
 */
export function affectedBy(
  manifest: Manifest,
  selectedElementIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const root = manifest.timeline.id;
  const owners = new Set([...selectedElementIds].map(ownerOf));
  owners.delete(root);
  if (owners.size === 0) return new Set();
  const removed = new Set(owners);
  for (const [id, line] of timelineAncestry(manifest)) {
    if (id !== root && line.some((ancestor) => owners.has(ancestor))) removed.add(id);
  }
  const visit = (timeline: TimelineManifest): void => {
    if (removed.has(timeline.id)) {
      const { breaks, jumps, markers } = timeline.flow_control;
      for (const items of [timeline.conversion_maps, timeline.regions, breaks, jumps, markers]) {
        for (const item of items) removed.add(item.id);
      }
    }
    for (const child of orderedChildren(timeline)) visit(child.timeline);
  };
  visit(manifest.timeline);
  const addresses = [
    ...manifestElements(manifest).flatMap((key) => (key.address === null ? [] : [key.address])),
    ...removed,
  ];
  return new Set(
    addresses.filter(
      (address) =>
        removed.has(ownerOf(address)) &&
        !selectedElementIds.has(address) &&
        !selectedElementIds.has(ownerOf(address)),
    ),
  );
}
