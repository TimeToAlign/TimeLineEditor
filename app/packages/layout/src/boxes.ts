/**
 * The containers a drawing records, one list from the block down to the
 * bands, and the axis of every line it draws (`docs/drawing.md` in
 * TimeToShare, sections 3.2, 6.4 and 8).
 */

import type {
  CardPlace,
  ContainerKind,
  ContainerRef,
  Coordinate,
  ElementAddress,
  Facet,
  ItemPlace,
  PlaceKey,
  Real,
} from "@timetoalign/tilie-core";
import {
  exactCoordinate,
  fromFloat,
  Rational,
  toFloat,
  toRational,
} from "@timetoalign/tilie-core/numbers";
import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import type { Style } from "./cascade.ts";
import type { WedgeCorner } from "./rotation.ts";

/**
 * The half-open range `[start, end)` of `Drawing.elements` that a container
 * emitted: a frame or a card its own rectangle when displayed, then
 * everything drawn as part of it, in drawing order (section 8.5); the block
 * every element. A container that is not displayed keeps its range over
 * what it still emits; a band emits nothing, and its range is empty.
 */
export interface ElementRange {
  readonly start: number;
  readonly end: number;
}

/**
 * One container of a drawing, a box: the block, a group's frame, a
 * timeline's card or one of a timeline's bands, with its rectangle in the
 * drawing's coordinates (those of the elements).
 */
export interface DrawnBox {
  readonly kind: ContainerKind;
  /**
   * Where its place lies in `places`, which tells every frame and card apart: `{item: G}` for
   * the frame of `G`, `{item: G, member: T}` for the card of `T` in it, `{item: T}` for an
   * ungrouped root's card; null for the block and a band.
   */
  readonly key: PlaceKey | null;
  /**
   * Its address: `{}` for the block, `{id: G}` for a frame, `{id: T, part: ["card"]}` for every
   * card of `T`, `{id: T, facet}` for a band (the same for every drawing of it).
   */
  readonly address: ElementAddress;
  /**
   * The place key of the box holding it: a frame's for the card of one of its members, the card
   * holding the line of a band's timeline (for a child, the card of the member drawing it lies
   * in) for a band. Null for the block and for what the block holds directly.
   */
  readonly holder: PlaceKey | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly range: ElementRange;
  /**
   * Its own rectangle is drawn: always for the block, for a frame or a card unless its style
   * hides it (its range then opens with that rectangle), never for a band.
   */
  readonly displayed: boolean;
  /**
   * The number of its contents (section 1), absent for a band: the block's items, a frame's
   * cards, a card's rows and bands (its root's row, its root's present bands and its ancestor
   * band when it has one).
   */
  readonly contentCount?: number;
  /**
   * A frame or a block-held card: its place with every default applied, `width` and `height` the
   * drawn size in item coordinates, before the scale; and the place as stated, `{}` when none.
   */
  readonly item?: { readonly place: Required<ItemPlace>; readonly stated: ItemPlace };
  /**
   * Any card: its drawn size in item coordinates, its spacing, the gap between its rows and its
   * bands (a member's card's own `spacing`, a block-held card's its item's, else 4), its margin
   * (likewise, else 0), and what `places` states for it.
   */
  readonly card?: {
    readonly size: { readonly width: number; readonly height: number };
    readonly spacing: number;
    readonly margin: number;
    readonly stated: CardPlace;
  };
  /**
   * An ancestor card (section 8.8), a card the block holds behind the frame of the group `group`,
   * aligned to its member `member`; it has no place, no `item` and no `card` record, and only a
   * displayed one is recorded.
   */
  readonly ancestor?: { readonly group: string; readonly member: string };
  /** A band: its timeline, facet, level, the elements it holds and its timeline's line. */
  readonly band?: {
    readonly timeline: string;
    readonly facet: Facet;
    /** Signed and never 0: 1, 2, … above its timeline's line, outwards; −1, −2, … below it. */
    readonly level: number;
    /** The number of displayed elements it holds directly; at least 1. */
    readonly elements: number;
    /** The ordinate of its timeline's line, telling two drawings of one timeline apart. */
    readonly line: number;
  };
}

/**
 * The identity of the container `ref` as a record states it, read from
 * core's listing of the manifest's containers: its kind, place key and
 * address, and its holder's place key.
 */
export function identityOf(
  ref: ContainerRef,
): Pick<DrawnBox, "kind" | "key" | "address" | "holder"> {
  return {
    kind: ref.kind,
    key: ref.key,
    address: ref.address,
    holder: ref.holder?.key ?? null,
  };
}

/**
 * One map drawn at a line (section 6.4, Conversion maps): its ID, the ID of
 * the timeline it spans (its owner: the line's own timeline or a segment
 * without a line that joins it), the abscissas of its ends and the ordinate
 * of its centre.
 */
export interface AxisMap {
  readonly id: string;
  readonly owner: string;
  readonly xs: number;
  readonly xe: number;
  readonly yc: number;
}

/**
 * One segment of a segment line (sections 3.1 and 3.4): its ID, its offset
 * and its length on its segment line's own axis, the length by the end
 * section 3.4 gives it where its own is not known.
 */
export interface AxisSegment {
  readonly id: string;
  readonly offset: Real;
  readonly length: Real;
}

/**
 * One line drawn, as the axis of its timeline: the abscissas of its start
 * and end (not of its start circle, chevrons or end mark) and the
 * coordinates on its timeline's own axis there. An ancestor line is clipped
 * to its member: its start and end are where it meets the member's start
 * and end, or its own end short of it.
 */
