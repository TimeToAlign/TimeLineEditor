/**
 * What a manifest holds: its root timelines, the addresses of its elements,
 * its title, and the timelines its drawing draws as roots (`docs/drawing.md` in timeskeleton, sections 2.2 and 8.1).
 */

import type { PathSegment } from "../json.ts";
import { compareCodePoints } from "../json.ts";
import type { AxisValue, Group, Manifest, TimelineManifest } from "./types.ts";

/** A root timeline of a manifest and its path from the manifest's top. */
export interface RootPath {
  readonly timeline: TimelineManifest;
  readonly path: readonly PathSegment[];
}

/** The root timelines of a manifest with their paths, `["timelines", <index>]`. */
export function rootPaths(manifest: Manifest): RootPath[] {
  return manifest.timelines.map((timeline, index) => ({ timeline, path: ["timelines", index] }));
}

/** Whether a manifest is named: it has an `id` or a `name`, and so a title. */
export function isNamed(manifest: Manifest): boolean {
  return manifest.id !== undefined || manifest.name !== null;
}

/** The words that follow an element's address to name one of its parts. */
export const PART_WORDS: readonly string[] = ["start", "end", "name", "label", "card"];

/** The address of a manifest's title, the top label of its box, named or not. */
export const TITLE_ADDRESS = "name";

/**
 * The address of an element with id `id` other than a timeline or a group
 * (a map, region, break, jump or marker) in the tree of root `root`:
 * `<root>/<id>`. A timeline, a group and the manifest are addressed by their
 * bare ids.
 */
export function elementAddress(root: string, id: string): string {
  return `${root}/${id}`;
}

/**
 * The address of the element a path within a manifest names, its trailing
 * part words removed: `<root>/<id>` when the path starts with a root's id
 * followed by an id that is no part word, and the first segment otherwise.
 * So `score/end/label` names `score` and `score/region_1/label` names
 * `score/region_1`; ids that are part words are refused, so the two never
 * meet. The manifest's title is `name` itself.
 */
export function elementOf(manifest: Manifest, path: string): string {
  return elementOfIn(manifest)(path);
}

/** `elementOf` of one manifest, its root ids read once for many paths. */
export function elementOfIn(manifest: Manifest): (path: string) => string {
  const roots = new Set(manifest.timelines.map((root) => root.id));
  return (path) => {
    const [first = "", second] = path.split("/");
    if (second === undefined) return first;
    return roots.has(first) && !PART_WORDS.includes(second) ? `${first}/${second}` : first;
  };
}

/** A timeline drawn as a root: a group's member or an ungrouped root. */
export interface MemberDrawing {
  readonly timeline: TimelineManifest;
  /** The id of the root whose tree holds it, which qualifies the addresses of its other elements. */
  readonly root: string;
  /**
   * Its ancestors from its root down to its parent, each with the offset, on
   * that ancestor's axis, of the next timeline down: the next ancestor, or
   * the member itself for its parent.
   */
  readonly ancestors: readonly Ancestor[];
}

/** An ancestor of a member that is a child timeline. */
export interface Ancestor {
  readonly timeline: TimelineManifest;
  /** A bare value on this ancestor's axis. */
  readonly offset: AxisValue;
}

/** A group's frame: the group and its member drawings in display order. */
export interface GroupFrame {
  readonly group: Group;
  readonly members: readonly MemberDrawing[];
}

/** What the drawing of a manifest draws as roots (section 8.1). */
export interface MemberDrawings {
  /** The frames, in canonical order of their groups. */
  readonly frames: readonly GroupFrame[];
  /** The roots drawn without a frame (no group names them and they contain no member), by id. */
  readonly ungrouped: readonly MemberDrawing[];
}

/**
 * The member drawings of a manifest in canonical order: every group's
 * members in their display order (`graphical.order`, else `members`), each
 * with its ancestors, then the ungrouped roots.
 */
export function memberDrawings(manifest: Manifest): MemberDrawings {
  const roots = [...manifest.timelines].sort((a, b) => compareCodePoints(a.id, b.id));
  const found = new Map<string, MemberDrawing>();
  const visit = (timeline: TimelineManifest, root: string, ancestors: readonly Ancestor[]) => {
    if (!found.has(timeline.id)) found.set(timeline.id, { timeline, root, ancestors });
    for (const child of timeline.children) {
      visit(child, root, [...ancestors, { timeline, offset: child.offset as AxisValue }]);
    }
  };
  for (const root of roots) visit(root, root.id, []);
  const groups = [...manifest.groups].sort((a, b) => compareCodePoints(a.id, b.id));
  const frames = groups.map((group) => ({
    group,
    members: (manifest.graphical?.order?.[group.id] ?? group.members).map(
      (id) => found.get(id) as MemberDrawing,
    ),
  }));
  const members = new Set(groups.flatMap((group) => group.members));
  const holdsMember = (timeline: TimelineManifest): boolean =>
    members.has(timeline.id) || timeline.children.some(holdsMember);
  const ungrouped = roots
    .filter((root) => !holdsMember(root))
    .map((root) => found.get(root.id) as MemberDrawing);
  return { frames, ungrouped };
}
