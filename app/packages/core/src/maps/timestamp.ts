/**
 * A timestamp: the values a position on a drawn line has.
 *
 * A position on a line is an exact count of grid steps from the line's
 * start. Its timestamp holds the line's own coordinate and the value of
 * each map shown for the line; on a segment line it also holds the segment
 * under the position, read from the segment's own start, with the segment's
 * maps. Each value is its map's compiled evaluator at the position, written
 * on the map's target unit (`express`), so every reader of a timestamp
 * shows the same values and none computes them again. The texts a reader
 * shows for a timestamp's place, a measure and a missing value are here
 * too, so every reader writes them alike.
 */

import type { NumberType, TimeUnit } from "@timetoalign/timetoshare";
import type { ConversionMap } from "../manifest/types.ts";
import type { CoordinateValue } from "../number/coordinate.ts";
import { displayValue, unitSymbol } from "../number/display.ts";
import type { GridInUse } from "../number/grid.ts";
import type { Rational } from "../number/rational.ts";
import type { Real } from "../number/real.ts";
import { compareReal, toRational } from "../number/real.ts";
import type { BlockId } from "../workspace/blocks.ts";
import type { Granularity } from "../workspace/view.ts";
import type { CompileContext } from "./compile.ts";
import { compileMap } from "./compile.ts";
import type { Expressed } from "./express.ts";
import { express, expressAs } from "./express.ts";
import type { MeasureKnot, MeasureKnots } from "./values.ts";

/** A timeline as a timestamp reads it: its axis and the maps shown for it, in drawing order. */
export interface TimestampTimeline {
  readonly timeline: string;
  /** The timeline's name, or its whole ID without one. */
  readonly name: string;
  readonly unit: TimeUnit;
  readonly numberType: NumberType;
  readonly maps: readonly ConversionMap[];
}

/** A segment of the line: where it starts on the line and how long it is (`null` when unknown). */
export interface TimestampSegment extends TimestampTimeline {
  readonly offset: Real;
  readonly length: Real | null;
}

/** What a timestamp is read from: the drawn line, its segments (none for any other line) and the grid step. */
export interface TimestampSpec {
  readonly block: BlockId;
  readonly step: Rational;
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
  /** The grid step the position was picked with. */
  readonly step: Rational;
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
 * The timestamp of `position`, the exact count of grid steps from the
 * line's start: the line's part at `position`, then, when a segment holds
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
  return { block: spec.block, timeline: spec.line.timeline, step: spec.step, parts };
}

/** Where a timestamp lies: its line's name and coordinate with its unit's symbol, as `Form at 13 1/2 ♩`. */
export function timestampPlace(timestamp: Timestamp): string {
  const [line] = timestamp.parts;
  if (line === undefined) throw new Error("a timestamp has its line's part");
  return `${line.name} at ${displayValue(line.position, line.numberType)} ${unitSymbol(line.unit)}`;
}

/** The grid a timestamp was picked on under `granularity`: its step on its line's axis. */
export function timestampGrid(timestamp: Timestamp, granularity: Granularity): GridInUse {
  const [line] = timestamp.parts;
  if (line === undefined) throw new Error("a timestamp has its line's part");
  return { step: timestamp.step, numberType: line.numberType, unit: line.unit, granularity };
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
