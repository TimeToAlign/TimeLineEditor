/**
 * `add`: what each kind of target takes (`ADDABLE`) and how each thing is
 * put in. A block goes into the workspace; a root timeline, a group or a
 * measure map into a block's manifest, and a named MatchStamp too; a child,
 * map, region, flow-control element or named timestamp into a timeline. The
 * value carries its ID: a block's taken by no block of the workspace, any
 * other's by no element of the manifest; a named timestamp and a named
 * MatchStamp alone are given the next free ID.
 * Whatever has a default may be left out, `settle` writing it out. A
 * problem of the value lies at `[<address key of into>, <kind>, …]`, one of
 * the manifest the command would leave at `[<block id>, "manifest", …]`.
 */

import { DEFAULTS, SCHEMA_VERSION, TIMESTAMP_DISPLAY } from "@timetoalign/timetoshare";
import type { CommandError, LoadError, Problem } from "../errors.ts";
import { ErrorCode, isCommandError, isLoadError, problem } from "../errors.ts";
import type { Json, JsonObject, PathSegment } from "../json.ts";
import { compareCodePoints, isJsonObject, withValueAt } from "../json.ts";
import { addressKey, idAddress, sameAddress } from "../manifest/address.ts";
import type { EntryKind } from "../manifest/files.ts";
import { ENTRY_KINDS, entriesOf } from "../manifest/files.ts";
import { readOnAxis } from "../manifest/invariants.ts";
import {
  completed,
  normalizeManifest,
  readEntry,
  readInPlace,
  readMeasureMap,
  schemaChecked,
} from "../manifest/io.ts";
import { statedLockProblem, withPlaceLocks } from "../manifest/locks.ts";
import { statementHolders } from "../manifest/statements.ts";
import type { Group, Manifest, TimelineManifest } from "../manifest/types.ts";
import { readName, readObject, readPlaces, unknownMember } from "../values.ts";
import { idPath, inBlock, manifestIds, WORKSPACE } from "../workspace/address.ts";
import type { Block } from "../workspace/blocks.ts";
import { BLOCK_ID } from "../workspace/blocks.ts";
import { MATCHSTAMP_PREFIX, nextId, TIMESTAMP_PREFIX } from "../workspace/ids.ts";
import { indexBetween } from "../workspace/order.ts";
import type { View } from "../workspace/view.ts";
import { placeProblems } from "../workspace/view.ts";
import { namedMatchStamp, readAnchors, readMatchClaims } from "./matchstamps.ts";
import type { ChangeSet } from "./mutations.ts";
import {
  emptyChanges,
  record,
  withBlock,
  withEntryAdded,
  withMatchStamps,
  withTimeline,
  withTimestamps,
} from "./mutations.ts";
import { BLOCK_PROPERTIES, readBlockManifest, setProperty } from "./set.ts";
import { withSegmentLinesCovered } from "./settle.ts";
import type { BlockTarget, TargetKind, TimelineTarget } from "./targets.ts";
import { targetOf } from "./targets.ts";
import { readDisplay, readTimestampCoordinate, withDefaultTimestamps } from "./timestamps.ts";
import { placeChild } from "./topology.ts";
import type { AddCommand, AddKind, Command } from "./types.ts";
import { ADD_KINDS } from "./types.ts";

const INTO_TIMELINE: readonly AddKind[] = ["child", ...ENTRY_KINDS, "timestamp"];

