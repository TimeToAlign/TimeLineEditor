/**
 * `add`: what each kind of target takes (`ADDABLE`) and how each thing is
 * put in. A block goes into the workspace; a root timeline or a group into a
 * block's manifest; a child, map, region, break, jump or marker into a
 * timeline. The value carries its id, which no element it would be confused
 * with may carry; whatever has a default may be left out, `settle` writing
 * it out.
 */

import { SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import type { CommandError, LoadError, Problem } from "../errors.ts";
import { ErrorCode, isCommandError, isLoadError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import type { EntryKind } from "../manifest/files.ts";
import { ENTRY_KINDS, elementAddress, entriesOf } from "../manifest/files.ts";
import { readOnAxis } from "../manifest/invariants.ts";
import { completed, normalizeManifest, readEntry, schemaChecked } from "../manifest/io.ts";
import { statedLockProblem, withPlaceLocks } from "../manifest/locks.ts";
import type { Group, TimelineManifest } from "../manifest/types.ts";
import { readObject, readPlaces, unknownMember } from "../values.ts";
import { qualify, WORKSPACE } from "../workspace/address.ts";
import type { Block } from "../workspace/blocks.ts";
import { BLOCK_ID } from "../workspace/blocks.ts";
import { manifestIds, takenIds } from "../workspace/ids.ts";
import { indexBetween } from "../workspace/order.ts";
import type { View } from "../workspace/view.ts";
import { placeProblems } from "../workspace/view.ts";
import type { ChangeSet } from "./mutations.ts";
import { emptyChanges, record, withBlock, withEntryAdded, withTimeline } from "./mutations.ts";
import { BLOCK_PROPERTIES, readBlockManifest, setProperty } from "./set.ts";
import { withSegmentLinesCovered } from "./settle.ts";
import type { BlockTarget, TargetKind, TimelineTarget } from "./targets.ts";
import { rootOf, targetOf } from "./targets.ts";
import { placeChild } from "./topology.ts";
import type { AddCommand, AddKind } from "./types.ts";
import { ADD_KINDS } from "./types.ts";

const INTO_TIMELINE: readonly AddKind[] = ["child", ...ENTRY_KINDS];

/** What `add` puts into each kind of target. */
export const ADDABLE: { readonly [kind in TargetKind]: readonly AddKind[] } = {
  workspace: ["block"],
  block: ["timeline", "group"],
  group: [],
  root: INTO_TIMELINE,
  child: INTO_TIMELINE,
  map: [],
  region: [],
  break: [],
  jump: [],
  marker: [],
};

const BLOCK_VALUE = ["id", "manifest", "places", ...BLOCK_PROPERTIES];

function addBlock(view: View, value: unknown, changes: ChangeSet): View | CommandError {
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
  const places = readPlaces(object.places ?? {}, [id, "places"]);
  if (isCommandError(places)) return places;
  const [stale] = placeProblems({ id, places, manifest }, [id]);
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
    const next = setProperty(current, id, member, item, own);
    if (isCommandError(next)) return next;
    current = next;
  }
  record(changes, [WORKSPACE, "block"], id);
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
 * root of a manifest of its own: its segment lines covered
 * (`withSegmentLinesCovered`, no id minted there among `taken`, the ids of
 * the manifest it is added to), checked by the schema, the `locked` it and
 * its subtree state checked against their place under `parent`
 * (`statedLockProblem`; a root's own lock is its own) before reading unlocks
 * its segments, then completed (`completed`, the schema check done), and given
 * the locks its place decides (a new timeline is no group member yet). A
 * problem is reported at `at`, where the timeline will lie in the block, and
 * below it; a refused lock at `path`.
 */
function readTimeline(
  value: JsonObject,
  parent: TimelineManifest | undefined,
  taken: ReadonlySet<string>,
  at: readonly PathSegment[],
  path: readonly PathSegment[],
): TimelineManifest | CommandError {
  const host = { timeskeleton: SCHEMA_VERSION, timelines: [value] };
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
  const [timeline] = read.timelines;
  if (timeline === undefined) throw new Error("the host holds the timeline");
  return withPlaceLocks(timeline, parent, () => false);
}

/** The element a value names by its id, refused as `duplicate_id` at `address` when taken. */
function readId(
  object: JsonObject,
  kind: AddKind,
  path: readonly PathSegment[],
): string | CommandError {
  const { id } = object;
  return typeof id === "string"
    ? id
    : problem(ErrorCode.invalidValue, `the ${kind} carries no id`, path);
}

function duplicate(block: Block, address: string, id: string): CommandError {
  return problem(ErrorCode.duplicateId, `${id} is already an id of the manifest`, [
    qualify(block.id, address),
  ]);
}

/** Add a root timeline to a block's manifest: its id taken by no timeline, group or the manifest. */
function addTimeline(view: View, target: BlockTarget, value: unknown, changes: ChangeSet) {
  const path = [target.address, "timeline"];
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const id = readId(object, "timeline", path);
  if (isCommandError(id)) return id;
  const { block } = target;
  const { manifest } = block;
  if (manifestIds(manifest).has(id)) return duplicate(block, id, id);
  const at = [block.id, "manifest", "timelines", manifest.timelines.length];
  const timeline = readTimeline(object, undefined, takenIds(manifest, true), at, path);
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
    timeskeleton: SCHEMA_VERSION,
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
 * through the schema boundary (`readGroup`), its id taken by no timeline,
 * group or the manifest, its members timelines of the manifest under the
 * rules of `set group` (`already_member`, `nested_member`). A member that
 * was drawn in a card of the box is then drawn in the group's frame,
 * `settle` keeping its card's size.
 */
function addGroup(view: View, target: BlockTarget, value: unknown, changes: ChangeSet) {
  const path = [target.address, "group"];
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const id = readId(object, "group", path);
  if (isCommandError(id)) return id;
  const { block } = target;
  const { manifest } = block;
  if (manifestIds(manifest).has(id)) return duplicate(block, id, id);
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
    const timeline = targetOf(current, qualify(block.id, member));
    if (isCommandError(timeline) || (timeline.kind !== "root" && timeline.kind !== "child")) {
      return problem(ErrorCode.unknownTarget, `${member} names no timeline of the manifest`, at);
    }
    const next = setProperty(current, timeline.address, "group", id, own);
    if (isCommandError(next)) return { ...next, path: at };
    current = next;
  }
  record(changes, path, block.id, true);
  return current;
}

/** Add a child, map, region, break, jump or marker into a timeline. */
function addElement(
  view: View,
  target: TimelineTarget,
  kind: "child" | EntryKind,
  value: unknown,
  changes: ChangeSet,
): View | CommandError {
  const path = [target.address, kind];
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const id = readId(object, kind, path);
  if (isCommandError(id)) return id;
  const { block, at } = target;
  const root = rootOf(at).id;
  if (takenIds(block.manifest, kind === "child", root).has(id)) {
    return duplicate(block, kind === "child" ? id : elementAddress(root, id), id);
  }
  const { timeline } = at;
  let changed: TimelineManifest | CommandError;
  if (kind === "child") {
    const { offset, ...child } = object;
    const on = readOnAxis(offset, timeline, [...path, "offset"]);
    if (isCommandError(on)) return on;
    const where = [block.id, "manifest", ...at.path, "children", timeline.children.length];
    const read = readTimeline(child, timeline, takenIds(block.manifest, true), where, path);
    if (isCommandError(read)) return read;
    changed = placeChild(at, read, on, path);
  } else {
    const entry = readEntry(kind, object, timeline, entriesOf(timeline, kind).length);
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
    switch (target.kind) {
      case "workspace":
        return addBlock(view, value, changes);
      case "block":
        return kind === "group"
          ? addGroup(view, target, value, changes)
          : addTimeline(view, target, value, changes);
      case "root":
      case "child":
        if (kind === "child" || isEntryKind(kind)) {
          return addElement(view, target, kind, value, changes);
        }
    }
  }
  return problem(ErrorCode.wrongTargetKind, `nothing of kind ${kind} goes into ${target.kind}`, [
    command.into,
    kind,
  ]);
}
