/** The immutable plain-JavaScript workspace view and its checks. */

import type { Graphical } from "@timetoalign/timetoshare";
import type { Problem } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { compareCodePoints } from "../json.ts";
import type { ContainerRef } from "../manifest/containers.ts";
import {
  ITEM_PLACE_MEMBERS,
  placeAt,
  placedContainer,
  placeMembersOf,
} from "../manifest/containers.ts";
import { manifestProblems } from "../manifest/io.ts";
import { positiveDecimal } from "../number/rational.ts";
import type { MemberReader } from "../values.ts";
import {
  readBoolean,
  readExact,
  readFinite,
  readIndex,
  readNonNegative,
  readNullablePositive,
  readPlaces,
  readPositive,
} from "../values.ts";
import type { Block, BlockId, BlockPlacement } from "./blocks.ts";
import { BLOCK_ID } from "./blocks.ts";

export interface WorkspaceMeta {
  readonly format: "tilie-workspace";
  readonly version: 7;
}

/**
 * The step of the grid a position on a timeline is picked from, per number
 * type, and whether it is refined when zooming in (or, for `int`, coarsened
 * when zooming out).
 */
export interface Granularity {
  /** The step `1 / denominator`; the denominator a positive safe integer. */
  readonly fraction: { readonly denominator: number; readonly refine: boolean };
  /** The step as positive decimal text, read exactly (`"0.2"` is 1/5). */
  readonly float: { readonly step: string; readonly refine: boolean };
  /** The step, a positive safe integer. */
  readonly int: { readonly step: number; readonly refine: boolean };
}

/**
 * How the editor is used on this workspace: the canvas's snapping grid, the
 * placement of new blocks and the granularity of positions on timelines.
 * No command changes a setting, so the journal neither records nor undoes
 * them (`Store.configure`).
 */
export interface WorkspaceSettings {
  readonly grid: { readonly size: number; readonly snap: boolean };
  readonly blockDefaults: BlockPlacement;
  readonly granularity: Granularity;
}

export interface View {
  readonly meta: WorkspaceMeta;
  /** The workspace's name, the default name of its file (`<name>.tle.json`); never empty. */
  readonly name: string;
  readonly settings: WorkspaceSettings;
  /** The workspace's default statements, between the built-in defaults and each manifest's own. */
  readonly graphical: Graphical;
  readonly blocks: { readonly [id: BlockId]: Block };
}

export const WORKSPACE_META: WorkspaceMeta = { format: "tilie-workspace", version: 7 };

/** The name of a new workspace, and of one read from a file that states none. */
export const UNTITLED_WORKSPACE = "untitled";

export const DEFAULT_GRANULARITY: Granularity = {
  fraction: { denominator: 1, refine: true },
  float: { step: "1", refine: true },
  int: { step: 1, refine: true },
};

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  grid: { size: 8, snap: true },
  blockDefaults: { scale: 1, length: 400, spacing: 8, margin: 0, width: null, height: null },
  granularity: DEFAULT_GRANULARITY,
};

/** An empty workspace with the given settings, named `untitled`. */
export function createView(settings: WorkspaceSettings = DEFAULT_SETTINGS): View {
  return { meta: WORKSPACE_META, name: UNTITLED_WORKSPACE, settings, graphical: {}, blocks: {} };
}

/** The reader of each member of a block's placement, as a block and the block defaults store it. */
export const PLACEMENT_READERS: {
  readonly [M in keyof BlockPlacement]-?: (
    value: unknown,
    path: readonly PathSegment[],
  ) => BlockPlacement[M] | Problem;
} = {
  scale: readPositive,
  length: readPositive,
  spacing: readNonNegative,
  margin: readNonNegative,
  width: readNullablePositive,
  height: readNullablePositive,
};

function readPositiveInteger(value: unknown, path: readonly PathSegment[]): number | Problem {
  const read = readPositive(value, path);
  if (isCommandError(read)) return read;
  return Number.isSafeInteger(read)
    ? read
    : problem(ErrorCode.invalidValue, "expected a positive safe integer", path);
}

function readDecimalStep(value: unknown, path: readonly PathSegment[]): string | Problem {
  return typeof value === "string" && positiveDecimal(value) !== undefined
    ? value
    : problem(ErrorCode.invalidValue, "a step is positive decimal text, such as 0.2", path);
}

