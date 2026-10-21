/**
 * The drawn elements of a manifest and the selector test over them
 * (`docs/drawing.md` in TimeToShare, sections 2.1 to 2.3): what a `graphical`
 * statement can select, for the cascade and for the `style` command alike.
 */

import type { ElementType, Selector, TimeUnit } from "@timetoalign/timetoshare";
import { canonicalOrder } from "@timetoalign/timetoshare";
import { compareCodePoints } from "../json.ts";
import { axisCoordinate } from "../number/coordinate.ts";
import { compareReal, realOf } from "../number/real.ts";
import type { BandKind } from "./bands.ts";
import { BAND_KINDS, bandAddress } from "./bands.ts";
import type { MemberDrawing } from "./files.ts";
import {
  cardAddress,
  elementAddress,
  isNamed,
  memberDrawings,
  partAddress,
  TITLE_ADDRESS,
} from "./files.ts";
import type { ChildTimeline, ConversionMap, Manifest, TimelineManifest } from "./types.ts";

export type Domain = "graphical" | "logical" | "physical";
export type Modality = "continuous" | "discrete";

/** What a selector can test on an element. */
export interface ElementKey {
  /** `null` for a segment, a node of the tree that no selector naming `element` matches. */
  readonly type: ElementType | null;
  /** `null` for the box. */
  readonly address: string | null;
  /** The timeline it belongs to; `null` for the box, a group's frame and a title. */
  readonly timeline: string | null;
  /** `null` for what belongs to no timeline, a band, and a map whose `target_unit` is null. */
  readonly domain: Domain | null;
  readonly modality: Modality | null;
  /** Its timeline's class, a map's `type` or a band's kind; `null` for what belongs to no timeline. */
  readonly class: string | null;
  /**
   * Its holder chain: the types of the elements holding it in the tree
   * (sections 2.1 and 8.1), outermost first, which the selector member
   * `inside` tests. A key's chain is its holder's chain followed by the
   * holder's type, so build keys with `elementKey`, `textKey`, `bandKey`
   * and `unownedKey` from the holder's key; a segment that is not a segment
   * line (type `null`) adds nothing. Two drawings of one address differ here
   * only.
   */
  readonly inside: readonly ElementType[];
}

/**
 * The box's key: it belongs to no timeline, has no address and no holder;
 * it is styled as the schema's `block` element.
 */
export const BOX_KEY: ElementKey = {
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
  return { ...BOX_KEY, type, address, inside: holdersOf(holder) };
}

/**
 * The flow-control element types a flow control band draws, in drawing
 * order: its flow markers, then its jump origins; a `jump_to` draws nothing
 * of its own.
 */
export const DRAWN_FLOW = ["flow_marker", "jump_from"] as const;

/** The domain and modality of every unit (drawing.md section 2.3). */
const UNIT_DOMAINS: Readonly<Record<TimeUnit, readonly [Domain, Modality]>> = {
  number: ["logical", "continuous"],
  floating_measures: ["logical", "continuous"],
  whole_notes: ["logical", "continuous"],
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

/** Whether a string is one of the schema's units. */
export function isUnit(unit: string): unit is TimeUnit {
  return Object.hasOwn(UNIT_DOMAINS, unit);
}

/** The domain and modality of a unit, or `null` for none (a map's `target_unit` may be null). */
export function unitDomain(unit: string | null | undefined): readonly [Domain, Modality] | null {
  return unit === null || unit === undefined || !isUnit(unit) ? null : UNIT_DOMAINS[unit];
}

/** The name of a timeline class, which a selector's `class` matches. */
export type TimelineClass = `${Capitalize<Modality>}${Capitalize<Domain>}Timeline`;

const capitalized = <T extends string>(word: T) =>
  `${word.charAt(0).toUpperCase()}${word.slice(1)}` as Capitalize<T>;

/** The class of a timeline on `unit`: its modality, then its domain, then `Timeline`. */
export function timelineClass(unit: TimeUnit): TimelineClass {
  const [domain, modality] = UNIT_DOMAINS[unit];
  return `${capitalized(modality)}${capitalized(domain)}Timeline`;
}

/** The key of an element of `timeline` held by `holder`, or of its conversion map `map`. */
export function elementKey(
  type: ElementType | null,
  address: string,
  timeline: TimelineManifest,
  holder: ElementKey,
  map?: ConversionMap,
): ElementKey {
  const own = timelineClass(timeline.unit);
  const [domain, modality] = unitDomain(map === undefined ? timeline.unit : map.target_unit) ?? [
    null,
    null,
  ];
  return {
    type,
    address,
    timeline: timeline.id,
    domain,
    modality,
    class: map === undefined ? own : map.type,
    inside: holdersOf(holder),
  };
}

/** The key of an element's own text, `name` or `label`, which the element holds. */
export function textKey(owner: ElementKey, type: "name" | "label"): ElementKey {
  if (owner.address === null) throw new Error("the box holds no text of its own");
  return { ...owner, type, address: partAddress(owner.address, type), inside: holdersOf(owner) };
}

/**
 * The key of the band of `kind` of the timeline `timeline`, held by `holder`,
 * that timeline's line or node: it belongs to the timeline, has no domain
 * and no modality, and its class is its kind.
 */
export function bandKey(timeline: string, kind: BandKind, holder: ElementKey): ElementKey {
  return {
    type: "band",
    address: bandAddress(timeline, kind),
    timeline,
    domain: null,
    modality: null,
    class: kind,
    inside: holdersOf(holder),
  };
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
    for (const child of timeline.children) collect(child, own);
  };
  for (const root of manifest.timelines) collect(root, []);
  return ancestry;
}

