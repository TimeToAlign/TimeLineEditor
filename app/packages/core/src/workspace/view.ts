/** The immutable plain-JavaScript workspace view and its checks. */

import type { Graphical } from "@timetoalign/timeskeleton";
import type { Problem } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { manifestProblems } from "../manifest/io.ts";
import { readFinite, readIndex, readOrder, readPositive } from "../values.ts";
import type { Block, BlockId, BlockPlacement } from "./blocks.ts";
import { BLOCK_ID } from "./blocks.ts";

export interface WorkspaceMeta {
  readonly format: "tilie-workspace";
  readonly version: 2;
}

export interface WorkspaceSettings {
  readonly grid: { readonly size: number; readonly snap: boolean };
  readonly blockDefaults: BlockPlacement;
  /** The workspace's default statements, between the built-in defaults and each manifest's own. */
  readonly graphical: Graphical;
}

export interface View {
  readonly meta: WorkspaceMeta;
  readonly settings: WorkspaceSettings;
  readonly blocks: { readonly [id: BlockId]: Block };
}

export const WORKSPACE_META: WorkspaceMeta = { format: "tilie-workspace", version: 2 };

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  grid: { size: 8, snap: true },
  blockDefaults: {
    scale: 1,
    length: 400,
    spacing: 1,
    width: null,
    height: null,
    order: ["children", "regions", "flow"],
  },
  graphical: {},
};

/** An empty workspace with the given settings. */
export function createView(settings: WorkspaceSettings = DEFAULT_SETTINGS): View {
  return { meta: WORKSPACE_META, settings, blocks: {} };
}

function formsParentCycle(view: View, start: BlockId): boolean {
  const seen = new Set<BlockId>();
  let current: BlockId | null = start;
  while (current !== null) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = view.blocks[current]?.parent ?? null;
  }
  return false;
}

function placementProblems(block: Block, path: readonly PathSegment[]): Problem[] {
  const problems: Problem[] = [];
  const check = (read: unknown) => {
    if (isCommandError(read)) problems.push(read);
  };
  check(readFinite(block.x, [...path, "x"]));
  check(readFinite(block.y, [...path, "y"]));
  for (const name of ["scale", "length", "spacing", "width", "height"] as const) {
    const value = block[name];
    if (value === null && (name === "width" || name === "height")) continue;
    check(readPositive(value, [...path, name]));
  }
  check(readOrder(block.order, [...path, "order"]));
  return problems;
}

/** Every problem of a view, block by block in id order, at its path in the view. */
export function checkWorkspace(view: View): Problem[] {
  return structureProblems(view, true);
}

/**
 * The problems of a view's blocks, in id order: their ids, parents,
 * indices and placement, and with `manifests` their manifests too.
 */
export function structureProblems(view: View, manifests = false): Problem[] {
  const problems: Problem[] = [];
  const siblingIndices = new Map<string, BlockId>();
  for (const key of Object.keys(view.blocks).sort()) {
    const block = view.blocks[key] as Block;
    const path = ["blocks", key];
    if (block.id !== key) {
      problems.push(
        problem(ErrorCode.keyMismatch, `block ${block.id} is stored under ${key}`, [...path, "id"]),
      );
    }
    if (!BLOCK_ID.test(block.id)) {
      problems.push(
        problem(ErrorCode.invalidBlockId, `invalid block id ${block.id}`, [...path, "id"]),
      );
    }
    if (block.parent !== null && view.blocks[block.parent] === undefined) {
      problems.push(
        problem(ErrorCode.unknownParent, `parent ${block.parent} does not exist`, [
          ...path,
          "parent",
        ]),
      );
    } else if (block.parent !== null && formsParentCycle(view, block.id)) {
      problems.push(
        problem(ErrorCode.parentCycle, "the parent chain forms a cycle", [...path, "parent"]),
      );
    }
    const index = readIndex(block.index, [...path, "index"]);
    if (isCommandError(index)) {
      problems.push(index);
    } else {
      const siblingKey = `${block.parent ?? ""}\u0000${index}`;
      const prior = siblingIndices.get(siblingKey);
      if (prior !== undefined) {
        problems.push(
          problem(
            ErrorCode.duplicateIndex,
            `block ${block.id} shares its sibling index with ${prior}`,
            [...path, "index"],
          ),
        );
      } else siblingIndices.set(siblingKey, block.id);
    }
    problems.push(...placementProblems(block, path));
    if (!manifests) continue;
    for (const item of manifestProblems(block.manifest)) {
      problems.push({ ...item, path: [...path, "manifest", ...item.path] });
    }
  }
  return problems;
}
