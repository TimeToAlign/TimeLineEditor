/**
 * What a manifest holds beyond its tree of timelines (`tree.ts`): the entries
 * its timelines list, the ids an element address reserves, its title, and
 * the timelines its drawing draws as roots (`docs/drawing.md` in
 * timeskeleton, sections 2.2 and 8.1).
 */

import { compareCodePoints } from "../json.ts";
import { BAND_ID_PATTERN } from "./bands.ts";
import { displayOrder } from "./order.ts";
import type {
  AxisValue,
  ConversionMap,
  FlowControlElement,
  Group,
  Manifest,
  Region,
  TimelineManifest,
} from "./types.ts";

/** Each kind of element a timeline holds in a list, and the type of its entries. */
export interface EntryTypes {
  readonly map: ConversionMap;
  readonly region: Region;
  readonly flow_control: FlowControlElement;
}

/** The kind of an element a timeline holds in a list. */
export type EntryKind = keyof EntryTypes;

/** An element a timeline holds in a list: a conversion map, a region or a flow-control element. */
export type ListedElement = EntryTypes[EntryKind];

/** One list of a timeline: where it lies, how to read it and how to replace it. */
export interface EntryList<E> {
  /** The members leading from a timeline to the list. */
  readonly path: readonly string[];
  get(timeline: TimelineManifest): readonly E[];
  replace(timeline: TimelineManifest, list: readonly E[]): TimelineManifest;
}

/** Where each kind of entry lies in a timeline: the one table of the three lists. */
export const ENTRY_LISTS: { readonly [kind in EntryKind]: EntryList<EntryTypes[kind]> } = {
  map: {
    path: ["conversion_maps"],
    get: (timeline) => timeline.conversion_maps,
    replace: (timeline, conversion_maps) => ({ ...timeline, conversion_maps }),
  },
  region: {
    path: ["regions"],
    get: (timeline) => timeline.regions,
    replace: (timeline, regions) => ({ ...timeline, regions }),
  },
  flow_control: {
    path: ["flow_control"],
    get: (timeline) => timeline.flow_control,
    replace: (timeline, flow_control) => ({ ...timeline, flow_control }),
  },
};

/** The kinds of listed elements, in the order a timeline's entries are visited. */
export const ENTRY_KINDS: readonly EntryKind[] = ["map", "region", "flow_control"];

/** The list of entries of one kind in a timeline. */
export function entriesOf(timeline: TimelineManifest, kind: EntryKind): readonly ListedElement[] {
  return ENTRY_LISTS[kind].get(timeline);
}

/** Whether a manifest is named: it has an `id` or a `name`, and so a title. */
export function isNamed(manifest: Manifest): boolean {
  return manifest.id !== undefined || manifest.name !== null;
}

/** The words that follow an element's address to name one of its parts. */
export const PART_WORDS = ["start", "end", "name", "label"] as const;

/** The word that ends a card's address (`cardAddress`). */
export const CARD_WORD = "card";

/**
 * Whether `id` is reserved, so that no id of a manifest may be it: a part
 * word, which follows an element's address as one of its parts, the card
 * word, which ends a card's address, or a band's id (`BAND_ID_PATTERN`),
 * which follows a timeline's id as one of its bands.
 */
export function isReservedId(id: string): boolean {
  return id === CARD_WORD || PART_WORDS.some((word) => word === id) || BAND_ID_PATTERN.test(id);
}

/** The address of a manifest's title, the top label of its box, named or not. */
export const TITLE_ADDRESS = "name";

/**
 * The address of an element with id `id` other than a timeline, a group or
 * a measure map (a map, region or flow-control element) in the tree of root
 * `root`: `<root>/<id>`. A timeline, a group, a measure map and the manifest
 * are addressed by their bare ids.
 */
export function elementAddress(root: string, id: string): string {
  return `${root}/${id}`;
}

/**
 * The `places` key of the card of `timeline` (drawing.md section 8.6): in
 * the frame of `group`, `<group>/<timeline>`; on the box (`group` null, an
 * ungrouped root), `<timeline>`.
 */
export function cardKey(timeline: string, group: string | null): string {
  return group === null ? timeline : `${group}/${timeline}`;
}

/**
 * The address of the card of `timeline` (drawing.md section 2.2): its
 * `places` key followed by the card word, `<group>/<timeline>/card` for a
 * member's card in the frame of `group`, `<timeline>/card` for an ungrouped
 * root's.
 */
export function cardAddress(timeline: string, group: string | null): string {
  return `${cardKey(timeline, group)}/${CARD_WORD}`;
}

/** The address of an element's part, `<owner address>/<word>`: a title, a label or a mark. */
export function partAddress(owner: string, word: (typeof PART_WORDS)[number]): string {
  return `${owner}/${word}`;
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
 * members in their display order (`displayOrder`), each with its ancestors,
 * then the ungrouped roots. A member id no timeline carries, which the
 * schema refuses, is passed over.
 */
export function memberDrawings(manifest: Manifest): MemberDrawings {
  const roots = [...manifest.timelines].sort((a, b) => compareCodePoints(a.id, b.id));
  const found = new Map<string, MemberDrawing>();
  const visit = (timeline: TimelineManifest, root: string, ancestors: readonly Ancestor[]) => {
    if (!found.has(timeline.id)) found.set(timeline.id, { timeline, root, ancestors });
    for (const child of timeline.children) {
      visit(child, root, [...ancestors, { timeline, offset: child.offset }]);
    }
  };
  for (const root of roots) visit(root, root.id, []);
  const drawn = (id: string): MemberDrawing[] => {
    const member = found.get(id);
    return member === undefined ? [] : [member];
  };
  const groups = [...manifest.groups].sort((a, b) => compareCodePoints(a.id, b.id));
  const frames = groups.map((group) => ({
    group,
    members: displayOrder(manifest, group.id).flatMap(drawn),
  }));
  const members = new Set(groups.flatMap((group) => group.members));
  const holdsMember = (timeline: TimelineManifest): boolean =>
    members.has(timeline.id) || timeline.children.some(holdsMember);
  const ungrouped = roots.filter((root) => !holdsMember(root)).flatMap((root) => drawn(root.id));
  return { frames, ungrouped };
}
