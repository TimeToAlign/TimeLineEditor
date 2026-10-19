/** The immutable plain-JavaScript workspace view and its checks. */

import type { Graphical } from "@timetoalign/timeskeleton";
import type { Problem } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { compareCodePoints } from "../json.ts";
import type { ContainerRef } from "../manifest/containers.ts";
import { containersOf, ITEM_PLACE_MEMBERS, placeMembersOf } from "../manifest/containers.ts";
import { manifestProblems } from "../manifest/io.ts";
import { readFinite, readIndex, readPlaces, readPositive } from "../values.ts";
import type { Block, BlockId, BlockPlacement } from "./blocks.ts";
import { BLOCK_ID } from "./blocks.ts";

export interface WorkspaceMeta {
  readonly format: "tilie-workspace";
  readonly version: 4;
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

export const WORKSPACE_META: WorkspaceMeta = { format: "tilie-workspace", version: 4 };

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  grid: { size: 8, snap: true },
  blockDefaults: { scale: 1, length: 400, spacing: 1, width: null, height: null },
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
  const places = readPlaces(block.places, [...path, "places"]);
  if (isCommandError(places)) problems.push(places);
  else problems.push(...placeProblems(block, path));
  return problems;
}

/** A list of words as prose: `a`, `a and b`, `a, b and c`. */
function listed(words: readonly string[]): string {
  return words.length < 2 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/**
 * The first member `place`, the place of `ref` (a frame's or a card's),
 * states beyond those `placeMembersOf(ref)` allows, as a problem of `code`
 * at `path` followed by that member; `undefined` when it states only those.
 * Only a member's card is so limited: to its size and vertical stretch.
 */
export function placeMemberProblem(
  ref: ContainerRef,
  place: object,
  path: readonly PathSegment[],
  code: ErrorCode = ErrorCode.unknownMember,
): Problem | undefined {
  const allowed = placeMembersOf(ref);
  const extra = ITEM_PLACE_MEMBERS.find(
    (member) => Object.hasOwn(place, member) && !allowed.includes(member),
  );
  return extra === undefined
    ? undefined
    : problem(code, `${ref.key} is a member: its card takes only ${listed(allowed)}`, [
        ...path,
        extra,
      ]);
}

/**
 * The problems of a block's `places`, in code-point order of its keys, each
 * at `path` followed by `places` and the key: a key naming no frame and no
 * card of its manifest's drawing (`unknown_place`), and a place stating a
 * member its container may not state (`placeMemberProblem`).
 */
export function placeProblems(
  block: Pick<Block, "id" | "places" | "manifest">,
  path: readonly PathSegment[],
): Problem[] {
  const { byKey } = containersOf(block.manifest);
  return Object.keys(block.places)
    .sort(compareCodePoints)
    .flatMap((key) => {
      const at = [...path, "places", key];
      const ref = byKey.get(key);
      if (ref === undefined) {
        return [
          problem(
            ErrorCode.unknownPlace,
            `${key} is no group, no ungrouped root and no member of block ${block.id}`,
            at,
          ),
        ];
      }
      const extra = placeMemberProblem(ref, block.places[key] ?? {}, at);
      return extra === undefined ? [] : [extra];
    });
}

/** Every problem of a view, block by block in id order, at its path in the view. */
export function checkWorkspace(view: View): Problem[] {
  return structureProblems(view, true);
}

/**
 * The problems of a view's blocks, in id order: their ids, parents,
 * indices and placement, the keys of their places, and with
 * `manifests` their manifests too.
 */
export function structureProblems(view: View, manifests = false): Problem[] {
  const problems: Problem[] = [];
  const siblingIndices = new Map<string, BlockId>();
  for (const key of Object.keys(view.blocks).sort()) {
    const block = view.blocks[key];
    if (block === undefined) continue;
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
