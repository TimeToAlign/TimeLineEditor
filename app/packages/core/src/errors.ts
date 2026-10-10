/**
 * Machine-readable problems: what `loadDocument` refuses a document for, and
 * what a command is refused with.
 */

import type { PathSegment } from "./json.ts";

/** Every problem code, as stable string constants. */
export const ErrorCode = {
  invalidJson: "invalid_json",
  schemaViolation: "schema_violation",
  migrationFailed: "migration_failed",
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
  unknownTimeline: "unknown_timeline",
  notARoot: "not_a_root",
  notAChild: "not_a_child",
  childIsAncestor: "child_is_ancestor",
  unknownRegion: "unknown_region",
  unknownBreak: "unknown_break",
  unknownJump: "unknown_jump",
  unknownMarker: "unknown_marker",
  unknownMap: "unknown_map",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * One problem: a code from `ErrorCode`, a description, and the path of the
 * offending value (into the document for a load, into the command for a
 * command).
 */
export interface Problem {
  readonly code: ErrorCode;
  readonly message: string;
  readonly path: readonly PathSegment[];
}

/** Why a command was refused. */
export type CommandError = Problem;

/** Why a document text was refused: every problem found. */
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

/** Whether a result of `loadDocument` is a refusal. */
export function isLoadError(value: unknown): value is LoadError {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { problems?: unknown }).problems)
  );
}

/** Thrown by `saveDocument` for a document that fails the schema or an invariant. */
export class InvalidDocumentError extends Error {
  readonly problems: readonly Problem[];

  constructor(problems: readonly Problem[]) {
    super(
      problems
        .map((item) => `${item.code} at ${JSON.stringify(item.path)}: ${item.message}`)
        .join("; "),
    );
    this.name = "InvalidDocumentError";
    this.problems = problems;
  }
}
