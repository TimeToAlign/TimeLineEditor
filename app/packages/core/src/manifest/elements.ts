/**
 * The drawn elements of a manifest and the selector test over them
 * (`docs/drawing.md` in TimeToShare, sections 2.1 to 2.3): what a `graphical`
 * rule can select, for the cascade and for the `style` command alike.
 */

import type { ElementType, Selector, TimeUnit } from "@timetoalign/timetoshare";
import { canonicalOrder, expandIri, FORMAT_CONTEXT, NAMESPACE } from "@timetoalign/timetoshare";
import { compareCodePoints } from "../json.ts";
import { expressAs } from "../maps/express.ts";
import { axisCoordinate } from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import { addReal, compareReal, type Real, realOf, toRational } from "../number/real.ts";
import type { ElementAddress, Facet } from "./address.ts";
import {
  BUNDLE_ADDRESS,
  bandAddress,
  cardAddress,
  FACETS,
  idAddress,
  partAddress,
  sameAddress,
  TITLE_ADDRESS,
} from "./address.ts";
import { ELISION_LABELS, elisionsOn, elisionsUnder, groupElisions } from "./elisions.ts";
import type { GroupFrame, MemberDrawing } from "./files.ts";
import { isNamed, memberDrawings } from "./files.ts";
import { FLOW_LINE_ROLES, type FlowLineRole, flowSymbols } from "./flow.ts";
import { findTimeline, groupsHolding, timelineAncestry } from "./tree.ts";
import type {
  ChildTimeline,
  ConversionMap,
  Elision,
  FlowControlElement,
  Manifest,
  NamedTimestamp,
  Region,
  TimelineManifest,
} from "./types.ts";

/** The domain of a timeline: graphical, logical or physical time. */
export type Domain = "graphical" | "logical" | "physical";
/** The modality of a timeline's axis: continuous or discrete. */
export type Modality = "continuous" | "discrete";

/** What a selector can test on an element. */
export interface ElementKey {
  /** `null` for a segment, a node of the tree that no selector naming `element` matches. */
  readonly type: ElementType | null;
  /** Its address: `{}` for the block. */
  readonly address: ElementAddress;
  /** The timeline it belongs to; `null` for the block, a group's frame and a title. */
  readonly timeline: string | null;
  /** `null` for what belongs to no timeline, a band, and a map whose `target_unit` is null. */
  readonly domain: Domain | null;
  readonly modality: Modality | null;
  /** Its timeline's class or a map's `type`; `null` for a band and for what belongs to no timeline. */
  readonly class: string | null;
  /** The facet a band draws; `null` for every other element. */
  readonly facet: Facet | null;
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
  /**
   * For a wedge or a label of a named timestamp's stack, whether it marks the timestamp's primary
   * coordinate or a secondary one (section 2), which the selector member `coordinates` tests;
   * absent on every other element, a cross-section line included.
   */
  readonly coordinates?: StampCoordinate;
  /**
   * For a region stating a `type`, the classes it names (`regionClasses`), each in every spelling
   * the selector member `class` matches (section 2.3); absent on every other element.
   */
  readonly types?: readonly string[];
}

/** Which of a named timestamp's coordinates a wedge or a label marks (sections 2 and 2.3). */
export type StampCoordinate = "primary" | "secondary";

/**
 * The block's key: it draws the bundle, whose address is `{}`, belongs to
 * no timeline and has no holder.
 */
export const BLOCK_KEY: ElementKey = {
  type: "block",
  address: BUNDLE_ADDRESS,
  timeline: null,
  domain: null,
  modality: null,
  class: null,
  facet: null,
  inside: [],
};

/** The types an element held by `holder` is inside: the holder's own and the holder's holders'. */
function holdersOf(holder: ElementKey): readonly ElementType[] {
  return holder.type === null ? holder.inside : [...holder.inside, holder.type];
}

/**
 * The key of an element belonging to no timeline, held by `holder`: a
 * group's frame, a title, the line of an alignment anchor or the label
 * that line holds (sections 2.1 and 2.2).
 */
export function unownedKey(
  type: "frame" | "name" | "alignment_anchor" | "label",
  address: ElementAddress,
  holder: ElementKey,
): ElementKey {
  return { ...BLOCK_KEY, type, address, inside: holdersOf(holder) };
}

/**
 * The flow-control elements a flow control band draws, in drawing order:
 * its breaks, section breaks and barlines together (`FLOW_LINE_ROLES`), then
 * its jumps; a jump target draws nothing of its own. An element's type in
 * the drawing is its role.
 */
const DRAWN_FLOW = [FLOW_LINE_ROLES, ["jump"]] as const;

/** The words of a flow-control element's stack, in the order it stacks them (section 6.4, Flow labels). */
const FLOW_LABELS = ["name", "id", "label"] as const;

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
  css_pixels: ["graphical", "continuous"],
  user_units: ["graphical", "continuous"],
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
  address: ElementAddress,
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
    facet: null,
    inside: holdersOf(holder),
  };
}

/** The prefix that stands for the format's namespace in a selector's `class`, in every layer. */
const FORMAT_PREFIX = "tts";

/**
 * The classes the region `region` names by its `type` statement (section
 * 2.3), each in every spelling of a selector's `class` that stands for the
 * same IRI, in the order of the statement. A stated class stands for the
 * IRI it expands to under the manifest's `@context` (`expandIri`), else for
 * itself; a selector's `class` holding `:` stands for the format's
 * namespace followed by `rest` when it is `tts:rest`, whatever the context
 * declares, else for the IRI it expands to under the context, else for
 * itself. So a region's spellings are those of its IRI, `tts:rest`
 * and `p:rest` for every prefix `p` the context declares, that stand for it.
 * `undefined` for a region stating no type.
 */
