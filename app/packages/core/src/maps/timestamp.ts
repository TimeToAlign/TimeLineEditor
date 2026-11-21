/**
 * A timestamp: the cross-section of a timeline at a position.
 *
 * The timestamp of a timeline (the anchor) at a position, exact on the
 * anchor's own axis, is its cross-section there: the anchor, then each
 * member (the anchor's ancestors, whose coordinates follow from its own by
 * the offsets up the tree, and the segments and displayed descendants its
 * line crosses, as the caller lists them) whose span holds the position,
 * each with its coordinate and the value of each of its drawn maps. A
 * **row** is one of those values: a member's own coordinate or one of its
 * maps' values. One row abstraction (`rowAxis`) evaluates a row forward
 * from an anchor position and back from a value to an anchor position;
 * the values a timestamp shows, the position a pointer picks on a row
 * (`snapOnRow`) and the position an edited value gives (`positionFor`)
 * all go through it, so no reader evaluates or inverts a map another way.
 * The rows every reader lists (`timestampRows`), the timestamp as one JSON
 * value (`timestampJson`) and the texts shown for a measure and a missing
 * value are here too, so every reader writes them alike.
 */

import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import { numberTypeOf } from "@timetoalign/timetoshare";
import type { Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import type { Json, JsonObject } from "../json.ts";
import type { Roots } from "../manifest/tree.ts";
import { locateTimeline } from "../manifest/tree.ts";
import type { ConversionMap, NamedTimestamp, TimelineManifest } from "../manifest/types.ts";
import type { CoordinateValue } from "../number/coordinate.ts";
import { axisCoordinate, jsonFloat, jsonInteger, toAxisValue } from "../number/coordinate.ts";
import { coordinateDict } from "../number/display.ts";
import { clampValue, nearest, snapValue } from "../number/grid.ts";
import { Rational } from "../number/rational.ts";
import type { Real } from "../number/real.ts";
import { compareReal, fromFloat, realOf, toRational } from "../number/real.ts";
import type { BlockId } from "../workspace/blocks.ts";
import type { Granularity } from "../workspace/view.ts";
import type { CompileContext } from "./compile.ts";
import { compileMap } from "./compile.ts";
import type { Expressed } from "./express.ts";
import { express, expressAs } from "./express.ts";
import { invert, invertible } from "./invert.ts";
import type { MapResult, MapValue, MeasureKnot, MeasureKnots } from "./values.ts";
import { isMapValue, kindOf } from "./values.ts";

const ZERO = Rational.fromParts(0n, 1n);

/**
 * A timeline as a cross-section reads it: its axis, its length (`null`
 * when unknown) and its drawn maps, in drawing order.
 */
export interface TimelineAxis {
  readonly timeline: string;
  /** The timeline's name, or its whole ID without one. */
  readonly name: string;
  readonly unit: TimeUnit;
  readonly numberType: NumberType;
  readonly length: Real | null;
  readonly maps: readonly ConversionMap[];
  /**
   * The ordinate, in canvas units of its block's drawing, of the drawn line
   * at which the reading crosses the timeline (its own line, an ancestor
   * line, a segment line holding it); absent where it is not drawn there.
   * The rows of a timestamp are listed top to bottom by it (`timestampRows`).
   */
  readonly ordinate?: number;
}

/** `timeline` as a cross-section reads it, with the maps `maps` (those drawn for it, in drawing order). */
export function timelineAxisOf(
  timeline: TimelineManifest,
  maps: readonly ConversionMap[],
): TimelineAxis {
  return {
    timeline: timeline.id,
    name: timeline.name ?? timeline.id,
    unit: timeline.unit,
    numberType: timeline.number_type,
    length: timeline.length === null ? null : realOf(axisCoordinate(timeline.length, timeline)),
    maps,
  };
}

/**
 * A timeline a timestamp may hold: its zero lies `offset` from the anchor's
 * zero, on the anchor's axis, exactly. A member of a group the anchor is a
 * member of, read by the group (a groupstamp's), has a `scale` too: the
 * members of a group start and end together, so its coordinate is the
 * anchor's times its drawn length over the anchor's. Its coordinate at a
 * position `p` on the anchor's axis is `(p − offset) × scale`, `scale` 1
 * where it is not given.
 */
export interface CrossSectionMember extends TimelineAxis {
  readonly offset: Real;
  readonly scale?: Real;
}

/** `member`'s own coordinate at `position` on the anchor's axis, exactly: `(position − offset) × scale`. */
function ownAt(member: CrossSectionMember, position: Rational): Rational {
  const own = position.subtract(toRational(member.offset));
  return member.scale === undefined ? own : own.multiply(toRational(member.scale));
}

/** The position on the anchor's axis of `member`'s own coordinate `own`, exactly: `own / scale + offset`. */
function onAnchorAxis(member: CrossSectionMember, own: Rational): Rational {
  const unscaled = member.scale === undefined ? own : own.divide(toRational(member.scale));
  return unscaled.add(toRational(member.offset));
}

/** Where `member`'s span ends on the anchor's axis: `offset + length / scale`; null for an unknown length. */
function endOnAnchor(member: CrossSectionMember): Rational | null {
  return member.length === null ? null : onAnchorAxis(member, toRational(member.length));
}

/**
 * The ancestors of the timeline `timeline` of `manifest` as members of its
 * cross-section, its parent first, up to its root: each one's zero lies
 * minus the sum of the offsets from the timeline up to it from the
 * timeline's zero, exactly (a parent's coordinate is its child's plus the
 * child's offset), and each carries no map. Empty for a root and for an ID
 * no timeline carries.
 */
export function ancestorMembers(manifest: Roots, timeline: string): CrossSectionMember[] {
  const members: CrossSectionMember[] = [];
  let at = locateTimeline(manifest, timeline);
  let offset = ZERO;
  while (at?.parent !== undefined) {
    const { parent } = at;
    const own = toRational(realOf(axisCoordinate(at.timeline.offset, parent.timeline)));
    offset = offset.subtract(own);
    members.push({ ...timelineAxisOf(parent.timeline, []), offset });
    at = parent;
  }
  return members;
}

/**
 * What a timestamp is read from: the anchor, the members its cross-section
 * may hold (the anchor excluded, in the order given: by the canvas's
 * convention the anchor's ancestors, parent first, then the timelines its
 * line crosses), and the granularity its floats are shown with and its
 * pointer positions picked to. An ancestor's span holds its descendant's,
 * so an ancestor is crossed wherever its descendant is.
 */
export interface CrossSectionSpec {
  readonly block: BlockId;
  readonly granularity: Granularity;
  readonly anchor: TimelineAxis;
  readonly members: readonly CrossSectionMember[];
}

/**
 * Why the expanded rows of a manifest's MeasureMaps are not at hand: there
 * is no server to expand them (`no_server`), the server cannot expand them
 * (`unsupported`), no server answered the request (`unreachable`), its
 * answer is awaited (`pending`), or the server refused the request or its
 * answer lacks a MeasureMap (`failed`).
 */
export type KnotsAbsence = "no_server" | "unsupported" | "unreachable" | "pending" | "failed";

/** The expanded rows of a manifest's MeasureMaps, or why they are not at hand. */
export type Knots = readonly MeasureKnots[] | KnotsAbsence;

/** One map's value at a timestamp's position; `value` is `null` where the map gives none. */
export interface TimestampMap {
  readonly id: string;
  readonly name: string | null;
  readonly targetUnit: TimeUnit | null;
  readonly value: Expressed | null;
  /**
   * Why the map gives no value when it reads a MeasureMap whose expanded
   * rows are not at hand; `null` for every other map.
   */
  readonly missingKnots: KnotsAbsence | null;
}

/** One crossed timeline's part of a timestamp: its coordinate, in its number type, and its maps' values. */
export interface TimestampPart {
  readonly timeline: string;
  readonly name: string;
  readonly unit: TimeUnit;
  readonly numberType: NumberType;
  readonly position: CoordinateValue;
  readonly maps: readonly TimestampMap[];
}

/** The cross-section of a timeline at a position: the anchor's part first, then each crossed member's. */
export interface Timestamp {
  readonly block: BlockId;
  /** The anchor's timeline. */
  readonly timeline: string;
  /** The granularity of its spec: `decimals` is how many places its floats are shown with. */
  readonly granularity: Granularity;
  readonly parts: readonly TimestampPart[];
}

/** A row of a cross-section: the timeline's own coordinate (`map` `null`) or the value of its map `map`. */
export interface Row {
  readonly timeline: string;
  readonly map: string | null;
}

/**
 * A row read both ways. Forward, from a position on the anchor's axis to
 * the row's value; backward, from a value to the position on the anchor's
 * axis where the row takes it.
 */
export interface RowAxis {
  readonly row: Row;
  /** The timeline the row belongs to; the anchor's offset is 0. */
  readonly member: CrossSectionMember;
  /** Where the member starts on the anchor's axis: its offset, exactly. */
  readonly start: Rational;
  /** The unit of the row's values: the member's for its coordinate, the map's target unit (`null` where it names none). */
  readonly unit: TimeUnit | null;
  /** The number type of the row's values: the member's for its coordinate, its target unit's for a map (`null` without one). */
  readonly numberType: NumberType | null;
  /** Whether a value of the row leads back to one position over the member's span: always for a coordinate; for a map, while it is invertible there. */
  readonly invertible: boolean;
  /** Why a map reading a MeasureMap without its expanded rows gives nothing; `null` for every other row. */
  readonly missingKnots: KnotsAbsence | null;
  /**
   * The row's raw value at `position` on the anchor's axis: the member's
   * coordinate (`position` minus the offset, times the scale, written in the
   * member's number type), or the map's result there; `undefined` where it
   * gives none.
   */
  valueAt(position: Rational): MapResult | undefined;
  /** The row's value at `position` as readers show it, on its unit; `null` where it gives none. */
  expressedAt(position: Rational): Expressed | null;
  /**
   * The position on the anchor's axis at which the row takes `value`,
   * exact: a map's inverse over the member's span `[0, length]`, settled on
   * the member's axis (a float on a fraction axis to the nearest multiple
   * of `1 / denominator`, any value on an int axis to the nearest integer,
   * an exact value kept), divided by the scale, the offset added, settled on the anchor's axis
   * alike; a coordinate is the value itself. `null` where none is: the map
   * is not invertible over the span or gives the value nowhere. The
   * position is not held to the member's span.
   */
  positionOf(value: MapValue): Rational | null;
}

/** The compile context `knots` give, and why a MeasureMap's rows are missing when a map lacks them. */
interface Reading {
  readonly context: CompileContext;
  readonly absence: KnotsAbsence;
}

function readingOf(knots: Knots): Reading {
  return typeof knots === "string"
    ? { context: {}, absence: knots }
    : { context: { knots }, absence: "failed" };
}

/** The member named `timeline`: the anchor at offset 0, else the member given. */
function memberOf(spec: CrossSectionSpec, timeline: string): CrossSectionMember | undefined {
  if (spec.anchor.timeline === timeline) return { ...spec.anchor, offset: ZERO };
  return spec.members.find((member) => member.timeline === timeline);
}

/**
 * The position an inverse or a sum gives, on an axis of `numberType`: a
 * float on a fraction axis the nearest multiple of `1 / denominator`, any
 * value on an int axis the nearest integer (a tie going up both times); an
 * exact value on a fraction or float axis, and a float on a float axis, as
 * it is.
 */
function settled(value: Real, numberType: NumberType, granularity: Granularity): Rational {
  const exact = toRational(value);
  if (numberType === "int") return nearest(exact, 1n);
  if (numberType === "fraction" && typeof value === "number") {
    return nearest(exact, BigInt(granularity.denominator));
  }
  return exact;
}

function axisOf(
  spec: CrossSectionSpec,
  member: CrossSectionMember,
  map: ConversionMap | null,
  reading: Reading,
): RowAxis {
  const start = toRational(member.offset);
  const coordinate = (position: Rational): CoordinateValue | undefined =>
    expressAs(ownAt(member, position), member.numberType);
  const onAnchor = (own: Real): Rational =>
    settled(
      onAnchorAxis(member, settled(own, member.numberType, spec.granularity)),
      spec.anchor.numberType,
      spec.granularity,
    );
  const row: Row = { timeline: member.timeline, map: map === null ? null : map.id };
  if (map === null) {
    return {
      row,
      member,
      start,
      unit: member.unit,
      numberType: member.numberType,
      invertible: true,
      missingKnots: null,
      valueAt: coordinate,
      expressedAt: (position) => {
        const value = coordinate(position);
        return value === undefined
          ? null
          : { unit: member.unit, numberType: member.numberType, value };
      },
      positionOf: (value) => onAnchor(toRational(value)),
    };
  }
  const evaluator = compileMap(map, reading.context);
  const { targetUnit } = evaluator;
  const inversion = {
    ...reading.context,
    span: { start: ZERO, end: member.length },
  };
  const valueAt = (position: Rational): MapResult | undefined => {
    const x = coordinate(position);
    return x === undefined ? undefined : evaluator.evaluate(x);
  };
  let solvable: boolean | undefined;
  return {
    row,
    member,
    start,
    unit: targetUnit,
    numberType: targetUnit === null ? null : numberTypeOf({ unit: targetUnit }),
    get invertible() {
      solvable ??= invertible(map, inversion);
      return solvable;
    },
    missingKnots: evaluator.missingKnots ? reading.absence : null,
    valueAt,
    expressedAt: (position) => {
      const result = valueAt(position);
      return result === undefined ? null : (express(result, targetUnit) ?? null);
    },
    positionOf: (value) => {
      const x = invert(map, value, inversion);
      return x === null ? null : onAnchor(x);
    },
  };
}

function axisIn(spec: CrossSectionSpec, row: Row, reading: Reading): RowAxis | null {
  const member = memberOf(spec, row.timeline);
  if (member === undefined) return null;
  if (row.map === null) return axisOf(spec, member, null, reading);
  const map = member.maps.find((item) => item.id === row.map);
  return map === undefined ? null : axisOf(spec, member, map, reading);
}

/**
 * The row `row` of `spec` read both ways, its maps compiled with `knots`
 * (the expanded rows of the manifest's MeasureMaps, or why they are not at
 * hand); `null` where the spec has no such timeline or the timeline no
 * such map.
 */
export function rowAxis(
  spec: CrossSectionSpec,
  row: Row,
  knots: Knots = "no_server",
): RowAxis | null {
  return axisIn(spec, row, readingOf(knots));
}

/** Whether the own coordinate `own` lies on the closed span `[0, length]`, unbounded above for an unknown length. */
function withinSpan(own: Rational, length: Real | null): boolean {
  return own.numerator >= 0n && (length === null || compareReal(own, length) <= 0);
}

/** Whether `member`'s closed span on the anchor's axis, `[offset, offset + length / scale]` (unbounded above for an unknown length), holds `position`. */
function crosses(member: CrossSectionMember, position: Rational): boolean {
  return withinSpan(ownAt(member, position), member.length);
}

function partOf(
  spec: CrossSectionSpec,
  member: CrossSectionMember,
  position: Rational,
  reading: Reading,
): TimestampPart {
  const value = axisOf(spec, member, null, reading).valueAt(position);
  if (value === undefined || !isMapValue(value)) {
    throw new RangeError(`${position} is no ${member.numberType} value`);
  }
  const maps = member.maps.map((map): TimestampMap => {
    const axis = axisOf(spec, member, map, reading);
    return {
      id: map.id,
      name: map.name ?? null,
      targetUnit: axis.unit,
      value: axis.expressedAt(position),
      missingKnots: axis.missingKnots,
    };
  });
  return {
    timeline: member.timeline,
    name: member.name,
    unit: member.unit,
    numberType: member.numberType,
    position: value,
    maps,
  };
}

/**
 * The timestamp of `position`, exact on the anchor's axis: the anchor's
 * part, then the part of each member, in the order given, whose closed
 * span `[offset, offset + length]` holds the position (a boundary two
 * contiguous members share is crossed by both). Each part's coordinate is
 * the position minus its offset, written in its number type, and each map
 * is evaluated there in the order given. `knots` are the expanded rows of
 * the manifest's MeasureMaps, or why they are not at hand (`no_server`
 * when not given); a map reading a MeasureMap without its rows gives no
 * value and says why (`failed` when the rows given lack it).
 */
export function timestampAt(
  spec: CrossSectionSpec,
  position: Rational,
  knots: Knots = "no_server",
): Timestamp {
  const reading = readingOf(knots);
  const anchor: CrossSectionMember = { ...spec.anchor, offset: ZERO };
  const crossed = spec.members.filter((member) => crosses(member, position));
  return {
    block: spec.block,
    timeline: spec.anchor.timeline,
    granularity: spec.granularity,
    parts: [anchor, ...crossed].map((member) => partOf(spec, member, position, reading)),
  };
}

/** A row's raw value at `position` as an exact number; `undefined` where it gives none or no number. */
function numberAt(axis: RowAxis, position: Rational): Rational | undefined {
  const value = axis.valueAt(position);
  return value === undefined || !isMapValue(value) ? undefined : toRational(value);
}

function magnitude(value: Rational): Rational {
  return value.numerator < 0n ? ZERO.subtract(value) : value;
}

/**
 * The position a pointer picks on a map's row: the map's value at the
 * pointer, snapped on the value's axis within half the values' spread over
 * the pointer's reach, then brought back exactly; `null` where the row has
 * no inverse there or no number.
 */
function snappedOnValues(
  axis: RowAxis,
  position: Rational,
  reach: Rational,
  granularity: Granularity,
): Rational | null {
  const value = axis.valueAt(position);
  if (value === undefined || !isMapValue(value) || !axis.invertible) return null;
  const v = toRational(value);
  const below = numberAt(axis, position.subtract(reach));
  const above = numberAt(axis, position.add(reach));
  if (below === undefined || above === undefined) return null;
  const spread = magnitude(above.subtract(below)).multiply(Rational.fromParts(1n, 2n));
  if (spread.numerator === 0n) return null;
  const snapped = snapValue(v, spread, axis.numberType ?? kindOf(value), granularity);
  return axis.positionOf(snapped);
}

/**
 * The position on the anchor's axis a pointer picks on the row `row`
 * (exact): `p` is the pointer, in units from the anchor's zero, `h` half a
 * device pixel in the anchor's units.
 *
 * - A member of an int axis (samples, ticks, pixels), on its coordinate's
 *   row and on every map's row alike: the integer nearest to `p` minus the
 *   offset (a tie going up), the offset added, so such a timeline steps by
 *   1 whatever the granularity; no map's value axis decides its step.
 * - Any other member's own coordinate: the simplest value of the member's
 *   number type within `h` of `p` minus the offset (`snapValue`), the
 *   offset added.
 * - A map's value of any other member: `v`, the map's value at `p`, is snapped within `hv`,
 *   half the absolute difference of its values at `p − h` and `p + h`,
 *   under the cap of the map's target number type (the value's own kind
 *   where the map names no target unit); the snapped value is inverted
 *   exactly (`RowAxis.positionOf`). A map without an inverse there, a
 *   value that is no number, or one whose inverse gives nothing falls back
 *   to the member's own coordinate.
 *
 * The result is held to the member's span within the anchor's `[0,
 * length]`.
 *
 * @throws {RangeError} if `p` is not finite, `h` is not finite and
 *   positive, or the spec has no such row.
 */
export function snapOnRow(
  spec: CrossSectionSpec,
  row: Row,
  p: number,
  h: number,
  knots: Knots = "no_server",
): Rational {
  if (!Number.isFinite(p)) throw new RangeError(`the position ${p} is not finite`);
  if (!Number.isFinite(h) || h <= 0) {
    throw new RangeError(`half a pixel of ${h} units is not finite and positive`);
  }
  const reading = readingOf(knots);
  const axis = axisIn(spec, row, reading);
  if (axis === null) {
    throw new RangeError(
      `the cross-section has no row ${row.map ?? "coordinate"} of '${row.timeline}'`,
    );
  }
  const position = fromFloat(p);
  const reach = fromFloat(h);
  const { member, start } = axis;
  const stepsByOne = member.numberType === "int";
  const own = (): Rational => {
    const at = ownAt(member, position);
    const scaled = member.scale === undefined ? reach : reach.multiply(toRational(member.scale));
    const snapped = stepsByOne
      ? nearest(at, 1n)
      : snapValue(at, scaled, member.numberType, spec.granularity);
    const found = axisOf(spec, member, null, reading).positionOf(snapped);
    if (found === null) throw new Error("a coordinate leads back to its position");
    return found;
  };
  const onValues = row.map !== null && !stepsByOne;
  const picked =
    (onValues ? snappedOnValues(axis, position, reach, spec.granularity) : null) ?? own();
  const end = endOnAnchor(member);
  const last = spec.anchor.length;
  const high = end === null || (last !== null && compareReal(end, last) > 0) ? last : end;
  return clampValue(picked, start.numerator < 0n ? ZERO : start, high);
}

/**
 * A pinned timestamp: what it is read from, the expanded MeasureMaps it was
 * read with (or why they are not at hand), the timestamp itself, and the
 * named timestamp it shows (`null` for an unnamed one), whose timeline is
 * the anchor.
 */
export interface Pin {
  readonly spec: CrossSectionSpec;
  readonly knots: Knots;
  readonly timestamp: Timestamp;
  readonly named: NamedTimestamp | null;
}

/** `pin` moved to `position` on its anchor's axis, its timestamp read anew. */
export function pinAt(pin: Pin, position: Rational): Pin {
  return { ...pin, timestamp: timestampAt(pin.spec, position, pin.knots) };
}

function refused(message: string): Problem {
  return problem(ErrorCode.invalidValue, message, []);
}

/**
 * The position on the pin's anchor axis, exact, at which the row `row`
 * takes the edited `value` (read by `parseAxisValue`), through the row's
 * `positionOf`. Refused, each as `invalid_value` at `[]`: a row of a
 * timeline the timestamp does not show, a map its timeline does not draw,
 * a value no position gives (the map is not invertible over its
 * timeline's span, or gives the value nowhere), a position outside the
 * timeline's `[0, length]`, and one outside the anchor's (an ancestor's
 * value beyond the anchor's span).
 */
export function positionFor(pin: Pin, row: Row, value: Rational): Rational | Problem {
  const { timeline } = row;
  if (!pin.timestamp.parts.some((part) => part.timeline === timeline)) {
    return refused(`the timestamp shows no '${timeline}'`);
  }
  const axis = rowAxis(pin.spec, row, pin.knots);
  if (axis === null) return refused(`'${timeline}' shows no map '${row.map}'`);
  const position = axis.positionOf(value);
  if (position === null) return refused(`no position on '${timeline}' gives ${value}`);
  const outside = (own: Rational, name: string, length: Real | null): Problem | null => {
    if (withinSpan(own, length)) return null;
    const span = length === null ? "at least 0" : `0 to ${toRational(length)}`;
    return refused(`${own} lies outside '${name}' (${span})`);
  };
  const { anchor } = pin.spec;
  return (
    outside(ownAt(axis.member, position), timeline, axis.member.length) ??
    outside(position, anchor.timeline, anchor.length) ??
    position
  );
}

/** What a measure is shown as: its name, else its number, else its count. */
export function measureText(record: MeasureKnot): string {
  return record.name !== "" ? record.name : String(record.number ?? record.count);
}

/** What each reason a MeasureMap's rows are missing says. */
const MISSING_KNOTS_TEXTS: { readonly [absence in KnotsAbsence]: string } = {
  no_server: "needs a server to expand its measure map",
  unsupported: "the server cannot expand measure maps",
  unreachable: "no server answered, so its measure map is not expanded",
  pending: "waiting for the server",
  failed: "the server did not expand its measure map",
};

/**
 * What a map that gives no value says instead: why its MeasureMap's rows
 * are missing, or, for any other map, that it has no value at the position
 * (the position lies outside its domain).
 */
export function missingValueText(map: Pick<TimestampMap, "missingKnots">): string {
  return map.missingKnots === null ? "no value here" : MISSING_KNOTS_TEXTS[map.missingKnots];
}

/**
 * One row of a pinned timestamp as every reader lists it: its row, the
 * timeline it belongs to, its label (the timeline's name for its
 * coordinate; a map's name, else its ID), its value (`null` where it has
 * none; a CombinationMap's outputs are one value), the text shown instead
 * of a missing value, and whether an edited value moves the timestamp.
 */
export interface TimestampRow {
  readonly row: Row;
  readonly timeline: string;
  readonly label: string;
  readonly value: Expressed | null;
  readonly missing: string | null;
  readonly editable: boolean;
}

/**
 * The parts of `pin`'s timestamp top to bottom where the reading crosses
 * each one's timeline (its `ordinate` in the spec), stably, so parts at one
 * ordinate keep the timestamp's order, and every part without an ordinate
 * after those with one, in that order too.
 */
function partsTopDown(pin: Pin): TimestampPart[] {
  const { spec } = pin;
  const ordinates = new Map<string, number>();
  for (const axis of [spec.anchor, ...spec.members]) {
    if (axis.ordinate !== undefined) ordinates.set(axis.timeline, axis.ordinate);
  }
  return pin.timestamp.parts.toSorted((a, b) => {
    const above = ordinates.get(a.timeline);
    const below = ordinates.get(b.timeline);
    if (above === undefined || below === undefined) {
      return (above === undefined ? 1 : 0) - (below === undefined ? 1 : 0);
    }
    return above - below;
  });
}

/**
 * The rows of `pin`'s timestamp in order: its parts top to bottom where the
 * reading crosses their timelines (`partsTopDown`), per part its
 * coordinate, then its maps in drawing order. A coordinate is always
 * editable; a map while it is invertible over its timeline's span. The
 * timestamp's own parts keep the anchor first.
 */
export function timestampRows(pin: Pin): TimestampRow[] {
  const reading = readingOf(pin.knots);
  return partsTopDown(pin).flatMap((part) => {
    const { timeline } = part;
    const coordinate: TimestampRow = {
      row: { timeline, map: null },
      timeline,
      label: part.name,
      value: { unit: part.unit, numberType: part.numberType, value: part.position },
      missing: null,
      editable: true,
    };
    const maps = part.maps.map((map): TimestampRow => {
      const row: Row = { timeline, map: map.id };
      return {
        row,
        timeline,
        label: map.name ?? map.id,
        value: map.value,
        missing: map.value === null ? missingValueText(map) : null,
        editable: axisIn(pin.spec, row, reading)?.invertible ?? false,
      };
    });
    return [coordinate, ...maps];
  });
}

/** A number without a unit as a manifest writes a bare value: an integer, a float, a Fraction pair. */
function bareValue(value: CoordinateValue): Json {
  if (value instanceof Rational) {
    return [jsonInteger(value.numerator), jsonInteger(value.denominator)];
  }
  return typeof value === "bigint" ? jsonInteger(value) : jsonFloat(value);
}

/**
 * A row's value as JSON: a number with a unit its coordinate dict, one
 * without `{number_type, value}`, a label as it is, a measure its record,
 * named outputs an object of their values; `null` where there is none.
 */
function valueJson(value: Expressed | null): Json {
  if (value === null || typeof value === "string") return value;
  if ("record" in value) return { ...value.record };
  if ("outputs" in value) {
    const outputs: { [output: string]: Json } = {};
    for (const [output, inner] of Object.entries(value.outputs)) outputs[output] = valueJson(inner);
    return outputs;
  }
  return value.unit === null
    ? { number_type: value.numberType, value: bareValue(value.value) }
    : { ...coordinateDict(value.value, value.unit, value.numberType) };
}

/**
 * `pin`'s timestamp as one JSON value: the named timestamp's members as the
 * manifest holds them, or, unnamed, `{timeline, coordinate}` (the anchor's
 * coordinate as a bare value on its own axis), then `mapping`, keyed by ID
 * in part order: each crossed timeline but the anchor its coordinate dict,
 * each map of each part its value (`null` where it gives none).
 */
export function timestampJson(pin: Pin): Json {
  const { parts } = pin.timestamp;
  const [anchor] = parts;
  if (anchor === undefined) throw new Error("a timestamp has its anchor's part");
  const mapping: { [id: string]: Json } = {};
  for (const [index, part] of parts.entries()) {
    if (index > 0) {
      mapping[part.timeline] = { ...coordinateDict(part.position, part.unit, part.numberType) };
    }
    for (const map of part.maps) mapping[map.id] = valueJson(map.value);
  }
  const entry: JsonObject = pin.named ?? {
    timeline: anchor.timeline,
    coordinate: toAxisValue({
      unit: anchor.unit,
      numberType: anchor.numberType,
      value: anchor.position,
    }),
  };
  return { ...entry, mapping };
}
