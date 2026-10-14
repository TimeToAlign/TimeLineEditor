/**
 * The drawn elements of a manifest and the selector test over them
 * (`docs/drawing.md` in timeskeleton, sections 2.1 to 2.3): what a `graphical`
 * statement can select, for the cascade and for the `style` command alike.
 */

import type { ElementType, Selector, TimeUnit } from "@timetoalign/timeskeleton";
import { canonicalOrder } from "@timetoalign/timeskeleton";
import { compareCodePoints } from "../json.ts";
import { coordinateFromDict } from "../number/coordinate.ts";
import { compareReal, realOf } from "../number/real.ts";
import type { MemberDrawing } from "./files.ts";
import { elementAddress, manifestKind, manifestRoots, memberDrawings } from "./files.ts";
import type { BundleFile, ChildEntry, ConversionMap, Manifest, TimelineManifest } from "./types.ts";

export type Domain = "graphical" | "logical" | "physical";
export type Modality = "continuous" | "discrete";

/** What a selector can test on an element. */
export interface ElementKey {
  /** `null` for a segment, a node of the tree that no selector naming `element` matches. */
  readonly type: ElementType | null;
  /** `null` for the block. */
  readonly address: string | null;
  /** The timeline it belongs to; `null` for the block, a group's frame and a title. */
  readonly timeline: string | null;
  readonly domain: Domain | null;
  readonly modality: Modality | null;
  readonly class: string | null;
  /**
   * Its holder chain: the types of the elements holding it in the tree
   * (sections 2.1 and 8.1), outermost first, which the selector member
   * `inside` tests. A key's chain is its holder's chain followed by the
   * holder's type, so build keys with `elementKey`, `textKey` and
   * `unownedKey` from the holder's key; a segment that is not a segment line
   * (type `null`) adds nothing. Two drawings of one address differ here only.
   */
  readonly inside: readonly ElementType[];
}

/** The block's key: it belongs to no timeline, has no address and no holder. */
export const BLOCK_KEY: ElementKey = {
  type: "block",
  address: null,
  timeline: null,
  domain: null,
  modality: null,
  class: null,
  inside: [],
};

/** The types an element held by `holder` is inside: the holder's own and the holder's holders'. */
function holdersOf(holder: ElementKey): readonly ElementType[] {
  return holder.type === null ? holder.inside : [...holder.inside, holder.type];
}

/** The key of an element belonging to no timeline, held by `holder`: a group's frame or a title. */
export function unownedKey(
  type: "group" | "name",
  address: string,
  holder: ElementKey,
): ElementKey {
  return { ...BLOCK_KEY, type, address, inside: holdersOf(holder) };
}

const UNIT_DOMAINS: Readonly<Partial<Record<TimeUnit, readonly [Domain, Modality]>>> = {
  floating_measures: ["logical", "continuous"],
  whole_note: ["logical", "continuous"],
  quarters: ["logical", "continuous"],
  ticks: ["logical", "discrete"],
  milliseconds: ["physical", "continuous"],
  seconds: ["physical", "continuous"],
  minutes: ["physical", "continuous"],
  samples: ["physical", "discrete"],
  frames: ["physical", "discrete"],
  pixels: ["graphical", "discrete"],
  meters: ["graphical", "continuous"],
  centimeters: ["graphical", "continuous"],
  millimeters: ["graphical", "continuous"],
  inches: ["graphical", "continuous"],
  points: ["graphical", "continuous"],
};

/** The domain and modality of a map's `target_unit`, or `null` for none. */
export function unitDomain(unit: string | null | undefined): readonly [Domain, Modality] | null {
  if (unit === null || unit === undefined || !Object.hasOwn(UNIT_DOMAINS, unit)) return null;
  return UNIT_DOMAINS[unit as TimeUnit] ?? null;
}

/** The domain and modality of a timeline class. */
export function classDomain(name: string): readonly [Domain, Modality] {
  const domain: Domain = name.includes("Graphical")
    ? "graphical"
    : name.includes("Physical")
      ? "physical"
      : "logical";
  return [domain, name.startsWith("Discrete") ? "discrete" : "continuous"];
}

/** The key of an element of `timeline` held by `holder`, or of its conversion map `map`. */
export function elementKey(
  type: ElementType | null,
  address: string,
  timeline: TimelineManifest,
  holder: ElementKey,
  map?: ConversionMap,
): ElementKey {
  const [domain, modality] =
    map === undefined
      ? classDomain(timeline.class)
      : (unitDomain(map.target_unit as string | null) ?? [null, null]);
  return {
    type,
    address,
    timeline: timeline.id,
    domain,
    modality,
    class: map === undefined ? timeline.class : map.type,
    inside: holdersOf(holder),
  };
}

/** The key of an element's own text, `name` or `label`, which the element holds. */
export function textKey(owner: ElementKey, type: "name" | "label"): ElementKey {
  return { ...owner, type, address: `${owner.address}/${type}`, inside: holdersOf(owner) };
}

/**
 * Every timeline id mapped to the ids from its root down to it, for every
 * root of the manifest; the length of the list is the timeline's depth.
 */
export function timelineAncestry(manifest: Manifest): Map<string, readonly string[]> {
  const ancestry = new Map<string, readonly string[]>();
  const collect = (timeline: TimelineManifest, path: readonly string[]) => {
    const own = [...path, timeline.id];
    ancestry.set(timeline.id, own);
    for (const child of Object.values(timeline.children)) collect(child.timeline, own);
  };
  for (const root of manifestRoots(manifest)) collect(root, []);
  return ancestry;
}

