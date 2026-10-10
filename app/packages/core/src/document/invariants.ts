/**
 * The invariants of a document beyond its schema, as timetoalign enforces
 * them. `tests/README.md` lists each one with the library source that
 * enforces the same rule.
 */

import type { NumberType, TimelineClass, TimeUnit } from "@timetoalign/timeskeleton";
import type { Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import type { Coordinate, CoordinateDict } from "../number/coordinate.ts";
import {
  CoordinateError,
  compareCoordinates,
  coordinateFromDict,
  zeroCoordinate,
} from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import type { Real } from "../number/real.ts";
import { addReal, compareReal, realOf } from "../number/real.ts";
import type { TimelineManifest } from "./types.ts";

/** The units each timeline class admits (timetoalign's `_allowed_units`). */
export const CLASS_UNITS: { readonly [name in TimelineClass]: readonly TimeUnit[] } = {
  ContinuousLogicalTimeline: ["whole_note", "quarters", "floating_measures", "number"],
  DiscreteLogicalTimeline: ["ticks"],
  ContinuousPhysicalTimeline: ["seconds", "milliseconds", "minutes"],
  DiscretePhysicalTimeline: ["samples", "frames"],
  ContinuousGraphicalTimeline: ["meters", "centimeters", "millimeters", "inches", "points"],
  DiscreteGraphicalTimeline: ["pixels"],
};

const DISCRETE_UNITS: readonly TimeUnit[] = ["ticks", "samples", "frames", "pixels"];

/** The number types a unit admits (timetoalign's `TimeUnit.allowed_number_types`). */
export function allowedNumberTypes(unit: TimeUnit): readonly NumberType[] {
  if (DISCRETE_UNITS.includes(unit)) return ["int"];
  if (unit === "number") return ["int", "float", "fraction"];
  return ["float", "fraction"];
}

/** Problems with a timeline's axis: class, unit and number type. */
export function axisProblems(
  timeline: Pick<TimelineManifest, "class" | "unit" | "number_type">,
  path: readonly PathSegment[],
): Problem[] {
  const problems: Problem[] = [];
  if (!CLASS_UNITS[timeline.class].includes(timeline.unit)) {
    problems.push(
      problem(
        ErrorCode.unitNotAllowed,
        `${timeline.class} does not allow unit ${timeline.unit}; allowed: ${CLASS_UNITS[timeline.class].join(", ")}`,
        [...path, "unit"],
      ),
    );
  }
  if (!allowedNumberTypes(timeline.unit).includes(timeline.number_type)) {
    problems.push(
      problem(
        ErrorCode.numberTypeNotAllowed,
        `unit ${timeline.unit} does not admit number_type ${timeline.number_type}; allowed: ${allowedNumberTypes(timeline.unit).join(", ")}`,
        [...path, "number_type"],
      ),
    );
  }
  return problems;
}

/**
 * Read a coordinate dict that must lie on a timeline's axis.
 *
 * Returns the coordinate, or the problem: `invalid_coordinate` when the
 * library cannot read it, `off_axis` when its unit or number type differs.
 */
export function readOnAxis(
  dict: CoordinateDict | unknown,
  timeline: Pick<TimelineManifest, "id" | "unit" | "number_type">,
  path: readonly PathSegment[],
): Coordinate | Problem {
  let coordinate: Coordinate;
  try {
    coordinate = coordinateFromDict(dict);
  } catch (error) {
    if (error instanceof CoordinateError) {
      return problem(ErrorCode.invalidCoordinate, error.message, [...path, ...error.path]);
    }
    throw error;
  }
  if (coordinate.unit !== timeline.unit || coordinate.numberType !== timeline.number_type) {
    return problem(
      ErrorCode.offAxis,
      `coordinate on ${coordinate.unit}/${coordinate.numberType} is not on the axis ${timeline.unit}/${timeline.number_type} of timeline ${JSON.stringify(timeline.id)}`,
      path,
    );
  }
  return coordinate;
}

export function isProblem(value: unknown): value is Problem {
  return typeof value === "object" && value !== null && "code" in value && "path" in value;
}

/**
 * Where a child ends on its parent: offset (on the parent's axis) plus the
 * child's length (on its own number type), as Python adds them.
 */
export function childEnd(offset: Coordinate, length: Coordinate): Real {
  return addReal(realOf(offset), realOf(length));
}

/** The end of the furthest child, or the origin (timetoalign's `_get_max_content_coordinate`). */
export function contentEnd(timeline: TimelineManifest): Real {
  let end: Real = Rational.of(0n);
  for (const entry of Object.values(timeline.children)) {
    const candidate = childEnd(
      coordinateFromDict(entry.offset),
      coordinateFromDict(entry.timeline.length),
    );
    if (compareReal(candidate, end) > 0) end = candidate;
  }
  return end;
}

function checkTimeline(
  timeline: TimelineManifest,
  path: readonly PathSegment[],
  seen: Map<string, readonly PathSegment[]>,
  problems: Problem[],
): void {
  const previous = seen.get(timeline.id);
  if (previous !== undefined) {
    problems.push(
      problem(
        ErrorCode.duplicateTimeline,
        `timeline id ${JSON.stringify(timeline.id)} is already used at ${JSON.stringify(previous)}`,
        [...path, "id"],
      ),
    );
  } else {
    seen.set(timeline.id, path);
  }
  const axis = axisProblems(timeline, path);
  problems.push(...axis);
  const report = (value: Coordinate | Problem): Coordinate | undefined => {
    if (isProblem(value)) {
      problems.push(value);
      return undefined;
    }
    return value;
  };
  const length = report(readOnAxis(timeline.length, timeline, [...path, "length"]));

  for (const [key, entry] of Object.entries(timeline.children)) {
    const entryPath = [...path, "children", key];
    const child = entry.timeline;
    const childPath = [...entryPath, "timeline"];
    if (child.id !== key) {
      problems.push(
        problem(
          ErrorCode.keyMismatch,
          `child stored under ${JSON.stringify(key)} has id ${JSON.stringify(child.id)}`,
          [...childPath, "id"],
        ),
      );
    }
    const offset = report(readOnAxis(entry.offset, timeline, [...entryPath, "offset"]));
    if (child.unit !== timeline.unit) {
      problems.push(
        problem(
          ErrorCode.childUnitMismatch,
          `child unit ${child.unit} does not match parent unit ${timeline.unit}`,
          [...childPath, "unit"],
        ),
      );
    }
    if (!child.locked) {
      problems.push(
        problem(ErrorCode.childNotLocked, `child ${JSON.stringify(key)} is not locked`, [
          ...childPath,
          "locked",
        ]),
      );
    }
    if (offset !== undefined) {
      if (compareCoordinates(offset, zeroCoordinate(offset.unit, offset.numberType)) < 0) {
        problems.push(
          problem(ErrorCode.negativeOffset, "a child offset cannot be negative", [
            ...entryPath,
            "offset",
          ]),
        );
      }
      // The child's own axis is checked when the child itself is checked.
      const childLength = readOnAxis(child.length, child, [...childPath, "length"]);
      if (length !== undefined && !isProblem(childLength) && child.unit === timeline.unit) {
        if (compareReal(childEnd(offset, childLength), realOf(length)) > 0) {
          problems.push(
            problem(
              ErrorCode.childExceedsParent,
              `child ${JSON.stringify(key)} ends after its parent ${JSON.stringify(timeline.id)}`,
              [...entryPath, "offset"],
            ),
          );
        }
      }
    }
    checkTimeline(child, childPath, seen, problems);
  }

  const mapIds = new Set<string>();
  timeline.conversion_maps.forEach((map, index) => {
    const mapPath = [...path, "conversion_maps", index];
    if (mapIds.has(map.id)) {
      problems.push(
        problem(ErrorCode.duplicateMap, `conversion map id ${JSON.stringify(map.id)} is repeated`, [
          ...mapPath,
          "id",
        ]),
      );
    }
    mapIds.add(map.id);
    if (map.source_unit !== null && map.source_unit !== timeline.unit) {
      problems.push(
        problem(
          ErrorCode.mapSourceUnitMismatch,
          `map source unit ${map.source_unit} does not match timeline unit ${timeline.unit}`,
          [...mapPath, "source_unit"],
        ),
      );
    }
  });

  const regionNames = new Set<string>();
  timeline.regions.forEach((region, index) => {
    const regionPath = [...path, "regions", index];
    if (regionNames.has(region.name)) {
      problems.push(
        problem(ErrorCode.duplicateRegion, `region ${JSON.stringify(region.name)} is repeated`, [
          ...regionPath,
          "name",
        ]),
      );
    }
    regionNames.add(region.name);
    const start = report(readOnAxis(region.start, timeline, [...regionPath, "start"]));
    const end = report(readOnAxis(region.end, timeline, [...regionPath, "end"]));
    if (start !== undefined && end !== undefined && compareCoordinates(end, start) < 0) {
      problems.push(
        problem(
          ErrorCode.regionEndBeforeStart,
          `region ${JSON.stringify(region.name)} ends before it starts`,
          [...regionPath, "end"],
        ),
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
  for (const [name, dict] of Object.entries(timeline.flow_control.markers)) {
    report(readOnAxis(dict, timeline, [...flowPath, "markers", name]));
  }

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

/** Every invariant violation of a schema-valid document, in document order. */
export function checkDocument(document: {
  readonly manifest: { readonly timelines: { readonly [id: string]: TimelineManifest } };
}): Problem[] {
  const problems: Problem[] = [];
  const seen = new Map<string, readonly PathSegment[]>();
  for (const [key, timeline] of Object.entries(document.manifest.timelines)) {
    const path = ["manifest", "timelines", key];
    if (timeline.id !== key) {
      problems.push(
        problem(
          ErrorCode.keyMismatch,
          `timeline stored under ${JSON.stringify(key)} has id ${JSON.stringify(timeline.id)}`,
          [...path, "id"],
        ),
      );
    }
    checkTimeline(timeline, path, seen, problems);
  }
  return problems;
}
