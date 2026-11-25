/**
 * One timeline drawn as a root: its timelines in traversal order, each with
 * its five bands, its axis and the measures its bands share
 * (`docs/drawing.md` in TimeToShare, sections 2.1, 2.4, 3.2, 5 and 6.1).
 * The keys mirror core's tree of elements: a child, or a segment's node, is
 * held by its parent's children band, and what a timeline holds of a facet
 * by its band of that facet.
 */

import {
  type ConversionMap,
  type ElementAddress,
  type Facet,
  idAddress,
  type Manifest,
  type OwnerAddress,
  partAddress,
  type TimelineManifest,
} from "@timetoalign/tilie-core";
import {
  bandKey,
  type ElementKey,
  elementKey,
  type GroupFrame,
  type MemberDrawing,
  orderedChildren,
  reachOf,
  textKey,
} from "@timetoalign/tilie-core/drawing";
import type { Rational, Real } from "@timetoalign/tilie-core/numbers";
import type { ElementType } from "@timetoalign/timetoshare";
import type { Run } from "./boxes.ts";
import type { Cascade, Style } from "./cascade.ts";
import { ROW_PITCH } from "./constants.ts";
import type { GapOrigin, LineEnd, Placement } from "./elements.ts";
import { cleanText, type TextMeasure } from "./metrics.ts";
import { add, coordinateValue, lengthValue, proportion, zero } from "./numbers.ts";

/** A drawn element: its address and its cascaded style. */
export interface Styled {
  readonly address: ElementAddress;
  readonly style: Style;
}

/** An element of the tree whose children inherit from it: its key and its cascaded style. */
export interface Holder {
  readonly key: ElementKey;
  readonly style: Style;
}

/**
 * A timeline as the traversal visits it: its key and style, where it starts and ends on the
 * root's axis, its name, its bands, and whether it is drawn.
 */
export interface Entry extends Holder {
  /** The timeline itself. */
  readonly manifest: TimelineManifest;
  /** The entry of its parent; undefined for the root. */
  readonly parent: Entry | undefined;
  /** Where it starts on the root's axis: the sum of its offsets and its ancestors'. */
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
  readonly bands: Readonly<Record<Facet, Holder>>;
  /**
   * Its drawing may be drawn (sections 2.4 and 6.4): it is displayed (its own `display` and that
   * of every band holding it, at any depth, are `inline`) and, for any timeline but the root, its
   * parent's drawing may be drawn. A line that is not displayed hides its timeline's whole
   * drawing, the root's as a child's: a child is then not placed, a segment adds nothing, and a
   * root draws nothing of its own.
   */
  readonly drawn: boolean;
}

/** An element a timeline's band holds: a map, a region, a break, a section break, a barline, a jump or a wedge. */
export interface Owned extends Styled {
  readonly entry: Entry;
  readonly label: Styled;
}

/** A text ready to draw. */
export interface Measured {
  /** The text with every character U+0000–U+001F replaced by a space (`cleanText`). */
  readonly clean: string;
  /** The width of `clean` at its owner's font size. */
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
  /** The frame whose member card draws it, null for an ungrouped root's card and an ancestor card. */
  readonly frame: GroupFrame | null;
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
  /** The card margin `V` (sections 6.5 and 8.6): empty space above its first row or band and below its last. */
  readonly V: number;
  /** The proportion `u` of an exact position on the root's axis (section 3.2). */
  readonly u: (value: Real) => number;
  /**
   * `L × u`: an exact position's distance from the root's start at full scale, which every first
   * fit measures (section 3.2).
   */
  readonly relativeX: (value: Real) => number;
  /**
   * The elided axis of the card drawing it (sections 3.2 and 8.9), where that card draws gaps:
   * its own, or its frame's read on its member's proportions.
   */
  readonly axis: CardAxis | undefined;
  /**
   * The distance of a drawn position from the root's start: `L × u − D` on the elided axis, `L ×
   * u` without one; undefined for a position in a gap, which has no x.
   */
  readonly drawnX: (value: Real) => number | undefined;
  /** The distance of a timeline's end `Xe` from the root's start: `L` for the root's open end. */
  readonly relativeEnd: (entry: Entry) => number;
  readonly h: (size: number) => number;
  readonly a: (size: number) => number;
  readonly d: (size: number) => number;
  readonly styled: (key: ElementKey, parent: Style) => Styled;
  readonly textOf: (owner: Holder, kind: "name" | "label") => Styled;
  readonly measured: (owner: Styled, text: string) => Measured;
  /** A conversion map, which has no label element. */
  readonly mapped: (
    at: ElementAddress,
    entry: Entry,
    map: ConversionMap,
  ) => Styled & Holder & { entry: Entry };
  /** The element `at` of `entry`, held by its band of `facet`. */
  readonly owned: (
    type: Exclude<ElementType, "map">,
    at: ElementAddress,
    entry: Entry,
    facet: Facet,
  ) => Owned & Holder;
}

