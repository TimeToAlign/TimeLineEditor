/**
 * The pure reducer of the four commands. A command resolves each address to
 * a target, and the target's kind decides what happens: one table of settable
 * properties per kind, one list of what can be added into it, and whether it
 * can be removed. A command is atomic: the first refusal refuses it whole.
 */

import type { Declaration, Graphical, Selector, Statement } from "@timetoalign/timeskeleton";
import { canonicalOrder, complete, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import type { CommandError, Problem } from "../errors.ts";
import { ErrorCode, isCommandError, isLoadError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import { canonicalText } from "../json.ts";
import {
  manifestElements,
  orderedChildren,
  selectorMatches,
  timelineAncestry,
} from "../manifest/elements.ts";
import type { EntryKind, Located } from "../manifest/files.ts";
import {
  ENTRY_KINDS,
  ENTRY_LISTS,
  elementAddress,
  entriesOf,
  locateEntry,
  locateTimeline,
} from "../manifest/files.ts";
import {
  checkOrdered,
  childEnd,
  childReach,
  contentEnd,
  lengthOf,
  readOnAxis,
} from "../manifest/invariants.ts";
import { readManifestValue, schemaProblems } from "../manifest/io.ts";
import { lockProblem, memberIds, statedLockProblem, withPlaceLocks } from "../manifest/locks.ts";
import type { Gap } from "../manifest/remove.ts";
import { isSegment, removedBy, withoutElements, withoutSegment } from "../manifest/remove.ts";
import type { Manifest, TimelineManifest } from "../manifest/types.ts";
import type { Coordinate } from "../number/coordinate.ts";
import { axisCoordinate, toAxisValue } from "../number/coordinate.ts";
import type { Real } from "../number/real.ts";
import { compareReal, exactCoordinate, realOf } from "../number/real.ts";
import {
  readBoolean,
  readFinite,
  readGraphical,
  readIndex,
  readNullablePositive,
  readNullableString,
  readObject,
  readOrder,
  readPositive,
  readString,
  toJson,
  unknownMember,
} from "../values.ts";
import type { Block, BlockId, BlockPlacement } from "../workspace/blocks.ts";
import { BLOCK_ID } from "../workspace/blocks.ts";
import type { Address } from "../workspace/ids.ts";
import { parseAddress, takenIds, WORKSPACE } from "../workspace/ids.ts";
import { indexBetween } from "../workspace/order.ts";
import type { View, WorkspaceSettings } from "../workspace/view.ts";
import { parseCommand } from "./parse.ts";
import type {
  AddCommand,
  AddKind,
  Command,
  RemoveCommand,
  SetCommand,
  StyleCommand,
} from "./types.ts";
import { ADD_KINDS } from "./types.ts";

// ---------------------------------------------------------------- targets

/** The root timeline of the tree a located timeline lies in. */
function rootOf(at: Located): TimelineManifest {
  return at.parent === undefined ? at.timeline : rootOf(at.parent);
}

type TargetKind = "workspace" | "block" | "group" | "root" | "child" | EntryKind;

/** An element of a manifest's list: a conversion map, region, break, jump or marker. */
type Entry = { readonly id: string; readonly [member: string]: unknown };

type Target =
  | { readonly kind: "workspace"; readonly address: Address }
  | { readonly kind: "block"; readonly address: Address; readonly block: Block }
  | { readonly kind: "group"; readonly address: Address; readonly block: Block }
  | {
      readonly kind: "root" | "child";
      readonly address: Address;
      readonly block: Block;
      readonly at: Located;
    }
  | {
      readonly kind: EntryKind;
      readonly address: Address;
      readonly block: Block;
      /** The timeline holding the entry. */
      readonly at: Located;
      readonly index: number;
    };

/** The list of entries of one kind in a timeline, as the setters read them. */
function entries(timeline: TimelineManifest, kind: EntryKind): readonly Entry[] {
  return entriesOf(timeline, kind) as unknown as readonly Entry[];
}

/** A timeline with the list of entries of one kind replaced. */
function withEntries(
  timeline: TimelineManifest,
  kind: EntryKind,
  list: readonly Entry[],
): TimelineManifest {
  return setIn(timeline as unknown as Tree, ENTRY_LISTS[kind], list) as unknown as TimelineManifest;
}

/**
 * Find the element an element address names in a manifest: the timeline
 * carrying a bare id, or the entry `<id>` of root `<root>`'s tree for
 * `<root>/<id>`. A group is found by `resolve`.
 */
function findElement(
  manifest: Manifest,
  element: string,
): { readonly at: Located; readonly kind?: EntryKind; readonly index?: number } | undefined {
  if (!element.includes("/")) {
    const at = locateTimeline(manifest, element);
    return at === undefined ? undefined : { at };
  }
  return locateEntry(manifest, element);
}

function resolve(view: View, address: Address): Target | CommandError {
  const parsed = parseAddress(address);
  if (isCommandError(parsed)) return parsed;
  if (parsed.block === null) return { kind: "workspace", address };
  const block = view.blocks[parsed.block];
  const unknown = problem(ErrorCode.unknownTarget, `${address} names nothing`, [address]);
  if (block === undefined) return unknown;
  if (parsed.element === null) return { kind: "block", address, block };
  if (block.manifest.groups.some((group) => group.id === parsed.element)) {
    return { kind: "group", address, block };
  }
  const found = findElement(block.manifest, parsed.element);
  if (found === undefined) return unknown;
  if (found.kind !== undefined) {
    return { kind: found.kind, address, block, at: found.at, index: found.index as number };
  }
  return { kind: found.at.parent === undefined ? "root" : "child", address, block, at: found.at };
}

// ---------------------------------------------------------------- tree edits

type Tree = { readonly [key: string]: unknown };

/**
 * `root` with the value at `path` replaced, or, in an object, removed when
 * `value` is `undefined`.
 */
function setIn(root: Tree, path: readonly PathSegment[], value: unknown): Tree {
  const [key, ...rest] = path as [PathSegment, ...PathSegment[]];
  const next = rest.length === 0 ? value : setIn((root as Tree)[key] as Tree, rest, value);
  if (Array.isArray(root)) {
    return root.map((item, index) => (index === key ? next : item)) as unknown as Tree;
  }
  const entries = Object.entries(root).flatMap(([name, item]): [string, unknown][] =>
    name !== key ? [[name, item]] : next === undefined ? [] : [[name, next]],
  );
  if (next !== undefined && !Object.hasOwn(root, key)) entries.push([String(key), next]);
  return Object.fromEntries(entries);
}

function withBlock(view: View, block: Block): View {
  return { ...view, blocks: { ...view.blocks, [block.id]: block } };
}

function withTimeline(view: View, block: Block, at: Located, timeline: TimelineManifest): View {
  const manifest = setIn(block.manifest as unknown as Tree, at.path, timeline);
  return withBlock(view, { ...block, manifest: manifest as unknown as Manifest });
}

/**
 * A timeline given to `add` under `parent`, its defaults supplied as for a
 * manifest's root, then each timeline of its subtree given the lock its
 * place decides (`withPlaceLocks`; a new timeline is no group member yet);
 * the value as given when it is too malformed to complete, for the checks to
 * refuse.
 */
function completeTimeline(value: JsonObject, parent: TimelineManifest): TimelineManifest {
  let timeline: TimelineManifest;
  try {
    const host = { timeskeleton: SCHEMA_VERSION, timelines: [value] };
    timeline = (complete(host as never) as unknown as Manifest).timelines[0] as TimelineManifest;
  } catch {
    return value as unknown as TimelineManifest;
  }
  return withPlaceLocks(timeline, parent, new Set());
}

/** The refusal of a child reaching past its parent's known length. */
function exceedsParent(
  child: TimelineManifest,
  parent: TimelineManifest,
  path: readonly PathSegment[],
): CommandError {
  return problem(
    ErrorCode.childExceedsParent,
    child.length === null
      ? `child ${child.id} starts after its parent ${parent.id} ends`
      : `child ${child.id} ends after its parent ${parent.id}`,
    path,
  );
}

/**
 * Why the timeline at `at` cannot take `length`, if it cannot. A length
 * change never pushes a parent: the new end stays within the parent's known
 * length. Segments fix ends, which keeps a segment within its line too: a
 * segment ends where its successor starts, and the last one where its line
 * ends while the line's length is known; a segment line ends where its last
 * segment ends while that segment's length is known. A length of null is always taken: it bounds nothing, and a
 * segment or line of unknown length ends where its neighbours say.
 */
function lengthProblem(
  at: Located,
  length: Coordinate | null,
  path: readonly PathSegment[],
): CommandError | undefined {
  if (length === null) return undefined;
  const { timeline } = at;
  const parent = at.parent?.timeline;
  if (parent !== undefined) {
    const end = childEnd(axisCoordinate(timeline.offset, parent), length);
    const parentLength = lengthOf(parent);
    if (!parent.is_segment_line) {
      if (parentLength !== null && compareReal(end, realOf(parentLength)) > 0) {
        return exceedsParent({ ...timeline, length: toAxisValue(length) }, parent, path);
      }
    } else {
      const segments = orderedChildren(parent);
      const successor = segments[segments.findIndex((segment) => segment.id === timeline.id) + 1];
      const fixed =
        successor === undefined ? parentLength : axisCoordinate(successor.offset, parent);
      if (fixed !== null && compareReal(end, realOf(fixed)) !== 0) {
        const where =
          successor === undefined
            ? `its segment line ${parent.id} ends`
            : `segment ${successor.id} starts`;
        return problem(
          ErrorCode.segmentEndFixed,
          `segment ${timeline.id} ends where ${where}`,
          path,
        );
      }
    }
  }
  const last = timeline.is_segment_line ? orderedChildren(timeline).at(-1) : undefined;
  const lastLength = last === undefined ? null : lengthOf(last);
  if (last !== undefined && lastLength !== null) {
    const lastEnd = childEnd(axisCoordinate(last.offset, timeline), lastLength);
    if (compareReal(realOf(length), lastEnd) !== 0) {
      return problem(
        ErrorCode.segmentEndFixed,
        `segment line ${timeline.id} ends where its last segment ${last.id} ends`,
        path,
      );
    }
  }
  return undefined;
}

/**
 * Put `child` under the timeline at `at` with its offset normalized. A child
 * reaching past that timeline's known end (its end, or its offset when its
 * length is not known) grows the timeline to that point when it is unlocked
 * and its number type holds the point exactly, and is refused otherwise
 * (`child_exceeds_parent` at `path`). Only that timeline grows: its new
 * length must be one it may take (`lengthProblem`). A timeline of unknown
 * length stays unknown. A malformed child is left for the schema to refuse.
 */
function placeChild(
  at: Located,
  child: TimelineManifest,
  path: readonly PathSegment[],
): TimelineManifest | CommandError {
  const parent = at.timeline;
  const offset = readOnAxis(child.offset, parent, []);
  if (isCommandError(offset)) return { ...parent, children: [...parent.children, child] };
  child = { ...child, offset: toAxisValue(offset) };
  const placed = { ...parent, children: [...parent.children, child] };
  let reach: Real;
  try {
    reach = childReach(offset, child);
  } catch {
    return placed;
  }
  const known = lengthOf(parent);
  if (known === null || compareReal(reach, realOf(known)) <= 0) return placed;
  const grown = parent.locked ? undefined : exactCoordinate(reach, parent.unit, parent.number_type);
  if (grown === undefined) return exceedsParent(child, parent, path);
  const refused = lengthProblem({ ...at, timeline: placed }, grown, path);
  return refused ?? { ...placed, length: toAxisValue(grown) };
}

// ---------------------------------------------------------------- set

type Setter<T extends Target> = (
  view: View,
  target: T,
  value: unknown,
  path: readonly PathSegment[],
) => View | CommandError;

type WorkspaceTarget = Extract<Target, { kind: "workspace" }>;
type BlockTarget = Extract<Target, { kind: "block" }>;
type TimelineTarget = Extract<Target, { kind: "root" | "child" }>;

function withSettings(view: View, settings: Partial<WorkspaceSettings>): View {
  return { ...view, settings: { ...view.settings, ...settings } };
}

/** Read the members given of an object whose members each have a reader. */
function readMembers(
  value: unknown,
  path: readonly PathSegment[],
  readers: { readonly [member: string]: (item: unknown, at: PathSegment[]) => unknown },
): JsonObject | CommandError {
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const extra = unknownMember(object, Object.keys(readers), path, ErrorCode.unknownProperty);
  if (extra !== undefined) return extra;
  const read: [string, unknown][] = [];
  for (const [member, item] of Object.entries(object)) {
    const result = (readers[member] as (item: unknown, at: PathSegment[]) => unknown)(item, [
      ...path,
      member,
    ]);
    if (isCommandError(result)) return result;
    read.push([member, result]);
  }
  return Object.fromEntries(read) as JsonObject;
}

const PLACEMENT_READERS = {
  scale: readPositive,
  length: readPositive,
  spacing: readPositive,
  width: readNullablePositive,
  height: readNullablePositive,
  order: readOrder,
} as const;

const WORKSPACE_SET: { readonly [property: string]: Setter<WorkspaceTarget> } = {
  grid: (view, _, value, path) => {
    const grid = readMembers(value, path, { size: readPositive, snap: readBoolean });
    if (isCommandError(grid)) return grid;
    return withSettings(view, { grid: { ...view.settings.grid, ...grid } });
  },
  blockDefaults: (view, _, value, path) => {
    const defaults = readMembers(value, path, PLACEMENT_READERS);
    if (isCommandError(defaults)) return defaults;
    return withSettings(view, {
      blockDefaults: { ...view.settings.blockDefaults, ...defaults } as BlockPlacement,
    });
  },
  graphical: (view, _, value, path) => {
    const graphical = readGraphical(value, path);
    if (isCommandError(graphical)) return graphical;
    return withSettings(view, { graphical: graphical as Graphical });
  },
};

/** A block property read by `read` and stored as read. */
function blockValue(
  read: (value: unknown, path: readonly PathSegment[]) => unknown,
): Setter<BlockTarget> {
  return (view, target, value, path) => {
    const property = path.at(-1) as keyof Block;
    const result = read(value, path);
    if (isCommandError(result)) return result;
    return withBlock(view, { ...target.block, [property]: result });
  };
}

/** A whole manifest for block `id`, its problems located below `[id, "manifest"]`. */
function readBlockManifest(value: unknown, id: BlockId): Manifest | CommandError {
  const path = [id, "manifest"];
  const json = toJson(value, path);
  if (isCommandError(json)) return json;
  const manifest = readManifestValue(json);
  if (isLoadError(manifest)) {
    const [first] = manifest.problems as [Problem];
    return { ...first, path: [...path, ...first.path] };
  }
  return manifest;
}

const BLOCK_SET: { readonly [property: string]: Setter<BlockTarget> } = {
  x: blockValue(readFinite),
  y: blockValue(readFinite),
  index: (view, target, value, path) => {
    const index = readIndex(value, path);
    if (isCommandError(index)) return index;
    const sibling = Object.values(view.blocks).find(
      (item) =>
        item.id !== target.block.id && item.parent === target.block.parent && item.index === index,
    );
    if (sibling !== undefined) {
      return problem(ErrorCode.duplicateIndex, `block ${sibling.id} already has that index`, path);
    }
    return withBlock(view, { ...target.block, index });
  },
  ...Object.fromEntries(
    Object.entries(PLACEMENT_READERS).map(([name, read]) => [name, blockValue(read)]),
  ),
  manifest: (view, target, value) => {
    const manifest = readBlockManifest(value, target.block.id);
    if (isCommandError(manifest)) return manifest;
    return withBlock(view, { ...target.block, manifest });
  },
};

/** A timeline member read by `read` and stored as read. */
function timelineValue(
  read: (value: unknown, path: readonly PathSegment[]) => unknown,
): Setter<TimelineTarget> {
  return (view, target, value, path) => {
    const member = path.at(-1) as string;
    const result = read(value, path);
    if (isCommandError(result)) return result;
    return withTimeline(view, target.block, target.at, { ...target.at.timeline, [member]: result });
  };
}

const TIMELINE_SET: { readonly [property: string]: Setter<TimelineTarget> } = {
  name: timelineValue(readNullableString),
  meta: timelineValue(readObject),
  locked: (view, target, value, path) => {
    const locked = readBoolean(value, path);
    if (isCommandError(locked)) return locked;
    const { timeline, parent } = target.at;
    const member = memberIds(target.block.manifest).has(timeline.id);
    const refused = lockProblem(locked, timeline.locked, timeline, parent?.timeline, member, path);
    if (refused !== undefined) return refused;
    return withTimeline(view, target.block, target.at, { ...timeline, locked });
  },
  length: (view, target, value, path) => {
    const { timeline } = target.at;
    if (timeline.locked) {
      return problem(ErrorCode.locked, `timeline ${timeline.id} is locked`, path);
    }
    // A length of null means the length is not known; it bounds nothing.
    if (value === null)
      return withTimeline(view, target.block, target.at, { ...timeline, length: null });
    const json = toJson(value, path);
    if (isCommandError(json)) return json;
    const length = readOnAxis(json, timeline, path);
    if (isCommandError(length)) return length;
    if (compareReal(realOf(length), contentEnd(timeline)) < 0) {
      return problem(
        ErrorCode.lengthBelowContent,
        "the length cannot be less than the farthest point a child reaches",
        path,
      );
    }
    const refused = lengthProblem(target.at, length, path);
    if (refused !== undefined) return refused;
    return withTimeline(view, target.block, target.at, {
      ...timeline,
      length: toAxisValue(length),
    });
  },
};

const CHILD_SET: { readonly [property: string]: Setter<TimelineTarget> } = {
  ...TIMELINE_SET,
  offset: (view, target, value, path) => {
    const parent = target.at.parent as Located;
    const json = toJson(value, path);
    if (isCommandError(json)) return json;
    const offset = readOnAxis(json, parent.timeline, path);
    if (isCommandError(offset)) return offset;
    const index = target.at.path.at(-1) as number;
    const children = parent.timeline.children.filter((_, item) => item !== index);
    const placed = placeChild(
      { ...parent, timeline: { ...parent.timeline, children } },
      { ...target.at.timeline, offset: toAxisValue(offset) },
      path,
    );
    if (isCommandError(placed)) return placed;
    return withTimeline(view, target.block, parent, placed);
  },
};

type EntryTarget = Extract<Target, { kind: EntryKind }>;

/** The view with the target entry replaced by `entry`. */
function withEntry(view: View, target: EntryTarget, entry: Entry): View {
  const { timeline } = target.at;
  const list = entries(timeline, target.kind).map((item, index) =>
    index === target.index ? entry : item,
  );
  return withTimeline(view, target.block, target.at, withEntries(timeline, target.kind, list));
}

function current(target: EntryTarget): Entry {
  return entries(target.at.timeline, target.kind)[target.index] as Entry;
}

/** An entry member read by `read` and stored as read. */
function entryValue(
  read: (value: unknown, path: readonly PathSegment[]) => unknown,
): Setter<EntryTarget> {
  return (view, target, value, path) => {
    const result = read(value, path);
    if (isCommandError(result)) return result;
    return withEntry(view, target, { ...current(target), [path.at(-1) as string]: result });
  };
}

/** An entry member holding a bare value on its timeline's axis. */
const entryCoordinate: Setter<EntryTarget> = (view, target, value, path) => {
  const json = toJson(value, path);
  if (isCommandError(json)) return json;
  const read = readOnAxis(json, target.at.timeline, path);
  if (isCommandError(read)) return read;
  return withEntry(view, target, {
    ...current(target),
    [path.at(-1) as string]: toAxisValue(read),
  });
};

/** A JSON value checked by the schema with the manifest it is set in. */
const readJson = (value: unknown, path: readonly PathSegment[]) => toJson(value, path);

const FLOW_SET = {
  control_type: entryValue(readString),
  condition: entryValue(readString),
  repeat_count: entryValue(readJson),
  label: entryValue(readNullableString),
  meta: entryValue(readObject),
};

const ENTRY_SET: {
  readonly [kind in EntryKind]: { readonly [property: string]: Setter<EntryTarget> };
} = {
  map: {
    map: (view, target, value, path) => {
      const map = readObject(value, path);
      if (isCommandError(map)) return map;
      if (map.id !== current(target).id) {
        return problem(ErrorCode.idNotSettable, "a conversion map keeps its id", [...path, "id"]);
      }
      return withEntry(view, target, map as Entry);
    },
  },
  region: {
    name: entryValue(readNullableString),
    start: entryCoordinate,
    end: entryCoordinate,
    meta: entryValue(readObject),
  },
  break: { ...FLOW_SET, name: entryValue(readNullableString), coordinate: entryCoordinate },
  jump: {
    ...FLOW_SET,
    from_coordinate: entryCoordinate,
    to_coordinate: entryCoordinate,
    target: entryValue(readNullableString),
  },
  marker: { name: entryValue(readNullableString), coordinate: entryCoordinate },
};

const SETTABLE: { readonly [kind in TargetKind]: { readonly [property: string]: Setter<never> } } =
  {
    workspace: WORKSPACE_SET,
    block: BLOCK_SET,
    group: {},
    root: TIMELINE_SET,
    child: CHILD_SET,
    ...ENTRY_SET,
  };

function setProperty(
  view: View,
  address: Address,
  property: string,
  value: unknown,
): View | CommandError {
  const target = resolve(view, address);
  if (isCommandError(target)) return target;
  const path = [address, property];
  if (property === "id") return problem(ErrorCode.idNotSettable, "ids are never settable", path);
  const setter = SETTABLE[target.kind][property] as Setter<Target> | undefined;
  if (setter !== undefined) return setter(view, target, value, path);
  const kinds = (Object.keys(SETTABLE) as TargetKind[]).filter((kind) =>
    Object.hasOwn(SETTABLE[kind], property),
  );
  return kinds.length > 0
    ? problem(
        ErrorCode.wrongTargetKind,
        `${property} is a property of ${kinds.join(", ")}, not of ${target.kind}`,
        path,
      )
    : problem(ErrorCode.unknownProperty, `${target.kind} has no property ${property}`, path);
}

/** The block a target lies in, when the target is an element of its manifest. */
function elementBlock(target: Target): BlockId | undefined {
  return target.kind === "workspace" || target.kind === "block" ? undefined : target.block.id;
}

function applySet(view: View, command: SetCommand, touched: Set<BlockId>): View | CommandError {
  let current = view;
  for (const change of command.changes) {
    const target = resolve(current, change.target);
    if (isCommandError(target)) return target;
    const block = elementBlock(target);
    if (block !== undefined) touched.add(block);
    for (const [property, value] of Object.entries(change.values)) {
      const next = setProperty(current, change.target, property, value);
      if (isCommandError(next)) return next;
      current = next;
    }
  }
  return current;
}

// ---------------------------------------------------------------- add

const INTO_TIMELINE: readonly AddKind[] = ["child", ...ENTRY_KINDS];

const ADDABLE: { readonly [kind in TargetKind]: readonly AddKind[] } = {
  workspace: ["block"],
  block: [],
  group: [],
  root: INTO_TIMELINE,
  child: INTO_TIMELINE,
  map: [],
  region: [],
  break: [],
  jump: [],
  marker: [],
};

const BLOCK_VALUE = ["id", "manifest", "x", "y", "index", ...Object.keys(PLACEMENT_READERS)];

function addBlock(view: View, value: unknown): View | CommandError {
  const object = readObject(value, [WORKSPACE, "block"]);
  if (isCommandError(object)) return object;
  const { id } = object;
  if (typeof id !== "string" || !BLOCK_ID.test(id)) {
    return problem(ErrorCode.invalidBlockId, "a block id is ten characters of base 36", [
      WORKSPACE,
      "block",
      "id",
    ]);
  }
  if (view.blocks[id] !== undefined) {
    return problem(ErrorCode.duplicateId, `block ${id} already exists`, [id]);
  }
  const extra = unknownMember(object, BLOCK_VALUE, [id], ErrorCode.unknownProperty);
  if (extra !== undefined) return extra;
  for (const member of ["manifest", "x", "y"]) {
    if (!Object.hasOwn(object, member)) {
      return problem(ErrorCode.invalidValue, `a new block needs ${member}`, [id, member]);
    }
  }
  const manifest = readBlockManifest(object.manifest, id);
  if (isCommandError(manifest)) return manifest;
  const greatest = Object.values(view.blocks)
    .filter((block) => block.parent === null)
    .reduce<string | null>(
      (found, block) => (found === null || found < block.index ? block.index : found),
      null,
    );
  const block: Block = {
    id,
    parent: null,
    index: indexBetween(greatest, null),
    x: 0,
    y: 0,
    ...view.settings.blockDefaults,
    manifest,
  };
  let current = withBlock(view, block);
  for (const [member, item] of Object.entries(object)) {
    if (member === "id" || member === "manifest") continue;
    const next = setProperty(current, id, member, item);
    if (isCommandError(next)) return next;
    current = next;
  }
  return current;
}

function addElement(
  view: View,
  target: TimelineTarget,
  kind: "child" | EntryKind,
  value: unknown,
): View | CommandError {
  const object = readObject(value, [target.address, kind]);
  if (isCommandError(object)) return object;
  const id = object.id;
  if (typeof id !== "string") {
    return problem(ErrorCode.invalidValue, `the ${kind} carries no id`, [target.address, kind]);
  }
  const { manifest } = target.block;
  const root = rootOf(target.at).id;
  if (takenIds(manifest, kind === "child", root).has(id)) {
    const address = kind === "child" ? id : elementAddress(root, id);
    return problem(ErrorCode.duplicateId, `${id} is already an id of the manifest`, [
      `${target.block.id}/${address}`,
    ]);
  }
  const { timeline } = target.at;
  const path = [target.address, kind];
  if (kind === "child") {
    const refused = statedLockProblem(object, timeline, path);
    if (refused !== undefined) return refused;
  }
  const changed =
    kind === "child"
      ? placeChild(target.at, completeTimeline(object, timeline), path)
      : withEntries(timeline, kind, [...entries(timeline, kind), object as Entry]);
  if (isCommandError(changed)) return changed;
  return withTimeline(view, target.block, target.at, changed);
}

function applyAdd(view: View, command: AddCommand, touched: Set<BlockId>): View | CommandError {
  const kind = ADD_KINDS.find((item) => Object.hasOwn(command, item)) as AddKind;
  const target = resolve(view, command.into);
  if (isCommandError(target)) return target;
  if (!ADDABLE[target.kind].includes(kind)) {
    return problem(ErrorCode.wrongTargetKind, `nothing of kind ${kind} goes into ${target.kind}`, [
      command.into,
      kind,
    ]);
  }
  if (target.kind === "workspace") return addBlock(view, command.block);
  touched.add((target as TimelineTarget).block.id);
  return addElement(view, target as TimelineTarget, kind as "child" | EntryKind, command[kind]);
}

// ---------------------------------------------------------------- remove

/** The view without the blocks `removed` and every block whose `parent` chain reaches one. */
function withoutBlocks(view: View, removed: Set<BlockId>): View {
  let grown = true;
  while (grown) {
    grown = false;
    for (const block of Object.values(view.blocks)) {
      if (!removed.has(block.id) && block.parent !== null && removed.has(block.parent)) {
        removed.add(block.id);
        grown = true;
      }
    }
  }
  return {
    ...view,
    blocks: Object.fromEntries(Object.entries(view.blocks).filter(([id]) => !removed.has(id))),
  };
}

/**
 * Remove the one segment a `remove` with a `gap` names, closing its gap as
 * the gap says. Deleting a segment is not enabled in the editor yet; this
 * command is kept for when it is.
 */
function removeSegment(
  view: View,
  command: RemoveCommand & { readonly gap: Gap },
  touched: Set<BlockId>,
): View | CommandError {
  const [address] = command.targets as [Address];
  const target = resolve(view, address);
  if (isCommandError(target)) return target;
  const path = [address, "gap"];
  if (target.kind !== "child" || !isSegment(target.block.manifest, target.at.timeline.id)) {
    return problem(ErrorCode.wrongTargetKind, "only a segment has a gap to close", path);
  }
  const { id } = target.at.timeline;
  const manifest = withoutSegment(target.block.manifest, id, command.gap);
  if (typeof manifest === "string") {
    return problem(
      ErrorCode.gapNotPermitted,
      `segment ${id} cannot be removed closing its gap that way: ${manifest}`,
      path,
    );
  }
  touched.add(target.block.id);
  return withBlock(view, { ...target.block, manifest });
}

/**
 * Remove blocks and elements. Every element of a block's manifest can be
 * removed, timelines and groups included; what goes with each is
 * `withoutElements`'s. Every target is resolved before anything is removed,
 * so a target that goes with another is not refused. A segment leaves a gap
 * in its segment line, so removing one names how to close it (`gap`), unless
 * it goes with its block or with another target.
 */
function applyRemove(
  view: View,
  command: RemoveCommand,
  touched: Set<BlockId>,
): View | CommandError {
  // Deleting a segment is not enabled in the editor yet; the gap of a
  // segment's removal is kept for when it is.
  if (command.gap !== undefined) {
    return removeSegment(view, command as RemoveCommand & { readonly gap: Gap }, touched);
  }
  const blocks = new Set<BlockId>();
  const elements = new Map<BlockId, string[]>();
  for (const address of command.targets) {
    const target = resolve(view, address);
    if (isCommandError(target)) return target;
    if (target.kind === "workspace") {
      return problem(ErrorCode.notRemovable, `${target.kind} cannot be removed`, [address]);
    }
    if (target.kind === "block") {
      blocks.add(target.block.id);
      continue;
    }
    const list = elements.get(target.block.id) ?? [];
    list.push(address.slice(target.block.id.length + 1));
    elements.set(target.block.id, list);
  }
  for (const [id, list] of elements) {
    if (blocks.has(id)) continue;
    const { manifest } = view.blocks[id] as Block;
    for (const [index, element] of list.entries()) {
      if (!isSegment(manifest, element)) continue;
      const others = list.filter((_, other) => other !== index);
      if (removedBy(manifest, others).has(element)) continue;
      // Kept, with the gap, for when deleting a segment is enabled.
      return problem(
        ErrorCode.gapRequired,
        `removing segment ${element} leaves a gap: name how to close it with gap {side, verb}`,
        [`${id}/${element}`],
      );
    }
  }
  let current = view;
  for (const [id, list] of elements) {
    const block = current.blocks[id] as Block;
    touched.add(id);
    current = withBlock(current, { ...block, manifest: withoutElements(block.manifest, list) });
  }
  current = withoutBlocks(current, blocks);
  for (const id of touched) if (current.blocks[id] === undefined) touched.delete(id);
  return current;
}

// ---------------------------------------------------------------- style

type Properties = { readonly [property: string]: unknown };

function merged(base: Properties, set: Properties): Properties {
  const result: { [property: string]: unknown } = { ...base };
  for (const [property, value] of Object.entries(set)) {
    if (value === null) delete result[property];
    else result[property] = value;
  }
  return result;
}

const isEmpty = (value: Properties): boolean => Object.keys(value).length === 0;

/**
 * A `graphical` block with the statement embedded (see `StyleCommand`); its
 * other members, such as the groups' display `order`, are kept.
 */
export function embedStatement<T extends Graphical>(
  graphical: T | undefined,
  select: Selector,
  set: Properties,
  name?: string,
): T {
  const styles: { [name: string]: Declaration } = { ...(graphical?.styles ?? {}) };
  let statements: Statement[] = [...(graphical?.statements ?? [])];
  const key = canonicalText(select);
  const index = statements.findIndex((statement) => canonicalText(statement.select) === key);
  const existing = statements[index];
  const place = (statement: Statement) => {
    if (index >= 0) statements[index] = statement;
    else statements.push(statement);
  };
  if (name !== undefined) {
    const style = merged((styles[name] ?? {}) as Properties, set);
    if (isEmpty(style)) {
      delete styles[name];
      statements = statements.filter((statement) => statement.set !== name);
    } else {
      styles[name] = style as Declaration;
      place({ select: existing?.select ?? select, set: name });
    }
    return { ...graphical, styles, statements } as T;
  }
  const base =
    existing === undefined
      ? {}
      : typeof existing.set === "string"
        ? (styles[existing.set] ?? {})
        : existing.set;
  const declaration = merged(base as Properties, set);
  if (!isEmpty(declaration)) place({ select: existing?.select ?? select, set: declaration });
  else if (index >= 0) statements.splice(index, 1);
  return { ...graphical, styles, statements } as T;
}

function applyStyle(view: View, command: StyleCommand, touched: Set<BlockId>): View | CommandError {
  let blocks: Block[];
  if (command.blocks !== undefined) {
    blocks = [];
    for (const id of command.blocks) {
      const block = view.blocks[id];
      if (block === undefined) {
        return problem(ErrorCode.unknownTarget, `block ${id} does not exist`, [id]);
      }
      blocks.push(block);
    }
  } else {
    blocks = Object.values(view.blocks).filter((block) => {
      const ancestry = timelineAncestry(block.manifest);
      return manifestElements(block.manifest).some((key) =>
        selectorMatches(command.select, key, ancestry),
      );
    });
  }
  let current = view;
  for (const block of blocks) {
    const graphical = embedStatement<Graphical>(
      block.manifest.graphical,
      command.select,
      command.set,
      command.name,
    );
    touched.add(block.id);
    const manifest = { ...block.manifest, graphical } as Manifest;
    current = withBlock(current, { ...block, manifest });
  }
  return current;
}

// ---------------------------------------------------------------- apply

/**
 * Put every edited manifest in its complete form and canonical order (an
 * added element may leave out what has a default) and refuse the first
 * problem it has.
 */
function settle(view: View, touched: ReadonlySet<BlockId>): View | CommandError {
  let current = view;
  for (const id of touched) {
    const block = current.blocks[id] as Block;
    const full = complete(block.manifest as never) as unknown as Manifest;
    let manifest = full;
    try {
      manifest = canonicalOrder(full);
    } catch {
      // A value the schema refuses cannot be ordered; the schema check reports it.
    }
    // The invariants read a manifest the schema accepts, so they run only then.
    const schema = schemaProblems(manifest);
    const [first] = schema.length > 0 ? schema : checkOrdered(manifest);
    if (first !== undefined) return { ...first, path: [id, "manifest", ...first.path] };
    current = withBlock(current, { ...block, manifest });
  }
  return current;
}

/** Apply one command to a view: the new view, or why the command was refused. */
export function apply(view: View, command: unknown): View | CommandError {
  const parsed = parseCommand(command);
  if (isCommandError(parsed)) return parsed;
  return applyParsed(view, parsed);
}

/** Apply a command `parseCommand` accepted. */
export function applyParsed(view: View, command: Command): View | CommandError {
  const touched = new Set<BlockId>();
  let result: View | CommandError;
  switch (command.type) {
    case "add":
      result = applyAdd(view, command, touched);
      break;
    case "set":
      result = applySet(view, command, touched);
      break;
    case "remove":
      result = applyRemove(view, command, touched);
      break;
    case "style":
      result = applyStyle(view, command, touched);
      break;
  }
  return isCommandError(result) ? result : settle(result, touched);
}
