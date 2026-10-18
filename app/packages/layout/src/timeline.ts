/**
 * One timeline drawn with a line of its own (the root of a member drawing, a
 * displayed child, a displayed segment that is a segment line) laid out with
 * its five bands at its own line (`docs/drawing.md` in timeskeleton, section
 * 6.4, Every timeline's bands). Its bands draw what it holds and what each
 * segment without a line of its own adds to them. The three passes of
 * section 6.4 split the work: `prepareTimeline` (every first fit),
 * `childrenStart` and `layoutTimeline` (the distances, once its children are
 * laid out), `TimelineDrawing.elements` (the ordinates). The children
 * band's first fit and its rows, shared with the other lines of its row, are
 * laid out by `rows.ts` and `children.ts`; this module never places a child.
 */

import {
  BAND_KINDS,
  type BandKind,
  bandAddress,
  bandOrderOf,
  type Real,
} from "@timetoalign/tilie-core";
import {
  bandSides,
  bandStart,
  type Centred,
  fillSide,
  type LaidBand,
  type LineElements,
  type LinePosition,
  levelsOf,
  opposite,
  type PreparedBand,
  type Side,
} from "./bands.ts";
import { type Extent, widen } from "./fit.ts";
import { flowControlBand } from "./flow.ts";
import { type LevelZero, levelZero } from "./line.ts";
import { conversionMapsBand } from "./maps.ts";
import { markersBand } from "./markers.ts";
import { regionsBand } from "./regions.ts";
import type { Entry, Scope } from "./traversal.ts";

/** One timeline once every first fit of its own bands is done (section 6.4, the first pass). */
export interface PreparedTimeline {
  readonly scope: Scope;
  /** Its entry: a timeline drawn with a line of its own. */
  readonly line: Entry;
  /** Its band order (core's `bandOrderOf`): its five band addresses and its id, top to bottom. */
  readonly order: readonly string[];
  /** The side of its line each of its bands lies on, by its band order (section 6.4, The band order). */
  readonly sides: Readonly<Record<BandKind, Side>>;
  /** Its five bands, present or not; the children band without its width. */
  readonly bands: Readonly<Record<BandKind, PreparedBand>>;
  /** The kinds of its present bands on each side, from level 1 or −1 outwards (section 6.4, Levels). */
  readonly levels: Readonly<Record<Side, readonly BandKind[]>>;
  /**
   * The child lines its children band places, in the order its first fit takes them (section
   * 6.4, Children and Segments without a line): its own displayed children with a line of their
   * own (every child of a timeline that is no segment line; every segment that is a segment line)
   * in canonical order, then the displayed children of each joined segment, segment after segment
   * in traversal order, each one's in canonical order. Its children band is present exactly when
   * this is not empty.
   */
  readonly children: readonly Entry[];
  /** Its line, its segments' boundaries and labels. */
  readonly levelZero: LevelZero;
  /**
   * How far its line reaches on each side (section 6.4, Level 0): its map stack on a side is its
   * conversion maps band when that band is present at level 1 or −1 there, and empty otherwise.
   */
  readonly reach: Readonly<Record<Side, number>>;
  /**
   * Its own extent (section 6.4, Children), from the root's start: the smallest interval holding
   * its line's extent and every extent its bands and its level 0 add, its children's left out.
   */
  readonly extent: Extent;
  /** Its drawn centred labels (section 6.7): its segment labels and its bands'. */
  readonly centred: readonly Centred[];
}

/** Where a timeline's line lies once every distance is known (section 6.4, the third pass). */
export interface LinePlace {
  /** The shared start `x0` (section 8.2), in item coordinates. */
  readonly x0: number;
  /** The ordinate `yl` of its line, in item coordinates. */
  readonly y: number;
  /** The name size `s` of the row its line lies in (section 6.2): the root's own name size for the root. */
  readonly size: number;
  /** The member drawing's top, in item coordinates (section 8.4). */
  readonly top: number;
  /** The member drawing's vertical padding `P × v` (section 6.5). */
  readonly Pv: number;
  /** The member drawing's content height `Hc` (section 6.5), its ancestor band included (section 8.4). */
  readonly Hc: number;
}

/** A child placed in its parent's children band (section 6.4, Children). */
export interface PlacedChild {
  /** The child's own drawing, laid out at its own line. */
  readonly drawing: TimelineDrawing;
  /** Its row `k` in its parent's children band, from 1, by that band's first fit (section 6.3). */
  readonly row: number;
  /**
   * `lk`, the distance of its row from its parent's line, outwards on the band's side, shared by
   * the rows `k` of every children band laid out together with its parent's.
   */
  readonly distance: number;
}

/**
 * A children band laid out together with the children bands of the other
 * lines of its timeline's row on the same side (section 6.4, Children): what
 * `rows.ts` gives `layoutTimeline`.
 */
