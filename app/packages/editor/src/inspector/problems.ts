/** What the inspector reports when text cannot become a manifest. */

import type { PathSegment, Problem } from "@timetoalign/tilie-core";

/** The inspector's own problem codes, beside those of core's command refusals. */
export const InspectorCode = {
  /** The text is not valid JSON, YAML or TOML; the problem carries a line and column. */
  syntaxError: "syntax_error",
  /** A number that is infinite or not a number. */
  nonFiniteNumber: "non_finite_number",
  /** A value without a JSON form, such as a TOML date. */
  invalidValue: "invalid_value",
  /** A value the chosen text format cannot show (a null TOML cannot omit). */
  notRepresentable: "not_representable",
  /** The text names a member it excludes (`graphical` while "Include styling" is unchecked). */
  hiddenMember: "hidden_member",
} as const;

/**
 * A problem with its path into the manifest, plus the 1-based line and column
 * of the text for a syntax error. Command refusals keep core's codes.
 */
export interface InspectorProblem {
  readonly code: Problem["code"] | (typeof InspectorCode)[keyof typeof InspectorCode];
  readonly message: string;
  readonly path: readonly PathSegment[];
  readonly line?: number;
  readonly column?: number;
}

/** A value, or every problem that kept it from being read. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly InspectorProblem[] };

/** A problem's path as a JSON pointer (RFC 6901; `""` for the whole text). */
export function problemPointer(problem: Pick<InspectorProblem, "path">): string {
  return problem.path
    .map((segment) => `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`)
    .join("");
}

/**
 * Where a problem lies, as a list of problems shows it: a syntax error's
 * line and column (`line 3, column 7`, or `line 3`), else the JSON pointer
 * of its member, `null` for the top level.
 */
export function problemPlace(
  problem: Pick<InspectorProblem, "path" | "line" | "column">,
): { readonly position: string } | { readonly pointer: string | null } {
  if (problem.line !== undefined) {
    return {
      position:
        problem.column === undefined
          ? `line ${problem.line}`
          : `line ${problem.line}, column ${problem.column}`,
    };
  }
  const pointer = problemPointer(problem);
  return { pointer: pointer === "" ? null : pointer };
}

/** The failed result of one problem. */
export function refused(
  code: InspectorProblem["code"],
  message: string,
  path: readonly PathSegment[] = [],
  position: { line: number; column: number } | null = null,
): { readonly ok: false; readonly problems: readonly InspectorProblem[] } {
  return { ok: false, problems: [{ code, message, path, ...position }] };
}

/** Thrown inside a recursive reader, caught at its boundary and returned as a result. */
export class ProblemError extends Error {
  readonly problem: InspectorProblem;

  constructor(problem: InspectorProblem) {
    super(problem.message);
    this.problem = problem;
  }
}

/** `read()`'s value, or its thrown `ProblemError` as a failed result. */
export function catching<T>(read: () => T): Result<T> {
  try {
    return { ok: true, value: read() };
  } catch (error) {
    if (error instanceof ProblemError) return { ok: false, problems: [error.problem] };
    throw error;
  }
}
