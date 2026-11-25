/** The immutable plain-JavaScript workspace view and its checks. */

import type { FileForm, Graphical, Serialization } from "@timetoalign/timetoshare";
import { isSerialization, JsonFloat } from "@timetoalign/timetoshare";
import type { Problem } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import { compareCodePoints, isJsonObject } from "../json.ts";
import type { ContainerRef } from "../manifest/containers.ts";
import {
  ITEM_PLACE_MEMBERS,
  placeAt,
  placedContainer,
  placeMembersOf,
} from "../manifest/containers.ts";
import { manifestProblems, NEW_MANIFEST_FILE } from "../manifest/io.ts";
import { BELIEF_STATES, type BeliefState, DEFAULT_BELIEFS } from "../matches/beliefs.ts";
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
import type { Block, BlockId, BlockPlacement, ItemArrangement } from "./blocks.ts";
import { BLOCK_ID, ITEM_DIRECTIONS } from "./blocks.ts";

/** The format and version a workspace file states: the only ones this editor reads. */
export interface WorkspaceMeta {
  readonly format: "tilie-workspace";
  readonly version: 7;
}

/**
 * How finely a position on a timeline is picked and a float shown: a
 * fraction axis picks multiples of `1 / denominator` at the finest, a float
 * axis decimals of at most `decimals` places, and a float is shown with
 * `decimals` places. An int axis picks integers at the finest and has no
 * setting.
 */
export interface Granularity {
  /** The finest fraction step is `1 / denominator`; a positive safe integer. */
  readonly denominator: number;
  /** The most decimal places a float is picked or shown with; an integer from 0 to 15. */
  readonly decimals: number;
}

/**
 * Which MatchClaims of a block's MatchClaim table are shown: those between
 * two of the timelines `timelines` lists (every timeline where it is
 * `null`) whose state for the user is one of `beliefs` (the belief
 * filter, `beliefMask`).
 */
export interface MatchClaimFilter {
  /** The IDs of the timelines whose MatchClaims are shown, by code point; `null` for every timeline. */
  readonly timelines: readonly string[] | null;
  /** The belief states kept, each once, in the order of `BELIEF_STATES`. */
  readonly beliefs: readonly BeliefState[];
}

/** The filter of a block that states none: every timeline, every belief state but `false`. */
export const DEFAULT_MATCH_CLAIM_FILTER: MatchClaimFilter = {
  timelines: null,
  beliefs: DEFAULT_BELIEFS,
};

/**
 * How a block's manifest is written to a file (`FileForm`) and, where the
 * editor knows it, where that file lies: `location`, its path relative to
 * the folder of the workspace's own file (POSIX, as a manifest states its
 * resources relative to itself; `..` leads out of that folder). A setting
 * of the workspace, never part of the manifest.
 */
export interface ManifestFile extends FileForm {
  readonly location?: string;
}

/**
 * How the editor is used on this workspace: the canvas's snapping grid, the
 * placement of new blocks, the granularity of positions on timelines, how
 * each block's manifest is written to a file and which of its MatchClaims
 * are shown. The MatchClaim table itself is never held. No command changes a
 * setting, so the journal neither records nor undoes them
 * (`Store.configure`).
 */
export interface WorkspaceSettings {
  readonly grid: { readonly size: number; readonly snap: boolean };
  readonly blockDefaults: BlockPlacement;
  readonly granularity: Granularity;
  /**
   * How the manifest of a block is written to a file and where that file
   * lies, by block ID; a block without an entry as `NEW_MANIFEST_FILE`
   * (`manifestFileOf`). An entry outlives its block, which the journal may
   * bring back.
   */
  readonly manifests: { readonly [block: BlockId]: ManifestFile };
  /**
   * The MatchClaim filter of a block, by block ID; a block without an entry
   * as `DEFAULT_MATCH_CLAIM_FILTER` (`matchClaimFilterOf`). An entry
   * outlives its block, and its timelines may name timelines its manifest
   * no longer holds.
   */
  readonly matchClaimFilters: { readonly [block: BlockId]: MatchClaimFilter };
}

/** The directions the blocks of a workspace may be arranged in. */
export const CANVAS_DIRECTIONS = ["vertical", "horizontal", "matrix"] as const;

/** A direction the blocks of a workspace may be arranged in. */
export type CanvasDirection = (typeof CANVAS_DIRECTIONS)[number];

/**
 * How the blocks of a workspace are arranged instead of standing at their
 * places: packed one under another, side by side, or in a matrix of
 * `columns` columns, in the order of their `index`.
 */
export interface CanvasArrangement {
  readonly direction: CanvasDirection;
  /** A matrix's number of columns, a positive integer; `columnsOf` where not stated. Only a matrix states it. */
  readonly columns?: number;
}

