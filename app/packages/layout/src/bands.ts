/**
 * One timeline's bands (`docs/drawing.md` in TimeToShare, section 6.4): the
 * side its band order gives each band, the levels of the present ones, and
 * where each lies outwards from its timeline's line, from its start to its
 * outer edge. Also the vocabulary every band shares: a band prepared by its
 * first fits, a line placed on the canvas, and what one timeline draws, by
 * the categories of section 7.2.
 */

import { type Facet, isFacet, LINE } from "@timetoalign/tilie-core";
import type { Real } from "@timetoalign/tilie-core/numbers";
import type { AxisMarker, AxisTimestamp } from "./boxes.ts";
import type {
  Cut,
  JumpElement,
  LineElement,
  MapElement,
  MarkerElement,
  RegionElement,
  TextElement,
  VerticalLineElement,
} from "./elements.ts";
import type { StackLabel } from "./elisions.ts";
import type { Extent } from "./fit.ts";
import type { Entry, Gap } from "./traversal.ts";

/** A side of a timeline's line: up or down, whichever side of its parent's line it lies on. */
export type Side = "above" | "below";

/** The other side of the line. */
export const opposite = (side: Side): Side => (side === "above" ? "below" : "above");

/**
 * A drawn centred label (section 6.7): its width and the distance `L × u` from
 * the root's start of the position it is centred on, `L × u − D` in a card
 * with gaps (section 3.2), `xm − x0` for an elision's label.
 */
export interface Centred {
  readonly width: number;
  readonly x: number;
  /** Its carry `v`, by which a turned wedge moves it across (section 6.7); 0 where absent. */
  readonly v?: number;
}

/**
 * A timeline's line placed in its item (sections 3.2, 3.3 and 6.4): what a
 * band of that timeline needs to draw its elements once its start is known.
 * Every position is in item coordinates.
 */
export interface LinePosition {
  /** The shared start `x0` of the member drawing (section 8.2). */
  readonly x0: number;
  /**
   * `x` of an exact position on the root's axis (section 3.2): `x0 + L × u`, on an elided axis
   * `x0 + (L × u − D)`; a position in a gap has none (`gap`).
   */
  readonly x: (value: Real) => number;
  /**
   * `x` of a position as the start of what follows it: at a seam of a root drawn once (section
   * 8.8, Drawn once), on the run right of it, where a region starts or a jump lands; `x` elsewhere.
   * `x` itself reads the line's own start so, and so its named timestamps there.
   */
  readonly xAfter: (value: Real) => number;
  /**
   * `Xe`, `x` of a timeline's end: `x0 + L` for an end that is the root's open end (section 3.4),
   * `x0 + (L − D)` on an elided axis, `D` every gap's shrink.
   */
  readonly xEnd: (entry: Entry) => number;
  /**
   * The edges `x(a)` and `x(b)` of the gap a position lies in on an elided axis (sections 3.2
   * and 6.6, Elisions), its ends excluded; undefined for a position in no gap. An element
   * marking a position in a gap is not drawn.
   */
  readonly gap: (value: Real) => Cut | undefined;
  /**
   * The edges of the gaps a row spanning `start` to `end` crosses, from the left (`end` null: open
   * to the right), where its line or outline stops and resumes (section 6.6, Elisions).
   */
  readonly cuts: (start: Real, end: Real | null) => Cut[];
  /** The ordinate `yl` of the line. */
  readonly y: number;
  /**
   * The ordinate of a distance `outwards` from the line, the distance summed whole before
   * (section 3.3): `yl − outwards` above, `yl + outwards` below.
   */
  readonly yAt: (side: Side, outwards: number) => number;
  /** The baseline of a label of font size `size` beyond the ordinate `y` (section 6.6): `y − d(size)` above, `y + a(size)` below. */
  readonly beyond: (side: Side, y: number, size: number) => number;
  /**
   * The ordinate at which a break, a section break or a barline of the line's flow control band,
   * lying on `side`, ends (section 6.4, Flow control): for the root of the member drawing its top plus `P` when the band
   * lies below the line and its top plus `Hc − P` when above; for every other timeline
   * `yl − mb` when the band lies below and `yl + mb` when above, `mb = max(E, h(s) / 2)`, `E` the
   * outer edge of the line's side opposite the band and `s` the name size of the row its line
   * lies in.
   */
  readonly flowLineEnd: (side: Side) => number;
}

