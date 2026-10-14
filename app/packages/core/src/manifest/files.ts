/**
 * The three file kinds and what they hold: the kind of a manifest, its root
 * timelines, the addresses of its elements, which of them can be removed,
 * and the timelines its drawing draws as roots (`docs/drawing.md` in timeskeleton, sections 2.2 and 8.1).
 */

import type { Group } from "@timetoalign/timeskeleton";
import type { PathSegment } from "../json.ts";
import { compareCodePoints } from "../json.ts";
import type { CoordinateDict } from "../number/coordinate.ts";
import type { BlockKind } from "../workspace/blocks.ts";
import type { BundleFile, GroupFile, Manifest, TimelineFile, TimelineManifest } from "./types.ts";

/**
 * The kind of a manifest: the one of `timeline`, `group` and `bundle` it
 * holds beside `meta`. Every other function narrows a manifest through this
 * one.
 */
export function manifestKind(manifest: Manifest): BlockKind {
  if (Object.hasOwn(manifest, "timeline")) return "timeline";
  return Object.hasOwn(manifest, "group") ? "group" : "bundle";
}

/** A root timeline of a manifest and its path from the manifest's top. */
export interface RootPath {
  readonly timeline: TimelineManifest;
  readonly path: readonly PathSegment[];
}

/** The root timelines of a manifest with their paths: `timeline`, or each of `timelines`. */
export function rootPaths(manifest: Manifest): RootPath[] {
  if (manifestKind(manifest) === "timeline") {
    return [{ timeline: (manifest as TimelineFile).timeline, path: ["timeline"] }];
  }
  return (manifest as GroupFile | BundleFile).timelines.map((timeline, index) => ({
    timeline,
    path: ["timelines", index],
  }));
}

/** The root timelines of a manifest: its `timeline`, or its `timelines`. */
export function manifestRoots(manifest: Manifest): readonly TimelineManifest[] {
  return rootPaths(manifest).map((root) => root.timeline);
}

/** The groups of a manifest: a group file's group, a bundle's groups, none in a timeline file. */
export function manifestGroups(manifest: Manifest): readonly Group[] {
  const kind = manifestKind(manifest);
  if (kind === "group") return [(manifest as GroupFile).group];
  return kind === "bundle" ? (manifest as BundleFile).bundle.groups : [];
}

/** The words that follow an element's address to name one of its parts. */
export const PART_WORDS: readonly string[] = ["start", "end", "name", "label", "card"];

/**
 * The address of an element with id `id` in the tree of root `root`: the id
 * itself in a timeline file (`root` null) and for a timeline, a group or the
 * bundle; `<root>/<id>` for every other element of a group or bundle file.
 */
export function elementAddress(root: string | null, id: string): string {
  return root === null ? id : `${root}/${id}`;
}

/**
 * The address of the element a path within a manifest names, its trailing
 * part words removed: in a timeline file the path's first segment; in a group
 * or bundle file `<root>/<id>` when the path starts with a root's id followed
 * by an id that is no part word, and the first segment otherwise. So
 * `score/end/label` names `score` and `score/region_1/label` names
 * `score/region_1`; ids that are part words are refused there, so the two
 * never meet.
 */
export function elementOf(manifest: Manifest, path: string): string {
  return elementOfIn(manifest)(path);
}

/** `elementOf` of one manifest, its kind and root ids read once for many paths. */
export function elementOfIn(manifest: Manifest): (path: string) => string {
  const timelineFile = manifestKind(manifest) === "timeline";
  const roots = new Set(manifestRoots(manifest).map((root) => root.id));
  return (path) => {
    const [first = "", second] = path.split("/");
    if (timelineFile || second === undefined) return first;
    return roots.has(first) && !PART_WORDS.includes(second) ? `${first}/${second}` : first;
  };
}

/**
 * Whether `remove` may be asked for the element at element address
 * `element` (an element, not a part): in a timeline file every element but
 * the root, which goes only with its block; in a group or bundle file no
 * timeline, group or bundle, only the elements of a root's tree. An address
 * naming nothing is not refused here; removing it names nothing.
 */
