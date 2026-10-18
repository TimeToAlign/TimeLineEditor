/**
 * Manifest invariants beyond the schema, matching timetoalign's behavior.
 */

import { canonicalOrder, type NumberType, type TimeUnit } from "@timetoalign/timeskeleton";
import type { Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { showJson } from "../json.ts";
import type { Coordinate } from "../number/coordinate.ts";
import { axisCoordinate, CoordinateError, compareCoordinates } from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import type { Real } from "../number/real.ts";
import { addReal, compareReal, realOf } from "../number/real.ts";
import { rootPaths } from "./tree.ts";
import type { Manifest, TimelineManifest } from "./types.ts";

const DISCRETE_UNITS: readonly TimeUnit[] = ["ticks", "samples", "frames", "pixels"];

export function allowedNumberTypes(unit: TimeUnit): readonly NumberType[] {
  if (DISCRETE_UNITS.includes(unit)) return ["int"];
  if (unit === "number") return ["int", "float", "fraction"];
  return ["float", "fraction"];
}

export function axisProblems(
  timeline: Pick<TimelineManifest, "unit" | "number_type">,
  path: readonly PathSegment[],
): Problem[] {
  if (allowedNumberTypes(timeline.unit).includes(timeline.number_type)) return [];
  return [
    problem(
      ErrorCode.numberTypeNotAllowed,
      `unit ${timeline.unit} does not admit number_type ${timeline.number_type}; allowed: ${allowedNumberTypes(timeline.unit).join(", ")}`,
      [...path, "number_type"],
    ),
  ];
}

/**
 * Read a bare value on the own axis of `timeline` (`axisCoordinate`): the
 * coordinate, or an `invalid_coordinate` problem at `path`.
 */
export function readOnAxis(
  value: unknown,
  timeline: Pick<TimelineManifest, "unit" | "number_type">,
  path: readonly PathSegment[],
): Coordinate | Problem {
  try {
    return axisCoordinate(value, timeline, path);
  } catch (error) {
    if (error instanceof CoordinateError) {
      return problem(ErrorCode.invalidCoordinate, error.message, error.path);
    }
    throw error;
  }
}

export function isProblem(value: unknown): value is Problem {
  return typeof value === "object" && value !== null && "code" in value && "path" in value;
}

export function childEnd(offset: Coordinate, length: Coordinate): Real {
  return addReal(realOf(offset), realOf(length));
}

/**
 * The length of a timeline on its own axis, or null when it is not known. The
 * timeline is one of a checked manifest, so its length reads.
 */
export function lengthOf(timeline: TimelineManifest): Coordinate | null {
  return timeline.length === null ? null : axisCoordinate(timeline.length, timeline);
}

/**
 * The farthest point a child at `offset` reaches on its parent's axis: its
 * end where its length is known, its offset where it is not.
 */
export function childReach(offset: Coordinate, child: TimelineManifest): Real {
  const length = lengthOf(child);
  return length === null ? realOf(offset) : childEnd(offset, length);
}

/**
 * The farthest point on a timeline's axis its children reach (`childReach`);
 * 0 without children.
 */
export function contentEnd(timeline: TimelineManifest): Real {
  let end: Real = Rational.of(0n);
  for (const child of timeline.children) {
    const candidate = childReach(axisCoordinate(child.offset, timeline), child);
    if (compareReal(candidate, end) > 0) end = candidate;
  }
  return end;
}

/** A bare value as a message spells it: a fraction pair as `[n, d]`. */
function spelled(value: unknown): string {
  return Array.isArray(value) ? `[${value.map(showJson).join(", ")}]` : showJson(value);
}

/**
 * The checks of one timeline and its subtree, on a manifest the schema
 * accepts: a child already shares its parent's unit and lies within its
 * parent's known length (timeskeleton's `validate` refuses both). The
 * schema accepts a child starting before its parent's origin; a negative
 * child offset is refused here, as not supported yet. A root's offset may
 * be negative.
 */
function checkTimeline(
  timeline: TimelineManifest,
  path: readonly PathSegment[],
  problems: Problem[],
  root = false,
): void {
  problems.push(...axisProblems(timeline, path));
  const report = (value: Coordinate | Problem): Coordinate | undefined => {
    if (isProblem(value)) {
      problems.push(value);
      return undefined;
    }
    return value;
  };
  if (timeline.length !== null) report(readOnAxis(timeline.length, timeline, [...path, "length"]));
  if (root && timeline.offset !== undefined) {
    report(readOnAxis(timeline.offset, timeline, [...path, "offset"]));
  }

  timeline.children.forEach((child, index) => {
    const childPath = [...path, "children", index];
    const offsetPath = [...childPath, "offset"];
    const offset = report(
      child.offset === undefined
        ? problem(ErrorCode.invalidCoordinate, "a child needs an offset", offsetPath)
        : readOnAxis(child.offset, timeline, offsetPath),
    );
    if (offset !== undefined && compareReal(realOf(offset), Rational.of(0n)) < 0) {
      problems.push(
        problem(
          ErrorCode.negativeChildOffset,
          `A negative child offset is not supported yet: child '${child.id}' has offset ${spelled(child.offset)}.`,
          offsetPath,
        ),
      );
    }
    checkTimeline(child, childPath, problems);
  });

  timeline.conversion_maps.forEach((map, index) => {
    const mapPath = [...path, "conversion_maps", index];
    if (map.source_unit != null && map.source_unit !== timeline.unit) {
      problems.push(
        problem(
          ErrorCode.mapSourceUnitMismatch,
          `map source unit ${map.source_unit} does not match timeline unit ${timeline.unit}`,
          [...mapPath, "source_unit"],
        ),
      );
    }
  });

  timeline.regions.forEach((region, index) => {
    const regionPath = [...path, "regions", index];
    const start = report(readOnAxis(region.start, timeline, [...regionPath, "start"]));
    const end = report(readOnAxis(region.end, timeline, [...regionPath, "end"]));
    if (start !== undefined && end !== undefined && compareCoordinates(end, start) < 0) {
      problems.push(
        problem(ErrorCode.regionEndBeforeStart, `region ${region.id} ends before it starts`, [
          ...regionPath,
          "end",
        ]),
      );
    }
  });

  const flowPath = [...path, "flow_control"];
  timeline.flow_control.breaks.forEach((entry, index) => {
    report(readOnAxis(entry.coordinate, timeline, [...flowPath, "breaks", index, "coordinate"]));
  });
  timeline.flow_control.jumps.forEach((entry, index) => {
    const jumpPath = [...flowPath, "jumps", index];
    report(readOnAxis(entry.from_coordinate, timeline, [...jumpPath, "from_coordinate"]));
    report(readOnAxis(entry.to_coordinate, timeline, [...jumpPath, "to_coordinate"]));
  });
  timeline.flow_control.markers.forEach((marker, index) => {
    report(readOnAxis(marker.coordinate, timeline, [...flowPath, "markers", index, "coordinate"]));
  });

  if (timeline.metric_hierarchy !== null && timeline.measure_map === null) {
    problems.push(
      problem(
        ErrorCode.metricHierarchyWithoutMeasureMap,
        "a metric hierarchy requires the timeline's measure map",
        [...path, "metric_hierarchy"],
      ),
    );
  }
}

/** Every invariant violation in canonical traversal order, root by root. */
export function checkManifest(manifest: Manifest): Problem[] {
  return checkOrdered(canonicalOrder(manifest));
}

/** `checkManifest` of a manifest already in canonical order. */
export function checkOrdered(manifest: Manifest): Problem[] {
  const problems: Problem[] = [];
  for (const root of rootPaths(manifest)) {
    checkTimeline(root.timeline, root.path, problems, true);
  }
  return problems;
}
