/**
 * One timeline drawn as a root: its timelines in traversal order, each with
 * its five bands, its axis and the measures its bands share
 * (`docs/drawing.md` in TimeToShare, sections 2.1, 2.4, 3.2, 5 and 6.1).
 * The keys mirror core's tree of elements: a child, or a segment's node, is
 * held by its parent's children band, and what a timeline holds of a kind
 * by its band of that kind.
 */

import {
  type BandKind,
  type ConversionMap,
  elementAddress,
  type Manifest,
  partAddress,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import {
  bandKey,
  type ElementKey,
  elementKey,
  type MemberDrawing,
  orderedChildren,
  textKey,
} from "@timetoalign/tilie-core/drawing";
import type { Real } from "@timetoalign/tilie-core/numbers";
import type { ElementType } from "@timetoalign/timetoshare";
import type { Cascade, Style } from "./cascade.ts";
import type { LineEnd, Placement } from "./elements.ts";
import { cleanText, type TextMeasure } from "./metrics.ts";
import { add, coordinateValue, lengthValue, proportion, reachOf, zero } from "./numbers.ts";

export interface Styled {
  readonly address: string;
  readonly style: Style;
}

/** An element of the tree whose children inherit from it: its key and its cascaded style. */
export interface Holder {
  readonly key: ElementKey;
  readonly style: Style;
}

export interface Entry extends Holder {
  readonly manifest: TimelineManifest;
  readonly parent: Entry | undefined;
  readonly start: Real;
  /** Where it ends on the root's axis (section 3.4). */
  readonly end: Real;
  /** Its end is open: no length and nothing else fixes it (section 3.4). */
  readonly open: boolean;
  /** Its end is the open end of the root, drawn at `x0 + L` whatever the reach (section 3.4). */
  readonly rootEnd: boolean;
  /**
   * Its name: drawn for the root and a child, counted for a segment line among segments. A
   * segment that is no line has no name element; its name is its own style, never resolved.
   */
  readonly name: Styled;
  /** A child of a segment line: it has a boundary unless it is the first, and a label. */
  readonly segment: boolean;
  /** The first segment of its segment line, in canonical order. */
  readonly first: boolean;
  /** Drawn as a line of its own: the root, a child, a segment that is a segment line. */
  readonly line: boolean;
  /** Its five bands (sections 2.1 and 2.2): each band's key, held by this timeline, and its style. */
  readonly bands: Readonly<Record<BandKind, Holder>>;
  /**
   * Its drawing may be drawn (sections 2.4 and 6.4): it is displayed (its own `display` and that
   * of every band holding it, at any depth, are `inline`) and, for any timeline but the root, its
   * parent's drawing may be drawn. A line that is not displayed hides its timeline's whole
   * drawing, the root's as a child's: a child is then not placed, a segment adds nothing, and a
   * root draws nothing of its own.
   */
  readonly drawn: boolean;
}

/** An element a timeline's band holds: a map, a region, a flow marker, a jump origin or a wedge. */
export interface Owned extends Styled {
  readonly entry: Entry;
  readonly label: Styled;
}

export interface Measured {
  readonly clean: string;
  readonly width: number;
}

/** The relationships every later layout pass reads from the one pre-order traversal. */
export interface TraversalIndex {
  /** Direct children in traversal order, keyed by their parent's timeline id. */
  readonly childrenByParent: ReadonlyMap<string, readonly Entry[]>;
  /** The line itself and the segments without a line whose bands join it, in traversal order. */
  readonly sourcesByLine: ReadonlyMap<Entry, readonly Entry[]>;
}

/** What every member drawing of one manifest shares. */
export interface Context {
  /** The manifest drawn, in canonical order: the band order of each timeline is read from it. */
  readonly manifest: Manifest;
  readonly placement: Placement;
  readonly cascade: Cascade;
  readonly measure: TextMeasure;
}

/** One timeline drawn as a root, traversed, with the measures of its axis and its texts. */
export interface Scope extends Context {
  readonly member: MemberDrawing;
  /** The timeline drawn as the root. */
  readonly root: TimelineManifest;
  /** Every timeline of its tree in traversal order, the root first. */
  readonly entries: readonly Entry[];
  readonly rootEntry: Entry;
  /** Its children by parent and its lines' sources, built once by the traversal. */
  readonly index: TraversalIndex;
  /** Compares two of `entries` by their traversal order (section 6.1), for sorting. */
  readonly byTraversal: (left: Entry, right: Entry) => number;
  /** The root's length `λ`, or its reach when its length is not known. */
  readonly lambda: Real;
  /** The graphical length `L`. */
  readonly L: number;
  /** The card spacing `S` (sections 6.2 and 8.6): the gap between its rows and between its bands. */
  readonly S: number;
  /** The proportion `u` of an exact position on the root's axis (section 3.2). */
  readonly u: (value: Real) => number;
  /** `L × u`: an exact position's distance from the root's start. */
  readonly relativeX: (value: Real) => number;
  /** The distance of a timeline's end `Xe` from the root's start: `L` for the root's open end. */
  readonly relativeEnd: (entry: Entry) => number;
  readonly h: (size: number) => number;
  readonly a: (size: number) => number;
  readonly d: (size: number) => number;
  readonly address: (id: string) => string;
  readonly styled: (key: ElementKey, parent: Style) => Styled;
  readonly textOf: (owner: Holder, kind: "name" | "label") => Styled;
  readonly measured: (owner: Styled, text: string) => Measured;
  /** A conversion map, which has no label element. */
  readonly mapped: (
    at: string,
    entry: Entry,
    map: ConversionMap,
  ) => Styled & Holder & { entry: Entry };
  /** The element `at` of `entry`, held by its band of `kind`. */
  readonly owned: (
    type: Exclude<ElementType, "map">,
    at: string,
    entry: Entry,
    kind: BandKind,
  ) => Owned & Holder;
}

export const shown = (style: Style): boolean => style.display === "inline";

/** What `map` holds under `key`: a stage reads only what an earlier stage of the pipeline set. */
export function known<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error("a layout stage read a value no earlier stage set");
  return value;
}

