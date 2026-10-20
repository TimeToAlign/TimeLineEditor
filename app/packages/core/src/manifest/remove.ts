/**
 * Removing elements from a manifest. Removing a timeline, root or child,
 * removes its subtree, its id from every group and from every display order,
 * every `ids` entry of a `graphical` statement addressing a removed element
 * (a statement left with no `ids` goes), and every statement whose `within`
 * names a removed timeline. Removing a group removes the group only: its
 * members stay where they are. A group left without members stays. Removing
 * a measure map removes it only; a measure view still naming it leaves the
 * manifest dangling, which the schema check refuses.
 */

import { elementOf } from "../workspace/address.ts";
import { ENTRY_KINDS, elementAddress, entriesOf } from "./files.ts";
import type { Manifest, ManifestGraphical, TimelineManifest } from "./types.ts";

/** The element addresses of every map, region and flow-control element of one timeline. */
function entryAddresses(timeline: TimelineManifest, root: string): string[] {
  return ENTRY_KINDS.flatMap((kind) =>
    entriesOf(timeline, kind).map((item) => elementAddress(root, item.id)),
  );
}

/**
 * The element addresses that removing `elements` (element addresses: a
 * timeline's, a group's or a measure map's id, `<root>/<id>` for any other
 * element) removes: the elements themselves, every timeline below a removed
 * one and every map, region and flow-control element those timelines hold.
 * An address naming nothing removes nothing.
 */
export function removedBy(manifest: Manifest, elements: Iterable<string>): Set<string> {
  const asked = new Set(elements);
  const removed = new Set<string>();
  const visit = (timeline: TimelineManifest, root: string, inRemoved: boolean): void => {
    const gone = inRemoved || asked.has(timeline.id);
    if (gone) removed.add(timeline.id);
    for (const address of entryAddresses(timeline, root)) {
      if (gone || asked.has(address)) removed.add(address);
    }
    for (const child of timeline.children) visit(child, root, gone);
  };
  for (const root of manifest.timelines) visit(root, root.id, false);
  for (const group of manifest.groups) if (asked.has(group.id)) removed.add(group.id);
  for (const map of manifest.measure_maps) if (asked.has(map.id)) removed.add(map.id);
  return removed;
}

/** `manifest` with `elements` removed, and everything `removedBy` names with them. */
export function withoutElements(manifest: Manifest, elements: Iterable<string>): Manifest {
  const removed = removedBy(manifest, elements);
  if (removed.size === 0) return manifest;
  const kept = (root: string) => (item: { readonly id: string }) =>
    !removed.has(elementAddress(root, item.id));
  const prune = <T extends TimelineManifest>(timeline: T, root: string): T => ({
    ...timeline,
    children: timeline.children
      .filter((child) => !removed.has(child.id))
      .map((child) => prune(child, root)),
    conversion_maps: timeline.conversion_maps.filter(kept(root)),
    regions: timeline.regions.filter(kept(root)),
    flow_control: timeline.flow_control.filter(kept(root)),
  });
  const result: Manifest = {
    ...manifest,
    timelines: manifest.timelines
      .filter((root) => !removed.has(root.id))
      .map((root) => prune(root, root.id)),
    groups: manifest.groups
      .filter((group) => !removed.has(group.id))
      .map((group) => ({ ...group, members: group.members.filter((id) => !removed.has(id)) })),
    measure_maps: manifest.measure_maps.filter((map) => !removed.has(map.id)),
  };
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
  if (graphical.statements !== undefined) {
    changed.statements = graphical.statements.flatMap((statement) => {
      const { ids, within } = statement.select;
      if (within !== undefined && removed.has(within)) return [];
      if (ids === undefined) return [statement];
      const [first, ...more] = ids.filter((address) => !removed.has(elementOf(manifest, address)));
      if (first === undefined) return [];
      if (more.length + 1 === ids.length) return [statement];
      return [{ ...statement, select: { ...statement.select, ids: [first, ...more] } }];
    });
  }
  return { ...result, graphical: changed as ManifestGraphical };
}
