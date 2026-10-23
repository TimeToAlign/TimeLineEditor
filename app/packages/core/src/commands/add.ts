/**
 * `add`: what each kind of target takes (`ADDABLE`) and how each thing is
 * put in. A block goes into the workspace; a root timeline, a group or a
 * measure map into a block's manifest; a child, map, region or flow-control
 * element into a timeline. The value carries its ID: a block's taken by no
 * block of the workspace, any other's by no element of the manifest.
 * Whatever has a default may be left out, `settle` writing it out. A
 * problem of the value lies at `[<address key of into>, <kind>, …]`, one of
 * the manifest the command would leave at `[<block id>, "manifest", …]`.
 */

import { SCHEMA_VERSION } from "@timetoalign/timetoshare";
import type { CommandError, LoadError, Problem } from "../errors.ts";
import { ErrorCode, isCommandError, isLoadError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import { addressKey, idAddress } from "../manifest/address.ts";
import type { EntryKind } from "../manifest/files.ts";
import { ENTRY_KINDS, entriesOf } from "../manifest/files.ts";
import { readOnAxis } from "../manifest/invariants.ts";
import {
  completed,
  normalizeManifest,
  readEntry,
  readMeasureMap,
  schemaChecked,
} from "../manifest/io.ts";
import { statedLockProblem, withPlaceLocks } from "../manifest/locks.ts";
import type { Group, MeasureMap, TimelineManifest } from "../manifest/types.ts";
import { readObject, readPlaces, unknownMember } from "../values.ts";
import { idPath, inBlock, manifestIds, WORKSPACE } from "../workspace/address.ts";
import type { Block } from "../workspace/blocks.ts";
import { BLOCK_ID } from "../workspace/blocks.ts";
import { indexBetween } from "../workspace/order.ts";
import type { View } from "../workspace/view.ts";
import { placeProblems } from "../workspace/view.ts";
import type { ChangeSet } from "./mutations.ts";
import { emptyChanges, record, withBlock, withEntryAdded, withTimeline } from "./mutations.ts";
import { BLOCK_PROPERTIES, readBlockManifest, setProperty } from "./set.ts";
import { withSegmentLinesCovered } from "./settle.ts";
import type { BlockTarget, TargetKind, TimelineTarget } from "./targets.ts";
import { targetOf } from "./targets.ts";
import { placeChild } from "./topology.ts";
import type { AddCommand, AddKind } from "./types.ts";
import { ADD_KINDS } from "./types.ts";

const INTO_TIMELINE: readonly AddKind[] = ["child", ...ENTRY_KINDS];

/** What `add` puts into each kind of target. */
export const ADDABLE: { readonly [kind in TargetKind]: readonly AddKind[] } = {
  workspace: ["block"],
  block: ["timeline", "group", "measure_map"],
  group: [],
  measure_map: [],
  root: INTO_TIMELINE,
  child: INTO_TIMELINE,
  map: [],
  region: [],
  flow_control: [],
};

const BLOCK_VALUE = ["id", "manifest", "places", ...BLOCK_PROPERTIES];

function addBlock(view: View, value: unknown, changes: ChangeSet): View | CommandError {
  const path = [addressKey(WORKSPACE), "block"];
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const { id } = object;
  if (typeof id !== "string" || !BLOCK_ID.test(id)) {
    return problem(ErrorCode.invalidBlockId, "a block id is ten characters of base 36", [
      ...path,
      "id",
    ]);
  }
  if (view.blocks[id] !== undefined) {
    return problem(ErrorCode.duplicateId, `block '${id}' already exists`, [...path, "id"]);
  }
  const extra = unknownMember(object, BLOCK_VALUE, path, ErrorCode.unknownProperty);
  if (extra !== undefined) return extra;
  for (const member of ["manifest", "x", "y"]) {
    if (!Object.hasOwn(object, member)) {
      return problem(ErrorCode.invalidValue, `a new block needs ${member}`, [...path, member]);
    }
  }
  const manifest = readBlockManifest(object.manifest, id);
  if (isCommandError(manifest)) return manifest;
  const places = readPlaces(object.places ?? {}, [...path, "places"]);
  if (isCommandError(places)) return places;
  const [stale] = placeProblems({ id, places, manifest }, path);
  if (stale !== undefined) return stale;
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
    places,
    manifest,
  };
  let current = withBlock(view, block);
  // The block's own members are set as a `set` would; their changes are the block's addition.
  const own = emptyChanges();
  for (const [member, item] of Object.entries(object)) {
    if (["id", "manifest", "places"].includes(member)) continue;
    const next = setProperty(current, { block: id }, member, item, own);
    if (isCommandError(next)) return { ...next, path: [...path, ...next.path.slice(1)] };
    current = next;
  }
  record(changes, path, id);
  return current;
}

