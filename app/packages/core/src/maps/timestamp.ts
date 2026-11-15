/**
 * A timestamp: the values a position on a drawn line has, and a pinned
 * timestamp moved by an edited value.
 *
 * A position on a line is exact, on the line's own axis. Its timestamp holds the line's own coordinate and the value of
 * each map shown for the line; on a segment line it also holds the segment
 * under the position, read from the segment's own start, with the segment's
 * maps. Each value is its map's compiled evaluator at the position, written
 * on the map's target unit (`express`), so every reader of a timestamp
 * shows the same values and none computes them again. The texts a reader
 * shows for a timestamp's place, a measure and a missing value are here
 * too, so every reader writes them alike.
 */

import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import type { Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import type { ConversionMap } from "../manifest/types.ts";
import type { CoordinateValue } from "../number/coordinate.ts";
import { displayValue, unitSymbol } from "../number/display.ts";
import { nearest } from "../number/grid.ts";
import { Rational } from "../number/rational.ts";
import type { Real } from "../number/real.ts";
import { compareReal, fromFloat, toRational } from "../number/real.ts";
import type { BlockId } from "../workspace/blocks.ts";
import type { Granularity } from "../workspace/view.ts";
import type { CompileContext } from "./compile.ts";
import { compileMap } from "./compile.ts";
import type { Expressed } from "./express.ts";
import { express, expressAs } from "./express.ts";
import { invert } from "./invert.ts";
import type { MeasureKnot, MeasureKnots } from "./values.ts";

/**
 * A timeline as a timestamp reads it: its axis, its length (`null` when
 * unknown) and the maps shown for it, in drawing order.
 */
export interface TimestampTimeline {
  readonly timeline: string;
  /** The timeline's name, or its whole ID without one. */
  readonly name: string;
  readonly unit: TimeUnit;
  readonly numberType: NumberType;
  readonly length: Real | null;
  readonly maps: readonly ConversionMap[];
}

/** A segment of the line: where it starts on the line. */
export interface TimestampSegment extends TimestampTimeline {
  readonly offset: Real;
}

/**
 * What a timestamp is read from: the drawn line, its segments (none for any
 * other line) and the granularity its readers show floats with and an
 * edited value is settled to.
 */
export interface TimestampSpec {
  readonly block: BlockId;
  readonly granularity: Granularity;
  readonly line: TimestampTimeline;
  readonly segments: readonly TimestampSegment[];
}

/**
 * Why the expanded rows of a manifest's MeasureMaps are not at hand: there
 * is no server to expand them (`no_server`), the server cannot expand them
 * (`unsupported`), its answer is awaited (`pending`), or the request failed
 * or its answer lacks a MeasureMap (`failed`).
 */
export type KnotsAbsence = "no_server" | "unsupported" | "pending" | "failed";

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

/** One timeline's part of a timestamp: its coordinate, in its number type, and its maps' values. */
export interface TimestampPart {
  readonly timeline: string;
  readonly name: string;
  readonly unit: TimeUnit;
  readonly numberType: NumberType;
  readonly position: CoordinateValue;
  readonly segment: boolean;
  readonly maps: readonly TimestampMap[];
}

/** The values a position on a line has: the line's part, then the segment's when one holds it. */
export interface Timestamp {
  readonly block: BlockId;
  /** The line's timeline. */
  readonly timeline: string;
  /** The granularity of its spec: `decimals` is how many places its floats are shown with. */
  readonly granularity: Granularity;
  readonly parts: readonly TimestampPart[];
}

/**
 * The segment under `position`: of those whose span `[offset, offset +
 * length]` holds it, the one starting last, so a shared boundary belongs to
 * the later segment and the line's end to the last.
 */
function segmentAt(
  segments: readonly TimestampSegment[],
  position: Rational,
): TimestampSegment | undefined {
  let found: TimestampSegment | undefined;
  for (const segment of segments) {
    const start = toRational(segment.offset);
    if (start.compare(position) > 0) continue;
    if (segment.length !== null && compareReal(position.subtract(start), segment.length) > 0) {
      continue;
    }
    if (found === undefined || start.compare(toRational(found.offset)) > 0) found = segment;
  }
  return found;
}

function partOf(
  timeline: TimestampTimeline,
  position: Rational,
  segment: boolean,
  context: CompileContext,
  absence: KnotsAbsence,
): TimestampPart {
  const value = expressAs(position, timeline.numberType);
  if (value === undefined) throw new RangeError(`${position} is no ${timeline.numberType} value`);
  const maps = timeline.maps.map((map): TimestampMap => {
    const evaluator = compileMap(map, context);
    const result = evaluator.evaluate(value);
    return {
      id: map.id,
      name: map.name ?? null,
      targetUnit: evaluator.targetUnit,
      value: result === undefined ? null : (express(result, evaluator.targetUnit) ?? null),
      missingKnots: evaluator.missingKnots ? absence : null,
    };
  });
  return {
    timeline: timeline.timeline,
    name: timeline.name,
    unit: timeline.unit,
    numberType: timeline.numberType,
    position: value,
    segment,
    maps,
  };
}

/**
 * The timestamp of `position`, exact on the line's own axis: the line's part at `position`, then, when a segment holds
 * it, the segment's part at `position` minus the segment's offset. Each
 * part's position is written in its timeline's number type, each map
 * evaluated there in the order given. `knots` are the expanded rows of the
 * manifest's MeasureMaps, or why they are not at hand (`no_server` when not
 * given); a map reading a MeasureMap without its rows gives no value and
 * says why (`failed` when the rows given lack it).
 */
export function timestampAt(
  spec: TimestampSpec,
  position: Rational,
  knots: readonly MeasureKnots[] | KnotsAbsence = "no_server",
): Timestamp {
  const given = typeof knots !== "string";
  const context: CompileContext = given ? { knots } : {};
  const absence: KnotsAbsence = given ? "failed" : knots;
  const parts = [partOf(spec.line, position, false, context, absence)];
  const segment = segmentAt(spec.segments, position);
  if (segment !== undefined) {
    const within = position.subtract(toRational(segment.offset));
    parts.push(partOf(segment, within, true, context, absence));
  }
  return {
    block: spec.block,
    timeline: spec.line.timeline,
    granularity: spec.granularity,
    parts,
  };
}

/** Where a timestamp lies: its line's name and coordinate with its unit's symbol, as `Form at 13 1/2 ♩`. */
export function timestampPlace(timestamp: Timestamp): string {
  const [line] = timestamp.parts;
  if (line === undefined) throw new Error("a timestamp has its line's part");
  const shown = displayValue(line.position, line.numberType, timestamp.granularity.decimals);
  return `${line.name} at ${shown} ${unitSymbol(line.unit)}`;
}

/**
 * A pinned timestamp: what it is read from, the expanded MeasureMaps it was
 * read with (or why they are not at hand), the timestamp itself, and the
 * `timestamp_N` ID of the named timestamp it shows (`null` for an unnamed
 * one).
 */
export interface Pin {
  readonly spec: TimestampSpec;
  readonly knots: readonly MeasureKnots[] | KnotsAbsence;
  readonly timestamp: Timestamp;
  readonly named: string | null;
}

/** `pin` moved to `position` on its line's own axis, its timestamp read anew. */
export function pinAt(pin: Pin, position: Rational): Pin {
  return { ...pin, timestamp: timestampAt(pin.spec, position, pin.knots) };
}

/**
 * A row of a pinned timestamp whose value is edited: the coordinate of the
 * line (`part` `"line"`) or of the segment under the position
 * (`"segment"`), or, with `map`, the value of that map of the part.
 */
export interface PinRow {
  readonly part: "line" | "segment";
  readonly map: string | null;
}

/**
 * The position an inverse gives, on an axis of `numberType`: a float on a
 * fraction axis the nearest multiple of `1 / denominator`, any value on an
 * int axis the nearest integer (a tie going up both times); an exact value
 * on a fraction or float axis, and a float on a float axis, as it is.
 */
function settled(value: Real, numberType: NumberType, granularity: Granularity): Rational {
  const exact = typeof value === "number" ? fromFloat(value) : value;
  if (numberType === "int") return nearest(exact, 1n);
  if (numberType === "fraction" && typeof value === "number") {
    return nearest(exact, BigInt(granularity.denominator));
  }
  return exact;
}

function refused(message: string): Problem {
  return problem(ErrorCode.invalidValue, message, []);
}

/**
 * The position on the pin's line, exact on its own axis, at which the row
 * `row` takes the edited `value` (read by `parseAxisValue`): the line's
 * coordinate is the position; a segment's coordinate lies at the segment's
 * offset plus the value; a map's value is inverted (`invert`) over its
 * part's span `[0, length]` and the result settled on the part's axis (a
 * float on a fraction axis to the granularity's `1 / denominator`, any
 * value on an int axis to the nearest integer). A position outside its
 * part's `[0, length]`, a map that is not invertible there or gives the
 * value nowhere, and a row the pin does not show are refused as
 * `invalid_value` at `[]`.
 */
export function positionFor(pin: Pin, row: PinRow, value: Rational): Rational | Problem {
  const { spec, timestamp } = pin;
  const part = timestamp.parts.find((item) => item.segment === (row.part === "segment"));
  const segment = spec.segments.find((item) => item.timeline === part?.timeline);
  const timeline = row.part === "line" ? spec.line : segment;
  if (part === undefined || timeline === undefined) {
    return refused(`the timestamp shows no ${row.part}`);
  }
  let own = value;
  if (row.map !== null) {
    const map = timeline.maps.find((item) => item.id === row.map);
    if (map === undefined) return refused(`'${timeline.timeline}' shows no map '${row.map}'`);
    const inverse = invert(map, value, {
      ...(typeof pin.knots === "string" ? {} : { knots: pin.knots }),
      span: { start: Rational.fromParts(0n, 1n), end: timeline.length },
    });
    if (inverse === null) return refused(`no position on '${timeline.timeline}' gives ${value}`);
    own = settled(inverse, timeline.numberType, spec.granularity);
  }
  const { length } = timeline;
  if (own.numerator < 0n || (length !== null && compareReal(own, length) > 0)) {
    const span = length === null ? "at least 0" : `0 to ${toRational(length)}`;
    return refused(`${own} lies outside '${timeline.timeline}' (${span})`);
  }
  return row.part === "line" || segment === undefined ? own : toRational(segment.offset).add(own);
}

/** What a measure is shown as: its name, else its number, else its count. */
export function measureText(record: MeasureKnot): string {
  return record.name !== "" ? record.name : String(record.number ?? record.count);
}

/** What each reason a MeasureMap's rows are missing says. */
const MISSING_KNOTS_TEXTS: { readonly [absence in KnotsAbsence]: string } = {
  no_server: "needs a server to expand its measure map",
  unsupported: "the server cannot expand measure maps",
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
