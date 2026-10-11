/** The immutable plain-JavaScript workspace view and its checks. */

import type { Graphical } from "@timetoalign/timeskeleton";
import type { Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import { manifestProblems } from "../manifest/io.ts";
import { RECORD_ID } from "./ids.ts";
import { isIndex } from "./order.ts";
import type { BlockPlacement, BlockRecord, RecordId, WorkspaceRecord } from "./records.ts";
import { BAND_GROUPS } from "./records.ts";

export interface WorkspaceMeta {
  readonly format: "tilie-workspace";
  readonly version: 1;
  readonly created: string;
  readonly generator: string;
}

export interface WorkspaceSettings {
  /** The application's style layer, between the defaults and a manifest's own. */
  readonly styles: Graphical;
  readonly blockDefaults: BlockPlacement;
  readonly grid: { readonly size: number; readonly snap: boolean };
}

export interface View {
  readonly meta: WorkspaceMeta;
  readonly settings: WorkspaceSettings;
  readonly records: { readonly [id: RecordId]: WorkspaceRecord };
}

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  styles: {},
  blockDefaults: {
    scale: 1,
    length: 400,
    spacing: 1,
    width: null,
    height: null,
    order: ["children", "regions", "flow"],
  },
  grid: { size: 8, snap: true },
};

export function createView(
  meta: { readonly created: string; readonly generator: string },
  settings: WorkspaceSettings = DEFAULT_SETTINGS,
): View {
  return {
    meta: { format: "tilie-workspace", version: 1, ...meta },
    settings,
    records: {},
  };
}

function finite(problems: Problem[], value: number, path: readonly (string | number)[]): void {
  if (!Number.isFinite(value)) {
    problems.push(problem(ErrorCode.nonFiniteNumber, "a canvas number must be finite", path));
  }
}

function styleNumbers(
  problems: Problem[],
  record: WorkspaceRecord,
  path: readonly (string | number)[],
): void {
  if (!("style" in record)) return;
  if (record.style.thickness !== undefined)
    finite(problems, record.style.thickness, [...path, "style", "thickness"]);
  if (record.style.opacity !== undefined)
    finite(problems, record.style.opacity, [...path, "style", "opacity"]);
}

function recordNumbers(
  problems: Problem[],
  record: WorkspaceRecord,
  path: readonly string[],
): void {
  const at = (name: string, value: number): void => finite(problems, value, [...path, name]);
  if ("x" in record) at("x", record.x);
  if ("y" in record) at("y", record.y);
  if (record.kind === "block") {
    for (const name of ["scale", "length", "spacing", "width", "height"] as const) {
      const value = record[name];
      if (value === null && (name === "width" || name === "height")) continue;
      at(name, value as number);
      if (Number.isFinite(value) && (value as number) <= 0) {
        problems.push(
          problem(ErrorCode.nonPositiveNumber, `${name} must be positive`, [...path, name]),
        );
      }
    }
    if (!isBandOrder(record.order)) {
      problems.push(
        problem(ErrorCode.invalidOrder, "order must hold children, regions and flow once each", [
          ...path,
          "order",
        ]),
      );
    }
  } else {
    if ("width" in record) at("width", record.width);
    if ("height" in record) at("height", record.height);
  }
  if (record.kind === "connector") {
    for (const [endName, end] of [
      ["from", record.from],
      ["to", record.to],
    ] as const) {
      if ("x" in end) {
        finite(problems, end.x, [...path, endName, "x"]);
        finite(problems, end.y, [...path, endName, "y"]);
      }
    }
    record.waypoints.forEach((point, index) => {
      finite(problems, point.x, [...path, "waypoints", index, "x"]);
      finite(problems, point.y, [...path, "waypoints", index, "y"]);
    });
  }
  styleNumbers(problems, record, path);
}

/** Whether a value is a permutation of the three band groups. */
export function isBandOrder(value: unknown): value is BlockPlacement["order"] {
  return (
    Array.isArray(value) &&
    value.length === BAND_GROUPS.length &&
    BAND_GROUPS.every((group) => value.includes(group))
  );
}

function formsParentCycle(view: View, start: RecordId): boolean {
  const seen = new Set<RecordId>();
  let current: RecordId | null = start;
  while (current !== null) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = view.records[current]?.parent ?? null;
  }
  return false;
}

export function checkWorkspace(view: View): Problem[] {
  const problems: Problem[] = [];
  const siblingIndices = new Map<string, RecordId>();
  for (const key of Object.keys(view.records).sort()) {
    const record = view.records[key] as WorkspaceRecord;
    const path = ["records", key];
    if (record.id !== key) {
      problems.push(
        problem(ErrorCode.keyMismatch, `record ${record.id} is stored under ${key}`, [
          ...path,
          "id",
        ]),
      );
    }
    if (!RECORD_ID.test(record.id)) {
      problems.push(
        problem(ErrorCode.invalidRecordId, `invalid record id ${record.id}`, [...path, "id"]),
      );
    }
    if (record.parent !== null && view.records[record.parent] === undefined) {
      problems.push(
        problem(ErrorCode.unknownParent, `parent ${record.parent} does not exist`, [
          ...path,
          "parent",
        ]),
      );
    } else if (record.parent !== null && formsParentCycle(view, record.id)) {
      problems.push(
        problem(ErrorCode.parentCycle, "the parent chain forms a cycle", [...path, "parent"]),
      );
    }
    const validIndex = isIndex(record.index);
    if (!validIndex) {
      problems.push(
        problem(ErrorCode.invalidIndex, `invalid fractional index ${record.index}`, [
          ...path,
          "index",
        ]),
      );
    } else {
      const siblingKey = `${record.parent ?? ""}\u0000${record.index}`;
      const prior = siblingIndices.get(siblingKey);
      if (prior !== undefined) {
        problems.push(
          problem(
            ErrorCode.duplicateIndex,
            `record ${record.id} shares its sibling index with ${prior}`,
            [...path, "index"],
          ),
        );
      } else siblingIndices.set(siblingKey, record.id);
    }
    recordNumbers(problems, record, path);
    if (record.kind === "block") {
      for (const item of manifestProblems((record as BlockRecord).manifest)) {
        problems.push({ ...item, path: [...path, "manifest", ...item.path] });
      }
    }
  }
  return problems;
}