/** The item at `index` of `items`, which holds one there. */
export function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`a layout stage read a missing item ${index}`);
  return item;
}

export const maxSize = (items: readonly Styled[], fallback = 9): number =>
  items.length === 0 ? fallback : Math.max(...items.map((item) => item.style["font-size"]));

/** The pitch `max(10 + S, h(size))` of a row whose name has font size `size`. */
export const rowPitch = (scope: Scope, size: number): number =>
  Math.max(10 + scope.S, scope.h(size));

/** How a timeline drawn up to its end ends (section 6.6): an open end with three chevrons. */
export function endOf(timeline: TimelineManifest, topLevel: boolean, open = false): LineEnd {
  if (open) return "unknown";
  if (!topLevel) return "diamond";
  if (timeline.locked) return "circle";
  return timeline.is_segment_line ? "open" : "arrowhead";
}

/**
 * Traverse one timeline drawn as a root (section 6.1), its line held by
 * `holder`, the block or its group's frame, in a card of spacing `S`.
 */
export function traverse(
  context: Context,
  member: MemberDrawing,
  holder: Holder,
  S: number,
): Scope {
  const { manifest, placement, cascade, measure } = context;
  const root = member.timeline;
  const L = placement.length;
  const h = (size: number) => measure.lineHeight(size);
  const a = (size: number) => measure.ascent(size);
  const d = (size: number) => measure.descent(size);
  const address = (id: string) => elementAddress(member.root, id);

  const styled = (key: ElementKey, parent: Style): Styled => {
    if (key.address === null) throw new Error("a styled element has no address");
    return { address: key.address, style: cascade.resolve(key, parent) };
  };
  const textOf = (owner: Holder, kind: "name" | "label"): Styled =>
    styled(textKey(owner.key, kind), owner.style);
  const measured = (owner: Styled, text: string): Measured => {
    const clean = cleanText(text);
    return { clean, width: measure.width(clean, owner.style["font-size"]) };
  };

  const entries: Entry[] = [];
  const reaches = new WeakMap<TimelineManifest, Real>();
  const rootLength = lengthValue(root);
  const lambda = rootLength ?? reachOf(root, reaches);
  /**
   * Where a timeline starting at `start` ends, by the first rule of section
   * 3.4 that applies: its length; the root's reach; the next segment's
   * start; its segment line's end; else its own reach, open.
   */
  const ending = (
    timeline: TimelineManifest,
    parent: Entry | undefined,
    start: Real,
    next: Real | undefined,
  ): Pick<Entry, "end" | "open" | "rootEnd"> => {
    const length = lengthValue(timeline);
    if (length !== null) return { end: add(start, length), open: false, rootEnd: false };
    if (parent === undefined) return { end: lambda, open: true, rootEnd: true };
    if (parent.manifest.is_segment_line) {
      if (next !== undefined) return { end: next, open: false, rootEnd: false };
      return { end: parent.end, open: parent.open, rootEnd: parent.rootEnd };
    }
    return { end: add(start, reachOf(timeline, reaches)), open: true, rootEnd: false };
  };
  const visit = (
    timeline: TimelineManifest,
    parent: Entry | undefined,
    start: Real,
    next: Real | undefined,
    first: boolean,
  ) => {
    const segment = parent?.manifest.is_segment_line === true;
    const line = !segment || timeline.is_segment_line;
    const type = parent === undefined ? "timeline" : line ? "child" : null;
    // A child, and a segment's node, are held by the children band of their parent.
    const outer = parent?.bands.children ?? holder;
    const key = elementKey(type, timeline.id, timeline, outer.key);
    const style = cascade.resolve(key, outer.style);
    const band = (kind: BandKind): Holder => {
      const own = bandKey(timeline.id, kind, key);
      return { key: own, style: cascade.resolve(own, style) };
    };
    const bands = {
      children: band("children"),
      conversion_maps: band("conversion_maps"),
      markers: band("markers"),
      regions: band("regions"),
      flow_control: band("flow_control"),
    } satisfies Record<BandKind, Holder>;
    const entry: Entry = {
      manifest: timeline,
      parent,
      start,
      ...ending(timeline, parent, start, next),
      key,
      style,
      name: line
        ? textOf({ key, style }, "name")
        : { address: partAddress(timeline.id, "name"), style },
      segment,
      first,
      line,
      bands,
      drawn:
        shown(style) &&
        (parent === undefined || (shown(parent.bands.children.style) && parent.drawn)),
    };
    entries.push(entry);
    const children = orderedChildren(timeline);
    const starts = children.map((child) =>
      add(start, coordinateValue(child.offset, timeline.number_type)),
    );
    children.forEach((child, index) => {
      visit(child, entry, nth(starts, index), starts[index + 1], index === 0);
    });
  };
  visit(root, undefined, zero(root.number_type), undefined, false);
  const rootEntry = nth(entries, 0);
  const childrenByParent = new Map<string, Entry[]>();
  const sourcesByLine = new Map<Entry, Entry[]>();
  const append = <K>(lists: Map<K, Entry[]>, key: K, entry: Entry) => {
    const list = lists.get(key);
    if (list === undefined) lists.set(key, [entry]);
    else list.push(entry);
  };
  for (const entry of entries) {
    if (entry.parent !== undefined) append(childrenByParent, entry.parent.manifest.id, entry);
    // A segment that is no line joins the line of its segment line, its parent.
    append(sourcesByLine, entry.line ? entry : (entry.parent ?? entry), entry);
  }
  const index: TraversalIndex = { childrenByParent, sourcesByLine };
  const traversal = new Map(entries.map((entry, index) => [entry, index]));
  const byTraversal = (left: Entry, right: Entry) =>
    known(traversal, left) - known(traversal, right);
  const u = (value: Real) => proportion(value, lambda);
  const relativeX = (value: Real) => L * u(value);
  const relativeEnd = (entry: Entry) => (entry.rootEnd ? L : relativeX(entry.end));

  const held = (
    type: ElementType,
    at: string,
    entry: Entry,
    kind: BandKind,
    map?: ConversionMap,
  ): Styled & Holder & { entry: Entry } => {
    const band = entry.bands[kind];
    const key = elementKey(type, at, entry.manifest, band.key, map);
    const style = cascade.resolve(key, band.style);
    return { key, address: at, style, entry };
  };
  const mapped = (at: string, entry: Entry, map: ConversionMap) =>
    held("map", at, entry, "conversion_maps", map);
  const owned = (
    type: Exclude<ElementType, "map">,
    at: string,
    entry: Entry,
    kind: BandKind,
  ): Owned & Holder => {
    const item = held(type, at, entry, kind);
    return { ...item, label: textOf(item, "label") };
  };

  return {
    manifest,
    placement,
    cascade,
    measure,
    member,
    root,
    entries,
    rootEntry,
    index,
    byTraversal,
    lambda,
    L,
    S,
    u,
    relativeX,
    relativeEnd,
    h,
    a,
    d,
    address,
    styled,
    textOf,
    measured,
    mapped,
    owned,
  };
}
