/**
 * One timeline's bands (`docs/drawing.md` in TimeToShare, section 6.4): the
 * side its band order gives each band, the levels of the present ones, and
 * where each lies outwards from its timeline's line, from its start to its
 * outer edge. Also the vocabulary every band shares: a band prepared by its
 * first fits, a line placed on the canvas, and what one timeline draws, by
 * the categories of section 7.2.
 */

import { type BandKind, bandAddress, parseBand } from "@timetoalign/tilie-core";
import type { Real } from "@timetoalign/tilie-core/numbers";
import type {
  JumpElement,
  LineElement,
  MapElement,
  MarkerElement,
  RegionElement,
  TextElement,
  VerticalLineElement,
} from "./elements.ts";
import type { Extent } from "./fit.ts";
import type { Entry } from "./traversal.ts";

/** A side of a timeline's line: up or down, whichever side of its parent's line it lies on. */
export type Side = "above" | "below";

export const opposite = (side: Side): Side => (side === "above" ? "below" : "above");

/** A centred label (section 6.7): its width and the proportion `u` of the position it is centred on. */
export interface Centred {
  readonly width: number;
  readonly u: number;
}

/**
 * A timeline's line placed in its item (sections 3.2, 3.3 and 6.4): what a
 * band of that timeline needs to draw its elements once its start is known.
 * Every position is in item coordinates.
 */