/** The number of columns of a matrix of `count` blocks: the stated one, else the smallest whose square holds them (at least 1). */
export function columnsOf(arrangement: CanvasArrangement, count: number): number {
  return arrangement.columns ?? Math.max(1, Math.ceil(Math.sqrt(count)));
}

/**
 * A workspace: its name, settings, default rules, block arrangement and
 * blocks by ID, an immutable plain-JavaScript value.
 */
export interface View {
  readonly meta: WorkspaceMeta;
  /** The workspace's name, the default name of its file (`<name>.tle.json`); never empty. */
  readonly name: string;
  readonly settings: WorkspaceSettings;
  /** The workspace's default rules, between the built-in defaults and each manifest's own. */
  readonly graphical: Graphical;
  /**
   * How the blocks are arranged; absent where they stand at their places, as
   * a file without the member and a `set` of `null` leave it.
   */
  readonly arrangement?: CanvasArrangement;
  readonly blocks: { readonly [id: BlockId]: Block };
}

/** The format and version of the workspaces this editor reads and writes. */
export const WORKSPACE_META: WorkspaceMeta = { format: "tilie-workspace", version: 7 };

/** The name of a new workspace, and of one read from a file that states none. */
export const UNTITLED_WORKSPACE = "untitled";

/** The default granularity: 2520 = lcm(1, …, 10) reaches every tuplet up to tens; floats to three places. */
export const DEFAULT_GRANULARITY: Granularity = { denominator: 2520, decimals: 3 };

/** The most decimal places `decimals` may state. */
export const MAX_DECIMALS = 15;

/**
 * The settings of a new workspace: an 8-unit grid that snaps, new blocks at
 * scale 1 and length 400 with spacing 8, no margin and no width or height,
 * `DEFAULT_GRANULARITY`, and no manifest file or MatchClaim filter entries.
 */
export const DEFAULT_SETTINGS: WorkspaceSettings = {
  grid: { size: 8, snap: true },
  blockDefaults: { scale: 1, length: 400, spacing: 8, margin: 0, width: null, height: null },
  granularity: DEFAULT_GRANULARITY,
  manifests: {},
  matchClaimFilters: {},
};

/** How the manifest of block `block` is written to a file: its entry in `settings`, else `NEW_MANIFEST_FILE`. */
export function manifestFileOf(settings: WorkspaceSettings, block: BlockId): ManifestFile {
  return settings.manifests[block] ?? NEW_MANIFEST_FILE;
}

/** Which MatchClaims of block `block` are shown: its entry in `settings`, else `DEFAULT_MATCH_CLAIM_FILTER`. */
export function matchClaimFilterOf(settings: WorkspaceSettings, block: BlockId): MatchClaimFilter {
  return settings.matchClaimFilters[block] ?? DEFAULT_MATCH_CLAIM_FILTER;
}

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

/** A direction among `directions`, quoted in the refusal. */
function readDirection<D extends string>(
  value: unknown,
  path: readonly PathSegment[],
  directions: readonly D[],
): D | Problem {
  const found = directions.find((direction) => direction === value);
  if (found !== undefined) return found;
  const words = directions.map((direction) => `"${direction}"`);
  return problem(
    ErrorCode.invalidValue,
    `expected ${words.slice(0, -1).join(", ")} or ${words.at(-1)}`,
    path,
  );
}

/** The members of an arrangement object `value` at `path`: an object holding `members` alone, `required` among them. */
function arrangementObject(
  value: unknown,
  path: readonly PathSegment[],
  members: readonly string[],
  required: readonly string[],
): JsonObject | Problem {
  if (!isJsonObject(value))
    return problem(ErrorCode.invalidValue, "expected null or an object", path);
  const extra = Object.keys(value).find((member) => !members.includes(member));
  if (extra !== undefined) {
    return problem(ErrorCode.unknownMember, `unknown member ${extra}`, [...path, extra]);
  }
  const missing = required.find((member) => !Object.hasOwn(value, member));
  return missing === undefined
    ? value
    : problem(ErrorCode.missingMember, `missing member ${missing}`, [...path, missing]);
}

/**
 * A block's arrangement as a `set` gives it or a file states it: `null`
 * for none, else `{direction, order}`, `direction` `"vertical"` or
 * `"horizontal"`, `order` a list of IDs, kept as given: an ID naming no
 * item or named again is valid (`itemOrder` passes over the one and takes
 * the other at its first mention).
 */