/** A label of a gap: its element's key, style and text, measured and cut to its `max-width`. */
export interface GapLabel {
  readonly word: "name" | "id" | "coordinate";
  readonly address: ElementAddress;
  readonly style: Style;
  readonly text: string;
  readonly width: number;
}

/**
 * What a gap draws, shared by every drawing of it (sections 2.4, 6.6 and
 * 8.9): its address and key, its cascaded style and its ellipses' (null
 * where it draws none), whether it draws continuations, its displayed
 * labels, the timeline it lies on with the elided coordinates of its piece
 * on that timeline's own axis, and the proportion its label stack is
 * centred on at full scale.
 */
export interface GapSource {
  readonly origin: GapOrigin;
  readonly address: OwnerAddress;
  readonly key: ElementKey;
  readonly style: Style;
  readonly ellipsis: Style | null;
  readonly continuation: boolean;
  readonly labels: readonly GapLabel[];
  readonly timeline: TimelineManifest;
  readonly start: Real;
  readonly end: Real;
  readonly um: number;
  /** It belongs to a frame: drawn across it after every item, never by a card (section 8.5). */
  readonly framed: boolean;
}

/** A gap of an elided axis (section 3.2), with its widths and its edges. */
export interface Gap {
  readonly source: GapSource;
  /** Its stretch on the axis of the card's root: exact for a card's gap, `p × λ` for a frame's. */
  readonly a: Real;
  readonly b: Real;
  /** The proportions of its ends. */
  readonly ua: number;
  readonly ub: number;
  /**
   * A frame's gap: the exact proportions of its ends (section 8.9, Carried gaps), each the exact
   * quotient of the stretch's end on its member's axis and that member's length or reach (a
   * float at its exact binary value), clipped to `[0, 1]`, or, where an earlier piece cut the
   * stretch, that piece's exact end; `ua` and `ub` are the doubles nearest them. Absent on a
   * card's gap.
   */
  readonly exact?: readonly [Rational, Rational];
  /** Its natural width `n`, drawn width `g` and shrink `n − g`. */
  readonly n: number;
  readonly g: number;
  readonly shrink: number;
  /** `L × u − D` at its two ends: its edges `x(a)` and `x(b)` less `x0`. */
  readonly left: number;
  readonly right: number;
  /** The timeline in the card whose markers band holds its label stack; none where it has none there. */
  readonly entry: Entry | undefined;
}

/**
 * The elided axis of a card (section 3.2): its gaps from the left, its runs,
 * and the distance `L × u − D` of a position from the root's start, `D` the
 * shrinks of the gaps ending at or before it, summed from the left.
 */
export interface CardAxis {
  readonly gaps: readonly Gap[];
  /**
   * The positions of its seams, from the left: an ancestor card's room under its frame's borders
   * (section 8.8, step 2), where its axis jumps right by the seam's width and nothing is left out.
   */
  readonly seams: readonly Real[];
  readonly runs: readonly Run[];
  /** The sum of every shrink, a seam's its negated width: `D` at the root's end, `DG` of a frame. */
  readonly total: number;
  /**
   * `L − D` at the open end of a root of unknown length lying at `value` (section 3.2): `D` the
   * sum of every shrink, summed from the left, a seam at `value` counted on the side facing the
   * protected span, so the end lies left of the seam at the span's end.
   */
  endAt(value: Real): number;
  /**
   * `L × u − D` of a position in no gap; a position at a seam lies on the side of the seam that
   * faces the protected span.
   */
  relative(value: Real): number;
  /**
   * `L × u − D` of a position as the end (`"before"`) or the start (`"after"`) of a run: at a seam
   * on its left or its right side, elsewhere as `relative`.
   */
  relativeAt(value: Real, side: "before" | "after"): number;
  /**
   * `L × u − D` of a position as the start of a line, of a region or as a jump's target: at a
   * seam that puts starts on its right side (between two anchors of a root drawn once, section
   * 8.8), the start of the run right of it, elsewhere as `relative`.
   */
  startAt(value: Real): number;
  /** The gap a position lies in, its ends excluded; undefined for a position in no gap. */
  gapOf(value: Real): Gap | undefined;
  /** `D` at a position: the shrinks of the gaps ending at or before it, summed from the left. */
  shrinkBefore(value: Real): number;
  /**
   * Whether a row spanning `start` to `end` (`null`: open, as the root's open end or an ancestor
   * line running on to the right) crosses `gap`: its span holds the whole gap (section 6.6).
   */
  crosses(gap: Gap, start: Real, end: Real | null): boolean;
}