export function regionClasses(manifest: Manifest, region: Region): readonly string[] | undefined {
  const types = region.statements?.type;
  if (types === undefined) return undefined;
  const context: unknown = manifest["@context"];
  const prefixes = new Set([FORMAT_PREFIX]);
  if (typeof context === "object" && context !== null) {
    for (const [prefix, namespace] of Object.entries(context)) {
      if (typeof namespace === "string" && !Object.hasOwn(FORMAT_CONTEXT, prefix)) {
        prefixes.add(prefix);
      }
    }
  }
  const spellings = new Set<string>();
  for (const stated of types) {
    const iri = expandIri(context, stated) ?? stated;
    const candidates = [iri];
    for (const prefix of prefixes) {
      const namespace = selectorClassIri(context, `${prefix}:`);
      if (iri.startsWith(namespace)) candidates.push(`${prefix}:${iri.slice(namespace.length)}`);
    }
    for (const text of candidates) if (selectorClassIri(context, text) === iri) spellings.add(text);
  }
  return [...spellings];
}

/**
 * The IRI a selector's `class` holding `:` stands for (section 2.3): the
 * format's namespace followed by `rest` for `tts:rest`, else its expansion
 * under `context`, else itself; a class without `:` stands for itself.
 */
function selectorClassIri(context: unknown, text: string): string {
  const colon = text.indexOf(":");
  if (colon < 0) return text;
  if (text.slice(0, colon) === FORMAT_PREFIX) return NAMESPACE + text.slice(colon + 1);
  return expandIri(context, text) ?? text;
}

/** The key of an element's own text, `name` or `label`, which the element holds. */
export function textKey(owner: ElementKey, type: "name" | "label"): ElementKey {
  const { facet, ...address } = owner.address;
  if (facet !== undefined) throw new Error("a band has no text");
  const { coordinates: _marks, types: _types, ...held } = owner;
  return { ...held, type, address: partAddress(address, type), inside: holdersOf(owner) };
}

/**
 * The key of the leader line joining the label `label` of the element `X`
 * to that element (sections 2.1, 2.2 and 6.6): of type `leader`, at `{id: X,
 * part: ["leader"]}`, of the label's timeline, held by the label.
 */
export function leaderKey(label: ElementKey): ElementKey {
  const { coordinates: _marks, types: _types, ...held } = label;
  const { id } = label.address;
  if (id === undefined) throw new Error("a leader joins the label of an element with an ID");
  return {
    ...held,
    type: "leader",
    address: partAddress(idAddress(id), "leader"),
    inside: holdersOf(label),
  };
}

/**
 * The key of the band drawing the facet `facet` of the timeline `timeline`,
 * held by `holder`, that timeline's line or node: it belongs to the
 * timeline, has no domain, no modality and no class, and has its facet.
 */
export function bandKey(timeline: string, facet: Facet, holder: ElementKey): ElementKey {
  return {
    type: "band",
    address: bandAddress(timeline, facet),
    timeline,
    domain: null,
    modality: null,
    class: null,
    facet,
    inside: holdersOf(holder),
  };
}

/**
 * The words of a named timestamp's `display` that name its labels, in the
 * order its stack holds them outwards from its wedge (sections 2 and 6.4,
 * Markers): its name, its ID, its coordinate. Each is a `label` element
 * addressed `{id: X, part: [word]}`.
 */
export const TIMESTAMP_LABELS = ["name", "id", "coordinate"] as const;

/** A word naming one of a named timestamp's labels. */
export type TimestampLabel = (typeof TIMESTAMP_LABELS)[number];

const NO_TIMESTAMPS: readonly NamedTimestamp[] = [];
const timestampLists = new WeakMap<Manifest, ReadonlyMap<string, readonly NamedTimestamp[]>>();

/**
 * The named timestamps of the timeline `timeline` (section 2), in the order
 * `graphical.timestamps` lists them, which is canonical (by timeline, then
 * coordinate, then ID) in a manifest in canonical order; none when it has
 * none. Memoised by the manifest's identity.
 */
export function namedTimestamps(manifest: Manifest, timeline: string): readonly NamedTimestamp[] {
  let lists = timestampLists.get(manifest);
  if (lists === undefined) {
    const built = new Map<string, NamedTimestamp[]>();
    for (const timestamp of manifest.graphical?.timestamps ?? []) {
      const list = built.get(timestamp.timeline);
      if (list === undefined) built.set(timestamp.timeline, [timestamp]);
      else list.push(timestamp);
    }
    lists = built;
    timestampLists.set(manifest, lists);
  }
  return lists.get(timeline) ?? NO_TIMESTAMPS;
}

/**
 * Whether an element matches every member present in a selector:
 * `addresses` by whole address, `class` a timeline's class or a map's type,
 * `facet` a band's facet, `coordinates` a named timestamp's wedge or label of
 * its primary or of a secondary coordinate (section 2.3).
 */
