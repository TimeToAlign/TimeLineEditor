/** Validated manifest loading and canonical saving. */

import {
  canonicalOrder,
  complete,
  completeStyles,
  dumps,
  minimal,
  parseJson,
  SchemaValidationError,
  UnsupportedVersionError,
  validate,
} from "@timetoalign/timeskeleton";
import type { LoadError, Problem } from "../errors.ts";
import { ErrorCode, InvalidManifestError, problem } from "../errors.ts";
import { checkManifest, checkOrdered } from "./invariants.ts";
import { withSegmentsUnlocked } from "./locks.ts";
import type { Manifest } from "./types.ts";

/** The problem a schema refusal is reported as. */
function schemaProblem(error: unknown): Problem {
  if (error instanceof SchemaValidationError) {
    return problem(ErrorCode.schemaViolation, error.detail, error.path);
  }
  if (error instanceof UnsupportedVersionError) {
    return problem(ErrorCode.schemaViolation, error.message, ["timeskeleton"]);
  }
  throw error;
}

export function schemaProblems(value: unknown): Problem[] {
  try {
    validate(value);
    return [];
  } catch (error) {
    return [schemaProblem(error)];
  }
}

/** The schema problem of a manifest value, else every invariant problem of its complete form. */
export function manifestProblems(value: unknown): Problem[] {
  const schema = schemaProblems(value);
  return schema.length > 0
    ? schema
    : checkManifest(complete(value as never) as unknown as Manifest);
}

function refuse(...problems: Problem[]): LoadError {
  return { problems };
}

export function loadManifest(text: string): Manifest | LoadError {
  let parsed: unknown;
  try {
    parsed = parseJson(text);
  } catch (error) {
    return refuse(problem(ErrorCode.invalidJson, (error as Error).message, []));
  }
  return readManifestValue(parsed);
}

/**
 * A manifest from a value read losslessly (`parseJson`): every schema or
 * invariant problem refuses it; an accepted one, complete or minimal or
 * anything between, is read in its complete form (every default written
 * out), put in canonical order, its segments unlocked (a segment's own lock
 * has no meaning: its segment line's governs it) and its missing styles
 * completed. Every other lock is kept as the file states it. Unknown keys
 * are kept.
 */
export function readManifestValue(value: unknown): Manifest | LoadError {
  const schema = schemaProblems(value);
  if (schema.length > 0) return refuse(...schema);
  const ordered = withSegmentsUnlocked(
    canonicalOrder(complete(value as never)) as unknown as Manifest,
  );
  const problems = checkOrdered(ordered);
  if (problems.length > 0) return refuse(...problems);
  if (ordered.graphical === undefined) return ordered;
  // completeStyles issues the one warning naming every missing style.
  const { graphical } = completeStyles(ordered.graphical);
  return { ...ordered, graphical };
}

export interface SaveOptions {
  /** Leave out every key whose value is its default; the complete form otherwise. */
  readonly minimal?: boolean;
}

/** A manifest's text: the complete form, or with `minimal` the minimal one. */
export function saveManifest(manifest: Manifest, options: SaveOptions = {}): string {
  const problems = manifestProblems(manifest);
  if (problems.length > 0) throw new InvalidManifestError(problems);
  const form = options.minimal === true ? minimal(manifest as never) : complete(manifest as never);
  return dumps(form as never);
}