/**
 * One element of a segment, kept with its segment: boundaries and segment
 * labels are ordered by the traversal order of their segments over every
 * line of the member drawing (section 7.2), not line by line.
 */
export interface SegmentElement<T> {
  readonly segment: Entry;
  readonly element: T;
}

/**
 * What one timeline drawn with a line of its own draws (its line, and what
 * its bands hold), by the categories of section 7.2, each category in its
 * order within that timeline. A member drawing concatenates each category
 * over its timelines in traversal order, so breaks, section breaks and barlines, maps, regions and jumps
 * come band by band, and orders boundaries and segment labels by the
 * traversal order of their segments. Ancestor lines, their marks and the row
 * names belong to the member drawing, not to a timeline.
 */
export interface LineElements {
  /** Its flow control band's breaks, section breaks and barlines: its own, then each joined segment's, each in canonical order. */
  readonly flowLines: readonly VerticalLineElement[];
  /** Its conversion maps band's maps: its own, then each joined segment's, each in canonical order. */
  readonly maps: readonly MapElement[];
  /** Its regions band's braces, in the order its first fit places them. */
  readonly regions: readonly RegionElement[];
  /** The arcs of its flow control band's jumps, in the order its first fit places them: sorted stably by span. */
  readonly jumps: readonly JumpElement[];
  /** Its line when displayed: a `timeline` element for the root of the member drawing, else a `child`. */
  readonly line: readonly LineElement[];
  /** The boundaries of its segments, on its line. */
  readonly boundaries: readonly SegmentElement<VerticalLineElement>[];
  /**
   * Its markers band's wedges in the order the band places their named timestamps: its own, then
   * those its segments without a line join to it.
   */
  readonly wedges: readonly MarkerElement[];
  /**
   * Its markers band's labels of named timestamps, the marker labels: timestamp by timestamp in
   * the order of `wedges`, each one's in the order of its stack (name, ID, coordinate), whether or
   * not its wedge is drawn.
   */
  readonly wedgeLabels: readonly TextElement[];
  /** The labels of its segments, in their tiers above its line. */
  readonly segmentLabels: readonly SegmentElement<TextElement>[];
  /** The labels of its regions band's regions, in the order of `regions`. */
  readonly regionLabels: readonly TextElement[];
  /** The labels of the arcs of its flow control band's jumps, in the order of `jumps`. */
  readonly jumpLabels: readonly TextElement[];
  /** The labels of its flow control band's breaks, section breaks and barlines, in the order of `flowLines`. */
  readonly flowLineLabels: readonly TextElement[];
  /** The cross-section lines its line holds, in the order its markers band places their timestamps. */
  readonly crossSections: readonly VerticalLineElement[];
  /**
   * The labels of the gaps whose label stacks its markers band places (section 6.4, Markers), by
   * gap, each gap's in stack order: written with the gap, not with the band (section 8.5).
   */
  readonly gapLabels: readonly (readonly [Gap, readonly StackLabel[]])[];
  /**
   * Where a coordinate marker of its line lies, with its line (one, when its line is drawn): what
   * the line's axis carries for an editor's marks (`DrawnAxis.marker`).
   */
  readonly markers: readonly LineMarker[];
}

/** A drawn line, where a coordinate marker of it lies, and the named timestamps it holds. */
export interface LineMarker {
  readonly line: LineElement;
  readonly marker: AxisMarker;
  readonly timestamps: readonly AxisTimestamp[];
}

/**
 * One band of a timeline once its first fits are done (section 6.4, the
 * first of the three passes), before any distance is known. Every kind of
 * band but the children band is prepared by its own module; the children
 * band's width comes from its children's layout, the conversion maps band's
 * from the slots it shares with the bands of its row (`JointSpans`).
 */
