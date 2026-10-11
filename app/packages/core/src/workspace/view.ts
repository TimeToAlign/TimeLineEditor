/** The immutable plain-JavaScript workspace view and its checks. */

import type { Graphical } from "@timetoalign/timeskeleton";
import type { Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import { manifestProblems } from "../manifest/io.ts";
import { RECORD_ID } from "./ids.ts";
import { isIndex } from "./order.ts";
import type {
  BlockRecord,
  Colour,
  Margins,
  NameColumn,
  RecordId,
  WorkspaceRecord,
} from "./records.ts";

export interface WorkspaceMeta {
  readonly format: "tilie-workspace";
  readonly version: 1;
  readonly created: string;
  readonly generator: string;
}

export interface BlockDefaults {
  readonly scale: number;
  readonly zoom: number;
  readonly margins: Margins;
  readonly background: Colour | null;
  readonly nameColumn: NameColumn;
}

export interface WorkspaceSettings {
  /** The application's style layer, between the defaults and a manifest's own. */
  readonly styles: Graphical;
  readonly blockDefaults: BlockDefaults;
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
    scale: 40,
    zoom: 1,
    margins: { top: 16, right: 16, bottom: 16, left: 16 },
    background: null,
    nameColumn: { visible: true, width: [1, 4] },
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
  if ("width" in record) at("width", record.width);
  if ("height" in record) at("height", record.height);
  if (record.kind === "block") {
    at("scale", record.scale);
    at("zoom", record.zoom);
    for (const side of ["top", "right", "bottom", "left"] as const) {
      finite(problems, record.margins[side], [...path, "margins", side]);
    }
    record.nameColumn.width.forEach((value, index) => {
      finite(problems, value, [...path, "nameColumn", "width", index]);
    });
    for (const name of ["scale", "zoom"] as const) {
      if (Number.isFinite(record[name]) && record[name] <= 0) {
        problems.push(
          problem(ErrorCode.nonPositiveNumber, `${name} must be positive`, [...path, name]),
        );
      }
    }
  } else if (record.kind === "connector") {
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