/**
 * Read workspace settings, every member required and none unknown; the
 * problems go to `problems` and the result is `undefined` when there are any.
 */
export function readSettings(
  value: unknown,
  path: readonly PathSegment[],
  problems: Problem[],
): WorkspaceSettings | undefined {
  const step =
    (read: MemberReader): MemberReader =>
    (item, at) =>
      readExact(item, at, { step: read, refine: readBoolean }, problems);
  const read: unknown = readExact(
    value,
    path,
    {
      grid: (grid, at) => readExact(grid, at, { size: readPositive, snap: readBoolean }, problems),
      blockDefaults: (defaults, at) => readExact(defaults, at, PLACEMENT_READERS, problems),
      granularity: (granularity, at) =>
        readExact(
          granularity,
          at,
          {
            fraction: (item, where) =>
              readExact(
                item,
                where,
                { denominator: readPositiveInteger, refine: readBoolean },
                problems,
              ),
            float: step(readDecimalStep),
            int: step(readPositiveInteger),
          },
          problems,
        ),
    },
    problems,
  );
  // Every member was read by the reader of its type.
  return read as WorkspaceSettings | undefined;
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
  for (const name of ["scale", "length", "width", "height"] as const) {
    const value = block[name];
    if (value === null && (name === "width" || name === "height")) continue;
    check(readPositive(value, [...path, name]));
  }
  check(readNonNegative(block.spacing, [...path, "spacing"]));
  check(readNonNegative(block.margin, [...path, "margin"]));
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
 * Only a member's card is so limited: to its size, spacing and margin.
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
    : problem(code, `'${ref.timeline}' is a member: its card takes only ${listed(allowed)}`, [
        ...path,
        extra,
      ]);
}

/**
 * The problems of a block's `places`, in code-point order of its keys and
 * then of each entry's `cards`, each at `path` followed by `places`, the key
 * and below: a key naming no group and no ungrouped root
 * (`unknown_place`; a member's card lies in its group's `cards`, never at
 * the top under the member's ID), `cards` on an entry that is no group's
 * (`unknown_member`), a key of `cards` naming no member of the group
 * (`unknown_place`), and a place stating a member its container may not
 * state (`placeMemberProblem`).
 */
export function placeProblems(
  block: Pick<Block, "id" | "places" | "manifest">,
  path: readonly PathSegment[],
): Problem[] {
  return Object.keys(block.places)
    .sort(compareCodePoints)
    .flatMap((item) => {
      const at = [...path, "places", item];
      const ref = placedContainer(block.manifest, { item });
      if (ref === undefined) {
        return [
          problem(
            ErrorCode.unknownPlace,
            `'${item}' is no group and no ungrouped root of block '${block.id}'`,
            at,
          ),
        ];
      }
      const own = placeAt(block.places, { item }) ?? {};
      const problems: Problem[] = [];
      const extra = placeMemberProblem(ref, own, at);
      if (extra !== undefined) problems.push(extra);
      const cards = block.places[item]?.cards;
      if (cards === undefined) return problems;
      if (ref.kind !== "frame") {
        problems.push(
          problem(ErrorCode.unknownMember, `'${item}' is no group: its place has no cards`, [
            ...at,
            "cards",
          ]),
        );
        return problems;
      }
      for (const member of Object.keys(cards).sort(compareCodePoints)) {
        const where = [...at, "cards", member];
        const card = placedContainer(block.manifest, { item, member });
        if (card === undefined) {
          problems.push(
            problem(
              ErrorCode.unknownPlace,
              `'${member}' is no member of group '${item}' of block '${block.id}'`,
              where,
            ),
          );
          continue;
        }
        const stated = placeMemberProblem(card, cards[member] ?? {}, where);
        if (stated !== undefined) problems.push(stated);
      }
      return problems;
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
        problem(ErrorCode.keyMismatch, `block '${block.id}' is stored under '${key}'`, [
          ...path,
          "id",
        ]),
      );
    }
    if (!BLOCK_ID.test(block.id)) {
      problems.push(
        problem(ErrorCode.invalidBlockId, `invalid block id '${block.id}'`, [...path, "id"]),
      );
    }
    if (block.parent !== null && view.blocks[block.parent] === undefined) {
      problems.push(
        problem(ErrorCode.unknownParent, `parent '${block.parent}' does not exist`, [
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
            `block '${block.id}' shares its sibling index with '${prior}'`,
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
