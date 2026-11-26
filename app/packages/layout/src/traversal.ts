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
  type FlowReading,
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
  leaderKey,
  type MemberDrawing,
  orderedChildren,
  type Piece,
  type PlayedSpan,
  playedAt,
  playedSpan,
  reachOf,
  textKey,
  type Unfolding,
} from "@timetoalign/tilie-core/drawing";
import type { Rational, Real } from "@timetoalign/tilie-core/numbers";
import type { ElementType } from "@timetoalign/timetoshare";
import type { Run } from "./boxes.ts";
import type { Cascade, Style } from "./cascade.ts";
import { ROW_PITCH } from "./constants.ts";
import type { GapOrigin, LineEnd, Placement } from "./elements.ts";
import { cleanText, type TextMeasure } from "./metrics.ts";
import { add, coordinateValue, lengthValue, proportion, zero } from "./numbers.ts";
import { unfoldedRoot } from "./switched.ts";

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
  /**
   * Where it starts on the root's axis: the sum of its offsets and its ancestors'; on a switched
   * card (section 8.10), where its drawing in its piece starts on the virtual axis.
   */
  readonly start: Real;
  /** Where it ends on the root's axis (section 3.4); on a switched card, where its drawing ends. */
  readonly end: Real;
  /**
   * Where it starts and ends on the axis of the member drawing's root as written (sections 3.1
   * and 3.4): `start` and `end`, but on a switched card.
   */
  readonly written: { readonly start: Real; readonly end: Real };
  /**
   * The stretch piece of a switched card's FlowMap it is drawn in (section 8.10); null on a card
   * drawn as written, and for a switched card's root, which holds nothing of its own.
   */
  readonly piece: Piece | null;
  /** Its drawing starts or ends at its piece's end, not at its own, and keeps no mark there. */
  readonly startCut: boolean;
  readonly endCut: boolean;
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
  readonly label: Styled & Holder;
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
  /** Direct children in traversal order, keyed by their parent's entry. */
  readonly childrenByParent: ReadonlyMap<Entry, readonly Entry[]>;
  /**
   * The line itself and the segments without a line whose bands join it, in traversal order; a
   * switched card's root followed by its pieces.
   */
  readonly sourcesByLine: ReadonlyMap<Entry, readonly Entry[]>;
  /** The segments of each segment line, in traversal order, its pieces' on a switched card's root. */
  readonly segmentsByLine: ReadonlyMap<Entry, readonly Entry[]>;
}

/**
 * One entry of a FlowMap's `chunks` as a line draws it (section 8.10): its
 * index `k`, whether it is a gap, its span on the virtual axis, its label's
 * text, whether it is drawn (the second and later entries of a run drawn
 * once are not), and whether a boundary marks its drawn start.
 */
export interface DrawnChunk {
  readonly index: number;
  readonly gap: boolean;
  readonly start: Real;
  readonly end: Real;
  readonly text: string;
  readonly drawn: boolean;
  readonly boundary: boolean;
}

/**
 * The chunks a line draws (section 8.10): `timeline` the ID its chunks'
 * addresses carry (a virtual timeline's, or a switched card's timeline's),
 * its entries in the order of `chunks`, and the run gaps of its runs drawn
 * once, each over `[a, b]`, the end of a run's first entry to the end of its
 * last, from the left.
 */
export interface DrawnFlow {
  readonly timeline: string;
  readonly chunks: readonly DrawnChunk[];
  readonly runGaps: readonly (readonly [Real, Real])[];
}

/** What every member drawing of one manifest shares. */
export interface Context {
  /** The manifest drawn, in canonical order: the band order of each timeline is read from it. */
  readonly manifest: Manifest;
  readonly placement: Placement;
  readonly cascade: Cascade;
  readonly measure: TextMeasure;
  /** The reading in force of flow control (section 1): what it does not read is faded; `null` for none. */
  readonly reading: FlowReading | null;
}

