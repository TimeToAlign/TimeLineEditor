/**
 * Removing elements from a manifest. Removing a timeline, root or child,
 * removes its subtree, its id from every group and from every display order,
 * the conversion maps naming a removed timeline as `source_id` or
 * `target_id`, every `ids` entry of a `graphical` statement addressing a
 * removed element (a statement left with no `ids` goes), and every statement
 * whose `within` names a removed timeline. Removing a group removes the group
 * only: its members stay where they are. A group left without members stays.
 */

import { elementOf } from "../workspace/address.ts";
import { elementAddress } from "./files.ts";
import type { ConversionMap, Manifest, ManifestGraphical, TimelineManifest } from "./types.ts";

const LISTS = ["conversion_maps", "regions"] as const;
const FLOW_LISTS = ["breaks", "jumps", "markers"] as const;

/** The element addresses of every map, region, break, jump and marker of one timeline. */
function entryAddresses(timeline: TimelineManifest, root: string): string[] {
  const { flow_control: flow } = timeline;
  return [
    ...LISTS.flatMap((list) => timeline[list].map((item) => elementAddress(root, item.id))),
    ...FLOW_LISTS.flatMap((list) => flow[list].map((item) => elementAddress(root, item.id))),
  ];
}

/**
 * The element addresses that removing `elements` (element addresses: a
 * timeline's or a group's id, `<root>/<id>` for any other element) removes:
 * the elements themselves, every timeline below a removed one and every map,
 * region, break, jump and marker those timelines hold, and every conversion
 * map naming a removed timeline. An address naming nothing removes nothing.
 */
export function removedBy(manifest: Manifest, elements: Iterable<string>): Set<string> {
  const asked = new Set(elements);
  const removed = new Set<string>();
  const timelines = new Set<string>();
  const visit = (timeline: TimelineManifest, root: string, inRemoved: boolean): void => {
    const gone = inRemoved || asked.has(timeline.id);
    if (gone) {
      timelines.add(timeline.id);
      removed.add(timeline.id);
    }
    for (const address of entryAddresses(timeline, root)) {
      if (gone || asked.has(address)) removed.add(address);
    }
    for (const child of timeline.children) visit(child, root, gone);
  };
  for (const root of manifest.timelines) visit(root, root.id, false);
  for (const group of manifest.groups) if (asked.has(group.id)) removed.add(group.id);
  // Only a map between two timelines names them (`source_id`, `target_id`).
  const named = (map: ConversionMap): boolean =>
    "source_id" in map && (timelines.has(map.source_id) || timelines.has(map.target_id));
  const maps = (timeline: TimelineManifest, root: string): void => {
    for (const map of timeline.conversion_maps) {
      if (named(map)) removed.add(elementAddress(root, map.id));
    }
    for (const child of timeline.children) maps(child, root);
  };
  for (const root of manifest.timelines) maps(root, root.id);
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
    flow_control: {
      ...timeline.flow_control,
      breaks: timeline.flow_control.breaks.filter(kept(root)),
      jumps: timeline.flow_control.jumps.filter(kept(root)),
      markers: timeline.flow_control.markers.filter(kept(root)),
    },
  });
  const result: Manifest = {
    ...manifest,
    timelines: manifest.timelines
      .filter((root) => !removed.has(root.id))
      .map((root) => prune(root, root.id)),
    groups: manifest.groups
      .filter((group) => !removed.has(group.id))
      .map((group) => ({ ...group, members: group.members.filter((id) => !removed.has(id)) })),
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