/** Whether a style displays its element: its `display` is `inline`. */
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

/** The largest font size among `items`, or `fallback` when there are none. */
export const maxSize = (items: readonly Styled[], fallback = 9): number =>
  items.length === 0 ? fallback : Math.max(...items.map((item) => item.style["font-size"]));

/** The pitch `max(10 + S, h(size))` of a row whose name has font size `size`. */
export const rowPitch = (scope: Scope, size: number): number =>
  Math.max(ROW_PITCH + scope.S, scope.h(size));

/** How a timeline drawn up to its end ends (section 6.6): an open end with three chevrons. */
export function endOf(timeline: TimelineManifest, topLevel: boolean, open = false): LineEnd {
  if (open) return "unknown";
  if (!topLevel) return "diamond";
  if (timeline.locked) return "circle";
  return timeline.is_segment_line ? "open" : "arrowhead";
}

/**
 * Traverse one timeline drawn as a root (section 6.1), its line held by
 * `holder`, the block or its group's frame, in a card of spacing `S` and
 * margin `V`, a member card of `frame` where one is given.
 */
export function traverse(
  context: Context,
  member: MemberDrawing,
  holder: Holder,
  S: number,
  V: number,
  frame: GroupFrame | null,
): Scope {
  const { manifest, placement, cascade, measure } = context;
  const root = member.timeline;
  const L = placement.length;
  const h = (size: number) => measure.lineHeight(size);
  const a = (size: number) => measure.ascent(size);
  const d = (size: number) => measure.descent(size);
  const styled = (key: ElementKey, parent: Style): Styled => ({
    address: key.address,
    style: cascade.resolve(key, parent),
  });
  const textOf = (owner: Holder, kind: "name" | "label"): Styled =>
    styled(textKey(owner.key, kind), owner.style);
  const measured = (owner: Styled, text: string): Measured => {
    const clean = cleanText(text);
    return { clean, width: measure.width(clean, owner.style["font-size"]) };
  };

  const entries: Entry[] = [];
  const reaches = new WeakMap<TimelineManifest, Real>();
  const rootLength = lengthValue(root);
  const lambda = rootLength ?? reachOf(root, manifest, reaches);
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
    return { end: add(start, reachOf(timeline, manifest, reaches)), open: true, rootEnd: false };
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
    const key = elementKey(type, idAddress(timeline.id), timeline, outer.key);
    const style = cascade.resolve(key, outer.style);
    const band = (facet: Facet): Holder => {
      const own = bandKey(timeline.id, facet, key);
      return { key: own, style: cascade.resolve(own, style) };
    };
    const bands = {
      children: band("children"),
      conversion_maps: band("conversion_maps"),
      markers: band("markers"),
      regions: band("regions"),
      flow_control: band("flow_control"),
    } satisfies Record<Facet, Holder>;
    const entry: Entry = {
      manifest: timeline,
      parent,
      start,
      ...ending(timeline, parent, start, next),
      key,
      style,
      name: line
        ? textOf({ key, style }, "name")
        : { address: partAddress(idAddress(timeline.id), "name"), style },
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
    at: ElementAddress,
    entry: Entry,
    facet: Facet,
    map?: ConversionMap,
  ): Styled & Holder & { entry: Entry } => {
    const band = entry.bands[facet];
    const key = elementKey(type, at, entry.manifest, band.key, map);
    const style = cascade.resolve(key, band.style);
    return { key, address: at, style, entry };
  };
  const mapped = (at: ElementAddress, entry: Entry, map: ConversionMap) =>
    held("map", at, entry, "conversion_maps", map);
  const owned = (
    type: Exclude<ElementType, "map">,
    at: ElementAddress,
    entry: Entry,
    facet: Facet,
  ): Owned & Holder => {
    const item = held(type, at, entry, facet);
    return { ...item, label: textOf(item, "label") };
  };

  return {
    manifest,
    placement,
    cascade,
    measure,
    member,
    frame,
    root,
    entries,
    rootEntry,
    index,
    byTraversal,
    lambda,
    L,
    S,
    V,
    u,
    relativeX,
    axis: undefined,
    drawnX: relativeX,
    relativeEnd,
    h,
    a,
    d,
    styled,
    textOf,
    measured,
    mapped,
    owned,
  };
}

/** `scope` drawn on the elided axis `axis` of its card (sections 3.2 and 8.9). */
export function withAxis(scope: Scope, axis: CardAxis): Scope {
  return {
    ...scope,
    axis,
    drawnX: (value) => (axis.gapOf(value) === undefined ? axis.relative(value) : undefined),
  };
}