export interface LaidChildren {
  /** `c0`, the largest of the own starts of the bands laid out together (`childrenStart`). */
  readonly start: number;
  /** Its width: `i1 + o1 + … + iC + oC`, its own `C` rows with the halves they share, summed left to right. */
  readonly width: number;
  /** The children it places, in the order of `PreparedTimeline.children`. */
  readonly children: readonly PlacedChild[];
}

/**
 * One timeline drawn with a line of its own, laid out with its bands and its
 * children at every depth (section 6.4): the recursion's unit. A member
 * drawing is the tree of these from its root.
 */
export interface TimelineDrawing {
  readonly prepared: PreparedTimeline;
  /**
   * Its present bands, top to bottom: those above from the outermost to level 1, then those below
   * from level −1 outwards.
   */
  readonly bands: readonly LaidBand[];
  /**
   * The outer edge of each side (section 6.4, Where a band lies): for a child, its edges, which
   * size the halves of its row (Children); for the root, `Ea` and `Eb` before the ancestor band
   * (sections 6.5 and 8.3).
   */
  readonly edges: Readonly<Record<Side, number>>;
  /** Its children band laid out, `undefined` when it is absent. */
  readonly children: LaidChildren | undefined;
  /**
   * Its own elements with its line at `place`: its line and what its bands hold, by the
   * categories of section 7.2, never its children's, which each draw their own.
   */
  elements(place: LinePlace): LineElements;
}

/**
 * The timelines whose content the bands of the line `line` draw (section
 * 6.4, Segments without a line): `line` itself, then, when it is a segment
 * line, each of its displayed segments that is no segment line, in
 * traversal order. Such a segment's bands lie at `line`'s line: what each of
 * its displayed bands holds joins the band of `line` of the same kind, after
 * `line`'s own content; its own band order places nothing. None when `line`
 * is not displayed, which hides its timeline's whole drawing (section 2.4):
 * only the root is laid out so, every other line being placed only when
 * displayed.
 */
export function sourcesOf(scope: Scope, line: Entry): readonly Entry[] {
  if (!line.drawn) return [];
  if (!line.manifest.is_segment_line) return [line];
  return [
    line,
    ...scope.entries.filter((entry) => entry.parent === line && !entry.line && entry.drawn),
  ];
}

/** The children band: the child lines it places, which each draw their own elements. */
function childrenBand(line: Entry, children: readonly Entry[]): PreparedBand {
  return {
    kind: "children",
    address: bandAddress(line.manifest.id, "children"),
    elements: children.length,
    width: 0,
    extents: [],
    centred: [],
    draw: () => ({}),
  };
}

/**
 * The width of the band lying against the line on `side` and sharing its
 * room (section 6.4, Where a band lies, Level 0 and Segment lines): the
 * conversion maps band at level 1 or −1, the line's map stack, or the
 * markers band at level 1, which the line's segment labels lie beyond; else
 * 0.
 */
function againstOf(
  bands: Readonly<Record<BandKind, PreparedBand>>,
  levels: Readonly<Record<Side, readonly BandKind[]>>,
  side: Side,
): number {
  const kind = levels[side][0];
  return kind === "conversion_maps" || (kind === "markers" && side === "above")
    ? bands[kind].width
    : 0;
}

/**
 * The first pass for the timeline drawn with the line `line` (section 6.4):
 * its band order (core's `bandOrderOf` over the scope's manifest), the side
 * of each band, each band prepared by its module from `sourcesOf` (markers,
 * conversion maps, regions, flow control; the children band from
 * `children`), the present bands' levels, its level 0 and its reach on each
 * side, its own extent and its centred labels. Uses no distance and no other
 * line's layout, so every line of a member drawing can be prepared first.
 */
export function prepareTimeline(scope: Scope, line: Entry): PreparedTimeline {
  const id = line.manifest.id;
  const order = bandOrderOf(scope.manifest, id);
  const sources = sourcesOf(scope, line);
  const children = sources.flatMap((source) =>
    scope.entries.filter((entry) => entry.parent === source && entry.line && entry.drawn),
  );
  const bands: Record<BandKind, PreparedBand> = {
    children: childrenBand(line, children),
    conversion_maps: conversionMapsBand(scope, line, sources),
    markers: markersBand(scope, line, sources),
    regions: regionsBand(scope, line, sources),
    flow_control: flowControlBand(scope, line, sources),
  };
  const levels = levelsOf(
    order,
    id,
    new Set(BAND_KINDS.filter((kind) => bands[kind].elements > 0)),
  );
  const zero = levelZero(scope, line);
  const own = [...zero.extents, ...BAND_KINDS.flatMap((kind) => bands[kind].extents)];
  return {
    scope,
    line,
    order,
    sides: bandSides(order, id),
    bands,
    levels,
    children,
    levelZero: zero,
    reach: {
      above: zero.reach("above", againstOf(bands, levels, "above")),
      below: zero.reach("below", againstOf(bands, levels, "below")),
    },
    extent: wholeExtent(own[0] as Extent, own.slice(1)),
    centred: [...zero.centred, ...BAND_KINDS.flatMap((kind) => bands[kind].centred)],
  };
}