export function readItemArrangement(
  value: unknown,
  path: readonly PathSegment[],
): ItemArrangement | null | Problem {
  if (value === null) return null;
  const object = arrangementObject(value, path, ["direction", "order"], ["direction", "order"]);
  if (isCommandError(object)) return object;
  const direction = readDirection(object.direction, [...path, "direction"], ITEM_DIRECTIONS);
  if (isCommandError(direction)) return direction;
  const { order } = object;
  if (!Array.isArray(order) || !order.every((item) => typeof item === "string")) {
    return problem(ErrorCode.invalidValue, "expected a list of item IDs", [...path, "order"]);
  }
  return { direction, order: [...order] };
}

/**
 * The workspace's arrangement as a `set` gives it or a file states it:
 * `null` for none, else `{direction, columns?}`, `direction` `"vertical"`,
 * `"horizontal"` or `"matrix"`, `columns` a positive integer that only a
 * matrix states.
 */
export function readCanvasArrangement(
  value: unknown,
  path: readonly PathSegment[],
): CanvasArrangement | null | Problem {
  if (value === null) return null;
  const object = arrangementObject(value, path, ["direction", "columns"], ["direction"]);
  if (isCommandError(object)) return object;
  const direction = readDirection(object.direction, [...path, "direction"], CANVAS_DIRECTIONS);
  if (isCommandError(direction)) return direction;
  if (!Object.hasOwn(object, "columns")) return { direction };
  const at = [...path, "columns"];
  if (direction !== "matrix") {
    return problem(ErrorCode.invalidValue, "only a matrix has columns", at);
  }
  const columns = readPositiveInteger(object.columns, at);
  return isCommandError(columns) ? columns : { direction, columns };
}

function readPositiveInteger(value: unknown, path: readonly PathSegment[]): number | Problem {
  const read = readPositive(value, path);
  if (isCommandError(read)) return read;
  return Number.isSafeInteger(read)
    ? read
    : problem(ErrorCode.invalidValue, "expected a positive safe integer", path);
}

function readDecimals(value: unknown, path: readonly PathSegment[]): number | Problem {
  const number = value instanceof JsonFloat ? value.value : value;
  return typeof number === "number" &&
    Number.isInteger(number) &&
    number >= 0 &&
    number <= MAX_DECIMALS
    ? number
    : problem(ErrorCode.invalidValue, `expected an integer from 0 to ${MAX_DECIMALS}`, path);
}

const GRANULARITY_READERS = { denominator: readPositiveInteger, decimals: readDecimals };

function readSerialization(value: unknown, path: readonly PathSegment[]): Serialization | Problem {
  return isSerialization(value)
    ? value
    : problem(ErrorCode.invalidValue, 'expected "yaml", "json" or "jcs"', path);
}

const FILE_FORM_READERS = {
  minimal: readBoolean,
  styling: readBoolean,
  serialization: readSerialization,
};

/**
 * Whether `location` is a relative POSIX path, the one form a file's location
 * takes: non-empty, no leading `/`, no scheme or drive such as `file:` or
 * `C:` (a URL is no location), no backslash.
 */
export function isRelativeLocation(location: string): boolean {
  return (
    location !== "" &&
    !location.startsWith("/") &&
    !location.includes("\\") &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(location)
  );
}

/** A manifest file's location (`isRelativeLocation`). */
function readLocation(value: unknown, path: readonly PathSegment[]): string | Problem {
  return typeof value === "string" && isRelativeLocation(value)
    ? value
    : problem(ErrorCode.invalidValue, "expected a relative POSIX path", path);
}

/** A block's manifest file entry: the file form's three members exactly, and `location` where it is stated. */
function readManifestEntry(
  value: unknown,
  path: readonly PathSegment[],
  problems: Problem[],
): ManifestFile | undefined {
  if (!isJsonObject(value) || !Object.hasOwn(value, "location")) {
    // Every member was read by the reader of its type.
    return readExact(value, path, FILE_FORM_READERS, problems) as ManifestFile | undefined;
  }
  const { location, ...form } = value;
  const read = readExact(form, path, FILE_FORM_READERS, problems);
  const at = readLocation(location, [...path, "location"]);
  if (isCommandError(at)) {
    problems.push(at);
    return undefined;
  }
  // Every member was read by the reader of its type.
  return read === undefined ? undefined : ({ ...read, location: at } as ManifestFile);
}

