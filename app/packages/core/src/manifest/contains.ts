/** Containment of a manifest's elements: what an editor on a timeline or a group edits. */

import { indexOf } from "../workspace/address.ts";
import type { ElementAddress } from "./address.ts";
import { entriesOf } from "./files.ts";
import { FlowMapError } from "./flowmaps.ts";
import { windowsOf } from "./switched.ts";
import type { Manifest, TimelineManifest } from "./types.ts";

const NOTHING_SHOWN: ReadonlySet<string> = new Set();

const shownByManifest = new WeakMap<Manifest, Map<string, ReadonlySet<string>>>();

/**
 * The IDs of the elements the windows of the virtual timeline `virtual` of
 * `manifest` show (TimeToShare's `docs/drawing.md`, section 8.10, Windows),
 * which keep their sources' addresses: the regions, conversion maps and
 * named timestamps held by a chunk's source or by a descendant of it, but
 * no Region a chunk of its FlowMap plays (that Region is the segment
 * itself). None where its map is no FlowMap that resolves. Memoised by the
 * manifest.
 */
export function windowElements(manifest: Manifest, virtual: string): ReadonlySet<string> {
  let byVirtual = shownByManifest.get(manifest);
  if (byVirtual === undefined) {
    byVirtual = new Map();
    shownByManifest.set(manifest, byVirtual);
  }
  let found = byVirtual.get(virtual);
  if (found === undefined) {
    found = shownBy(manifest, virtual);
    byVirtual.set(virtual, found);
  }
  return found;
}

function shownBy(manifest: Manifest, virtual: string): ReadonlySet<string> {
  const map = (manifest.virtual_timelines ?? []).find((item) => item.id === virtual)?.map;
  if (map === undefined) return NOTHING_SHOWN;
  let pieces: ReturnType<typeof windowsOf>["chunks"];
  try {
    pieces = windowsOf(manifest, map).chunks;
  } catch (error) {
    if (error instanceof FlowMapError) return NOTHING_SHOWN;
    throw error;
  }
  const played = new Set<string>();
  const sources = new Map<string, TimelineManifest>();
  for (const list of pieces.values()) {
    for (const { source, region } of list) {
      sources.set(source.id, source);
      if (region !== null) played.add(region);
    }
  }
  const timelines = new Set<string>();
  const shown = new Set<string>();
  const visit = (timeline: TimelineManifest) => {
    if (timelines.has(timeline.id)) return;
    timelines.add(timeline.id);
    for (const kind of ["region", "map"] as const) {
      for (const entry of entriesOf(timeline, kind)) {
        if (!played.has(entry.id)) shown.add(entry.id);
      }
    }
    for (const child of timeline.children) visit(child);
  };
  for (const source of sources.values()) visit(source);
  for (const timestamp of manifest.graphical?.timestamps ?? []) {
    if (timelines.has(timestamp.timeline)) shown.add(timestamp.id);
  }
  return shown;
}

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
  if (ancestry.has(container)) {
    const own = within(container);
    const shown = windowElements(manifest, container);
    if (shown.size === 0) return own;
    return (element) => own(element) || (element.id !== undefined && shown.has(element.id));
  }
  const group = manifest.groups.find((item) => item.id === container);
  if (group === undefined) return () => false;
  const members = group.members.map((member) => containsIn(manifest, member));
  return (element) => element.id === container || members.some((member) => member(element));
}

/**
 * Whether `element`, an element address of `manifest` (it may name a part,
 * a band or a card), lies inside `container`, the ID of a timeline, a
 * virtual timeline or a group. A timeline contains itself, every element
 * belonging to it or to a descendant, and their parts; an ancestor line's
 * address names the ancestor and lies outside. A virtual timeline contains
 * itself, its cards, bands and chunks, the named timestamps and elisions
 * lying on it, and what its chunks' windows show at their sources'
 * addresses (`windowElements`): those regions, conversion maps and named
 * timestamps are edited from the virtual card's editor, every drawing of
 * them changing at once. A group contains its frame, its title and
 * whatever a member contains. Any other element contains nothing.
 */
export function contains(manifest: Manifest, container: string, element: ElementAddress): boolean {
  return containsIn(manifest, container)(element);
}