/**
 * The own start of the children band of `prepared`, on its side (section
 * 6.4, Where a band lies): the larger of `pl / 2` and the start `bandStart`
 * gives it after the present bands at lower levels of its side, `pl` the
 * pitch of the row its line lies in (`p0` for the root). Defined only for a
 * present children band.
 */
export function childrenStart(prepared: PreparedTimeline, pl: number): number {
  const { scope, line, sides, levels, bands, reach } = prepared;
  const side = sides.children;
  const lower = levels[side].slice(0, levels[side].indexOf("children"));
  const w = line.style["stroke-width"];
  const before = fillSide(
    side,
    lower.map((kind) => bands[kind]),
    reach[side],
    scope.v,
    w,
    undefined,
  );
  const start = bandStart(
    "children",
    lower.length === 0 ? undefined : before.edge,
    reach[side],
    w,
    scope.v,
  );
  return Math.max(start, pl / 2);
}

/**
 * The smallest interval holding `own` and every one of `children`, each end
 * compared exactly (section 6.4, Children): a timeline's own extent from
 * what its line and its bands add, and its extent from its own and its
 * placed children's, once for every line in the first pass (`Fitted.extent`).
 */
export function wholeExtent(own: Extent, children: readonly Extent[]): Extent {
  return children.reduce(widen, own);
}

/** What one line draws, every category empty. */
const NOTHING: LineElements = {
  breaks: [],
  maps: [],
  regions: [],
  jumps: [],
  line: [],
  boundaries: [],
  wedges: [],
  wedgeLabels: [],
  segmentLabels: [],
  regionLabels: [],
  jumpLabels: [],
  breakLabels: [],
};

/**
 * The second pass for one timeline, once its children band is laid out
 * (`children`, `undefined` exactly when that band is absent): each side
 * filled by `fillSide` from its present bands in level order, the children
 * band at `children.start` and `children.width` wide; its outer edges; and
 * its elements once its line's place is known.
 */
export function layoutTimeline(
  prepared: PreparedTimeline,
  children: LaidChildren | undefined,
): TimelineDrawing {
  const { scope, line, sides, levels, bands, reach } = prepared;
  const w = line.style["stroke-width"];
  const fill = (side: Side) =>
    fillSide(
      side,
      levels[side].map((kind) => bands[kind]),
      reach[side],
      scope.v,
      w,
      sides.children === side ? children : undefined,
    );
  const above = fill("above");
  const below = fill("below");
  const edges = { above: above.edge, below: below.edge };
  const laid = [...above.bands.toReversed(), ...below.bands];

  const elements = (place: LinePlace): LineElements => {
    const at = linePosition(prepared, edges, place);
    const parts = [
      prepared.levelZero.draw(at, againstOf(bands, levels, "above")),
      ...laid.map((band) => bands[band.kind].draw(band.start, band.side, at)),
    ];
    const drawn: Record<string, unknown[]> = {};
    for (const category of Object.keys(NOTHING) as (keyof LineElements)[]) {
      drawn[category] = parts.flatMap((part) => (part[category] ?? []) as unknown[]);
    }
    return drawn as unknown as LineElements;
  };

  return {
    prepared,
    bands: laid,
    edges,
    children,
    elements,
  };
}

/**
 * The line of `prepared` placed at `place` (sections 3.2, 3.3 and 6.4), its
 * sides reaching `edges`: what its bands and its level 0 draw from.
 */
function linePosition(
  prepared: PreparedTimeline,
  edges: Readonly<Record<Side, number>>,
  place: LinePlace,
): LinePosition {
  const { scope, line } = prepared;
  const { x0, y, size, top, Pv, Hc } = place;
  return {
    x0,
    x: (value: Real) => x0 + scope.relativeX(value),
    xEnd: (entry: Entry) => x0 + scope.relativeEnd(entry),
    y,
    yAt: (side, outwards) => (side === "above" ? y - outwards : y + outwards),
    beyond: (side, ordinate, labelSize) =>
      side === "above" ? ordinate - scope.d(labelSize) : ordinate + scope.a(labelSize),
    breakEnd: (side) => {
      // The root's breaks run to the padding of the opposite side, counted from the drawing's top.
      if (line === scope.rootEntry) return side === "below" ? top + Pv : top + (Hc - Pv);
      const mb = Math.max(edges[opposite(side)], scope.h(size) / 2);
      return side === "below" ? y - mb : y + mb;
    },
  };
}
