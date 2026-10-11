/** Validated manifest loading and canonical saving. */

import {
  canonicalOrder,
  declaredVersion,
  dumps,
  MigrationError,
  migrate,
  parse,
  SCHEMA_VERSION,
  SchemaValidationError,
  UnsupportedVersionError,
  validate,
} from "@timetoalign/timeskeleton";
import type { LoadError, Problem } from "../errors.ts";
import { ErrorCode, InvalidManifestError, problem } from "../errors.ts";
import { checkManifest } from "./invariants.ts";
import type { Manifest } from "./types.ts";

export function schemaProblems(value: unknown): Problem[] {
  try {
    validate(value);
    return [];
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      return [problem(ErrorCode.schemaViolation, error.detail, error.path)];
    }
    if (error instanceof UnsupportedVersionError) {
      return [problem(ErrorCode.schemaViolation, error.message, ["meta", "schema_version"])];
    }
    throw error;
  }
}

export function manifestProblems(value: unknown): Problem[] {
  const schema = schemaProblems(value);
  return schema.length > 0 ? schema : checkManifest(value as Manifest);
}

function refuse(...problems: Problem[]): LoadError {
  return { problems };
}

export function loadManifest(text: string): Manifest | LoadError {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      return refuse(problem(ErrorCode.schemaViolation, error.detail, error.path));
    }
    if (error instanceof UnsupportedVersionError) {
      return refuse(problem(ErrorCode.schemaViolation, error.message, ["meta", "schema_version"]));
    }
    return refuse(problem(ErrorCode.invalidJson, (error as Error).message, []));
  }
  let current = parsed;
  if (declaredVersion(parsed) !== SCHEMA_VERSION) {
    try {
      current = migrate(parsed);
    } catch (error) {
      if (error instanceof MigrationError) {
        return refuse(problem(ErrorCode.migrationFailed, error.detail, error.path));
      }
      if (error instanceof UnsupportedVersionError) {
        return refuse(
          problem(ErrorCode.schemaViolation, error.message, ["meta", "schema_version"]),
        );
      }
      throw error;
    }
  }
  const problems = manifestProblems(current);
  if (problems.length > 0) return refuse(...problems);
  return canonicalOrder(current as Manifest);
}

export function saveManifest(manifest: Manifest): string {
  const problems = manifestProblems(manifest);
  if (problems.length > 0) throw new InvalidManifestError(problems);
  return dumps(manifest);
}