export interface PreparedBand {
  /** The facet it draws; its address is `{id: T, facet}`, `T` its timeline (section 2.2). */
  readonly facet: Facet;
  /**
   * The displayed elements it holds directly, those a segment without a line of its own adds to
   * it included (section 6.4, What a band holds and Segments without a line): wedges and the labels
   * of named timestamps, maps, child lines, regions, breaks, section breaks, barlines and the
   * jumps that draw an arc. Any other label is
   * held by its element and not counted; a segment without a line is no element. The band is present when this is positive (section 6.4,
   * Levels), and a band record's `band.elements` is this number.
   */
  readonly elements: number;
  /**
   * Its width (section 6.4, Where a band lies), the distance its content reaches outwards from its
   * start, summed as its paragraph writes it: the markers band `w / 2 + 13`, or `w / 2 + 13 + 2 +
   * T × h(9)` with label tiers (Markers); the regions band `R × pr − S` (Regions); the flow
   * control band `T × h(9) + (4 + S) + (K − 1) × pj + 2 + h(9)`, or `T × h(9)` without jumps (Flow
   * control). 0 for an absent band, for the children band, whose width its children's layout
   * gives, and for the conversion maps band, `e = w / 2 + J × (g + d)` by its slots (Conversion
   * maps).
   */
  readonly width: number;
  /**
   * What the band adds to its timeline's extent (section 6.4, Children), each measured from the
   * root's start as section 6.3 measures extents: the extent of every item its first fits place
   * (a region or a jump's arc widened to its drawn label, a wedge, or the label of a break, a
   * section break or a barline), and `[L × u, L × u]` at every such line it draws. Empty for the children band, whose children's
   * extents are added by their own layout, and for the conversion maps band: a map adds none.
   */
  readonly extents: readonly Extent[];
  /** Its drawn centred labels (section 6.7): wedge, region and jump labels. */
  readonly centred: readonly Centred[];
  /**
   * Its elements (section 6.6), the band starting at `start` outwards on `side` of the line
   * placed at `at`: the third pass. The children band draws nothing, each child drawing its own,
   * nor does the conversion maps band, whose maps take the slots of its row (`drawMaps`).
   */
  draw(start: number, side: Side, at: LinePosition): Partial<LineElements>;
}

/** A present band laid out (section 6.4, Levels and Where a band lies). */
export interface LaidBand {
  readonly facet: Facet;
  readonly side: Side;
  /** Signed and never 0: 1, 2, … above the line, outwards; −1, −2, … below it. */
  readonly level: number;
  /** Its start `c`, a distance outwards from its timeline's line. */
  readonly start: number;
  readonly width: number;
  /**
   * Its outer edge: `c` plus its width, the width summed first; for the markers or conversion
   * maps band at level 1 or −1, the larger of that and the line's reach on its side.
   */
  readonly edge: number;
  /** As `PreparedBand.elements`. */
  readonly elements: number;
}

/** One side of a timeline laid out (section 6.4, Where a band lies). */
export interface LaidSide {
  /** Its present bands, from level 1 or −1 outwards. */
  readonly bands: readonly LaidBand[];
  /** The outer edge of the side: its outermost band's, or the line's reach when no band is present there. */
  readonly edge: number;
}

/**
 * Where a band laid out together with bands of other lines of its row lies
 * (section 6.4, Children and Conversion maps): its start, the common `c0` of
 * the bands laid out together, and its width.
 */
export interface BandSpan {
  readonly start: number;
  readonly width: number;
}

/** The bands of a timeline laid out together with those of other lines: their spans by facet. */
export type JointSpans = Readonly<Partial<Record<"children" | "conversion_maps", BandSpan>>>;

/**
 * The side each band of a timeline lies on (section 6.4, The band order):
 * `above` for the facets listed before `line` in its band order `order`,
 * `below` for those after it, whether present or not.
 */
