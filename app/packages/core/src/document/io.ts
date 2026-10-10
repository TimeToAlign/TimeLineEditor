/**
 * Loading and saving document text.
 *
 * `loadDocument` reads the text with timeskeleton's lossless `parse`, migrates
 * it to the latest schema version, validates it against the schema and then
 * checks every invariant. `saveDocument` validates and writes it with
 * timeskeleton's `dumps`: the canonical order and the standard JSON text,
 * byte-identical to the Python writer.
 */

import {
  canonicalOrder,
  declaredVersion,
  dumps,
  MigrationError,
  migrate,
  parse,
  SCHEMA_VERSION,
  SchemaValidationError,
  validate,
} from "@timetoalign/timeskeleton";
import type { LoadError, Problem } from "../errors.ts";
import { ErrorCode, InvalidDocumentError, problem } from "../errors.ts";
import { checkDocument } from "./invariants.ts";
import type { Document } from "./types.ts";

/** The schema problem of a value, or none. */
export function schemaProblems(value: unknown): Problem[] {
  try {
    validate(value);
    return [];
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      return [problem(ErrorCode.schemaViolation, error.detail, error.path)];
    }
    throw error;
  }
}

/** The schema problem and every invariant violation of a document. */
export function documentProblems(document: Document): Problem[] {
  const schema = schemaProblems(document);
  return schema.length > 0 ? schema : checkDocument(document);
}

function refuse(...problems: Problem[]): LoadError {
  return { problems };
}

/**
 * Read a document text.
 *
 * Returns the document in canonical order, or a `LoadError` listing every
 * problem: the first schema violation (as the shared validator reports it),
 * or every invariant violation of a schema-valid document.
 */
export function loadDocument(text: string): Document | LoadError {
  // `parse` checks the document against the version it declares (an
  // unknown version against the latest schema, which refuses it there).
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    if (error instanceof SchemaValidationError) {
      return refuse(problem(ErrorCode.schemaViolation, error.detail, error.path));
    }
    return refuse(problem(ErrorCode.invalidJson, (error as Error).message, []));
  }
  const version = declaredVersion(parsed);
  let current = parsed;
  if (version !== SCHEMA_VERSION) {
    try {
      current = migrate(parsed);
    } catch (error) {
      if (error instanceof MigrationError) {
        return refuse(problem(ErrorCode.migrationFailed, error.detail, error.path));
      }
      throw error;
    }
  }
  const schema = schemaProblems(current);
  if (schema.length > 0) return refuse(...schema);
  const document = current as Document;
  const invariants = checkDocument(document);
  if (invariants.length > 0) return refuse(...invariants);
  return canonicalOrder(document);
}

/**
 * Write a document as text, in canonical order.
 *
 * @throws {InvalidDocumentError} listing the problems of a document that fails the schema or an invariant.
 */
export function saveDocument(document: Document): string {
  const problems = documentProblems(document);
  if (problems.length > 0) throw new InvalidDocumentError(problems);
  return dumps(document);
}