/**
 * A problem of a host manifest holding one value first in its `list`,
 * placed at `at`, where the value lies in the command or will lie in the
 * block.
 */
function located(
  problem: Problem,
  list: "timelines" | "groups",
  at: readonly PathSegment[],
): Problem {
  const [member, index, ...rest] = problem.path;
  return { ...problem, path: member === list && index === 0 ? [...at, ...rest] : [...at] };
}

/** The first problem of a manifest `normalizeManifest` refused. */
function firstProblem(refused: LoadError): Problem {
  const [first] = refused.problems;
  if (first === undefined) throw new Error("a refused manifest names its problem");
  return first;
}

/**
 * A timeline given to `add`, read through the schema boundary as the one
 * root of a manifest of its own, beside the `measureMaps` of the manifest it
 * is added to, which its measure views may name: its segment lines covered
 * (`withSegmentLinesCovered`, no ID minted there among `taken`, the IDs of
 * the manifest it is added to), checked by the schema, the `locked` it and
 * its subtree state checked against their place under `parent`
 * (`statedLockProblem`; a root's own lock is its own) before reading unlocks
 * its segments, then completed (`completed`, the schema check done), every
 * ID of its tree checked against `taken` (`duplicate_id` at the first it
 * shares), and given the locks its place decides (a new timeline is no
 * group member yet). A problem is reported at `at`, where the timeline will
 * lie in the block, and below it; a refused lock at `path`.
 */
function readTimeline(
  value: JsonObject,
  parent: TimelineManifest | undefined,
  measureMaps: readonly MeasureMap[],
  taken: ReadonlySet<string>,
  at: readonly PathSegment[],
  path: readonly PathSegment[],
): TimelineManifest | CommandError {
  const host = { timetoshare: SCHEMA_VERSION, timelines: [value], measure_maps: measureMaps };
  const checked = schemaChecked(withSegmentLinesCovered(host, taken));
  if ("code" in checked) return located(checked, "timelines", at);
  const [fragment] = checked.timelines;
  if (fragment === undefined) throw new Error("the host holds the timeline");
  const placed = parent === undefined ? (fragment.children ?? []) : [fragment];
  for (const timeline of placed) {
    const refused = statedLockProblem(timeline, parent ?? fragment, path);
    if (refused !== undefined) return refused;
  }
  const read = completed(checked);
  if (isLoadError(read)) return located(firstProblem(read), "timelines", at);
  for (const id of manifestIds(read)) {
    // The measure maps beside the timeline are the manifest's own: only its tree's IDs lie in it.
    const where = idPath(read, id);
    if (where !== undefined && taken.has(id)) {
      return located(duplicated(id, where), "timelines", at);
    }
  }
  const [timeline] = read.timelines;
  if (timeline === undefined) throw new Error("the host holds the timeline");
  return withPlaceLocks(timeline, parent, () => false);
}

/** `duplicate_id` for `id`, an ID the manifest holds, given again at `path`. */
function duplicated(id: string, path: readonly PathSegment[]): CommandError {
  return problem(ErrorCode.duplicateId, `'${id}' is already an ID of the manifest`, path);
}

