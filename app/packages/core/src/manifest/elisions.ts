/**
 * The elisions of a manifest (`graphical.elisions`, TimeToShare's README
 * and `docs/drawing.md`, sections 2 and 8.9): each lies on one timeline,
 * at any depth, as a named timestamp does. An elision on a timeline that
 * lies in a group is a group elision of that group, drawn across its
 * frame; every other one is a card elision of its root's cards. Core reads
 * the stored ones; the elisions a card derives are made by the drawing
 * from the view, and core knows of them only which timelines may carry
 * them.
 */

import { memberDrawings } from "./files.ts";
import { groupsHolding, locateTimeline, timelineAncestry } from "./tree.ts";
import type { Elision, Manifest, TimelineManifest } from "./types.ts";

/**
 * The words of an elision's `display` that name its labels, in the order
 * its stack holds them (drawing.md sections 2 and 6.4, Markers): its name,
 * its ID, its elided coordinates. Each is a `label` element addressed
 * `{id: E, part: [word]}`; a derived elision, which has no ID, has no `id`
 * label, its others addressed `{id: T, part: ["elision", word]}`.
 */
export const ELISION_LABELS = ["name", "id", "coordinate"] as const;

/** A word naming one of an elision's labels. */
export type ElisionLabel = (typeof ELISION_LABELS)[number];

const NO_ELISIONS: readonly Elision[] = [];
const elisionLists = new WeakMap<Manifest, ReadonlyMap<string, readonly Elision[]>>();

/**
 * The stored elisions lying on the timeline `timeline`, card and group
 * elisions alike, in the order `graphical.elisions` lists them, which is
 * canonical (by timeline, then start, then ID) in a manifest in canonical
 * order; none when it has none. Memoised by the manifest's identity.
 */
export function elisionsOn(manifest: Manifest, timeline: string): readonly Elision[] {
  let lists = elisionLists.get(manifest);
  if (lists === undefined) {
    const built = new Map<string, Elision[]>();
    for (const elision of manifest.graphical?.elisions ?? []) {
      const list = built.get(elision.timeline);
      if (list === undefined) built.set(elision.timeline, [elision]);
      else list.push(elision);
    }
    lists = built;
    elisionLists.set(manifest, lists);
  }
  return lists.get(timeline) ?? NO_ELISIONS;
}

/** The groups each stored elision's timeline lies in, by the manifest's identity. */
const elisionGroups = new WeakMap<Manifest, ReadonlyMap<Elision, readonly string[]>>();

/**
 * The IDs of the groups the timeline of `elision` lies in (`groupsHolding`:
 * the timeline or one of its ancestors is a member), in the order of
 * `groups`: none for a card elision. Memoised by the manifest's identity.
 */
function groupsOf(manifest: Manifest, elision: Elision): readonly string[] {
  let found = elisionGroups.get(manifest);
  if (found === undefined) {
    const ancestry = timelineAncestry(manifest);
    found = new Map(
      (manifest.graphical?.elisions ?? []).map((item) => [
        item,
        groupsHolding(manifest, item.timeline, ancestry).map((group) => group.id),
      ]),
    );
    elisionGroups.set(manifest, found);
  }
  return found.get(elision) ?? [];
}

/**
 * The stored card elisions lying on the timeline `root` or on a descendant
 * of it, in the order of `graphical.elisions`: every stored elision of that
 * tree whose timeline lies in no group (drawing.md section 8.9), which
 * decides a card's `auto` mode and which Remove all takes from a root's
 * cards in one `remove`. A group elision of the tree is none of them. None
 * for an ID naming no timeline.
 */
export function elisionsUnder(manifest: Manifest, root: string): readonly Elision[] {
  const located = locateTimeline(manifest, root);
  if (located === undefined) return NO_ELISIONS;
  const tree = new Set<string>();
  const visit = (timeline: TimelineManifest) => {
    tree.add(timeline.id);
    for (const child of timeline.children) visit(child);
  };
  visit(located.timeline);
  return (manifest.graphical?.elisions ?? []).filter(
    (elision) => tree.has(elision.timeline) && groupsOf(manifest, elision).length === 0,
  );
}

/**
 * The group elisions of the group `group`: every stored elision whose
 * timeline lies in it, a member or a member's descendant (`groupsHolding`,
 * drawing.md section 8.9), in the order of `graphical.elisions`. An elision
 * on a timeline lying in several groups is a group elision of each. None
 * for an ID naming no group.
 */
export function groupElisions(manifest: Manifest, group: string): readonly Elision[] {
  return (manifest.graphical?.elisions ?? []).filter((elision) =>
    groupsOf(manifest, elision).includes(group),
  );
}

const defaultTimelines = new WeakMap<Manifest, ReadonlySet<string>>();

/**
 * The timelines on which an ancestor card may derive elisions (drawing.md
 * section 8.9), memoised by the manifest's identity: for every ancestor
 * card of a root `R` aligned to a member `M` with the ancestors `A1 = R, …,
 * Ak`, `R` and every child of `A1` to `A(k − 1)` (the depths 1 to `k`). A
 * card derives them only where its `elision-mode` is `proportional`, or
 * `auto` without a stored card elision on `R`'s tree (`elisionsUnder`),
 * and its proportion below 1; which of these timelines take a gap depends
 * on its `elision-depths`, the view the drawing is made for and the rules
 * that display children. The mode and the rest are the cascade's and the
 * drawing's, which core does not read, so this is every timeline any mode
 * lets the card derive one on. An ungrouped root's card derives none.
 */
export function defaultElisionTimelines(manifest: Manifest): ReadonlySet<string> {
  const known = defaultTimelines.get(manifest);
  if (known !== undefined) return known;
  const found = new Set<string>();
  for (const { member, root } of memberDrawings(manifest).ancestorCards) {
    found.add(root.timeline.id);
    for (const { timeline } of member.ancestors.slice(0, -1)) {
      for (const child of timeline.children) found.add(child.id);
    }
  }
  defaultTimelines.set(manifest, found);
  return found;
}
