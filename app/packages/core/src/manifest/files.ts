/**
 * What a manifest holds beyond its tree of timelines (`tree.ts`): the entries
 * its timelines list, the addresses of its elements, its title, and the
 * timelines its drawing draws as roots (`docs/drawing.md` in timeskeleton,
 * sections 2.2 and 8.1).
 */

import { compareCodePoints } from "../json.ts";
import { BAND_ID_PATTERN } from "./bands.ts";
import type { Located } from "./tree.ts";
import { rootPaths, searchTree } from "./tree.ts";
import type {
  AxisValue,
  Break,
  ConversionMap,
  Group,
  Jump,
  Manifest,
  Marker,
  Region,
  TimelineManifest,
} from "./types.ts";

/** The kinds of the elements a timeline holds in a list, and where each list lies. */
export const ENTRY_LISTS = {
  map: ["conversion_maps"],
  region: ["regions"],
  break: ["flow_control", "breaks"],
  jump: ["flow_control", "jumps"],
  marker: ["flow_control", "markers"],
} as const;

/** The kind of an element a timeline holds in a list. */
export type EntryKind = keyof typeof ENTRY_LISTS;

export const ENTRY_KINDS = Object.keys(ENTRY_LISTS) as EntryKind[];

/** An element a timeline holds in a list: a conversion map, region, break, jump or marker. */
export type ListedElement = ConversionMap | Region | Break | Jump | Marker;

/** The list of entries of one kind in a timeline. */
export function entriesOf(timeline: TimelineManifest, kind: EntryKind): readonly ListedElement[] {
  const [first, second] = ENTRY_LISTS[kind] as readonly string[];
  const holder = timeline as unknown as { readonly [key: string]: unknown };
  const list =
    second === undefined
      ? holder[first as string]
      : (holder[first as string] as typeof holder)[second];
  return list as readonly ListedElement[];
}

/** An entry inside a manifest: the timeline holding it, its kind and its index in that list. */
export interface LocatedEntry {
  readonly at: Located;
  readonly kind: EntryKind;
  readonly index: number;
}

/**
 * The entry an element address `<root>/<id>` names: the map, region, break,
 * jump or marker `<id>` of root `<root>`'s tree, located; `undefined` for
 * any other address.
 */
export function locateEntry(manifest: Manifest, address: string): LocatedEntry | undefined {
  const [first = "", id, ...rest] = address.split("/");
  if (id === undefined || rest.length > 0) return undefined;
  const root = rootPaths(manifest).find((item) => item.timeline.id === first);
  if (root === undefined) return undefined;
  return searchTree({ ...root, parent: undefined }, (at): LocatedEntry | undefined => {
    for (const kind of ENTRY_KINDS) {
      const index = entriesOf(at.timeline, kind).findIndex((item) => item.id === id);
      if (index >= 0) return { at, kind, index };
    }
    return undefined;
  });
}

/**
 * The entry an element address `<root>/<id>` names, with its kind; the one
 * reader of a map, region, break, jump or marker by address (`undefined` for
 * a timeline, a group, the title or an unknown address).
 */
export function findEntry(
  manifest: Manifest,
  address: string,
): { readonly kind: EntryKind; readonly entry: ListedElement } | undefined {
  const found = locateEntry(manifest, address);
  if (found === undefined) return undefined;
  return {
    kind: found.kind,
    entry: entriesOf(found.at.timeline, found.kind)[found.index] as ListedElement,
  };
}

/** Whether a manifest is named: it has an `id` or a `name`, and so a title. */
export function isNamed(manifest: Manifest): boolean {
  return manifest.id !== undefined || manifest.name !== null;
}

/** The words that follow an element's address to name one of its parts. */
const PART_WORDS: readonly string[] = ["start", "end", "name", "label", "card"];

/**
 * Whether `id` is reserved, so that no id of a manifest may be it: a part
 * word, which follows an element's address as one of its parts, or a band's
 * id (`BAND_ID_PATTERN`), which follows a timeline's id as one of its bands.
 */
export function isReservedId(id: string): boolean {
  return PART_WORDS.includes(id) || BAND_ID_PATTERN.test(id);
}

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
 * part words and band ids removed: `<root>/<id>` when the path starts with
 * a root's id followed by an id that is not reserved (`isReservedId`), and
 * the first segment otherwise. So `score/end/label` and `score/regions_1`
 * (the regions band of `score`) name `score`, as `score/card` does, and
 * `score/region_1/label` names `score/region_1`; reserved ids are refused as
 * ids, so the two never meet. The manifest's title is `name` itself.
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
    return roots.has(first) && !isReservedId(second) ? `${first}/${second}` : first;
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
