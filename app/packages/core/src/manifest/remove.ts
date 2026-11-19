/**
 * Removing elements from a manifest. Removing a timeline, root or child,
 * removes its subtree, the named timestamps lying on it, its ID from every
 * group and from every display order, every `addresses` entry of a
 * `graphical` rule addressing a removed element or a part, band or
 * card of one (a rule left with no `addresses` goes), and every
 * rule whose `within` names a removed timeline. Removing a named
 * timestamp removes it and the rules' `addresses` entries naming it
 * or its parts alike. Removing a group removes the group only: its
 * members stay where they are. A group left without members stays. Removing
 * a measure map removes it only; a measure view still naming it leaves the
 * manifest dangling, which the schema check refuses. A removed element's
 * statements go with it, and every reference to it in the statements and
 * provenance of the elements left (`withoutReferencesTo`) is taken out.
 */

import { ENTRY_KINDS, entriesOf } from "./files.ts";
import { withoutReferencesTo } from "./statements.ts";
import type { Manifest, ManifestGraphical, TimelineManifest } from "./types.ts";

/** The IDs of every map, region and flow-control element of one timeline. */
function entryIds(timeline: TimelineManifest): string[] {
  return ENTRY_KINDS.flatMap((kind) => entriesOf(timeline, kind).map((item) => item.id));
}

/**
 * The IDs that removing the elements with the IDs `elements` (timelines,
 * groups, measure maps, maps, regions, flow-control elements and named
 * timestamps) removes: the elements themselves, every timeline below a
 * removed one, every map, region and flow-control element those timelines
 * hold and every named timestamp lying on one of them. An ID naming nothing
 * removes nothing.
 */
export function removedBy(manifest: Manifest, elements: Iterable<string>): Set<string> {
  const asked = new Set(elements);
  const removed = new Set<string>();
  const visit = (timeline: TimelineManifest, inRemoved: boolean): void => {
    const gone = inRemoved || asked.has(timeline.id);
    if (gone) removed.add(timeline.id);
    for (const id of entryIds(timeline)) {
      if (gone || asked.has(id)) removed.add(id);
    }
    for (const child of timeline.children) visit(child, gone);
  };
  for (const root of manifest.timelines) visit(root, false);
  for (const group of manifest.groups) if (asked.has(group.id)) removed.add(group.id);
  for (const map of manifest.measure_maps) if (asked.has(map.id)) removed.add(map.id);
  for (const { id, timeline } of manifest.graphical?.timestamps ?? []) {
    if (asked.has(id) || removed.has(timeline)) removed.add(id);
  }
  return removed;
}

/** `manifest` with `elements` removed, and everything `removedBy` names with them. */
export function withoutElements(manifest: Manifest, elements: Iterable<string>): Manifest {
  const removed = removedBy(manifest, elements);
  if (removed.size === 0) return manifest;
  const kept = (item: { readonly id: string }) => !removed.has(item.id);
  const prune = <T extends TimelineManifest>(timeline: T): T => ({
    ...timeline,
    children: timeline.children.filter(kept).map(prune),
    conversion_maps: timeline.conversion_maps.filter(kept),
    regions: timeline.regions.filter(kept),
    flow_control: timeline.flow_control.filter(kept),
  });
  const pruned: Manifest = {
    ...manifest,
    timelines: manifest.timelines.filter(kept).map(prune),
    groups: manifest.groups
      .filter((group) => !removed.has(group.id))
      .map((group) => ({ ...group, members: group.members.filter((id) => !removed.has(id)) })),
    measure_maps: manifest.measure_maps.filter((map) => !removed.has(map.id)),
  };
  const result = withoutReferencesTo(pruned, removed);
  const { graphical } = manifest;
  if (graphical === undefined) return result;
  const changed: { -readonly [key in keyof ManifestGraphical]: ManifestGraphical[key] } = {
    ...graphical,
  };
  if (graphical.order !== undefined) {
    changed.order = Object.fromEntries(
      Object.entries(graphical.order)
        .filter(([group]) => !removed.has(group))
        .map(([group, members]) => [group, members.filter((id) => !removed.has(id))]),
    );
  }
  if (graphical.timestamps !== undefined) {
    changed.timestamps = graphical.timestamps.filter(kept);
  }
  if (graphical.rules !== undefined) {
    changed.rules = graphical.rules.flatMap((rule) => {
      const { addresses, within } = rule.select;
      if (within !== undefined && removed.has(within)) return [];
      if (addresses === undefined) return [rule];
      const [first, ...more] = addresses.filter(
        (address) => address.id === undefined || !removed.has(address.id),
      );
      if (first === undefined) return [];
      if (more.length + 1 === addresses.length) return [rule];
      return [{ ...rule, select: { ...rule.select, addresses: [first, ...more] } }];
    });
  }
  return { ...result, graphical: changed as ManifestGraphical };
}