/** Whether an element matches every member present in a selector. */
export function selectorMatches(
  select: Selector,
  element: ElementKey,
  ancestry: ReadonlyMap<string, readonly string[]>,
): boolean {
  if (select.element !== undefined && select.element !== element.type) return false;
  if (select.ids !== undefined) {
    if (element.address === null || !select.ids.includes(element.address)) return false;
  }
  if (select.domain !== undefined && select.domain !== element.domain) return false;
  if (select.modality !== undefined && select.modality !== element.modality) return false;
  if (select.class !== undefined && select.class !== element.class) return false;
  if (select.inside !== undefined && !element.inside.includes(select.inside)) return false;
  if (select.within !== undefined) {
    if (element.timeline === null) return false;
    if (!(ancestry.get(element.timeline) ?? []).includes(select.within)) return false;
  }
  return true;
}

/** A timeline's children by offset, then id in code-point order, whatever their keys' order. */
export function orderedChildren(timeline: TimelineManifest): ChildEntry[] {
  return Object.values(timeline.children).sort(
    (left, right) =>
      compareReal(
        realOf(coordinateFromDict(left.offset)),
        realOf(coordinateFromDict(right.offset)),
      ) || compareCodePoints(left.timeline.id, right.timeline.id),
  );
}

/**
 * The elements of one member drawing (section 8.1; a timeline file's root
 * alone) held by `holder`, the block or a frame: its card; its ancestor
 * lines, each with its name and its marks of the member's start and end,
 * each mark with its label; then per timeline in pre-order, children by
 * offset then id: its line and name, or for a segment its node (its line
 * and no name when it is a segment line), its boundary when it is not the
 * first segment and its label; its maps; its regions, breaks and jumps each
 * followed by its label; and after the member's own elements its two wedges
 * with their labels.
 */
function memberElements(member: MemberDrawing, holder: ElementKey, keys: ElementKey[]): void {
  const address = (id: string) => elementAddress(member.root, id);
  const root = member.timeline;
  keys.push(elementKey("card", `${root.id}/card`, root, holder));
  const line = elementKey("timeline", root.id, root, holder);
  for (const { timeline } of member.ancestors) {
    const ancestor = elementKey("ancestor", timeline.id, timeline, line);
    keys.push(ancestor, textKey(ancestor, "name"));
    for (const end of ["start", "end"]) {
      const mark = elementKey("wedge", `${root.id}/${end}`, root, ancestor);
      keys.push(mark, textKey(mark, "label"));
    }
  }
  const visit = (key: ElementKey, timeline: TimelineManifest) => {
    for (const map of timeline.conversion_maps) {
      keys.push(elementKey("map", address(map.id), timeline, key, map));
    }
    const labelled = (type: ElementType, at: string) => {
      const owned = elementKey(type, at, timeline, key);
      keys.push(owned, textKey(owned, "label"));
    };
    const { breaks, jumps } = timeline.flow_control;
    for (const [type, entries] of [
      ["region", timeline.regions],
      ["break", breaks],
      ["jump", jumps],
    ] as const) {
      for (const entry of entries) labelled(type, address(entry.id));
    }
    if (timeline === root) {
      labelled("wedge", `${timeline.id}/start`);
      labelled("wedge", `${timeline.id}/end`);
    }
    orderedChildren(timeline).forEach((child, index) => {
      const own = child.timeline;
      if (timeline.is_segment_line) {
        const node = elementKey(own.is_segment_line ? "child" : null, own.id, own, key);
        keys.push(node);
        if (index > 0) keys.push(elementKey("boundary", `${own.id}/start`, own, node));
        keys.push(textKey(node, "label"));
        visit(node, own);
      } else {
        const node = elementKey("child", own.id, own, key);
        keys.push(node, textKey(node, "name"));
        visit(node, own);
      }
    });
  };
  keys.push(line, textKey(line, "name"));
  visit(line, root);
}

/**
 * Every element of a manifest's drawing, in the order of its tree (sections
 * 2.1 and 8.1): the block; a bundle's title; each group's frame, its title
 * and its member drawings in display order; then the roots drawn without a
 * frame (a timeline file's root, a bundle's ungrouped roots). A timeline a
 * bundle draws twice, as an ancestor line and as a line of its own, is
 * listed at each drawing, and so are a member's start and end, marked on its
 * own line and on each of its ancestor lines.
 */
export function manifestElements(manifest: Manifest): ElementKey[] {
  const ordered = canonicalOrder(manifest as never) as unknown as Manifest;
  const keys: ElementKey[] = [BLOCK_KEY];
  if (manifestKind(ordered) === "bundle") {
    keys.push(unownedKey("name", `${(ordered as BundleFile).bundle.id}/name`, BLOCK_KEY));
  }
  const { frames, ungrouped } = memberDrawings(ordered);
  for (const frame of frames) {
    const group = unownedKey("group", frame.group.id, BLOCK_KEY);
    keys.push(group, unownedKey("name", `${frame.group.id}/name`, group));
    for (const member of frame.members) memberElements(member, group, keys);
  }
  for (const member of ungrouped) memberElements(member, BLOCK_KEY, keys);
  return keys;
}