/** What `add` puts into each kind of target. */
export const ADDABLE: { readonly [kind in TargetKind]: readonly AddKind[] } = {
  workspace: ["block"],
  block: ["timeline", "group", "measure_map", "matchstamp"],
  group: [],
  measure_map: [],
  root: INTO_TIMELINE,
  child: INTO_TIMELINE,
  map: [],
  region: [],
  flow_control: [],
  timestamp: [],
  matchstamp: [],
  anchor: [],
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
    // An `add` the store journals states every placement member (`withStatedPlacement`),
    // so a replay reads none of these; `apply` and `preview` of an add that leaves members
    // out take them from the view's block defaults, as the arranger does when it previews
    // where a new block will lie.
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
 * `command` as the store journals it: an `add` of a block into the workspace
 * with every placement member it leaves out stated from the workspace's
 * block defaults, so that replaying the journal reads no setting; any other
 * command unchanged.
 */
export function withStatedPlacement(view: View, command: Command): Command {
  if (command.type !== "add" || !sameAddress(command.into, WORKSPACE)) return command;
  const { block } = command;
  if (!isJsonObject(block)) return command;
  return { ...command, block: { ...view.settings.blockDefaults, ...block } };
}

/**
 * A problem of a manifest holding a value at `place`, placed at `at`, where
 * the value lies in the command or will lie in the block: below `at` where
 * it lies in the value, else at `at`.
 */
function located(
  problem: Problem,
  place: readonly PathSegment[],
  at: readonly PathSegment[],
): Problem {
  const inside = place.every((step, index) => problem.path[index] === step);
  return { ...problem, path: inside ? [...at, ...problem.path.slice(place.length)] : [...at] };
}

/** The first problem of a manifest `normalizeManifest` refused. */
function firstProblem(refused: LoadError): Problem {
  const [first] = refused.problems;
  if (first === undefined) throw new Error("a refused manifest names its problem");
  return first;
}

/** Where the one value of a host manifest lies in it. */
const FIRST_ROOT = ["timelines", 0];

/** The members of an element that state something about it. */
const DESCRIBING = ["statements", "provenance"] as const;

/**
 * A value given to `add` (a timeline with what it holds) with the
 * `statements` and `provenance` of every element in it set aside: what is
 * read alone, before they are read where they will lie, in the whole
 * manifest, since a value may name any element of the manifest. What is set
 * aside is put into `found` by the ID of its element; what an element
 * carrying no string ID states is dropped with it, the schema refusing the
 * element. Every other member is kept as given.
 */
function undescribed(value: JsonObject, found: Map<string, JsonObject>): JsonObject {
  const result: { [key: string]: Json } = {};
  const described: { [key: string]: Json } = {};
  for (const [key, member] of Object.entries(value)) {
    if ((DESCRIBING as readonly string[]).includes(key)) described[key] = member;
    else result[key] = member;
  }
  if (Object.keys(described).length > 0 && typeof value.id === "string") {
    found.set(value.id, described);
  }
  for (const member of ["regions", "children"]) {
    const list = result[member];
    if (Array.isArray(list)) {
      result[member] = list.map((item: Json) =>
        isJsonObject(item) ? undescribed(item, found) : item,
      );
    }
  }
  return result;
}

/**
 * A timeline given to `add`, read through the schema boundary in two steps.
 * First the timeline alone, what its elements state set aside
 * (`undescribed`), as the one root of a manifest of its own beside the
 * measure maps of `manifest`, the manifest it is added to, which its
 * measure views may name: its segment lines covered
 * (`withSegmentLinesCovered`, no ID minted there among `taken`, the IDs of
 * the manifest), checked by the schema, the `locked` it and its subtree
 * state checked against their place under `parent` (`statedLockProblem`; a
 * root's own lock is its own) before reading unlocks its segments, then
 * completed (`completed`, the schema check done), every ID of its tree
 * checked against `taken` (`duplicate_id` at the first it shares), and given
 * the locks its place decides (a new timeline is no group member yet). Then
 * what its elements state, where it will lie (`withDescriptionsRead`). A
 * problem is reported at `at`, where the timeline will lie in the block, and
 * below it; a refused lock at `path`.
 */
function readTimeline(
  value: JsonObject,
  parent: TimelineManifest | undefined,
  manifest: Manifest,
  taken: ReadonlySet<string>,
  at: readonly PathSegment[],
  path: readonly PathSegment[],
): TimelineManifest | CommandError {
  const described = new Map<string, JsonObject>();
  const host = {
    timetoshare: SCHEMA_VERSION,
    timelines: [undescribed(value, described)],
    measure_maps: manifest.measure_maps,
  };
  const checked = schemaChecked(withSegmentLinesCovered(host, taken));
  if ("code" in checked) return located(checked, FIRST_ROOT, at);
  const [fragment] = checked.timelines;
  if (fragment === undefined) throw new Error("the host holds the timeline");
  const placed = parent === undefined ? (fragment.children ?? []) : [fragment];
  for (const timeline of placed) {
    const refused = statedLockProblem(timeline, parent ?? fragment, path);
    if (refused !== undefined) return refused;
  }
  const read = completed(checked);
  if (isLoadError(read)) return located(firstProblem(read), FIRST_ROOT, at);
  for (const id of manifestIds(read)) {
    // The measure maps beside the timeline are the manifest's own: only its tree's IDs lie in it.
    const where = idPath(read, id);
    if (where !== undefined && taken.has(id)) {
      return located(duplicated(id, where), FIRST_ROOT, at);
    }
  }
  const [timeline] = read.timelines;
  if (timeline === undefined) throw new Error("the host holds the timeline");
  const own = withPlaceLocks(timeline, parent, () => false);
  return described.size === 0 ? own : withDescriptionsRead(own, described, manifest, at);
}

/**
 * `timeline`, read with what its elements state set aside, with what
 * `described` holds by the ID of each element, read where it will lie: the
 * timeline, its statements and provenance in place, among the roots of
 * `manifest`, which is read whole (`readInPlace`, checked with the context a
 * file writes), so that a value may name any element of the manifest. A
 * problem is reported at `at`, where the timeline will lie in the block, and
 * below it.
 */
function withDescriptionsRead(
  timeline: TimelineManifest,
  described: ReadonlyMap<string, JsonObject>,
  manifest: Manifest,
  at: readonly PathSegment[],
): TimelineManifest | CommandError {
  // The roots lie in canonical order, by ID: the timeline goes where that order puts it.
  const index = manifest.timelines.filter(
    ({ id }) => compareCodePoints(id, timeline.id) < 0,
  ).length;
  const place = ["timelines", index];
  const roots = manifest.timelines.toSpliced(index, 0, timeline);
  let probe: unknown = { ...manifest, timelines: roots };
  for (const holder of statementHolders({ ...manifest, timelines: [timeline] })) {
    const given = holder.id === null ? undefined : described.get(holder.id);
    if (given === undefined) continue;
    const [, , ...below] = holder.path;
    for (const [key, member] of Object.entries(given)) {
      probe = withValueAt(probe, [...place, ...below, key], member);
    }
  }
  const read = readInPlace(probe);
  if ("code" in read) return located(read, place, at);
  const found = read.timelines.find(({ id }) => id === timeline.id);
  if (found === undefined) throw new Error("the manifest holds the timeline");
  return found;
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

/**
 * Add a root timeline to a block's manifest: its ID taken by no element of
 * the manifest. It is given its default timestamps (`withDefaultTimestamps`),
 * its descendants none.
 */
function addTimeline(view: View, target: BlockTarget, value: unknown, changes: ChangeSet) {
  const read = readNew(target, "timeline", value);
  if (isCommandError(read)) return read;
  const { object, path, ids } = read;
  const { block } = target;
  const { manifest } = block;
  const at = [block.id, "manifest", "timelines", manifest.timelines.length];
  const timeline = readTimeline(object, undefined, manifest, ids, at, path);
  if (isCommandError(timeline)) return timeline;
  record(changes, path, block.id, true);
  const added = { ...manifest, timelines: [...manifest.timelines, timeline] };
  return withBlock(view, { ...block, manifest: withDefaultTimestamps(added, timeline) });
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
  if (isLoadError(read)) return located(firstProblem(read), ["groups", 0], at);
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
    const placed = readTimeline(child, timeline, block.manifest, ids, where, path);
    if (isCommandError(placed)) return placed;
    changed = placeChild(block.manifest, at, placed, on, path);
  } else {
    const entry = readEntry(kind, object, at, entriesOf(timeline, kind).length, block.manifest);
    if (isCommandError(entry)) {
      return { ...entry, path: [block.id, "manifest", ...at.path, ...entry.path] };
    }
    changed = withEntryAdded(timeline, kind, entry);
  }
  if (isCommandError(changed)) return changed;
  record(changes, path, block.id, true);
  return withTimeline(view, block, at, changed);
}

/** The members a named timestamp `add` is given must have; its ID is minted and its timeline is the target. */
const TIMESTAMP_REQUIRED = ["name", "coordinate"];

/** Every member a named timestamp `add` is given may have. */
const TIMESTAMP_VALUE = [...TIMESTAMP_REQUIRED, "display"];

/**
 * Add a named timestamp into a timeline: `{name, coordinate, display?}`,
 * name and coordinate required (`invalid_value`), nothing else
 * (`unknown_property`); the name non-empty, the coordinate on the
 * timeline's own axis within it (`readTimestampCoordinate`), the display
 * read by `readDisplay` over `TIMESTAMP_DISPLAY`, the schema's default where it is left
 * out. It is given the smallest free `timestamp_N` of the manifest and
 * written into its `graphical` object's `timestamps`, which `settle` puts
 * in canonical order.
 */
function addTimestamp(
  view: View,
  target: TimelineTarget,
  value: unknown,
  changes: ChangeSet,
): View | CommandError {
  const path = [addressKey(target.address), "timestamp"];
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const extra = unknownMember(object, TIMESTAMP_VALUE, path, ErrorCode.unknownProperty);
  if (extra !== undefined) return extra;
  for (const member of TIMESTAMP_REQUIRED) {
    if (!Object.hasOwn(object, member)) {
      return problem(ErrorCode.invalidValue, `a new timestamp needs ${member}`, [...path, member]);
    }
  }
  const name = readName(object.name, [...path, "name"]);
  if (isCommandError(name)) return name;
  const { block, at } = target;
  const coordinate = readTimestampCoordinate(object.coordinate, at.timeline, [
    ...path,
    "coordinate",
  ]);
  if (isCommandError(coordinate)) return coordinate;
  const display =
    object.display === undefined
      ? [...DEFAULTS.timestamp.display]
      : readDisplay(object.display, TIMESTAMP_DISPLAY, [...path, "display"]);
  if (isCommandError(display)) return display;
  const { manifest } = block;
  const id = nextId(TIMESTAMP_PREFIX, manifestIds(manifest));
  const timestamp = { id, timeline: at.timeline.id, coordinate, name, display, matchstamp: false };
  const timestamps = [...(manifest.graphical?.timestamps ?? []), timestamp];
  record(changes, path, block.id, true);
  return withBlock(view, { ...block, manifest: withTimestamps(manifest, timestamps) });
}

/** The members a named MatchStamp `add` is given: all required, its IDs minted. */
const MATCHSTAMP_VALUE = ["name", "anchors", "match_claims"];

/**
 * Name a potential MatchStamp in a block's manifest: `{name, anchors,
 * match_claims}`, every member required (`invalid_value`), nothing else
 * (`unknown_property`); the name non-empty, the anchors pairs of
 * coordinates in screen order (`readAnchors`), the claims a list of
 * MatchClaim IDs (`readMatchClaims`). It is given the smallest free
 * `matchstamp_N`, its anchors and new match timestamps theirs
 * (`namedMatchStamp`), and appended to the manifest's named MatchStamps.
 */
function addMatchStamp(
  view: View,
  target: BlockTarget,
  value: unknown,
  changes: ChangeSet,
): View | CommandError {
  const path = [addressKey(target.address), "matchstamp"];
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const extra = unknownMember(object, MATCHSTAMP_VALUE, path, ErrorCode.unknownProperty);
  if (extra !== undefined) return extra;
  for (const member of MATCHSTAMP_VALUE) {
    if (!Object.hasOwn(object, member)) {
      return problem(ErrorCode.invalidValue, `a new MatchStamp needs ${member}`, [...path, member]);
    }
  }
  const name = readName(object.name, [...path, "name"]);
  if (isCommandError(name)) return name;
  const { block } = target;
  const { manifest } = block;
  const anchors = readAnchors(object.anchors, manifest, [...path, "anchors"]);
  if (isCommandError(anchors)) return anchors;
  const claims = readMatchClaims(object.match_claims, [...path, "match_claims"]);
  if (isCommandError(claims)) return claims;
  const taken = manifestIds(manifest);
  const id = nextId(MATCHSTAMP_PREFIX, taken);
  taken.add(id);
  const named = namedMatchStamp(manifest, taken, id, name, anchors, claims);
  const matchstamps = [...(manifest.graphical?.matchstamps ?? []), named.matchstamp];
  record(changes, path, block.id, true);
  const next = withMatchStamps(manifest, named.timestamps, matchstamps);
  return withBlock(view, { ...block, manifest: next });
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
        if (kind === "matchstamp") return addMatchStamp(view, target, value, changes);
        return addTimeline(view, target, value, changes);
      case "root":
      case "child":
        if (kind === "timestamp") return addTimestamp(view, target, value, changes);
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