/** A filter's belief states: each once, held in the order of `BELIEF_STATES`. */
function readFilterBeliefs(
  value: unknown,
  path: readonly PathSegment[],
): readonly BeliefState[] | Problem {
  if (!Array.isArray(value)) {
    return problem(ErrorCode.invalidValue, "expected a list of belief states", path);
  }
  const seen = new Set<BeliefState>();
  for (const [index, word] of value.entries()) {
    const state = BELIEF_STATES.find((item) => item === word);
    if (state === undefined) {
      const words = BELIEF_STATES.map((item) => `"${item}"`).join(", ");
      return problem(ErrorCode.invalidValue, `expected a belief state (${words})`, [
        ...path,
        index,
      ]);
    }
    if (seen.has(state)) {
      return problem(ErrorCode.invalidValue, `'${state}' is listed twice`, [...path, index]);
    }
    seen.add(state);
  }
  return BELIEF_STATES.filter((state) => seen.has(state));
}

/** A filter's timelines: `null`, or timeline IDs, each once, held by code point. */
function readFilterTimelines(
  value: unknown,
  path: readonly PathSegment[],
): readonly string[] | null | Problem {
  if (value === null) return null;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return problem(ErrorCode.invalidValue, "expected null or a list of timeline IDs", path);
  }
  const seen = new Set<string>();
  for (const [index, id] of value.entries()) {
    if (seen.has(id)) {
      return problem(ErrorCode.invalidValue, `'${id}' is listed twice`, [...path, index]);
    }
    seen.add(id);
  }
  return [...seen].sort(compareCodePoints);
}

const MATCH_CLAIM_FILTER_READERS = { timelines: readFilterTimelines, beliefs: readFilterBeliefs };

/**
 * Entries by block ID (`WorkspaceSettings.manifests`,
 * `WorkspaceSettings.matchClaimFilters`), every entry read by `readEntry`,
 * which pushes its problems to the list it is given. With `lenient`, a
 * value that is no object reads as none and each entry that does not read
 * is left out, without a problem.
 */
function readByBlock(
  value: unknown,
  path: readonly PathSegment[],
  readEntry: (entry: unknown, path: readonly PathSegment[], problems: Problem[]) => unknown,
  problems: Problem[],
  lenient: boolean,
): { [block: BlockId]: unknown } | undefined {
  const found = lenient ? [] : problems;
  if (!isJsonObject(value)) {
    found.push(problem(ErrorCode.invalidValue, "expected an object", path));
    return lenient ? {} : undefined;
  }
  const result: { [block: BlockId]: unknown } = {};
  let complete = true;
  for (const [block, entry] of Object.entries(value)) {
    const at = [...path, block];
    if (!BLOCK_ID.test(block)) {
      found.push(problem(ErrorCode.invalidBlockId, `invalid block id '${block}'`, at));
      complete = false;
      continue;
    }
    const read = readEntry(entry, at, found);
    if (read === undefined) complete = false;
    else result[block] = read;
  }
  return complete || lenient ? result : undefined;
}

/**
 * Read workspace settings, every member required and none unknown; the
 * problems go to `problems` and the result is `undefined` when there are any.
 * With `lenient`, as a workspace file is read, a `granularity` that does not
 * read as one (missing, or of another shape) is read as `DEFAULT_GRANULARITY`,
 * a `manifests` or `matchClaimFilters` that is missing or no object as none
 * and each of its entries that does not read is left out, without a problem: settings lie outside the
 * journal, so nothing a replay needs is lost. Every other member is read
 * strictly either way.
 */
export function readSettings(
  value: unknown,
  path: readonly PathSegment[],
  problems: Problem[],
  lenient = false,
): WorkspaceSettings | undefined {
  const granularity = (item: unknown, at: readonly PathSegment[]) => {
    if (!lenient) return readExact(item, at, GRANULARITY_READERS, problems);
    return readExact(item, at, GRANULARITY_READERS, []) ?? DEFAULT_GRANULARITY;
  };
  const manifests = (item: unknown, at: readonly PathSegment[]) =>
    readByBlock(item, at, readManifestEntry, problems, lenient);
  const matchClaimFilters = (item: unknown, at: readonly PathSegment[]) =>
    readByBlock(
      item,
      at,
      (entry, place, found) => readExact(entry, place, MATCH_CLAIM_FILTER_READERS, found),
      problems,
      lenient,
    );
  const stated =
    lenient && isJsonObject(value)
      ? {
          granularity: DEFAULT_SETTINGS.granularity,
          manifests: DEFAULT_SETTINGS.manifests,
          matchClaimFilters: DEFAULT_SETTINGS.matchClaimFilters,
          ...value,
        }
      : value;
  const read: unknown = readExact(
    stated,
    path,
    {
      grid: (grid, at) => readExact(grid, at, { size: readPositive, snap: readBoolean }, problems),
      blockDefaults: (defaults, at) => readExact(defaults, at, PLACEMENT_READERS, problems),
      granularity,
      manifests,
      matchClaimFilters,
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
  if (block.arrangement !== undefined) {
    check(readItemArrangement(block.arrangement, [...path, "arrangement"]));
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