/**
 * Whether an element matches every member present in a selector; `class`
 * matches a timeline's class, a map's type or a band's kind alike.
 */
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

/** A timeline's children by offset, then id in code-point order, whatever their order in `children`. */
export function orderedChildren(timeline: TimelineManifest): ChildTimeline[] {
  const offset = (child: ChildTimeline) => realOf(axisCoordinate(child.offset, timeline));
  return [...timeline.children].sort(
    (left, right) =>
      compareReal(offset(left), offset(right)) || compareCodePoints(left.id, right.id),
  );
}

/**
 * The elements of one member drawing (section 8.1) held by `holder`, the
 * box or the frame of `group`: its card, addressed by its group; its ancestor lines, each with its name and its
 * marks of the member's start and end, each mark with its label; then per
 * timeline in pre-order its line and name, or for a segment its node (its
 * line and no name when it is a segment line), then its five bands in the
 * order of `BAND_KINDS`, each followed by what it holds: the children band
 * its children by offset then id, each segment with its boundary when it is
 * not the first segment and its label, which its segment line holds
 * directly; the conversion maps band its maps; the markers band the
 * member's two wedges with their labels; the regions band its regions, and
 * the flow control band its flow markers, then its jump origins, each with
 * its label (a jump target draws nothing of its own).
 */
function memberElements(
  member: MemberDrawing,
  holder: ElementKey,
  group: string | null,
  keys: ElementKey[],
): void {
  const address = (id: string) => elementAddress(member.root, id);
  const root = member.timeline;
  keys.push(elementKey("card", cardAddress(root.id, group), root, holder));
  const line = elementKey("timeline", root.id, root, holder);
  for (const { timeline } of member.ancestors) {
    const ancestor = elementKey("ancestor", timeline.id, timeline, line);
    keys.push(ancestor, textKey(ancestor, "name"));
    for (const end of ["start", "end"] as const) {
      const mark = elementKey("wedge", partAddress(root.id, end), root, ancestor);
      keys.push(mark, textKey(mark, "label"));
    }
  }
  const visit = (key: ElementKey, timeline: TimelineManifest) => {
    const labelled = (type: ElementType, at: string, band: ElementKey) => {
      const owned = elementKey(type, at, timeline, band);
      keys.push(owned, textKey(owned, "label"));
    };
    const held: { readonly [kind in BandKind]: (band: ElementKey) => void } = {
      children: (band) => {
        orderedChildren(timeline).forEach((own, index) => {
          if (timeline.is_segment_line) {
            const node = elementKey(own.is_segment_line ? "child" : null, own.id, own, band);
            keys.push(node);
            // A segment's boundary and label are parts of its segment line's line, in no band.
            if (index > 0)
              keys.push(elementKey("boundary", partAddress(own.id, "start"), own, key));
            keys.push(elementKey("label", partAddress(own.id, "label"), own, key));
            visit(node, own);
          } else {
            const node = elementKey("child", own.id, own, band);
            keys.push(node, textKey(node, "name"));
            visit(node, own);
          }
        });
      },
      conversion_maps: (band) => {
        for (const map of timeline.conversion_maps) {
          keys.push(elementKey("map", address(map.id), timeline, band, map));
        }
      },
      markers: (band) => {
        if (timeline !== root) return;
        labelled("wedge", partAddress(timeline.id, "start"), band);
        labelled("wedge", partAddress(timeline.id, "end"), band);
      },
      regions: (band) => {
        for (const region of timeline.regions) labelled("region", address(region.id), band);
      },
      flow_control: (band) => {
        for (const type of DRAWN_FLOW) {
          for (const item of timeline.flow_control) {
            if (item.type === type) labelled(type, address(item.id), band);
          }
        }
      },
    };
    for (const kind of BAND_KINDS) {
      const band = bandKey(timeline.id, kind, key);
      keys.push(band);
      held[kind](band);
    }
  };
  keys.push(line, textKey(line, "name"));
  visit(line, root);
}

/**
 * Every element of a manifest's drawing, in the order of its tree (sections
 * 2.1 and 8.1): the box; the title of a named manifest (one with an `id`
 * or a `name`), addressed `name`; each group's frame, its title and its
 * member drawings in display order; then the roots drawn without a frame. A
 * timeline drawn twice, as an ancestor line and as a line of its own, or as
 * a member of several groups, is listed at each drawing with the same
 * address, and so are a member's start and end, marked on its own line and
 * on each of its ancestor lines; only its cards' addresses differ.
 */
export function manifestElements(manifest: Manifest): ElementKey[] {
  const ordered = canonicalOrder(manifest);
  const keys: ElementKey[] = [BOX_KEY];
  if (isNamed(ordered)) {
    keys.push(unownedKey("name", TITLE_ADDRESS, BOX_KEY));
  }
  const { frames, ungrouped } = memberDrawings(ordered);
  for (const frame of frames) {
    const group = unownedKey("group", frame.group.id, BOX_KEY);
    keys.push(group, unownedKey("name", partAddress(frame.group.id, "name"), group));
    for (const member of frame.members) memberElements(member, group, frame.group.id, keys);
  }
  for (const member of ungrouped) memberElements(member, BOX_KEY, null, keys);
  return keys;
}
