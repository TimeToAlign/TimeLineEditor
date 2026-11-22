/**
 * The elisions of a manifest (`graphical.elisions`, TimeToShare's README
 * and `docs/drawing.md`, sections 2 and 8.9): each lies on one timeline,
 * at any depth, as a named timestamp does, and is drawn in the cards that
 * draw a timeline whole outside a frame. Core reads the stored ones; the
 * default ones are derived by the drawing from the view, and core knows of
 * them only which timelines may carry them.
 */

import { memberDrawings } from "./files.ts";
import { locateTimeline } from "./tree.ts";
import type { Elision, Manifest, TimelineManifest } from "./types.ts";

/**
 * The words of an elision's `display` that name its labels, in the order
 * its strip holds them (drawing.md sections 2 and 8.5): the name of the
 * timeline it lies on, then its coordinates. Each is a `label` element
 * addressed `{id: E, part: [word]}`, a default elision's `{id: T, part:
 * ["elision", word]}`.
 */
export const ELISION_LABELS = ["name", "coordinate"] as const;

/** A word naming one of an elision's labels. */
export type ElisionLabel = (typeof ELISION_LABELS)[number];

const NO_ELISIONS: readonly Elision[] = [];
const elisionLists = new WeakMap<Manifest, ReadonlyMap<string, readonly Elision[]>>();

/**
 * The stored elisions lying on the timeline `timeline`, in the order
 * `graphical.elisions` lists them, which is canonical (by timeline, then
 * start, then ID) in a manifest in canonical order; none when it has none.
 * Memoised by the manifest's identity.
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

/**
 * The stored elisions lying on the timeline `root` or on a descendant of
 * it, in the order of `graphical.elisions`: what "Reset to automatic"
 * removes from a root's cards in one `remove`. None for an ID naming no
 * timeline.
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
  return (manifest.graphical?.elisions ?? []).filter((elision) => tree.has(elision.timeline));
}

const defaultTimelines = new WeakMap<Manifest, ReadonlySet<string>>();

/**
 * The timelines on which an ancestor card may draw default elisions
 * (drawing.md section 8.9), memoised by the manifest's identity: for every
 * ancestor card of a root `R` aligned to a member `M` with the ancestors
 * `A1 = R, …, Ak`, when no stored elision lies on `R` or a descendant of
 * it, `R` and every child of `A1` to `A(k − 1)` (the generations 1 to
 * `k`). Whether a card draws them, and which of these timelines take a
 * strip, depends on the view the drawing is made for and on the rules that
 * display children; the drawing decides that. An ungrouped root's card
 * draws no default elision.
 */
export function defaultElisionTimelines(manifest: Manifest): ReadonlySet<string> {
  const known = defaultTimelines.get(manifest);
  if (known !== undefined) return known;
  const found = new Set<string>();
  for (const { member, root } of memberDrawings(manifest).ancestorCards) {
    if (elisionsUnder(manifest, root.timeline.id).length > 0) continue;
    found.add(root.timeline.id);
    for (const { timeline } of member.ancestors.slice(0, -1)) {
      for (const child of timeline.children) found.add(child.id);
    }
  }
  defaultTimelines.set(manifest, found);
  return found;
}
