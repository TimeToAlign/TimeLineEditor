/**
 * The pure reducer of the four commands. A command resolves each address to
 * a target, and the target's kind decides what happens: one table of settable
 * properties per kind, one list of what can be added into it, and whether it
 * can be removed. A command is atomic: the first refusal refuses it whole.
 */

import type { Declaration, Graphical, Selector, Statement } from "@timetoalign/timeskeleton";
import { canonicalOrder } from "@timetoalign/timeskeleton";
import type { CommandError, Problem } from "../errors.ts";
import { ErrorCode, isCommandError, isLoadError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import { canonicalText } from "../json.ts";
import { manifestElements, selectorMatches, timelineAncestry } from "../manifest/elements.ts";
import { elementAddress, isRemovable, manifestKind, rootPaths } from "../manifest/files.ts";
import { checkOrdered, childEnd, contentEnd, readOnAxis } from "../manifest/invariants.ts";
import { readManifestValue, schemaProblems } from "../manifest/io.ts";
import type { ChildEntry, Manifest, TimelineManifest } from "../manifest/types.ts";
import { coordinateFromDict, coordinateToDict } from "../number/coordinate.ts";
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

/** A timeline inside a manifest: its value, its path from the manifest's top, its parent. */
interface Located {
  readonly timeline: TimelineManifest;
  readonly path: readonly PathSegment[];
  readonly parent: Located | undefined;
}

/** The root timeline of the tree a located timeline lies in. */
function rootOf(at: Located): TimelineManifest {
  return at.parent === undefined ? at.timeline : rootOf(at.parent);
}

/** The kinds of the elements a timeline holds in a list, and where the list lies. */
const LISTS = {
  map: ["conversion_maps"],
  region: ["regions"],
  break: ["flow_control", "breaks"],
  jump: ["flow_control", "jumps"],
  marker: ["flow_control", "markers"],
} as const;
type EntryKind = keyof typeof LISTS;
const ENTRY_KINDS = Object.keys(LISTS) as EntryKind[];

type TargetKind = "workspace" | "block" | "root" | "child" | EntryKind;

/** An element of a manifest's list: a conversion map, region, break, jump or marker. */
type Entry = { readonly id: string; readonly [member: string]: unknown };

type Target =
  | { readonly kind: "workspace"; readonly address: Address }
  | { readonly kind: "block"; readonly address: Address; readonly block: Block }
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

/** The list of entries of one kind in a timeline. */
function entries(timeline: TimelineManifest, kind: EntryKind): readonly Entry[] {
  const [first, second] = LISTS[kind] as readonly string[];
  const holder = timeline as unknown as Tree;
  return (
    second === undefined ? holder[first as string] : (holder[first as string] as Tree)[second]
  ) as Entry[];
}

/** A timeline with the list of entries of one kind replaced. */
function withEntries(
  timeline: TimelineManifest,
  kind: EntryKind,
  list: readonly Entry[],
): TimelineManifest {
  return setIn(timeline as unknown as Tree, LISTS[kind], list) as unknown as TimelineManifest;
}

/** A timeline found in a manifest, or an entry of one of its lists. */
type Found = { readonly at: Located; readonly kind?: EntryKind; readonly index?: number };

/** Search a tree for the timeline (with `timelines`) or the entry (with `lists`) carrying `id`. */
function search(here: Located, id: string, timelines: boolean, lists: boolean): Found | undefined {
  const { timeline, path } = here;
  if (timelines && timeline.id === id) return { at: here };
  if (lists) {
    for (const kind of ENTRY_KINDS) {
      const index = entries(timeline, kind).findIndex((item) => item.id === id);
      if (index >= 0) return { at: here, kind, index };
    }
  }
  for (const [key, entry] of Object.entries(timeline.children)) {
    const child = {
      timeline: entry.timeline,
      path: [...path, "children", key, "timeline"],
      parent: here,
    };
    const found = search(child, id, timelines, lists);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Find the element an element address names in a manifest: in a timeline
 * file the timeline or entry carrying that id; in a group or bundle file the
 * timeline carrying a bare id, or the entry `<id>` of root `<root>`'s tree
 * for `<root>/<id>`.
 */
function findElement(manifest: Manifest, element: string): Found | undefined {
  const roots = rootPaths(manifest).map(
    (root): Located => ({ timeline: root.timeline, path: root.path, parent: undefined }),
  );
  if (manifestKind(manifest) === "timeline")
    return search(roots[0] as Located, element, true, true);
  const [first = "", id, ...rest] = element.split("/");
  if (rest.length > 0) return undefined;
  if (id === undefined) {
    for (const root of roots) {
      const found = search(root, first, true, false);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const root = roots.find((item) => item.timeline.id === first);
  return root === undefined ? undefined : search(root, id, false, true);
}

function resolve(view: View, address: Address): Target | CommandError {
  const parsed = parseAddress(address);
  if (isCommandError(parsed)) return parsed;
  if (parsed.block === null) return { kind: "workspace", address };
  const block = view.blocks[parsed.block];
  const unknown = problem(ErrorCode.unknownTarget, `${address} names nothing`, [address]);
  if (block === undefined) return unknown;
  if (parsed.element === null) return { kind: "block", address, block };
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
 * Put a child entry under `parent`, growing an unlocked parent to the child's
 * end when the child would end after it and the parent's number type holds
 * that end exactly. Anything else is left for the manifest's invariants.
 */
function placeChild(parent: TimelineManifest, id: string, entry: ChildEntry): TimelineManifest {
  let length = parent.length;
  const offset = readOnAxis(entry.offset, parent, []);
  if (!isCommandError(offset)) {
    entry = { ...entry, offset: coordinateToDict(offset) };
    let childLength: ReturnType<typeof coordinateFromDict> | undefined;
    try {
      childLength = coordinateFromDict(entry.timeline.length);
    } catch {
      childLength = undefined;
    }
    if (childLength !== undefined && !parent.locked) {
      const end = childEnd(offset, childLength);
      if (compareReal(end, realOf(coordinateFromDict(parent.length))) > 0) {
        const grown = exactCoordinate(end, parent.unit, parent.number_type);
        if (grown !== undefined) length = coordinateToDict(grown);
      }
    }
  }
  return { ...parent, length, children: { ...parent.children, [id]: entry } };
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
  manifest: (view, target, value, path) => {
    const manifest = readBlockManifest(value, target.block.id);
    if (isCommandError(manifest)) return manifest;
    if (manifestKind(manifest) !== target.block.blockKind) {
      return problem(
        ErrorCode.blockKindMismatch,
        `a ${target.block.blockKind} block needs a ${target.block.blockKind} manifest`,
        path,
      );
    }
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
  locked: timelineValue(readBoolean),
  length: (view, target, value, path) => {
    const { timeline } = target.at;
    if (timeline.locked) {
      return problem(ErrorCode.locked, `timeline ${timeline.id} is locked`, path);
    }
    const json = toJson(value, path);
    if (isCommandError(json)) return json;
    const length = readOnAxis(json, timeline, path);
    if (isCommandError(length)) return length;
    if (compareReal(realOf(length), contentEnd(timeline)) < 0) {
      return problem(
        ErrorCode.lengthBelowContent,
        "the length cannot be less than the end of the furthest child",
        path,
      );
    }
    return withTimeline(view, target.block, target.at, {
      ...timeline,
      length: coordinateToDict(length),
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
    const id = target.at.path.at(-2) as string;
    const children = { ...parent.timeline.children };
    const entry = children[id] as ChildEntry;
    delete children[id];
    const placed = placeChild({ ...parent.timeline, children }, id, {
      ...entry,
      offset: coordinateToDict(offset),
    });
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

/** An entry member holding a coordinate on its timeline's axis. */
const entryCoordinate: Setter<EntryTarget> = (view, target, value, path) => {
  const json = toJson(value, path);
  if (isCommandError(json)) return json;
  const read = readOnAxis(json, target.at.timeline, path);
  if (isCommandError(read)) return read;
  return withEntry(view, target, {
    ...current(target),
    [path.at(-1) as string]: coordinateToDict(read),
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
    blockKind: manifestKind(manifest) as Block["blockKind"],
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

/** The id an added element carries: a child's `timeline.id`, any other's `id`. */
function carriedId(kind: AddKind, value: JsonObject): unknown {
  if (kind !== "child") return value.id;
  const timeline = value.timeline;
  return typeof timeline === "object" && timeline !== null && !Array.isArray(timeline)
    ? (timeline as JsonObject).id
    : undefined;
}

function addElement(
  view: View,
  target: TimelineTarget,
  kind: "child" | EntryKind,
  value: unknown,
): View | CommandError {
  const object = readObject(value, [target.address, kind]);
  if (isCommandError(object)) return object;
  const id = carriedId(kind, object);
  if (typeof id !== "string") {
    return problem(ErrorCode.invalidValue, `the ${kind} carries no id`, [target.address, kind]);
  }
  const { manifest } = target.block;
  const root = rootOf(target.at).id;
  if (takenIds(manifest, kind === "child", root).has(id)) {
    const qualified = kind === "child" || manifestKind(manifest) === "timeline" ? null : root;
    return problem(ErrorCode.duplicateId, `${id} is already an id of the manifest`, [
      `${target.block.id}/${elementAddress(qualified, id)}`,
    ]);
  }
  const { timeline } = target.at;
  const changed =
    kind === "child"
      ? placeChild(timeline, id, object as unknown as ChildEntry)
      : withEntries(timeline, kind, [...entries(timeline, kind), object as Entry]);
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

function removeTarget(view: View, target: Target): View {
  switch (target.kind) {
    case "block": {
      const removed = new Set([target.block.id]);
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
    case "child": {
      const manifest = setIn(
        target.block.manifest as unknown as Tree,
        target.at.path.slice(0, -1),
        undefined,
      );
      return withBlock(view, { ...target.block, manifest: manifest as unknown as Manifest });
    }
    case "root":
    case "workspace":
      return view;
    default: {
      const { timeline } = target.at;
      const list = entries(timeline, target.kind).filter((_, index) => index !== target.index);
      return withTimeline(view, target.block, target.at, withEntries(timeline, target.kind, list));
    }
  }
}

function applyRemove(
  view: View,
  command: RemoveCommand,
  touched: Set<BlockId>,
): View | CommandError {
  for (const address of command.targets) {
    const target = resolve(view, address);
    if (isCommandError(target)) return target;
    if (target.kind === "workspace") {
      return problem(ErrorCode.notRemovable, `${target.kind} cannot be removed`, [address]);
    }
    if (target.kind === "block") continue;
    const { manifest } = target.block;
    if (!isRemovable(manifest, address.slice(target.block.id.length + 1))) {
      return manifestKind(manifest) === "timeline"
        ? problem(ErrorCode.notRemovable, `${target.kind} cannot be removed`, [address])
        : problem(
            ErrorCode.unsupportedTarget,
            "removing a timeline from a group or bundle file is not supported yet",
            [address],
          );
    }
  }
  let current = view;
  for (const address of command.targets) {
    // A target already removed with its container is gone.
    const target = resolve(current, address);
    if (isCommandError(target)) continue;
    const block = elementBlock(target);
    if (block !== undefined) touched.add(block);
    current = removeTarget(current, target);
  }
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
 * other members, such as a group or bundle file's `order`, are kept.
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

/** Put every edited manifest in canonical order and refuse the first problem it has. */
function settle(view: View, touched: ReadonlySet<BlockId>): View | CommandError {
  let current = view;
  for (const id of touched) {
    const block = current.blocks[id] as Block;
    const manifest = canonicalOrder(block.manifest as never) as unknown as Manifest;
    const [first] = [...schemaProblems(manifest), ...checkOrdered(manifest)];
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