export function isRemovable(manifest: Manifest, element: string): boolean {
  return isRemovableIn(manifest)(element);
}

/** `isRemovable` of one manifest, its kind and refused ids read once for many elements. */
export function isRemovableIn(manifest: Manifest): (element: string) => boolean {
  const kind = manifestKind(manifest);
  if (kind === "timeline") {
    const root = (manifest as TimelineFile).timeline.id;
    return (element) => element !== root;
  }
  const refused = new Set(manifestGroups(manifest).map((group) => group.id));
  if (kind === "bundle") refused.add((manifest as BundleFile).bundle.id);
  const visit = (timeline: TimelineManifest): void => {
    refused.add(timeline.id);
    for (const entry of Object.values(timeline.children)) visit(entry.timeline);
  };
  for (const root of manifestRoots(manifest)) visit(root);
  return (element) => !refused.has(element);
}

/** A timeline drawn as a root: a timeline file's root, a group's member or an ungrouped root. */
export interface MemberDrawing {
  readonly timeline: TimelineManifest;
  /**
   * The id of the root whose tree holds it, which qualifies the addresses of
   * its elements other than timelines; null in a timeline file.
   */
  readonly root: string | null;
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
  readonly offset: CoordinateDict;
}

/** A group's frame: the group and its member drawings in display order. */
export interface GroupFrame {
  readonly group: Group;
  readonly members: readonly MemberDrawing[];
}

/** What the drawing of a manifest draws as roots (section 8.1). */
export interface MemberDrawings {
  /** The frames, in canonical order of their groups; none in a timeline file. */
  readonly frames: readonly GroupFrame[];
  /**
   * The roots drawn without a frame: a timeline file's root, or a bundle's
   * ungrouped roots (no group names them and they contain no member), by id.
   */
  readonly ungrouped: readonly MemberDrawing[];
}

/**
 * The member drawings of a manifest in canonical order: in a group or bundle
 * file every group's members in their display order (`graphical.order`, else
 * `members`), each with its ancestors, then a bundle's ungrouped roots.
 */
export function memberDrawings(manifest: Manifest): MemberDrawings {
  const kind = manifestKind(manifest);
  if (kind === "timeline") {
    return {
      frames: [],
      ungrouped: [{ timeline: (manifest as TimelineFile).timeline, root: null, ancestors: [] }],
    };
  }
  const roots = [...manifestRoots(manifest)].sort((a, b) => compareCodePoints(a.id, b.id));
  const found = new Map<string, MemberDrawing>();
  const visit = (timeline: TimelineManifest, root: string, ancestors: readonly Ancestor[]) => {
    if (!found.has(timeline.id)) found.set(timeline.id, { timeline, root, ancestors });
    for (const entry of Object.values(timeline.children)) {
      visit(entry.timeline, root, [...ancestors, { timeline, offset: entry.offset }]);
    }
  };
  for (const root of roots) visit(root, root.id, []);
  const groups = [...manifestGroups(manifest)].sort((a, b) => compareCodePoints(a.id, b.id));
  const order = (group: Group): readonly string[] => {
    const graphical = (manifest as GroupFile | BundleFile).graphical;
    const listed =
      kind === "group"
        ? (graphical as GroupFile["graphical"])?.order
        : (graphical as BundleFile["graphical"])?.order?.[group.id];
    return listed ?? group.members;
  };
  const frames = groups.map((group) => ({
    group,
    members: order(group).map((id) => found.get(id) as MemberDrawing),
  }));
  const members = new Set(groups.flatMap((group) => group.members));
  const holdsMember = (timeline: TimelineManifest): boolean =>
    members.has(timeline.id) ||
    Object.values(timeline.children).some((entry) => holdsMember(entry.timeline));
  const ungrouped =
    kind === "bundle"
      ? roots
          .filter((root) => !holdsMember(root))
          .map((root) => found.get(root.id) as MemberDrawing)
      : [];
  return { frames, ungrouped };
}
