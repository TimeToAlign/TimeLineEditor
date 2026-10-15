/**
 * Machine-readable problems from manifest and workspace boundaries and from
 * commands.
 */

import type { PathSegment } from "./json.ts";

/** Every problem code, as stable string constants. */
export const ErrorCode = {
  invalidJson: "invalid_json",
  schemaViolation: "schema_violation",
  invalidCommand: "invalid_command",
  invalidCoordinate: "invalid_coordinate",
  numberTypeNotAllowed: "number_type_not_allowed",
  childExceedsParent: "child_exceeds_parent",
  locked: "locked",
  negativeChildOffset: "negative_child_offset",
  segmentNeverLocked: "segment_never_locked",
  unlockingNotSupported: "unlocking_not_supported",
  lengthBelowContent: "length_below_content",
  segmentEndFixed: "segment_end_fixed",
  regionEndBeforeStart: "region_end_before_start",
  mapSourceUnitMismatch: "map_source_unit_mismatch",
  metricHierarchyWithoutMeasureMap: "metric_hierarchy_without_measure_map",
  duplicateId: "duplicate_id",
  keyMismatch: "key_mismatch",
  invalidBlockId: "invalid_block_id",
  unknownParent: "unknown_parent",
  parentCycle: "parent_cycle",
  invalidIndex: "invalid_index",
  duplicateIndex: "duplicate_index",
  invalidAddress: "invalid_address",
  unknownTarget: "unknown_target",
  unknownProperty: "unknown_property",
  wrongTargetKind: "wrong_target_kind",
  idNotSettable: "id_not_settable",
  notRemovable: "not_removable",
  gapRequired: "gap_required",
  gapNotPermitted: "gap_not_permitted",
  invalidValue: "invalid_value",
  nonFiniteNumber: "non_finite_number",
  nonPositiveNumber: "non_positive_number",
  invalidOrder: "invalid_order",
  unsupportedFormat: "unsupported_format",
  unsupportedVersion: "unsupported_version",
  unknownMember: "unknown_member",
  missingMember: "missing_member",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * One problem: a code from `ErrorCode`, a description, and the path of the
 * offending value.
 *
 * For a load, the path points into the text read: into the manifest, or into
 * the workspace file (`["blocks", <id>, "manifest", ...]`). For a command,
 * it starts with the address of the target at fault, followed by the
 * property or kind at fault (`[<address>, "length"]`), or by `"manifest"`
 * and a location in the manifest the command would leave (`[<block id>,
 * "manifest", "timelines", 0, ...]`). Only a malformed command, which has no
 * target, names the malformed member of the command itself.
 */
export interface Problem {
  readonly code: ErrorCode;
  readonly message: string;
  readonly path: readonly PathSegment[];
}

/** Why a command was refused. */
export type CommandError = Problem;

/** Why manifest or workspace text was refused: every problem found. */
export interface LoadError {
  readonly problems: readonly Problem[];
}

export function problem(code: ErrorCode, message: string, path: readonly PathSegment[]): Problem {
  return { code, message, path };
}

/** Whether a result of `apply`, `dispatch` or `parseCommand` is a refusal. */
export function isCommandError(value: unknown): value is CommandError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    Array.isArray((value as { path?: unknown }).path)
  );
}

/** Whether a manifest or workspace load result is a refusal. */
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