export function selectorMatches(
  select: Selector,
  element: ElementKey,
  ancestry: ReadonlyMap<string, readonly string[]>,
): boolean {
  if (select.element !== undefined && select.element !== element.type) return false;
  if (select.addresses !== undefined) {
    if (!select.addresses.some((address) => sameAddress(address, element.address))) return false;
  }
  if (select.domain !== undefined && select.domain !== element.domain) return false;
  if (select.modality !== undefined && select.modality !== element.modality) return false;
  if (
    select.class !== undefined &&
    select.class !== element.class &&
    !(element.types?.includes(select.class) ?? false)
  ) {
    return false;
  }
  if (select.facet !== undefined && select.facet !== element.facet) return false;
  if (select.inside !== undefined && !element.inside.includes(select.inside)) return false;
  if (select.coordinates !== undefined && select.coordinates !== element.coordinates) return false;
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
 * The gap of the stored elision `elision` lying on `timeline`, held by
 * `holder` (section 2.1), and what the gap holds: its one ellipsis, centred
 * in the gap (section 6.6), at `{id: E, part: ["ellipsis"]}` where its
 * `display` lists `ellipsis`; then, where `labels` holds, the labels its `display` lists, `{id: E, part:
 * [word]}` in the order of `ELISION_LABELS`.
 */
function gapElements(
  elision: Elision,
  timeline: TimelineManifest,
  holder: ElementKey,
  keys: ElementKey[],
  labels: boolean,
): void {
  const at = idAddress(elision.id);
  const gap = elementKey("elision", at, timeline, holder);
  keys.push(gap);
  const { display } = elision;
  if (display.includes("ellipsis")) {
    keys.push(elementKey("ellipsis", partAddress(at, "ellipsis"), timeline, gap));
  }
  if (!labels) return;
  for (const word of ELISION_LABELS) {
    if (display.includes(word)) {
      keys.push(elementKey("label", partAddress(at, word), timeline, gap));
    }
  }
}

/**
 * The elements of one member drawing (section 8.1) held by `holder`, the
 * block or a group's frame: its card, of type `card` (an `ancestor_card` for
 * a root drawn behind a frame, section 8.8); its ancestor lines, each with its name,
 * then the ancestor's own named timestamps within the member's span, of
 * each what its `display` lists as in a markers band (below), its
 * cross-section line held by the ancestor line, then the secondary
 * coordinates on the ancestor line; then per timeline in pre-order its line and name, or for a segment its
 * node (its line and no name when it is a segment line), then its five
 * bands in the order of `FACETS`, each followed by what it holds: the
 * children band its children by offset then ID, each segment with its
 * boundary when it is not the first segment and its label, which its
 * segment line holds directly; the conversion maps band its maps; the
 * markers band its timeline's named timestamps in canonical order, of each
 * the elements its `display` lists: its wedge `{id: X}`, its labels `{id: X,
 * part: [word]}` in the order of `TIMESTAMP_LABELS`, each held by the band
 * beside the wedge and not by it, then its cross-section line `{id: X, part:
 * ["line"]}`, which its timeline's line (or node) holds directly, so that
 * hiding the band leaves the line (sections 2 and 2.2), then the secondary
 * coordinates on its timeline (core's `cardStamps`, in the frame `frame`
 * for a member card), of each the wedge and the labels its `display` lists,
 * but the `coordinate` label of one without a value (section 6.6);
 * every wedge and label of a named timestamp carries `coordinates`, the
 * primary or a secondary one; the regions band its
 * regions, and the flow control band its breaks, section breaks and barlines,
 * then its jumps, each with its label (a jump target draws nothing of its own). In a card
 * drawing a root whole (`elides`: an ungrouped root's card or an ancestor
 * card, section 8.9), each timeline's line (or node) then holds, after its
 * five bands, the gaps of the stored card elisions lying on it
 * (`elisionsUnder` the root) in canonical order, each `{id: E}` of type
 * `elision` with its ellipsis and labels (`gapElements`), whatever the
 * card's `elision-mode`, which the cascade decides as it decides `display`;
 * a member's card in a frame draws none, nor does any card draw a group
 * elision on a timeline of its own (`manifestElements` lists those).
 */
function memberElements(
  manifest: Manifest,
  member: MemberDrawing,
  holder: ElementKey,
  keys: ElementKey[],
  card: "card" | "ancestor_card" = "card",
  frame: GroupFrame | null = null,
  elides = false,
): void {
  const root = member.timeline;
  keys.push(elementKey(card, cardAddress(root.id), root, holder));
  const line = elementKey("timeline", idAddress(root.id), root, holder);
  const drawn = cardStamps(manifest, member, frame);
  const cardElisions = elides ? new Set(elisionsUnder(manifest, root.id)) : undefined;
  // The wedge and the labels its `display` lists of a coordinate of `timestamp` on `timeline`,
  // held by `band` (a markers band or an ancestor line); no `coordinate` label where the
  // coordinate has no value (a secondary coordinate of the frame, section 6.6).
  const marks = (
    timestamp: NamedTimestamp,
    timeline: TimelineManifest,
    band: ElementKey,
    coordinates: StampCoordinate,
    valued = true,
  ) => {
    const at = idAddress(timestamp.id);
    const { display } = timestamp;
    if (display.includes("wedge")) {
      keys.push({ ...elementKey("wedge", at, timeline, band), coordinates });
    }
    for (const word of TIMESTAMP_LABELS) {
      if (display.includes(word) && (valued || word !== "coordinate")) {
        keys.push({ ...elementKey("label", partAddress(at, word), timeline, band), coordinates });
      }
    }
  };
  // The secondary coordinates on `timeline` (section 2, core's `cardStamps`).
  const secondary = (timeline: TimelineManifest, band: ElementKey) => {
    for (const { timestamp, value } of drawn.secondaries.get(timeline.id) ?? []) {
      marks(timestamp, timeline, band, "secondary", value !== null);
    }
  };
  for (const { timeline } of member.ancestors) {
    const ancestor = elementKey("ancestor", idAddress(timeline.id), timeline, line);
    keys.push(ancestor, textKey(ancestor, "name"));
    // The timestamps of the ancestor within the member's span, drawn on its line (section 8.3).
    for (const { timestamp, source } of drawn.stamps) {
      if (source !== "ancestor" || timestamp.timeline !== timeline.id) continue;
      marks(timestamp, timeline, ancestor, "primary");
      if (timestamp.display.includes("cross_section")) {
        keys.push(
          elementKey(
            "cross_section",
            partAddress(idAddress(timestamp.id), "line"),
            timeline,
            ancestor,
          ),
        );
      }
    }
    secondary(timeline, ancestor);
  }
  // A flow-control element of `timeline` held by `band` (section 2.1): its own key (none for a
  // jump target, which is no element), then the labels its stack may draw, its symbol where its
  // manifestation has one and a jump's brackets where a destination's manifestation is `volta`.
  const flowElement = (
    item: FlowControlElement,
    type: FlowLineRole | "jump" | null,
    timeline: TimelineManifest,
    band: ElementKey,
  ) => {
    const at = idAddress(item.id);
    const holder = type === null ? band : elementKey(type, at, timeline, band);
    if (type !== null) {
      keys.push(holder);
      const labelled =
        (item.label !== null && item.label !== undefined) ||
        (item.targets ?? []).some((target) => target.label !== null && target.label !== undefined);
      const texts = {
        name: item.name !== null && item.name !== undefined,
        id: true,
        label: labelled,
      };
      for (const word of FLOW_LABELS) {
        if (texts[word]) keys.push(elementKey("label", partAddress(at, word), timeline, holder));
      }
    }
    if (flowSymbols(item).length > 0) {
      keys.push(elementKey("symbol", partAddress(at, "symbol"), timeline, holder));
    }
    const volta = (item.targets ?? []).some((target) => target.manifestation === "volta");
    if (type === "jump" && volta) {
      keys.push(elementKey("bracket", partAddress(at, "bracket"), timeline, holder));
    }
  };
  const visit = (key: ElementKey, timeline: TimelineManifest) => {
    const labelled = (
      type: ElementType,
      at: ElementAddress,
      band: ElementKey,
      types?: readonly string[],
    ) => {
      const owned = elementKey(type, at, timeline, band);
      keys.push(types === undefined ? owned : { ...owned, types }, textKey(owned, "label"));
    };
    const held: { readonly [facet in Facet]: (band: ElementKey) => void } = {
      children: (band) => {
        orderedChildren(timeline).forEach((own, index) => {
          if (timeline.is_segment_line) {
            const node = elementKey(
              own.is_segment_line ? "child" : null,
              idAddress(own.id),
              own,
              band,
            );
            keys.push(node);
            // A segment's boundary and label are parts of its segment line's line, in no band.
            const segment = idAddress(own.id);
            if (index > 0)
              keys.push(elementKey("boundary", partAddress(segment, "start"), own, key));
            keys.push(elementKey("label", partAddress(segment, "label"), own, key));
            visit(node, own);
          } else {
            const node = elementKey("child", idAddress(own.id), own, band);
            keys.push(node, textKey(node, "name"));
            visit(node, own);
          }
        });
      },
      conversion_maps: (band) => {
        for (const map of timeline.conversion_maps) {
          keys.push(elementKey("map", idAddress(map.id), timeline, band, map));
        }
      },
      markers: (band) => {
        for (const timestamp of namedTimestamps(manifest, timeline.id)) {
          marks(timestamp, timeline, band, "primary");
          if (timestamp.display.includes("cross_section")) {
            const at = partAddress(idAddress(timestamp.id), "line");
            keys.push(elementKey("cross_section", at, timeline, key));
          }
        }
        secondary(timeline, band);
      },
      regions: (band) => {
        for (const region of timeline.regions) {
          labelled("region", idAddress(region.id), band, regionClasses(manifest, region));
        }
      },
      flow_control: (band) => {
        for (const roles of DRAWN_FLOW) {
          for (const item of timeline.flow_control) {
            const role = roles.find((drawn) => drawn === item.role);
            if (role !== undefined) flowElement(item, role, timeline, band);
          }
        }
        for (const item of timeline.flow_control) {
          if (item.role === "jump_target") flowElement(item, null, timeline, band);
        }
        // A member that is a child timeline: the elements of its root's tree outside its own.
        if (timeline !== root || member.ancestors.length === 0) return;
        const own = new Set<TimelineManifest>();
        const collect = (each: TimelineManifest) => {
          own.add(each);
          for (const child of each.children) collect(child);
        };
        collect(root);
        for (const roles of [...DRAWN_FLOW, ["jump_target"] as const]) {
          for (const placed of memberFlow(manifest, member)) {
            if (own.has(placed.timeline)) continue;
            const role = roles.find((drawn) => drawn === placed.element.role);
            if (role === undefined) continue;
            flowElement(
              placed.element,
              role === "jump_target" ? null : role,
              placed.timeline,
              band,
            );
          }
        }
      },
    };
    for (const facet of FACETS) {
      const band = bandKey(timeline.id, facet, key);
      keys.push(band);
      held[facet](band);
    }
    if (cardElisions === undefined) return;
    for (const elision of elisionsOn(manifest, timeline.id)) {
      if (cardElisions.has(elision)) gapElements(elision, timeline, key, keys, true);
    }
  };
  keys.push(line, textKey(line, "name"));
  visit(line, root);
}

/**
 * Every element of a manifest's drawing, in the order of its tree (sections
 * 2.1 and 8.1): the block; the title of a named manifest (one with an `id`
 * or a `name`), addressed `{part: ["name"]}`; the ancestor cards behind the
 * frames (section 8.8), each an `ancestor_card` at `{id: R, part: ["card"]}`
 * followed by the member drawing of its root `R`, all held by the block,
 * whether a rule displays them or not, each followed by the gaps carried
 * into it from the frame `G` it stands behind (section 8.9), one per group
 * elision of `G` (`groupElisions`) in canonical order, each with its
 * ellipsis and no label, keyed as the frame's own gap of it (held by the
 * frame), whose cascaded values it takes; each group's frame, its title
 * and its member drawings in display order; then the roots drawn without a
 * frame; the cards of the ancestor cards and of those roots holding the
 * gaps of the stored card elisions of their timelines (`memberElements`);
 * then, after every item, the gaps of the frames' group elisions, frame by
 * frame in drawing order and each frame's in canonical order, each `{id:
 * E}` of type `elision` held by the frame with its ellipsis and its labels
 * (`gapElements`), belonging to the elision's timeline; then the lines of the groupstamps across their
 * groups' frames (section 6.6), so that every drawn line has an address:
 * timestamp by timestamp in the order of `graphical.timestamps`, for each
 * groupstamp whose `display` lists `cross_section`, one `cross_section` at
 * its line's address `{id: X, part: ["line"]}` per frame holding a card that
 * draws its timeline (the member itself or a descendant of it), held by that
 * frame and belonging to the timestamp's timeline, in the order of the
 * frames; then the alignment anchors of the named
 * MatchStamps (section 8.7), MatchStamp by MatchStamp and each one's
 * anchors in the order of its `alignment_anchors`: each anchor's line `{id:
 * A}`, which the block holds, and, when its `display` lists `name`, the
 * MatchStamp's name at it, a `label` addressed `{id: A, part: ["name"]}`
 * that the line holds. A timeline drawn more than once, as an ancestor
 * line and as a line of its own, or as a member of several groups, is
 * listed at each drawing with the same address, cards included; so is an
 * elision drawn in several cards or frames. The elisions a card derives
 * (section 8.9) depend on the drawing's geometry and are listed nowhere.
 *
 * The list is a list of keys, each element once per drawing of it with its
 * holder, never the order in which a drawing writes its elements (section
 * 8.5): a card's stored gaps stand here after the bands of their timeline,
 * where section 8.5 writes them after the card's whole member drawing, from
 * the left. Read it as a set of keys wherever an order would be compared.
 */
export function manifestElements(manifest: Manifest): ElementKey[] {
  const ordered = canonicalOrder(manifest);
  const keys: ElementKey[] = [BLOCK_KEY];
  if (isNamed(ordered)) {
    keys.push(unownedKey("name", TITLE_ADDRESS, BLOCK_KEY));
  }
  const { frames, ungrouped, ancestorCards } = memberDrawings(ordered);
  const frameOf = (group: string) => unownedKey("frame", idAddress(group), BLOCK_KEY);
  // The gaps of the group elisions of `group`, held by its frame `frame`, labelled or not.
  const groupGaps = (group: string, frame: ElementKey, labels: boolean) => {
    for (const elision of groupElisions(ordered, group)) {
      const timeline = findTimeline(ordered, elision.timeline);
      if (timeline !== undefined) gapElements(elision, timeline, frame, keys, labels);
    }
  };
  for (const { group, root } of ancestorCards) {
    memberElements(ordered, root, BLOCK_KEY, keys, "ancestor_card", null, true);
    groupGaps(group.id, frameOf(group.id), false);
  }
  const drawnFrames = frames.map((drawn) => {
    const { group, members } = drawn;
    const frame = frameOf(group.id);
    keys.push(frame, unownedKey("name", partAddress(idAddress(group.id), "name"), frame));
    for (const member of members) memberElements(ordered, member, frame, keys, "card", drawn);
    return { group, frame };
  });
  for (const member of ungrouped)
    memberElements(ordered, member, BLOCK_KEY, keys, "card", null, true);
  for (const { group, frame } of drawnFrames) groupGaps(group.id, frame, true);
  const ancestry = timelineAncestry(ordered);
  for (const timestamp of ordered.graphical?.timestamps ?? []) {
    if (!timestamp.groupstamp || !timestamp.display.includes("cross_section")) continue;
    const timeline = findTimeline(ordered, timestamp.timeline);
    if (timeline === undefined) continue;
    const holding = groupsHolding(ordered, timeline.id, ancestry);
    const address = partAddress(idAddress(timestamp.id), "line");
    for (const { group, frame } of drawnFrames) {
      if (holding.some((held) => held.id === group.id)) {
        keys.push(elementKey("cross_section", address, timeline, frame));
      }
    }
  }
  for (const matchstamp of ordered.graphical?.matchstamps ?? []) {
    for (const anchor of matchstamp.alignment_anchors) {
      const address = idAddress(anchor.id);
      const line = unownedKey("alignment_anchor", address, BLOCK_KEY);
      keys.push(line);
      if (anchor.display.includes("name")) {
        keys.push(unownedKey("label", partAddress(address, "name"), line));
      }
    }
  }
  return keys;
}

/**
 * A timeline a member drawing draws in its card: a line of the member's
 * tree (the root, a child, a segment, with or without a line of its own) or
 * an ancestor line (section 8.3), with its span on the axis of the member's
 * outermost ancestor (the member's root itself when it is a root), `end`
 * null for an ancestor whose length is not known.
 */
export interface CardTimeline {
  readonly timeline: TimelineManifest;
  readonly start: Real;
  readonly end: Real | null;
  /** It is drawn as an ancestor line of the member. */
  readonly ancestor: boolean;
}

/**
 * Where a card draws a named timestamp from: on a timeline of the member's
 * tree, on an ancestor line of the member (section 8.3), or, a groupstamp
 * of another member of the frame holding the card, by its line across the
 * card (section 6.6).
 */
export type StampSource = "member" | "ancestor" | "frame";

/** A named timestamp a card draws, at its position on the axis of `CardTimeline.start`. */
export interface CardStamp {
  readonly timestamp: NamedTimestamp;
  /**
   * Its position: for a stamp of the frame, the position on the member that lies at the same
   * proportion of its drawn length as the stamp's position on its own member (section 6.6).
   */
  readonly position: Real;
  readonly source: StampSource;
}

/** A named timestamp at a secondary coordinate on a timeline of a card (section 2). */
export interface SecondaryStamp extends CardStamp {
  /**
   * Its coordinate on that timeline: its exact position, every operand at its exact value (a
   * float's exact binary value), less the timeline's exact start, written in the timeline's
   * number type as timetoalign's `express_as` writes it (an int rounded half to even, held as
   * an integral exact value). `null` for a stamp of the frame where the length of the card's
   * member or of the member it lies on is not known (section 6.6): a group maps a position by
   * the proportion of its members' lengths and never carries one member's length to another, so
   * the coordinate is not defined there; the stamp keeps its position, where its line is drawn.
   */
  readonly value: Real | null;
}

/** What the card of one member drawing draws of named timestamps. */
export interface CardStamps {
  /** Its ancestors' lines from the root down to the parent, then its tree in pre-order. */
  readonly timelines: readonly CardTimeline[];
  /**
   * The member's own timestamps, its tree's in pre-order, each timeline's in canonical order;
   * then its ancestors' from the root down whose position lies within the member's span, its
   * ends included (section 8.3); then, for a card in a frame, the groupstamps of the frame's
   * other members in their display order, each member's in the order of its own.
   */
  readonly stamps: readonly CardStamp[];
  /** The member's span on the same axis: its start and its end, at its reach where its length is not known. */
  readonly window: readonly [Real, Real];
  /**
   * The secondary coordinates of the card by the ID of the timeline they lie on (section 2): every
   * stamp of `stamps` whose position the span of a timeline of `timelines` holds, its ends
   * included, but on the stamp's own timeline, in the canonical order of `graphical.timestamps`,
   * each with its coordinate on that timeline. A timeline without one has no entry.
   */
  readonly secondaries: ReadonlyMap<string, readonly SecondaryStamp[]>;
}

const value = (raw: unknown, timeline: TimelineManifest): Real =>
  realOf(axisCoordinate(raw, timeline));

/** Whether `position` lies on the span `[start, end]`, its ends included; no end bounds nothing. */
function spans(start: Real, end: Real | null, position: Real): boolean {
  return compareReal(start, position) <= 0 && (end === null || compareReal(position, end) <= 0);
}

/** Zero on a timeline's axis: an exact 0, or the float 0.0. */
const zeroOf = (timeline: TimelineManifest): Real =>
  timeline.number_type === "float" ? 0 : Rational.of(0n);

const lengthOf = (timeline: TimelineManifest): Real | null =>
  timeline.length === null ? null : value(timeline.length, timeline);

/** The larger of two values, compared exactly; of two equal ones, an exact one before a float. */
function larger(left: Real, right: Real): Real {
  const order = compareReal(left, right);
  if (order !== 0) return order > 0 ? left : right;
  return typeof left === "number" ? right : left;
}

/**
 * The value at the proportion `t / from` of `to` (section 6.6), exactly, a
 * float entering as its exact binary value, as timetoalign maps a position
 * across a group; zero, exact or float as `to`, where `from` is 0, whose
 * proportion is 0 (section 3.2).
 */
function atProportion(t: Real, from: Real, to: Real): Real {
  if (compareReal(from, Rational.of(0n)) === 0) return typeof to === "number" ? 0 : Rational.of(0n);
  return toRational(t).divide(toRational(from)).multiply(toRational(to));
}

/** A value written in `numberType` (core's `expressAs`), an int held as an integral exact value. */
function expressed(exact: Rational, numberType: TimelineManifest["number_type"]): Real {
  const written = expressAs(exact, numberType);
  // `expressAs` refuses only an infinite float, which an exact value never is.
  return typeof written === "bigint" ? Rational.fromParts(written, 1n) : (written as Real);
}

/**
 * The reach of a timeline on its own axis (section 3.4): the largest of its
 * number type's zero and every coordinate its content reaches, displayed or
 * not. A child counts its offset plus its length, or plus its own reach when
 * its length is not known; regions their start and end; every flow-control
 * element its coordinate, and a jump the place each destination with a `by`
 * reaches, its coordinate plus that distance (every other destination lands
 * on a coordinate counted here, a region's start, a child's offset or 0);
 * every named timestamp of it in `manifest`'s `graphical` object its
 * coordinate. Maps are not content, and a measure map belongs to no timeline.
 * `reaches` holds the reach of every timeline already walked, so one traversal
 * walks each subtree once.
 */
export function reachOf(
  timeline: TimelineManifest,
  manifest: Manifest,
  reaches: WeakMap<TimelineManifest, Real> = new WeakMap(),
): Real {
  const cached = reaches.get(timeline);
  if (cached !== undefined) return cached;
  const own = (raw: unknown) => value(raw, timeline);
  let reach = zeroOf(timeline);
  const take = (value: Real) => {
    reach = larger(reach, value);
  };
  for (const child of timeline.children) {
    take(addReal(own(child.offset), lengthOf(child) ?? reachOf(child, manifest, reaches)));
  }
  for (const region of timeline.regions) {
    take(own(region.start));
    take(own(region.end));
  }
  for (const item of timeline.flow_control) {
    const at = own(item.coordinate);
    take(at);
    for (const destination of item.targets ?? []) {
      if (destination.by !== undefined) take(addReal(at, own(destination.by)));
    }
  }
  for (const timestamp of namedTimestamps(manifest, timeline.id)) take(own(timestamp.coordinate));
  reaches.set(timeline, reach);
  return reach;
}

/**
 * A card with the exact position of each of its stamps on the axis of `CardTimeline.start`,
 * every operand at its exact value (a float's exact binary value), and the member's exact start
 * and drawn length there.
 */
interface ExactCard {
  readonly card: CardStamps;
  readonly positions: ReadonlyMap<CardStamp, Rational>;
  readonly start: Rational;
  readonly length: Real;
  /** Whether the member's length is known: its drawn length is not its reach. */
  readonly known: boolean;
}

/** The cards already found, by manifest, member drawing and frame (`NO_FRAME` for none). */
const foundCards = new WeakMap<Manifest, WeakMap<MemberDrawing, WeakMap<object, ExactCard>>>();
const NO_FRAME = {};

/**
 * The timelines and named timestamps of the card drawing `member`, in the
 * frame `frame` when the card is a member card there (null for an ungrouped
 * root's card and an ancestor card, section 8.8, which no groupstamp line
 * crosses). Every position is taken on the axis of the member's outermost
 * ancestor, the member's start being the sum of the offsets from there
 * down, so that no value is negated. A timeline of the member's tree whose
 * length is not known ends where it is drawn to (section 3.4): at its
 * reach, or, a segment, at the next segment's start or its segment line's
 * end; an ancestor whose length is not known has no end. A groupstamp of
 * another member `O` of the frame, one of `O`'s own timestamps, lies on
 * this card at the proportion of the member's drawn length at which it lies
 * on `O`'s (section 6.6); where the member's length or `O`'s is not known,
 * its secondary coordinates there have no value. Memoised by `manifest`,
 * `member` and `frame`.
 */
export function cardStamps(
  manifest: Manifest,
  member: MemberDrawing,
  frame: GroupFrame | null = null,
): CardStamps {
  return exactCard(manifest, member, frame).card;
}

function exactCard(manifest: Manifest, member: MemberDrawing, frame: GroupFrame | null): ExactCard {
  let byMember = foundCards.get(manifest);
  if (byMember === undefined) {
    byMember = new WeakMap();
    foundCards.set(manifest, byMember);
  }
  let byFrame = byMember.get(member);
  if (byFrame === undefined) {
    byFrame = new WeakMap();
    byMember.set(member, byFrame);
  }
  const found = byFrame.get(frame ?? NO_FRAME);
  if (found !== undefined) return found;
  const card = cardOf(manifest, member, frame);
  byFrame.set(frame ?? NO_FRAME, card);
  return card;
}

function cardOf(manifest: Manifest, member: MemberDrawing, frame: GroupFrame | null): ExactCard {
  const root = member.timeline;
  // Each timeline's start exactly, every offset at its exact value.
  const exactStarts = new Map<TimelineManifest, Rational>();
  let base: Real | undefined;
  let exactBase = Rational.of(0n);
  const ancestors: CardTimeline[] = [];
  for (const { timeline, offset } of member.ancestors) {
    const start = base ?? zeroOf(timeline);
    const length = lengthOf(timeline);
    ancestors.push({
      timeline,
      start,
      end: length === null ? null : addReal(start, length),
      ancestor: true,
    });
    exactStarts.set(timeline, exactBase);
    base = addReal(start, value(offset, timeline));
    exactBase = exactBase.add(toRational(value(offset, timeline)));
  }
  const memberStart = base ?? zeroOf(root);
  const reaches = new WeakMap<TimelineManifest, Real>();
  // The member's drawn length: its length, or its reach where that is not known (section 3.4).
  const memberLength = lengthOf(root);
  const lambda = memberLength ?? reachOf(root, manifest, reaches);
  const window = [memberStart, addReal(memberStart, lambda)] as const;
  const tree: CardTimeline[] = [];
  // Where each timeline ends as drawn: at its length; a segment of unknown length at the next
  // segment's start, the last at its segment line's end; any other of unknown length at its reach.
  const visit = (timeline: TimelineManifest, start: Real, exactStart: Rational, end: Real) => {
    tree.push({ timeline, start, end, ancestor: false });
    exactStarts.set(timeline, exactStart);
    const starts = orderedChildren(timeline).map((child) => ({
      child,
      start: addReal(start, value(child.offset, timeline)),
      exact: exactStart.add(toRational(value(child.offset, timeline))),
    }));
    starts.forEach(({ child, start: from, exact }, index) => {
      const length = lengthOf(child);
      const next = starts[index + 1]?.start;
      const to =
        length !== null
          ? addReal(from, length)
          : timeline.is_segment_line
            ? (next ?? end)
            : addReal(from, reachOf(child, manifest, reaches));
      visit(child, from, exact, to);
    });
  };
  visit(root, memberStart, exactBase, window[1]);
  const positions = new Map<CardStamp, Rational>();
  // A stamp at `position`, exactly `exact`.
  const placed = (stamp: CardStamp, exact: Rational): CardStamp => {
    positions.set(stamp, exact);
    return stamp;
  };
  // A named timestamp of `timeline`, starting at `start` (exactly `exactStart`), at its coordinate.
  const at = (timestamp: NamedTimestamp, timeline: TimelineManifest, start: Real) => {
    const own = value(timestamp.coordinate, timeline);
    const exactStart = exactStarts.get(timeline) ?? Rational.of(0n);
    return { position: addReal(start, own), exact: exactStart.add(toRational(own)) };
  };
  const own = tree.flatMap(({ timeline, start }) =>
    namedTimestamps(manifest, timeline.id).map((timestamp) => {
      const { position, exact } = at(timestamp, timeline, start);
      return placed({ timestamp, position, source: "member" }, exact);
    }),
  );
  const inherited = ancestors.flatMap(({ timeline, start }) =>
    namedTimestamps(manifest, timeline.id).flatMap((timestamp): CardStamp[] => {
      const { position, exact } = at(timestamp, timeline, start);
      return spans(window[0], window[1], position)
        ? [placed({ timestamp, position, source: "ancestor" }, exact)]
        : [];
    }),
  );
  const others = (frame?.members ?? []).filter((other) => other.timeline.id !== root.id);
  // The stamps of the frame placed by a drawn length that is a reach: no coordinate is defined.
  const undefinedHere = new Set<CardStamp>();
  const crossing = others.flatMap((other) => {
    const found = exactCard(manifest, other, null);
    return found.card.stamps.flatMap((stamp): CardStamp[] => {
      const exact = found.positions.get(stamp);
      if (stamp.source !== "member" || !stamp.timestamp.groupstamp || exact === undefined) {
        return [];
      }
      const proportion = atProportion(exact.subtract(found.start), found.length, lambda);
      const crossed = placed(
        {
          timestamp: stamp.timestamp,
          position: addReal(memberStart, proportion),
          source: "frame",
        },
        exactBase.add(toRational(proportion)),
      );
      if (memberLength === null || !found.known) undefinedHere.add(crossed);
      return [crossed];
    });
  });
  const stamps = [...own, ...inherited, ...crossing];
  const timelines = [...ancestors, ...tree];
  const order = new Map((manifest.graphical?.timestamps ?? []).map((item, index) => [item, index]));
  const secondaries = new Map<string, SecondaryStamp[]>();
  for (const line of timelines) {
    const lineStart = exactStarts.get(line.timeline) ?? Rational.of(0n);
    const held = stamps
      .filter(
        ({ timestamp, position }) =>
          timestamp.timeline !== line.timeline.id && spans(line.start, line.end, position),
      )
      .sort((left, right) => (order.get(left.timestamp) ?? 0) - (order.get(right.timestamp) ?? 0))
      .map(
        (stamp): SecondaryStamp => ({
          ...stamp,
          value: undefinedHere.has(stamp)
            ? null
            : expressed(
                (positions.get(stamp) ?? toRational(stamp.position)).subtract(lineStart),
                line.timeline.number_type,
              ),
        }),
      );
    if (held.length > 0) secondaries.set(line.timeline.id, held);
  }
  return {
    card: { timelines, stamps, window, secondaries },
    positions,
    start: exactBase,
    length: lambda,
    known: memberLength !== null,
  };
}

/** A flow-control element of a tree with the timeline stating it and its position on an axis. */
export interface PlacedFlow {
  readonly element: FlowControlElement;
  readonly timeline: TimelineManifest;
  /** Where the timeline starts on the axis. */
  readonly start: Real;
  /** Where the element lies on the axis: the timeline's start plus its coordinate. */
  readonly at: Real;
}

/**
 * The flow-control elements the card of a member that is a child timeline
 * draws (section 6.4, Flow control): those of every timeline of its root's
 * tree, the member's own and its descendants' included, each at its
 * position on the member's axis (offset arithmetic from the root down),
 * kept where that position lies on `[0, λ]`, `λ` the member's length or,
 * where that is not known, its reach (section 3.4); in the root's traversal
 * order (section 6.1, children by offset, then ID), each timeline's in the
 * order of its `flow_control`. None for a root, whose card draws its own
 * tree's.
 */
export function memberFlow(manifest: Manifest, member: MemberDrawing): readonly PlacedFlow[] {
  const [top] = member.ancestors;
  if (top === undefined) return [];
  const own = member.timeline;
  // The member's start on the root's axis, summed from the root down.
  let memberStart: Real = zeroOf(top.timeline);
  for (const { timeline, offset } of member.ancestors) {
    memberStart = addReal(memberStart, value(offset, timeline));
  }
  const lambda = own.length === null ? reachOf(own, manifest) : value(own.length, own);
  const back =
    typeof memberStart === "number" ? -memberStart : Rational.of(0n).subtract(memberStart);
  const placed: PlacedFlow[] = [];
  const visit = (timeline: TimelineManifest, start: Real) => {
    const relative = addReal(start, back);
    for (const element of timeline.flow_control) {
      const at = addReal(relative, value(element.coordinate, timeline));
      if (compareReal(at, zeroOf(own)) >= 0 && compareReal(at, lambda) <= 0) {
        placed.push({ element, timeline, start: relative, at });
      }
    }
    for (const child of orderedChildren(timeline)) {
      visit(child, addReal(start, value(child.offset, timeline)));
    }
  };
  visit(top.timeline, zeroOf(top.timeline));
  return placed;
}