export function bandSides(order: readonly string[]): Readonly<Record<Facet, Side>> {
  const line = order.indexOf(LINE);
  const side = (facet: Facet): Side => (order.indexOf(facet) < line ? "above" : "below");
  return {
    children: side("children"),
    conversion_maps: side("conversion_maps"),
    markers: side("markers"),
    regions: side("regions"),
    flow_control: side("flow_control"),
  };
}

/**
 * The present bands of each side of a timeline, in level order (section
 * 6.4, Levels): above, the facets listed before `line` in its band order
 * `order`, level 1 the one listed nearest before it, then outwards; below,
 * those listed after it, level −1 the one listed nearest after it, then
 * outwards. A band absent from `present` has no level.
 */
export function levelsOf(
  order: readonly string[],
  present: ReadonlySet<Facet>,
): Readonly<Record<Side, readonly Facet[]>> {
  const line = order.indexOf(LINE);
  const facets = (entries: readonly string[]) =>
    entries.flatMap((entry) => (isFacet(entry) && present.has(entry) ? [entry] : []));
  return { above: facets(order.slice(0, line).reverse()), below: facets(order.slice(line + 1)) };
}

/**
 * The markers band and the conversion maps band: at level 1 or −1 each lies
 * against the line, from `c = 0`, and shares its room with the line's reach
 * (section 6.4, Where a band lies).
 */
const againstLine = (facet: Facet): boolean => facet === "markers" || facet === "conversion_maps";

/**
 * The start `c` of a band drawing the facet `facet` (section 6.4, Where a band
 * lies), `previous` the outer edge of the present band at the level before
 * it on its side, `undefined` at level 1 or −1, `reach` the line's reach on
 * that side (Level 0), `w` the line's stroke width and `S` the card spacing:
 * at level 1 or −1 the markers band and the conversion maps band start at 0,
 * every other band `S` beyond the larger of `reach` and `w / 2`; any further
 * band starts at `previous` plus `S`. A children band's own start is the larger
 * of this and half its row's pitch (`ownStart`).
 */
export function bandStart(
  facet: Facet,
  previous: number | undefined,
  reach: number,
  w: number,
  S: number,
): number {
  if (previous !== undefined) return previous + S;
  return againstLine(facet) ? 0 : Math.max(reach, w / 2) + S;
}

/**
 * Lay out the present bands of one side outwards from the line (section 6.4,
 * Where a band lies), `present` in level order, `reach` the line's reach on
 * that side (Level 0), `w` the line's stroke width and `S` the card spacing:
 *
 * - every band but the children band and the conversion maps band starts
 *   where `bandStart` puts it;
 * - the children band and the conversion maps band, each laid out together
 *   with the bands of other lines of its row, start and are as wide as
 *   `spans` says (`spans` holds a span for each of them that `present`
 *   holds);
 * - every outer edge is the band's start plus its width, the width summed
 *   first, and for the markers or conversion maps band at level 1 or −1 the
 *   larger of that and `reach`, since it shares its room with the line's;
 *   the side's outer edge is its outermost band's, or `reach` when `present`
 *   is empty.
 *
 * Levels are `1, 2, …` above and `−1, −2, …` below, in the order of `present`.
 */
export function fillSide(
  side: Side,
  present: readonly PreparedBand[],
  reach: number,
  S: number,
  w: number,
  spans: JointSpans,
): LaidSide {
  const sign = side === "above" ? 1 : -1;
  const bands: LaidBand[] = [];
  let edge: number | undefined;
  for (const band of present) {
    const first = edge === undefined;
    let start: number;
    let width: number;
    if (band.facet === "children" || band.facet === "conversion_maps") {
      const span = spans[band.facet];
      if (span === undefined) throw new Error(`a ${band.facet} band is laid out without its span`);
      ({ start, width } = span);
    } else {
      start = bandStart(band.facet, edge, reach, w, S);
      width = band.width;
    }
    const outer = start + width;
    const against = first && againstLine(band.facet);
    edge = against ? Math.max(outer, reach) : outer;
    bands.push({
      facet: band.facet,
      side,
      level: sign * (bands.length + 1),
      start,
      width,
      edge,
      elements: band.elements,
    });
  }
  return { bands, edge: edge ?? reach };
}