export interface DrawnAxis {
  /** The address of the timeline drawn, `{id: T}`. */
  readonly address: ElementAddress;
  /** The place key of the card whose member drawing draws it. */
  readonly card: PlaceKey;
  /** The ordinate of its line, telling two drawings of one timeline apart. */
  readonly line: number;
  readonly xStart: number;
  /** The end's abscissa; where the end is not known, the reach's. */
  readonly xEnd: number;
  readonly unit: TimeUnit;
  readonly numberType: NumberType;
  readonly start: Real;
  /** Null where the end is not known. */
  readonly end: Real | null;
  /**
   * The coordinate at `xEnd`, on the same scale as every other line of its
   * member drawing: `end` where it is known, else the reach's (section 3.2).
   */
  readonly drawnEnd: Real;
  /** The segments of its timeline when it is a segment line, in canonical order; else none. */
  readonly segments: readonly AxisSegment[];
  /** The maps drawn at its line, in the order they are drawn; none for an ancestor line. */
  readonly maps: readonly AxisMap[];
  /** Where a coordinate marker of its line lies; null for an ancestor line, which draws none. */
  readonly marker: AxisMarker | null;
}

/**
 * Where a coordinate marker of a drawn line lies at any abscissa (sections
 * 6.4, Markers, and 6.6, Wedges and Cross-section lines), as the layout
 * draws a named timestamp's wedge and cross-section line there: the wedge's
 * tip ordinate and the corners of its base, from the start of the
 * line's markers band (or from where that band would start were it present),
 * the cross-section line's ordinates, and what it crosses; each with the
 * style of a wedge or a cross-section line of the line's timeline that no
 * named timestamp holds.
 */
export interface AxisMarker {
  readonly wedge: {
    readonly yt: number;
    readonly corners: readonly [WedgeCorner, WedgeCorner];
    readonly style: Style;
  };
  readonly crossSection: {
    /**
     * The ordinates of the line's cross-section lines, `y1` the smaller: from the smallest to the
     * largest of the line's ordinate and of the start and outer edge of its children band and of
     * its conversion maps band, each where present; null where neither band is present, so that
     * a cross-section line there has no length and is not drawn.
     */
    readonly extent: { readonly y1: number; readonly y2: number } | null;
    /** The style of a cross-section line of the line's timeline, drawn or not. */
    readonly style: Style;
  };
  /**
   * The IDs of the timelines its cross-section lines cross besides its own: its displayed
   * descendants drawn with a line of their own in the member drawing, every one within its
   * children band, in traversal order (section 6.1).
   */
  readonly descendants: readonly string[];
  /**
   * The named timestamps the line holds, its timeline's and those of its segments without a line
   * of their own, in the order its markers band places them, each with the abscissa of its
   * cross-section line, drawn or not (section 8.7).
   */
  readonly timestamps: readonly AxisTimestamp[];
}

/**
 * A named timestamp held by a drawn line: its ID, the abscissa of its
 * cross-section line, that line's style, and the ordinates its stack of
 * labels lies between.
 */
export interface AxisTimestamp {
  readonly id: string;
  readonly x: number;
  /**
   * The style of its cross-section line, whether or not the line has a length there; null where
   * its `display` does not list `cross_section` or the line is not displayed.
   */
  readonly line: Style | null;
  /**
   * The ordinates `[y1, y2]`, `y1` the smaller, of the lines of the markers band its labels lie
   * on, from the first line of its stack to the end of the last (each `h(s)` high, `s` the band's
   * largest label size); null where it draws no label.
   */
  readonly labels: readonly [number, number] | null;
}

/**
 * `value` rounded once into `numberType`: a float to the nearest double, an
 * int to the nearest integer (ties to even), a fraction kept; undefined
 * where the result does not fit a coordinate (int64).
 */
function rounded(value: Rational, unit: TimeUnit, numberType: NumberType): Coordinate | undefined {
  if (numberType === "float") return exactCoordinate(toFloat(value), unit, numberType);
  if (numberType === "fraction") return exactCoordinate(value, unit, numberType);
  const floor = value.floor();
  const twice = value.subtract(Rational.of(floor)).multiply(Rational.of(2n));
  const up = twice.compare(Rational.of(1n));
  const integer = up > 0 || (up === 0 && floor % 2n !== 0n) ? floor + 1n : floor;
  return exactCoordinate(Rational.of(integer), unit, numberType);
}

/**
 * The coordinate at the abscissa `x` of `axis`: `start + (x − xStart) /
 * (xEnd − xStart) × (end − start)`, every double read as its exact value,
 * computed exactly and rounded once into the axis's number type. Null
 * outside `[xStart, xEnd]`, where the end is not known, and where the
 * result does not fit a coordinate.
 */
export function coordinateAt(axis: DrawnAxis, x: number): Coordinate | null {
  const { xStart, xEnd, start, end } = axis;
  if (end === null || !(x >= xStart && x <= xEnd)) return null;
  const from = toRational(start);
  const value =
    xEnd === xStart
      ? from
      : from.add(
          fromFloat(x)
            .subtract(fromFloat(xStart))
            .divide(fromFloat(xEnd).subtract(fromFloat(xStart)))
            .multiply(toRational(end).subtract(from)),
        );
  return rounded(value, axis.unit, axis.numberType) ?? null;
}
