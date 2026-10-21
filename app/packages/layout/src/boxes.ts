/**
 * The containers a drawing records, one list from the box down to the
 * bands, and the axis of every line it draws (`docs/drawing.md` in
 * TimeToShare, sections 3.2, 6.4 and 8).
 */

import type {
  BandKind,
  CardPlace,
  ContainerKind,
  ContainerRef,
  ConversionMap,
  Coordinate,
  ItemPlace,
  Real,
} from "@timetoalign/tilie-core";
import { exactCoordinate, fromFloat, Rational, toFloat } from "@timetoalign/tilie-core/numbers";
import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";

/**
 * The half-open range `[start, end)` of `Drawing.elements` that a container
 * emitted: a frame or a card its own rectangle when displayed, then
 * everything drawn as part of it, in drawing order (section 8.5); the box
 * every element. A container that is not displayed keeps its range over
 * what it still emits; a band emits nothing, and its range is empty.
 */
export interface ElementRange {
  readonly start: number;
  readonly end: number;
}

/**
 * One container of a drawing: the box, a group's frame, a timeline's card
 * or one of a timeline's bands, with its rectangle in the drawing's
 * coordinates (those of the elements).
 */
export interface DrawnBox {
  readonly kind: ContainerKind;
  /**
   * The `places` key: the group id of a frame, `G/T` for a member's card in the frame of `G`,
   * `T` for an ungrouped root's card; null otherwise.
   */
  readonly key: string | null;
  /**
   * `G` for a frame, `G/T/card` or `T/card` for a card, `T/<kind>_1` for a band (the same for
   * every drawing of it); null for the box.
   */
  readonly address: string | null;
  /**
   * The holder's address: a frame's for the card of one of its members, the card holding the
   * line of a band's timeline (for a child, the card of the member drawing it lies in) for a
   * band. Null for the box and for what the box holds directly, since the box has no address.
   */
  readonly holder: string | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly range: ElementRange;
  /**
   * Its own rectangle is drawn: always for the box, for a frame or a card unless its style hides
   * it (its range then opens with that rectangle), never for a band.
   */
  readonly displayed: boolean;
  /**
   * A frame or a box-held card: its place with every default applied, `width` and `height` the
   * drawn size in item coordinates, before the scale; and the place as stated, `{}` when none.
   */
  readonly item?: { readonly place: Required<ItemPlace>; readonly stated: ItemPlace };
  /**
   * Any card: its drawn size in item coordinates, its spacing, the gap between its rows and its
   * bands (a member's card's own `spacing`, a box-held card's its item's, else 4), and what
   * `places` states for it.
   */
  readonly card?: {
    readonly size: { readonly width: number; readonly height: number };
    readonly spacing: number;
    readonly stated: CardPlace;
  };
  /** A band: its timeline, kind, level, the elements it holds and its timeline's line. */
  readonly band?: {
    readonly timeline: string;
    readonly kind: BandKind;
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
 * core's listing of the manifest's containers: its kind, `places` key and
 * address, and its holder's address.
 */
export function identityOf(
  ref: ContainerRef,
): Pick<DrawnBox, "kind" | "key" | "address" | "holder"> {
  return {
    kind: ref.kind,
    key: ref.key,
    address: ref.address,
    holder: ref.holder?.address ?? null,
  };
}

/**
 * One line drawn, as the axis of its timeline: the abscissas of its start
 * and end (not of its start circle, chevrons or end mark) and the
 * coordinates on its timeline's own axis there. An ancestor line is clipped
 * to its member: its start and end are where it meets the member's start
 * and end, or its own end short of the member's.
 */
export interface DrawnAxis {
  /** The timeline drawn. */
  readonly address: string;
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
  /** The timeline's conversion maps the drawing displays. */
  readonly maps: readonly ConversionMap[];
}

const exact = (value: Real): Rational => (typeof value === "number" ? fromFloat(value) : value);

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
  const from = exact(start);
  const value =
    xEnd === xStart
      ? from
      : from.add(
          fromFloat(x)
            .subtract(fromFloat(xStart))
            .divide(fromFloat(xEnd).subtract(fromFloat(xStart)))
            .multiply(exact(end).subtract(from)),
        );
  return rounded(value, axis.unit, axis.numberType) ?? null;
}