/** A value `add` puts into a manifest, read: the object, its ID, its path in the command, the manifest's IDs. */
interface NewValue {
  readonly object: JsonObject;
  readonly id: string;
  readonly path: readonly PathSegment[];
  readonly ids: ReadonlySet<string>;
}

/**
 * The prologue of every `add` into a manifest: the value of kind `kind`
 * given to `target`, read as an object at its path in the command
 * (`[<address key of into>, <kind>]`), carrying an ID that no element of
 * the target's manifest has (`duplicate_id` at that path and `id`).
 */
function readNew(
  target: BlockTarget | TimelineTarget,
  kind: AddKind,
  value: unknown,
): NewValue | CommandError {
  const path = [addressKey(target.address), kind];
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const { id } = object;
  if (typeof id !== "string") {
    return problem(ErrorCode.invalidValue, `the ${kind} carries no id`, path);
  }
  const ids = manifestIds(target.block.manifest);
  return ids.has(id) ? duplicated(id, [...path, "id"]) : { object, id, path, ids };
}

/** Add a root timeline to a block's manifest: its ID taken by no element of the manifest. */
function addTimeline(view: View, target: BlockTarget, value: unknown, changes: ChangeSet) {
  const read = readNew(target, "timeline", value);
  if (isCommandError(read)) return read;
  const { object, path, ids } = read;
  const { block } = target;
  const { manifest } = block;
  const at = [block.id, "manifest", "timelines", manifest.timelines.length];
  const timeline = readTimeline(object, undefined, manifest.measure_maps, ids, at, path);
  if (isCommandError(timeline)) return timeline;
  record(changes, path, block.id, true);
  return withBlock(view, {
    ...block,
    manifest: { ...manifest, timelines: [...manifest.timelines, timeline] },
  });
}

/**
 * A group given to `add`, its members left out, read through the schema
 * boundary as the one group of an empty manifest of its own and returned in
 * its complete form, its unknown keys kept. A problem is reported at `at`,
 * the group's path in the command, and below it.
 */
function readGroup(value: JsonObject, at: readonly PathSegment[]): Group | CommandError {
  const read = normalizeManifest({
    timetoshare: SCHEMA_VERSION,
    timelines: [],
    groups: [{ ...value, members: [] }],
  });
  if (isLoadError(read)) return located(firstProblem(read), "groups", at);
  const [group] = read.groups;
  if (group === undefined) throw new Error("the host holds the group");
  return group;
}

/**
 * Add a group to a block's manifest: `{id, name?, meta?, members}`, read
 * through the schema boundary (`readGroup`), its ID taken by no element of
 * the manifest, its members timelines of the manifest, each joining it as
 * `set groups` joins a group (`nested_member`, and `invalid_value` for a
 * member listed twice). A member that was drawn in one card of the block is
 * then drawn in the group's frame too, `settle` keeping that card's size
 * when the frame is its only one.
 */
function addGroup(view: View, target: BlockTarget, value: unknown, changes: ChangeSet) {
  const read = readNew(target, "group", value);
  if (isCommandError(read)) return read;
  const { object, id, path } = read;
  const { block } = target;
  const { manifest } = block;
  const { members } = object;
  if (!Array.isArray(members) || !members.every((member) => typeof member === "string")) {
    return problem(ErrorCode.invalidValue, "a group's members are timeline ids", [
      ...path,
      "members",
    ]);
  }
  const group = readGroup(object, path);
  if (isCommandError(group)) return group;
  let current = withBlock(view, {
    ...block,
    manifest: { ...manifest, groups: [...manifest.groups, group] },
  });
  const own = emptyChanges();
  for (const [index, member] of members.entries()) {
    const at = [...path, "members", index];
    const timeline = targetOf(current, inBlock(block.id, idAddress(member)));
    if (isCommandError(timeline) || (timeline.kind !== "root" && timeline.kind !== "child")) {
      return problem(ErrorCode.unknownTarget, `'${member}' names no timeline of the manifest`, at);
    }
    const groups = timeline.block.manifest.groups
      .filter((item) => item.members.includes(member))
      .map((item) => item.id);
    const next = setProperty(current, timeline.address, "groups", [...groups, id], own);
    if (isCommandError(next)) return { ...next, path: at };
    current = next;
  }
  record(changes, path, block.id, true);
  return current;
}