/** One timeline drawn as a root, traversed, with the measures of its axis and its texts. */
export interface Scope extends Context {
  readonly member: MemberDrawing;
  /**
   * The chunks of the FlowMap its root's line draws (section 8.10): a virtual timeline's, or a
   * switched card's; null for a line that draws none.
   */
  readonly flow: DrawnFlow | null;
  /** The frame whose member card draws it, null for an ungrouped root's card and an ancestor card. */
  readonly frame: GroupFrame | null;
  /**
   * How its tree is unfolded onto a FlowMap's virtual axis, on a switched card or a card of a
   * switched frame (section 8.10); null for a card drawn as written.
   */
  readonly unfolding: Unfolding | null;
  /**
   * Its root is a member carried through a switched frame onto another member's FlowMap (section
   * 8.10): its root's line, and a virtual member's chunks, are drawn once in each piece.
   */
  readonly carried: boolean;
  /**
   * Where the coordinate `value` of the own axis of `entry`'s timeline is drawn on the root's
   * axis: its position (section 3.1), played in `entry`'s piece on a switched card, undefined
   * where it is played elsewhere.
   */
  readonly at: (entry: Entry, value: Real) => Real | undefined;
  /**
   * The span from `start` to `end` of the own axis of `entry`'s timeline as it is drawn (section
   * 8.10): whole on a card drawn as written; in `entry`'s piece on a switched card, undefined
   * where it does not reach into it.
   */
  readonly over: (entry: Entry, start: Real, end: Real) => PlayedSpan | undefined;
  /**
   * A position of the member drawing's root's axis as written, drawn in `entry`'s piece: itself
   * on a card drawn as written.
   */
  readonly play: (entry: Entry, value: Real) => Real | undefined;
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
  readonly textOf: (owner: Holder, kind: "name" | "label") => Styled & Holder;
  /** The leader line joining the label `label` to its element, held by the label (section 6.6). */
  readonly leaderOf: (label: Holder) => Styled;
  readonly measured: (owner: Styled, text: string) => Measured;
  /** A conversion map, which has no label element. */
  readonly mapped: (
    at: ElementAddress,
    entry: Entry,
    map: ConversionMap,
  ) => Styled & Holder & { entry: Entry };
  /**
   * The element `at` of `entry`, held by its band of `facet`; `types` the classes a region's type
   * statement names (core's `regionClasses`), which its key carries.
   */
  readonly owned: (
    type: Exclude<ElementType, "map">,
    at: ElementAddress,
    entry: Entry,
    facet: Facet,
    types?: readonly string[],
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
  /**
   * The run gaps of its runs drawn once (section 8.10, Runs), each `[a, b]` on its root's axis,
   * from the left: what no line drawn on it draws, so that a line's axes leave them out.
   */
  readonly runGaps: readonly (readonly [Real, Real])[];
  /**
   * The run gap of a run drawn once a position lies in, its ends excluded (section 8.10, Runs):
   * `L × u − D` of its drawn start, where it takes no room and is not drawn; undefined for a
   * position in none.
   */
  runGapOf(value: Real): number | undefined;
  /** `D` at a position: the shrinks of the gaps ending at or before it, summed from the left. */
  shrinkBefore(value: Real): number;
  /**
   * Whether a row spanning `start` to `end` (`null`: open, as the root's open end or an ancestor
   * line running on to the right) crosses `gap`: its span holds the whole gap (section 6.6).
   */
  crosses(gap: Gap, start: Real, end: Real | null): boolean;
}

/**
 * The pieces of the root of `scope` (section 8.10), in their order: the
 * entries a switched card's or a carried card's root draws its tree in,
 * one per stretch piece; none on a card drawn as written.
 */
export const rootPieces = (scope: Scope): readonly Entry[] =>
  (scope.index.sourcesByLine.get(scope.rootEntry) ?? []).filter((entry) => entry.piece !== null);

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
 * margin `V`, a member card of `frame` where one is given, its line drawing
 * the chunks `flow` where they are given (section 8.10). Where `switched`
 * is given, the card is switched or a card of a switched frame (section
 * 8.10): the root holds nothing and spans the virtual axis, named `name`
 * where that is given, and every element of its tree is visited once per
 * stretch piece it reaches into, clipped to it, in the order of the pieces.
 */
export function traverse(
  context: Context,
  member: MemberDrawing,
  holder: Holder,
  S: number,
  V: number,
  frame: GroupFrame | null,
  flow: DrawnFlow | null = null,
  switched: { readonly unfolding: Unfolding; readonly name: string | null } | null = null,
): Scope {
  const { manifest, placement, cascade, measure, reading } = context;
  const root = member.timeline;
  const unfolding = switched?.unfolding ?? null;
  const L = placement.length;
  const h = (size: number) => measure.lineHeight(size);
  const a = (size: number) => measure.ascent(size);
  const d = (size: number) => measure.descent(size);
  const styled = (key: ElementKey, parent: Style): Styled => ({
    address: key.address,
    style: cascade.resolve(key, parent),
  });
  const textOf = (owner: Holder, kind: "name" | "label"): Styled & Holder => {
    const key = textKey(owner.key, kind);
    return { ...styled(key, owner.style), key };
  };
  const leaderOf = (label: Holder): Styled => styled(leaderKey(label.key), label.style);
  const measured = (owner: Styled, text: string): Measured => {
    const clean = cleanText(text);
    return { clean, width: measure.width(clean, owner.style["font-size"]) };
  };

  const entries: Entry[] = [];
  const reaches = new WeakMap<TimelineManifest, Real>();
  const rootLength = lengthValue(root);
  // The root's length or reach as written, and `λ`: that, or the played length of the FlowMap
  // its card is unfolded onto.
  const written = rootLength ?? reachOf(root, manifest, reaches);
  const lambda = unfolding?.length ?? written;
  type Ending = Pick<Entry, "end" | "open" | "rootEnd">;
  // Where each entry ends as written, which its children and segments read (section 3.4).
  const endings = new Map<Entry, Ending>();
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
  ): Ending => {
    const length = lengthValue(timeline);
    if (length !== null) return { end: add(start, length), open: false, rootEnd: false };
    if (parent === undefined) return { end: written, open: true, rootEnd: true };
    if (parent.manifest.is_segment_line) {
      if (next !== undefined) return { end: next, open: false, rootEnd: false };
      return known(endings, parent);
    }
    return { end: add(start, reachOf(timeline, manifest, reaches)), open: true, rootEnd: false };
  };
  /** The entry of `timeline`, held by `parent`'s children band (the root's by `holder`). */
  const entryOf = (
    timeline: TimelineManifest,
    parent: Entry | undefined,
    start: Real,
    ended: Ending,
    drawnAs: Pick<Entry, "start" | "end" | "open" | "rootEnd" | "piece" | "startCut" | "endCut">,
    first: boolean,
  ): Entry => {
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
      ...drawnAs,
      written: { start, end: ended.end },
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
    endings.set(entry, ended);
    entries.push(entry);
    return entry;
  };
  /** Visit the children of `timeline`, starting at `start` as written, held by `parent`. */
  const visitChildren = (
    timeline: TimelineManifest,
    parent: Entry,
    start: Real,
    piece: Piece | null,
  ) => {
    const children = orderedChildren(timeline);
    const starts = children.map((child) =>
      add(start, coordinateValue(child.offset, timeline.number_type)),
    );
    children.forEach((child, index) => {
      visit(child, parent, nth(starts, index), starts[index + 1], index === 0, piece);
    });
  };
  const visit = (
    timeline: TimelineManifest,
    parent: Entry,
    start: Real,
    next: Real | undefined,
    first: boolean,
    piece: Piece | null,
  ) => {
    const ended = ending(timeline, parent, start, next);
    if (unfolding === null || piece === null) {
      const whole = { start, ...ended, piece: null, startCut: false, endCut: false };
      visitChildren(timeline, entryOf(timeline, parent, start, ended, whole, first), start, null);
      return;
    }
    // On a switched card, drawn once in its piece where it reaches into it, cut to it.
    const span = playedSpan(unfolding, piece, start, ended.end);
    if (span === undefined) return;
    const drawnAs = { ...span, open: ended.open && !span.endCut, rootEnd: false, piece };
    visitChildren(timeline, entryOf(timeline, parent, start, ended, drawnAs, first), start, piece);
  };
  const origin = zero(root.number_type);
  const rootEnding = ending(root, undefined, origin, undefined);
  if (unfolding === null || switched === null) {
    const whole = { start: origin, ...rootEnding, piece: null, startCut: false, endCut: false };
    visitChildren(root, entryOf(root, undefined, origin, rootEnding, whole, false), origin, null);
  } else {
    // The root spans the virtual axis and holds nothing; each stretch piece draws the root's
    // tree in it, joined to the root's line as a segment without a line is.
    const shownRoot = unfoldedRoot(root, switched.name);
    const virtual = { end: lambda, open: false, rootEnd: false };
    const top = entryOf(
      shownRoot,
      undefined,
      origin,
      rootEnding,
      { start: origin, ...virtual, piece: null, startCut: false, endCut: false },
      false,
    );
    for (const piece of unfolding.pieces) {
      const span = playedSpan(unfolding, piece, origin, written);
      if (span === undefined) continue;
      const entry: Entry = {
        ...top,
        manifest: root,
        parent: top,
        ...span,
        open: rootEnding.open && !span.endCut,
        rootEnd: false,
        piece,
        line: false,
      };
      endings.set(entry, rootEnding);
      entries.push(entry);
      visitChildren(root, entry, origin, piece);
    }
  }
  const rootEntry = nth(entries, 0);
  const childrenByParent = new Map<Entry, Entry[]>();
  const sourcesByLine = new Map<Entry, Entry[]>();
  const segmentsByLine = new Map<Entry, Entry[]>();
  const append = <K>(lists: Map<K, Entry[]>, key: K, entry: Entry) => {
    const list = lists.get(key);
    if (list === undefined) lists.set(key, [entry]);
    else list.push(entry);
  };
  // The line an entry's bands join: its own, else its parent's (a segment's segment line, a
  // piece's root).
  const lineOf = (entry: Entry): Entry =>
    entry.line || entry.parent === undefined ? entry : lineOf(entry.parent);
  for (const entry of entries) {
    if (entry.parent !== undefined) append(childrenByParent, entry.parent, entry);
    if (entry.segment && entry.parent !== undefined) {
      append(segmentsByLine, lineOf(entry.parent), entry);
    }
    // A segment that is no line, and a piece, join the line of their parent.
    append(sourcesByLine, lineOf(entry), entry);
  }
  const index: TraversalIndex = { childrenByParent, sourcesByLine, segmentsByLine };
  const traversal = new Map(entries.map((entry, index) => [entry, index]));
  const byTraversal = (left: Entry, right: Entry) =>
    known(traversal, left) - known(traversal, right);
  const u = (value: Real) => proportion(value, lambda);
  const relativeX = (value: Real) => L * u(value);
  const relativeEnd = (entry: Entry) => (entry.rootEnd ? L : relativeX(entry.end));
  const play = (entry: Entry, value: Real): Real | undefined => {
    if (unfolding === null) return value;
    return entry.piece === null ? undefined : playedAt(unfolding, entry.piece, value);
  };
  const at = (entry: Entry, value: Real): Real | undefined =>
    unfolding === null ? add(entry.start, value) : play(entry, add(entry.written.start, value));
  const over = (entry: Entry, start: Real, end: Real): PlayedSpan | undefined => {
    if (unfolding === null) {
      return {
        start: add(entry.start, start),
        end: add(entry.start, end),
        startCut: false,
        endCut: false,
      };
    }
    if (entry.piece === null) return undefined;
    const from = entry.written.start;
    return playedSpan(unfolding, entry.piece, add(from, start), add(from, end));
  };

  const held = (
    type: ElementType,
    at: ElementAddress,
    entry: Entry,
    facet: Facet,
    map?: ConversionMap,
    types?: readonly string[],
  ): Styled & Holder & { entry: Entry } => {
    const band = entry.bands[facet];
    const own = elementKey(type, at, entry.manifest, band.key, map);
    const key = types === undefined ? own : { ...own, types };
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
    types?: readonly string[],
  ): Owned & Holder => {
    const item = held(type, at, entry, facet, undefined, types);
    return { ...item, label: textOf(item, "label") };
  };

  return {
    manifest,
    placement,
    cascade,
    measure,
    reading,
    member,
    flow,
    frame,
    unfolding,
    carried: switched !== null && switched.name === null,
    at,
    over,
    play,
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
    leaderOf,
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
    drawnX: (value) =>
      axis.gapOf(value) === undefined && axis.runGapOf(value) === undefined
        ? axis.relative(value)
        : undefined,
  };
}
