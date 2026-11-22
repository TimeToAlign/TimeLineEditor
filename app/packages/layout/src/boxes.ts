/**
 * The containers a drawing records, one list from the block down to the
 * bands, and the axis of every line it draws (`docs/drawing.md` in
 * TimeToShare, sections 3.2, 6.4 and 8).
 */

import type {
  CardPlace,
  ContainerKind,
  ContainerRef,
  ElementAddress,
  Facet,
  ItemPlace,
  PlaceKey,
  Real,
} from "@timetoalign/tilie-core";
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
  /**
   * The mark of an ancestor line (section 8.3) at the abscissa 0, as its marks of the member's
   * start and end are drawn: above the line, its tip on the line's edge, with the style of a
   * wedge held by that line that no named timestamp holds; null for every other line, whose
   * `marker` holds its wedge.
   */
  readonly mark: AxisWedge | null;
  /**
   * The named timestamps the line holds, its timeline's and those of its segments without a line
   * of their own, in the order its markers band places them, or on an ancestor line those it
   * draws (section 8.3), each with the abscissa of its cross-section line, drawn or not.
   */
  readonly timestamps: readonly AxisTimestamp[];
  /**
   * Set where the card drawing it is an ancestor card (section 8.8): the group whose frame that
   * card lies behind and the member it is aligned to, as its `DrawnBox.ancestor`. Its card's
   * place key has a member card's shape, `{item: group, member: root}`, but the card is no
   * member card of the frame.
   */
  readonly ancestor?: { readonly group: string; readonly member: string };
  /**
   * Set from the second full run on of a line drawn in runs between the strips of its card
   * (sections 3.2 and 8.9): the run's number from 0, from the left. Every run is its own axis,
   * linear, with its timeline's address.
   */
  readonly run?: number;
}

/**
 * A wedge at the abscissa 0 of a drawn line (section 6.6, Wedges): its tip's
 * ordinate, the corners of its base, and its style.
 */
export interface AxisWedge {
  readonly yt: number;
  readonly corners: readonly [WedgeCorner, WedgeCorner];
  readonly style: Style;
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
  readonly wedge: AxisWedge;
  readonly crossSection: {
    /**
     * The ordinates of the card drawing the line, `y1` its top and `y2` its bottom (sections 8.4
     * and 8.6), which every cross-section line of the line crosses (section 6.6).
     */
    readonly span: { readonly y1: number; readonly y2: number };
    /**
     * The gap a cross-section line of the line leaves where the wedge at the abscissa 0 stands,
     * `y1` the smaller: its tip and corners where it is displayed and the vertical meets its body;
     * null otherwise.
     */
    readonly gap: { readonly y1: number; readonly y2: number } | null;
    /** The style of a cross-section line of the line's timeline, drawn or not. */
    readonly style: Style;
  };
  /**
   * The IDs of the timelines its cross-section lines cross besides its own: its displayed
   * descendants drawn with a line of their own in the member drawing, every one within its
   * children band, in traversal order (section 6.1).
   */
  readonly descendants: readonly string[];
}

/**
 * A named timestamp held by a drawn line, its own or an ancestor line's
 * (section 8.3): its ID, the abscissa of its cross-section line, that line's
 * style, and the card span its cross-section segment covers (section 8.7).
 */
export interface AxisTimestamp {
  readonly id: string;
  readonly x: number;
  /**
   * The style of its cross-section line, drawn or not; null where its `display` does not list
   * `cross_section` or the line is not displayed.
   */
  readonly line: Style | null;
  /** Its cross-section segment's ordinates: the card's top and bottom, its gap included. */
  readonly segment: { readonly y1: number; readonly y2: number };
}
