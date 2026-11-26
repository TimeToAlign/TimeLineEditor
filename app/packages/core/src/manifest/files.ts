/**
 * What a manifest holds beyond its tree of timelines (`tree.ts`): the entries
 * its timelines list, whether it has a title, and the timelines its drawing
 * draws as roots (`docs/drawing.md` in TimeToShare, section 8.1).
 */

import { compareCodePoints } from "../json.ts";
import { displayOrder } from "./order.ts";
import type { Located } from "./tree.ts";
import type {
  AxisValue,
  ConversionMap,
  FlowControlElement,
  Group,
  Manifest,
  Region,
  TimelineManifest,
  VirtualTimeline,
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

/** A timeline drawn as a root: a group's member or an ungrouped root. */
export interface MemberDrawing {
  readonly timeline: TimelineManifest;
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

/**
 * The ancestor card of a root behind a group's frame (section 8.8): the root
 * of a member that is a child timeline, drawn whole and aligned to that
 * member.
 */
export interface AncestorCard {
  readonly group: Group;
  /** The member it is aligned to: the first in display order below the root. */
  readonly member: MemberDrawing;
  /** The root, drawn as a root: it has no ancestors. */
  readonly root: MemberDrawing;
}

/** What the drawing of a manifest draws as roots (section 8.1). */
export interface MemberDrawings {
  /** The frames, in canonical order of their groups. */
  readonly frames: readonly GroupFrame[];
  /** The roots drawn without a frame (no group names them and they contain no member), by id. */
  readonly ungrouped: readonly MemberDrawing[];
  /**
   * The ancestor cards, frame by frame in the order of `frames`, then by their members' display
   * order: one per root of a member that is a child timeline, aligned to its first such member.
   */
  readonly ancestorCards: readonly AncestorCard[];
}

/**
 * The member drawings of a manifest in canonical order: every group's
 * members in their display order (`displayOrder`), each with its ancestors,
 * then the ungrouped roots, and the ancestor cards behind the frames. A
 * member id no timeline carries, which the schema refuses, is passed over.
 */
export function memberDrawings(manifest: Manifest): MemberDrawings {
  const roots = [...manifest.timelines].sort((a, b) => compareCodePoints(a.id, b.id));
  const found = new Map<string, MemberDrawing>();
  const visit = (timeline: TimelineManifest, ancestors: readonly Ancestor[]) => {
    if (!found.has(timeline.id)) found.set(timeline.id, { timeline, ancestors });
    for (const child of timeline.children) {
      visit(child, [...ancestors, { timeline, offset: child.offset }]);
    }
  };
  for (const root of roots) visit(root, []);
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
  const ancestorCards = frames.flatMap(({ group, members: drawings }) => {
    const roots = new Set<string>();
    return drawings.flatMap((member): AncestorCard[] => {
      const id = member.ancestors[0]?.timeline.id;
      if (id === undefined || roots.has(id)) return [];
      roots.add(id);
      return drawn(id).map((root) => ({ group, member, root }));
    });
  });
  return { frames, ungrouped, ancestorCards };
}

/** The member drawings of the virtual timelines of each manifest, by ID: one object each. */
const virtualDrawings = new WeakMap<Manifest, Map<string, MemberDrawing>>();

/**
 * The member drawing of the virtual timeline `id` of `manifest` (section
 * 8.10), which is drawn as a root holding nothing: a timeline of its ID,
 * name, unit, number type and length, locked (its end is fixed by its map),
 * without children, conversion maps, regions or flow control, and without
 * ancestors; one object per manifest and ID, so every reader keyed by a
 * member drawing reads the same. `undefined` for an ID no virtual timeline
 * carries.
 */
export function virtualDrawing(manifest: Manifest, id: string): MemberDrawing | undefined {
  let known = virtualDrawings.get(manifest);
  if (known === undefined) {
    known = new Map();
    virtualDrawings.set(manifest, known);
  }
  const found = known.get(id);
  if (found !== undefined) return found;
  const virtual = (manifest.virtual_timelines ?? []).find((item) => item.id === id);
  if (virtual === undefined) return undefined;
  const drawing: MemberDrawing = { timeline: virtualAxis(virtual), ancestors: [] };
  known.set(id, drawing);
  return drawing;
}

/**
 * The virtual timeline `id` of `manifest` located as the timeline its axis
 * is (`virtualDrawing`, section 8.10): a root holding nothing, at its own
 * place in the manifest's `virtual_timelines`, from which what lies on it (a
 * named timestamp, a coordinate of an alignment anchor) reads its axis;
 * `undefined` for an ID no virtual timeline carries.
 */
export function locateVirtual(manifest: Manifest, id: string): Located | undefined {
  const index = (manifest.virtual_timelines ?? []).findIndex((item) => item.id === id);
  const drawing = virtualDrawing(manifest, id);
  if (index < 0 || drawing === undefined) return undefined;
  return { timeline: drawing.timeline, path: ["virtual_timelines", index], parent: undefined };
}

/**
 * A virtual timeline read as the timeline its axis is: its ID, name, unit,
 * number type and length, locked, holding nothing (section 8.10).
 */
function virtualAxis(virtual: VirtualTimeline): TimelineManifest {
  return {
    id: virtual.id,
    name: virtual.name ?? null,
    unit: virtual.unit,
    number_type: virtual.number_type,
    length: virtual.length,
    locked: true,
    is_segment_line: false,
    meta: {},
    children: [],
    conversion_maps: [],
    regions: [],
    flow_control: [],
  };
}

/**
 * The frame `frame` with its virtual members (section 8.10): every member
 * of its group's display order that is a timeline or a virtual timeline,
 * in that order, a virtual one by its member drawing (`virtualDrawing`);
 * `frame` itself where its group has no virtual member.
 */
export function withVirtualMembers(manifest: Manifest, frame: GroupFrame): GroupFrame {
  const { group, members } = frame;
  const virtual = new Set((manifest.virtual_timelines ?? []).map((item) => item.id));
  if (!group.members.some((id) => virtual.has(id))) return frame;
  const real = new Map(members.map((member) => [member.timeline.id, member]));
  return {
    group,
    members: displayOrder(manifest, group.id).flatMap((id) => {
      const member = real.get(id) ?? virtualDrawing(manifest, id);
      return member === undefined ? [] : [member];
    }),
  };
}