export interface LinePosition {
  /** The shared start `x0` of the member drawing (section 8.2). */
  readonly x0: number;
  /** `x` of an exact position on the root's axis: `x0 + L × u` (section 3.2). */
  readonly x: (value: Real) => number;
  /** `Xe`, `x` of a timeline's end: `x0 + L` for an end that is the root's open end (section 3.4). */
  readonly xEnd: (entry: Entry) => number;
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
   * The ordinate at which a flow marker of the line's flow control band, lying on `side`, ends
   * (section 6.4, Flow markers): for the root of the member drawing its top plus `P` when the band
   * lies below the line and its top plus `Hc − P` when above; for every other timeline
   * `yl − mb` when the band lies below and `yl + mb` when above, `mb = max(E, h(s) / 2)`, `E` the
   * outer edge of the line's side opposite the band and `s` the name size of the row its line
   * lies in.
   */
  readonly flowMarkerEnd: (side: Side) => number;
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
 * over its timelines in traversal order, so flow markers, maps, regions and jumps
 * come band by band, and orders boundaries and segment labels by the
 * traversal order of their segments. Ancestor lines, their marks and the row
 * names belong to the member drawing, not to a timeline.
 */
export interface LineElements {
  /** Its flow control band's flow markers: its own, then each joined segment's, each in canonical order. */
  readonly flowMarkers: readonly VerticalLineElement[];
  /** Its conversion maps band's maps: its own, then each joined segment's, each in canonical order. */
  readonly maps: readonly MapElement[];
  /** Its regions band's braces, in the order its first fit places them. */
  readonly regions: readonly RegionElement[];
  /** Its flow control band's jumps, in the order its first fit places them: sorted stably by span. */
  readonly jumps: readonly JumpElement[];
  /** Its line when displayed: a `timeline` element for the root of the member drawing, else a `child`. */
  readonly line: readonly LineElement[];
  /** The boundaries of its segments, on its line. */
  readonly boundaries: readonly SegmentElement<VerticalLineElement>[];
  /** Its markers band's wedges, start before end: the root's only. */
  readonly wedges: readonly MarkerElement[];
  /** The labels of those wedges, start before end. */
  readonly wedgeLabels: readonly TextElement[];
  /** The labels of its segments, in their tiers above its line. */
  readonly segmentLabels: readonly SegmentElement<TextElement>[];
  /** The labels of its regions band's regions, in the order of `regions`. */
  readonly regionLabels: readonly TextElement[];
  /** The labels of its flow control band's jumps, in the order of `jumps`. */
  readonly jumpLabels: readonly TextElement[];
  /** The labels of its flow control band's flow markers, in the order of `flowMarkers`. */
  readonly flowMarkerLabels: readonly TextElement[];
}

/**
 * One band of a timeline once its first fits are done (section 6.4, the
 * first of the three passes), before any distance is known. Every kind of
 * band but the children band is prepared by its own module; the children
 * band's width comes from its children's layout.
 */
export interface PreparedBand {
  readonly kind: BandKind;
  /** `T/<kind>_1`, `T` its timeline (section 2.2). */
  readonly address: string;
  /**
   * The displayed elements it holds directly, those a segment without a line of its own adds to
   * it included (section 6.4, What a band holds and Segments without a line): wedges, maps, child
   * lines, regions, flow markers and jumps. A label is held by its element and not counted; a segment
   * without a line is no element. The band is present when this is positive (section 6.4,
   * Levels), and a band record's `band.elements` is this number.
   */
  readonly elements: number;
  /**
   * Its width (section 6.4, Where a band lies), the distance its content reaches outwards from its
   * start, summed as its paragraph writes it: the markers band `w / 2 + 13`, or `w / 2 + 13 + 2 +
   * T × h(9)` with label tiers (Markers); the conversion maps band `e = w / 2 + J × (g + d)`
   * (Conversion maps); the regions band `R × pr − S` (Regions); the flow control band `T ×
   * h(9) + (4 + S) + (K − 1) × pj + 2 + h(9)`, or `T × h(9)` without jumps (Flow control). 0 for an
   * absent band, and for the children band, whose width its children's layout gives.
   */
  readonly width: number;
  /**
   * What the band adds to its timeline's extent (section 6.4, Children), each measured from the
   * root's start as section 6.3 measures extents: the extent of every item its first fits place
   * (a region or jump widened to its drawn label, a wedge or flow-marker label), and
   * `[L × u, L × u]` at every flow marker it draws. Empty for the children band: its children's extents are added by
   * their own layout.
   */
  readonly extents: readonly Extent[];
  /** Its drawn centred labels (section 6.7): wedge, region and jump labels. */
  readonly centred: readonly Centred[];
  /**
   * Its elements (section 6.6), the band starting at `start` outwards on `side` of the line
   * placed at `at`: the third pass. The children band draws nothing: each child draws its own.
   */
  draw(start: number, side: Side, at: LinePosition): Partial<LineElements>;
}

/** A present band laid out (section 6.4, Levels and Where a band lies). */
export interface LaidBand {
  readonly kind: BandKind;
  /** `T/<kind>_1`. */
  readonly address: string;
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

/** Where a children band lies once its children are laid out with the other bands of its row (section 6.4, Children). */
export interface ChildrenSpan {
  /** The joint start `c0`, the largest own start of the children bands laid out together. */
  readonly start: number;
  /** Its width: its own rows with the halves they share. */
  readonly width: number;
}

/**
 * The side each band of the timeline `id` lies on (section 6.4, The band
 * order): `above` for the bands listed before `id` in its band order
 * `order`, `below` for those after it, whether present or not.
 */
export function bandSides(order: readonly string[], id: string): Readonly<Record<BandKind, Side>> {
  const line = order.indexOf(id);
  const side = (kind: BandKind): Side =>
    order.indexOf(bandAddress(id, kind)) < line ? "above" : "below";
  return {
    children: side("children"),
    conversion_maps: side("conversion_maps"),
    markers: side("markers"),
    regions: side("regions"),
    flow_control: side("flow_control"),
  };
}

/**
 * The present bands of each side of the timeline `id`, in level order
 * (section 6.4, Levels): above, those listed before `id` in `order`, level 1
 * the one listed nearest before it, then outwards; below, those listed after
 * it, level −1 the one listed nearest after it, then outwards. A band absent
 * from `present` has no level.
 */
export function levelsOf(
  order: readonly string[],
  id: string,
  present: ReadonlySet<BandKind>,
): Readonly<Record<Side, readonly BandKind[]>> {
  const line = order.indexOf(id);
  const kinds = (entries: readonly string[]) =>
    entries.flatMap((entry) => {
      const kind = parseBand(entry)?.kind;
      return kind !== undefined && present.has(kind) ? [kind] : [];
    });
  return { above: kinds(order.slice(0, line).reverse()), below: kinds(order.slice(line + 1)) };
}

/**
 * The markers band and the conversion maps band: at level 1 or −1 each lies
 * against the line, from `c = 0`, and shares its room with the line's reach
 * (section 6.4, Where a band lies).
 */
const againstLine = (kind: BandKind): boolean => kind === "markers" || kind === "conversion_maps";

/**
 * The start `c` of a band of the kind `kind` (section 6.4, Where a band
 * lies), `previous` the outer edge of the present band at the level before
 * it on its side, `undefined` at level 1 or −1, `reach` the line's reach on
 * that side (Level 0), `w` the line's stroke width and `S` the card spacing:
 * at level 1 or −1 the markers band and the conversion maps band start at 0,
 * every other band `S` beyond the larger of `reach` and `w / 2`; any further
 * band starts at `previous` plus `S`. A children band's own start is the larger
 * of this and half its row's pitch (`childrenStart`).
 */
export function bandStart(
  kind: BandKind,
  previous: number | undefined,
  reach: number,
  w: number,
  S: number,
): number {
  if (previous !== undefined) return previous + S;
  return againstLine(kind) ? 0 : Math.max(reach, w / 2) + S;
}

/**
 * Lay out the present bands of one side outwards from the line (section 6.4,
 * Where a band lies), `present` in level order, `reach` the line's reach on
 * that side (Level 0), `w` the line's stroke width and `S` the card spacing:
 *
 * - every band but the children band starts where `bandStart` puts it;
 * - the children band starts at `children.start` and is `children.width`
 *   wide (`children` is given exactly when `present` holds the children
 *   band; its start is never less than the one `bandStart` gives it);
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
  children: ChildrenSpan | undefined,
): LaidSide {
  const sign = side === "above" ? 1 : -1;
  const bands: LaidBand[] = [];
  let edge: number | undefined;
  for (const band of present) {
    const first = edge === undefined;
    let start: number;
    let width: number;
    if (band.kind === "children") {
      if (children === undefined) throw new Error(`${band.address} is laid out without its rows`);
      ({ start, width } = children);
    } else {
      start = bandStart(band.kind, edge, reach, w, S);
      width = band.width;
    }
    const outer = start + width;
    const against = first && againstLine(band.kind);
    edge = against ? Math.max(outer, reach) : outer;
    bands.push({
      kind: band.kind,
      address: band.address,
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
