/**
 * Machine-readable problems from manifest boundaries and command reducers.
 */

import type { PathSegment } from "./json.ts";

/** Every problem code, as stable string constants. */
export const ErrorCode = {
  invalidJson: "invalid_json",
  schemaViolation: "schema_violation",
  invalidCommand: "invalid_command",
  invalidCoordinate: "invalid_coordinate",
  unitNotAllowed: "unit_not_allowed",
  numberTypeNotAllowed: "number_type_not_allowed",
  offAxis: "off_axis",
  childUnitMismatch: "child_unit_mismatch",
  negativeOffset: "negative_offset",
  childExceedsParent: "child_exceeds_parent",
  childNotLocked: "child_not_locked",
  locked: "locked",
  lengthBelowContent: "length_below_content",
  negativeLength: "negative_length",
  duplicateRegion: "duplicate_region",
  regionEndBeforeStart: "region_end_before_start",
  duplicateMap: "duplicate_map",
  mapSourceUnitMismatch: "map_source_unit_mismatch",
  metricHierarchyWithoutMeasureMap: "metric_hierarchy_without_measure_map",
  duplicateTimeline: "duplicate_timeline",
  keyMismatch: "key_mismatch",
  unknownRecord: "unknown_record",
  duplicateRecord: "duplicate_record",
  invalidRecordId: "invalid_record_id",
  notABlock: "not_a_block",
  unknownParent: "unknown_parent",
  parentCycle: "parent_cycle",
  invalidIndex: "invalid_index",
  duplicateIndex: "duplicate_index",
  invalidAddress: "invalid_address",
  nonFiniteNumber: "non_finite_number",
  nonPositiveNumber: "non_positive_number",
  invalidOrder: "invalid_order",
  unknownTimeline: "unknown_timeline",
  notAChild: "not_a_child",
  unknownRegion: "unknown_region",
  unknownBreak: "unknown_break",
  unknownJump: "unknown_jump",
  unknownMarker: "unknown_marker",
  unknownMap: "unknown_map",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * One problem: a code from `ErrorCode`, a description, and the path of the
 * offending value.
 *
 * For a load, the path points into the manifest. For a command applied to a
 * view, the path points into that view: `["records", <id>, ...]` for a record
 * command (`["records", <id>, "index"]` names the record's index), and
 * `["records", <block id>, "manifest", ...]` for a manifest command, where the
 * rest names the member of the command at fault, since a refused value is not
 * in the view. `applyToManifest`, which has no view, reports that member
 * alone. A command that `parseCommand` rejects as malformed has no view
 * location; its path names the malformed member of the rejected value.
 */
export interface Problem {
  readonly code: ErrorCode;
  readonly message: string;
  readonly path: readonly PathSegment[];
}

/** Why a command was refused. */
export type CommandError = Problem;

/** Why manifest text was refused: every problem found. */
export interface LoadError {
  readonly problems: readonly Problem[];
}

export function problem(code: ErrorCode, message: string, path: readonly PathSegment[]): Problem {
  return { code, message, path };
}

/** Whether a result of `apply` or `parseCommand` is a refusal. */
export function isCommandError(value: unknown): value is CommandError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    Array.isArray((value as { path?: unknown }).path)
  );
}

/** Whether a manifest load result is a refusal. */
export function isLoadError(value: unknown): value is LoadError {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { problems?: unknown }).problems)
  );
}

/** Thrown when a manifest fails the schema or an invariant at save time. */
export class InvalidManifestError extends Error {
  readonly problems: readonly Problem[];

  constructor(problems: readonly Problem[]) {
    super(
      problems
        .map((item) => `${item.code} at ${JSON.stringify(item.path)}: ${item.message}`)
        .join("; "),
    );
    this.name = "InvalidManifestError";
    this.problems = problems;
  }
}