/**
 * Add a measure map to a block's manifest: `{id, name?, meta?, rows}`, read
 * through the schema boundary (`readMeasureMap`), its ID taken by no
 * element of the manifest; a problem is reported at the measure map's path
 * in the command, and below it.
 */
function addMeasureMap(view: View, target: BlockTarget, value: unknown, changes: ChangeSet) {
  const read = readNew(target, "measure_map", value);
  if (isCommandError(read)) return read;
  const { object, path } = read;
  const { block } = target;
  const { manifest } = block;
  const map = readMeasureMap(object);
  if (isCommandError(map)) return { ...map, path: [...path, ...map.path] };
  record(changes, path, block.id, true);
  return withBlock(view, {
    ...block,
    manifest: { ...manifest, measure_maps: [...manifest.measure_maps, map] },
  });
}

/** Add a child, map, region or flow-control element into a timeline. */
function addElement(
  view: View,
  target: TimelineTarget,
  kind: "child" | EntryKind,
  value: unknown,
  changes: ChangeSet,
): View | CommandError {
  const read = readNew(target, kind, value);
  if (isCommandError(read)) return read;
  const { object, path, ids } = read;
  const { block, at } = target;
  const { timeline } = at;
  let changed: TimelineManifest | CommandError;
  if (kind === "child") {
    const { offset, ...child } = object;
    const on = readOnAxis(offset, timeline, [...path, "offset"]);
    if (isCommandError(on)) return on;
    const where = [block.id, "manifest", ...at.path, "children", timeline.children.length];
    const placed = readTimeline(child, timeline, block.manifest.measure_maps, ids, where, path);
    if (isCommandError(placed)) return placed;
    changed = placeChild(at, placed, on, path);
  } else {
    const entry = readEntry(
      kind,
      object,
      timeline,
      entriesOf(timeline, kind).length,
      block.manifest.measure_maps,
    );
    if (isCommandError(entry)) {
      return { ...entry, path: [block.id, "manifest", ...at.path, ...entry.path] };
    }
    changed = withEntryAdded(timeline, kind, entry);
  }
  if (isCommandError(changed)) return changed;
  record(changes, path, block.id, true);
  return withTimeline(view, block, at, changed);
}

function isEntryKind(kind: AddKind): kind is EntryKind {
  return ENTRY_KINDS.some((item) => item === kind);
}

export function applyAdd(view: View, command: AddCommand, changes: ChangeSet): View | CommandError {
  const kind = ADD_KINDS.find((item) => Object.hasOwn(command, item));
  if (kind === undefined) throw new Error("a parsed add names its kind");
  const target = targetOf(view, command.into);
  if (isCommandError(target)) return target;
  const value = command[kind];
  if (ADDABLE[target.kind].includes(kind)) {
    changes.targets.push(command.into);
    switch (target.kind) {
      case "workspace":
        return addBlock(view, value, changes);
      case "block":
        if (kind === "group") return addGroup(view, target, value, changes);
        if (kind === "measure_map") return addMeasureMap(view, target, value, changes);
        return addTimeline(view, target, value, changes);
      case "root":
      case "child":
        if (kind === "child" || isEntryKind(kind)) {
          return addElement(view, target, kind, value, changes);
        }
    }
  }
  return problem(ErrorCode.wrongTargetKind, `nothing of kind ${kind} goes into ${target.kind}`, [
    addressKey(command.into),
    kind,
  ]);
}
