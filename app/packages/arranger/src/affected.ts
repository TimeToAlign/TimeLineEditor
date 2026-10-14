/** What removing a selection takes away besides the selection itself. */

import type { Manifest, TimelineManifest } from "@timetoalign/tilie-core";
import {
  elementAddress,
  elementOfIn,
  isRemovableIn,
  manifestElements,
  manifestKind,
  manifestRoots,
  orderedChildren,
  timelineAncestry,
} from "@timetoalign/tilie-core";

/**
 * The addresses that removing the selected elements of `manifest` would
 * also take away: every timeline below a selected one, every map, region,
 * break, jump and marker those timelines and the selected elements own, and
 * the parts of all of them. A selected part stands for its element (core's
 * `elementOf`); what core does not remove (core's `isRemovable`) takes
 * nothing with it. The selected addresses, and the parts of a selected
 * element, are left out: they show as selected.
 */
export function affectedBy(
  manifest: Manifest,
  selectedElementIds: ReadonlySet<string>,
): ReadonlySet<string> {
  const element = elementOfIn(manifest);
  const removable = isRemovableIn(manifest);
  const owners = new Set([...selectedElementIds].map(element).filter(removable));
  if (owners.size === 0) return new Set();
  const removed = new Set(owners);
  for (const [id, line] of timelineAncestry(manifest)) {
    if (removable(id) && line.some((ancestor) => owners.has(ancestor))) {
      removed.add(id);
    }
  }
  const qualified = manifestKind(manifest) !== "timeline";
  for (const root of manifestRoots(manifest)) {
    const address = (id: string) => elementAddress(qualified ? root.id : null, id);
    const visit = (timeline: TimelineManifest): void => {
      if (removed.has(timeline.id)) {
        const { breaks, jumps, markers } = timeline.flow_control;
        for (const items of [timeline.conversion_maps, timeline.regions, breaks, jumps, markers]) {
          for (const item of items) removed.add(address(item.id));
        }
      }
      for (const child of orderedChildren(timeline)) visit(child.timeline);
    };
    visit(root);
  }
  const addresses = [
    ...manifestElements(manifest).flatMap((key) => (key.address === null ? [] : [key.address])),
    ...removed,
  ];
  return new Set(
    addresses.filter(
      (address) =>
        removed.has(element(address)) &&
        !selectedElementIds.has(address) &&
        !selectedElementIds.has(element(address)),
    ),
  );
}
