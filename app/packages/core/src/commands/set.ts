/**
 * `set`: the one table of what each kind of target lets a command set
 * (`SETTABLE`). A setter reads its value, refuses what its target cannot
 * take, and stores the value; a value equal, as JSON, to the one stored
 * writes nothing and records no change, so a `set` that changes nothing is
 * recognised without comparing views.
 */

import type { CommandError, Problem } from "../errors.ts";
import { ErrorCode, isCommandError, isLoadError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import type { CardPlace, ItemPlace } from "../manifest/containers.ts";
import { containersOf, ITEM_PLACE_MEMBERS, isMember } from "../manifest/containers.ts";
import type { EntryKind, EntryTypes } from "../manifest/files.ts";
import { contentEnd, readOnAxis } from "../manifest/invariants.ts";
import { normalizeManifest, readEntry } from "../manifest/io.ts";
import { lockProblem } from "../manifest/locks.ts";
import { bandOrderProblem } from "../manifest/order.ts";
import type { AxisValue, Manifest, TimelineManifest } from "../manifest/types.ts";
import { toAxisValue } from "../number/coordinate.ts";
import { compareReal, realOf } from "../number/real.ts";
import {
  PLACE_READERS,
  readBoolean,
  readFinite,
  readGraphical,
  readIndex,
  readNullablePositive,
  readNullableString,
  readObject,
  readPositive,
  toJson,
  unknownMember,
} from "../values.ts";
import type { Address } from "../workspace/address.ts";
import type { Block, BlockId, BlockPlacement } from "../workspace/blocks.ts";
import type { View, WorkspaceSettings } from "../workspace/view.ts";
import { placeMemberProblem } from "../workspace/view.ts";
import type { ChangeSet } from "./mutations.ts";
import {
  entryAt,
  record,
  recordValue,
  sameJson,
  withBlock,
  withEntryAt,
  withEntryMember,
  withKey,
  withSettings,
  withTimeline,
} from "./mutations.ts";
import type {
  BlockTarget,
  EntryTarget,
  GroupTarget,
  Target,
  TargetKind,
  TargetOfKind,
  TimelineTarget,
  WorkspaceTarget,
} from "./targets.ts";
import { targetOf } from "./targets.ts";
import { joinGroup, lengthProblem, moveTimeline, placeChild } from "./topology.ts";

/**
 * Set one property of `target` to `value`: the new view, or the refusal at
 * `path` (`[address, property]`). A setter that changes something records
 * `path` in `changes`.
 */
export type Setter<T extends Target> = (
  view: View,
  target: T,
  value: unknown,
  path: readonly PathSegment[],
  changes: ChangeSet,
) => View | CommandError;

type Setters<T extends Target> = { readonly [property: string]: Setter<T> };
type Reader<T> = (value: unknown, path: readonly PathSegment[]) => T | Problem;
/** A reader of each member of a `T`. */
type Readers<T> = { readonly [M in keyof T]-?: Reader<T[M]> };

/** Whether `key` names a member of `object`. */
function isMemberOf<T extends object>(object: T, key: string): key is Extract<keyof T, string> {
  return Object.hasOwn(object, key);
}

/** Read the members given of a `T`, each by its reader. */
function readMembers<T>(
  value: unknown,
  path: readonly PathSegment[],
  readers: Readers<T>,
): Partial<T> | CommandError {
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const extra = unknownMember(object, Object.keys(readers), path, ErrorCode.unknownProperty);
  if (extra !== undefined) return extra;
  const read: Partial<T> = {};
  for (const [member, item] of Object.entries(object)) {
    if (!isMemberOf(readers, member)) continue;
    const result = readers[member](item, [...path, member]);
    if (isCommandError(result)) return result;
    read[member] = result;
  }
  return read;
}

// ---------------------------------------------------------------- workspace

const PLACEMENT_READERS: Readers<BlockPlacement> = {
  scale: readPositive,
  length: readPositive,
  spacing: readPositive,
  width: readNullablePositive,
  height: readNullablePositive,
};

const GRID_READERS: Readers<WorkspaceSettings["grid"]> = { size: readPositive, snap: readBoolean };

/** The workspace setting `member` replaced by `next`, unless it holds what is stored. */
function settingChange<M extends keyof WorkspaceSettings>(
  view: View,
  path: readonly PathSegment[],
  changes: ChangeSet,
  member: M,
  next: WorkspaceSettings[M],
): View {
  const stored = view.settings[member];
  if (sameJson(stored, next)) return view;
  recordValue(changes, path, null, false, stored, next);
  return withSettings(view, { [member]: next });
}

const WORKSPACE_SET: Setters<WorkspaceTarget> = {
  grid: (view, _, value, path, changes) => {
    const grid = readMembers(value, path, GRID_READERS);
    if (isCommandError(grid)) return grid;
    return settingChange(view, path, changes, "grid", { ...view.settings.grid, ...grid });
  },
  blockDefaults: (view, _, value, path, changes) => {
    const defaults = readMembers(value, path, PLACEMENT_READERS);
    if (isCommandError(defaults)) return defaults;
    const { blockDefaults } = view.settings;
    return settingChange(view, path, changes, "blockDefaults", { ...blockDefaults, ...defaults });
  },
  graphical: (view, _, value, path, changes) => {
    const graphical = readGraphical(value, path);
    if (isCommandError(graphical)) return graphical;
    return settingChange(view, path, changes, "graphical", graphical);
  },
};

// ---------------------------------------------------------------- block

type BlockNumber = "x" | "y" | keyof BlockPlacement;

/** A block member read by `read` and stored as read. */
function blockValue<M extends BlockNumber>(member: M, read: Reader<Block[M]>): Setter<BlockTarget> {
  return (view, target, value, path, changes) => {
    const result = read(value, path);
    if (isCommandError(result)) return result;
    const { block } = target;
    if (sameJson(block[member], result)) return view;
    recordValue(changes, path, block.id, false, block[member], result);
    return withBlock(view, { ...block, [member]: result });
  };
}

/** A whole manifest for block `id`, its problems located below `[id, "manifest"]`. */
export function readBlockManifest(value: unknown, id: BlockId): Manifest | CommandError {
  const path = [id, "manifest"];
  const json = toJson(value, path);
  if (isCommandError(json)) return json;
  const manifest = normalizeManifest(json);
  if (!isLoadError(manifest)) return manifest;
  const [first] = manifest.problems;
  if (first === undefined) throw new Error("a refused manifest names its problem");
  return { ...first, path: [...path, ...first.path] };
}

const BLOCK_SET: Setters<BlockTarget> = {
  x: blockValue("x", readFinite),
  y: blockValue("y", readFinite),
  index: (view, target, value, path, changes) => {
    const index = readIndex(value, path);
    if (isCommandError(index)) return index;
    const { block } = target;
    if (block.index === index) return view;
    const sibling = Object.values(view.blocks).find(
      (item) => item.id !== block.id && item.parent === block.parent && item.index === index,
    );
    if (sibling !== undefined) {
      return problem(ErrorCode.duplicateIndex, `block ${sibling.id} already has that index`, path);
    }
    recordValue(changes, path, block.id, false, block.index, index);
    return withBlock(view, { ...block, index });
  },
  scale: blockValue("scale", PLACEMENT_READERS.scale),
  length: blockValue("length", PLACEMENT_READERS.length),
  spacing: blockValue("spacing", PLACEMENT_READERS.spacing),
  width: blockValue("width", PLACEMENT_READERS.width),
  height: blockValue("height", PLACEMENT_READERS.height),
  manifest: (view, target, value, path, changes) => {
    const manifest = readBlockManifest(value, target.block.id);
    if (isCommandError(manifest)) return manifest;
    const { block } = target;
    if (sameJson(block.manifest, manifest)) return view;
    // A whole new manifest may no longer hold what the block's places name.
    record(changes, path, block.id, true);
    return withBlock(view, { ...block, manifest });
  },
};

/** The names of a block's members a `set` may give, in the order a new block's are applied. */
export const BLOCK_PROPERTIES: readonly string[] = Object.keys(BLOCK_SET);

// ---------------------------------------------------------------- places and orders

/** A target that `places` and `graphical.order` may name: a group, a root or a child timeline. */
type KeyedTarget = GroupTarget | TimelineTarget;

/** The id a group or timeline target carries, the key it has in `places` and `graphical.order`. */
function keyOf(target: KeyedTarget): string {
  return target.kind === "group" ? target.group.id : target.at.timeline.id;
}

/** A value read by `read`, or null. */
function nullable<T>(read: Reader<T>): Reader<T | null> {
  return (value, path) => (value === null ? null : read(value, path));
}

/** A place's members as a `set` gives them: each a value, or null to unstate it. */
type PlaceValues = { readonly [M in keyof ItemPlace]-?: number | null };

const NULLABLE_PLACE_READERS: Readers<PlaceValues> = {
  x: nullable(PLACE_READERS.x),
  y: nullable(PLACE_READERS.y),
  length: nullable(PLACE_READERS.length),
  scale: nullable(PLACE_READERS.scale),
  spacing: nullable(PLACE_READERS.spacing),
  width: nullable(PLACE_READERS.width),
  height: nullable(PLACE_READERS.height),
};

/**
 * `stored` with `given` merged in, in the order a place is written: a value
 * states a member, null unstates it; `undefined` when no member is left.
 */
function mergedPlace(
  stored: ItemPlace | CardPlace | undefined,
  given: Partial<PlaceValues>,
): ItemPlace | undefined {
  const kept: ItemPlace = stored ?? {};
  const place: { -readonly [M in keyof ItemPlace]?: number } = {};
  for (const member of ITEM_PLACE_MEMBERS) {
    const item = given[member] === undefined ? kept[member] : given[member];
    if (typeof item === "number") place[member] = item;
  }
  return Object.keys(place).length > 0 ? place : undefined;
}

/**
 * Merge members into the stated place of a container: a value states a
 * member, null unstates it, and a place left without members is no place.
 * Only a frame or a card has a place, and only the members its holder lets
 * it state (`placeMembersOf`): a box-held one its full place, a frame-held
 * card its size and vertical stretch, the length and scale it is drawn with
 * being its group's.
 */
const setPlace: Setter<KeyedTarget> = (view, target, value, path, changes) => {
  const key = keyOf(target);
  const { block } = target;
  const container = containersOf(block.manifest).byKey.get(key);
  if (container === undefined) {
    return problem(ErrorCode.notAnItem, `${key} is not drawn in a card of its own`, path);
  }
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const extra = placeMemberProblem(container, object, path, ErrorCode.notAnItem);
  if (extra !== undefined) return extra;
  const given = readMembers(object, path, NULLABLE_PLACE_READERS);
  if (isCommandError(given)) return given;
  // An empty value would journal a command that changes nothing.
  if (Object.keys(given).length === 0) {
    return problem(ErrorCode.invalidValue, "a place value states at least one member", path);
  }
  const stored = block.places[key];
  const place = mergedPlace(stored, given);
  if (sameJson(stored, place)) return view;
  recordValue(changes, path, block.id, false, stored, place);
  return withBlock(view, { ...block, places: withKey(block.places, key, place) });
};

/**
 * Write the entry of a group or timeline in its manifest's `graphical.order`
 * (a group's display order, a timeline's band order), or delete it with
 * null. Deleting an entry that is not there leaves the view as it is, never
 * with an empty `graphical` added.
 */
function withOrder(
  view: View,
  target: KeyedTarget,
  order: readonly string[] | null,
  path: readonly PathSegment[],
  changes: ChangeSet,
): View {
  const { manifest } = target.block;
  const graphical = manifest.graphical ?? {};
  const key = keyOf(target);
  const orders = graphical.order ?? {};
  const stated = Object.hasOwn(orders, key) ? orders[key] : undefined;
  if (order === null ? stated === undefined : sameJson(stated, order)) return view;
  const written = order === null ? undefined : [...order];
  const entries = withKey(orders, key, written);
  recordValue(changes, path, target.block.id, true, stated, written);
  return withBlock(view, {
    ...target.block,
    manifest: { ...manifest, graphical: { ...graphical, order: entries } },
  });
}

function isStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

const GROUP_SET: Setters<GroupTarget> = {
  /** The group's display order; null deletes its entry. */
  order: (view, target, value, path, changes) => {
    const { id, members } = target.group;
    if (value === null) return withOrder(view, target, null, path, changes);
    const listsMembers =
      isStrings(value) &&
      value.length === members.length &&
      members.every((member) => value.includes(member));
    if (!listsMembers) {
      return problem(ErrorCode.invalidOrder, `order must list every member of ${id} once`, path);
    }
    return withOrder(view, target, value, path, changes);
  },
  place: setPlace,
};

// ---------------------------------------------------------------- timelines

/** The view with the target timeline replaced by `next`, unless the member it sets holds what is stored. */
function timelineChange(
  view: View,
  target: TimelineTarget,
  path: readonly PathSegment[],
  changes: ChangeSet,
  stored: unknown,
  next: TimelineManifest,
  value: unknown,
): View {
  if (sameJson(stored, value)) return view;
  recordValue(changes, path, target.block.id, true, stored, value);
  return withTimeline(view, target.block, target.at, next);
}

const TIMELINE_SET: Setters<TimelineTarget> = {
  /** The timeline's band order; null deletes its entry, so it inherits again. */
  order: (view, target, value, path, changes) => {
    if (value === null) return withOrder(view, target, null, path, changes);
    const refused = bandOrderProblem(target.block.manifest, target.at.timeline.id, value);
    return refused === null && isStrings(value)
      ? withOrder(view, target, value, path, changes)
      : problem(ErrorCode.invalidOrder, refused ?? "a band order is an array of strings", path);
  },
  name: (view, target, value, path, changes) => {
    const name = readNullableString(value, path);
    if (isCommandError(name)) return name;
    const { timeline } = target.at;
    return timelineChange(view, target, path, changes, timeline.name, { ...timeline, name }, name);
  },
  meta: (view, target, value, path, changes) => {
    const meta = readObject(value, path);
    if (isCommandError(meta)) return meta;
    const { timeline } = target.at;
    return timelineChange(view, target, path, changes, timeline.meta, { ...timeline, meta }, meta);
  },
  locked: (view, target, value, path, changes) => {
    const locked = readBoolean(value, path);
    if (isCommandError(locked)) return locked;
    const { timeline, parent } = target.at;
    const member = isMember(target.block.manifest, timeline.id);
    const refused = lockProblem(locked, timeline.locked, timeline, parent?.timeline, member, path);
    if (refused !== undefined) return refused;
    const next = { ...timeline, locked };
    return timelineChange(view, target, path, changes, timeline.locked, next, locked);
  },
  length: (view, target, value, path, changes) => {
    const { timeline } = target.at;
    if (timeline.locked) {
      return problem(ErrorCode.locked, `timeline ${timeline.id} is locked`, path);
    }
    // A length of null means the length is not known; it bounds nothing.
    if (value === null) {
      const next = { ...timeline, length: null };
      return timelineChange(view, target, path, changes, timeline.length, next, null);
    }
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
    const stored = toAxisValue(length);
    const next = { ...timeline, length: stored };
    return timelineChange(view, target, path, changes, timeline.length, next, stored);
  },
  parent: moveTimeline,
  group: joinGroup,
  place: setPlace,
};

const ROOT_SET: Setters<TimelineTarget> = TIMELINE_SET;

const CHILD_SET: Setters<TimelineTarget> = {
  ...TIMELINE_SET,
  offset: (view, target, value, path, changes) => {
    const { parent, timeline } = target.at;
    if (parent === undefined) throw new Error(`${timeline.id} is a child with a parent`);
    const json = toJson(value, path);
    if (isCommandError(json)) return json;
    const offset = readOnAxis(json, parent.timeline, path);
    if (isCommandError(offset)) return offset;
    const stored = toAxisValue(offset);
    if (sameJson(timeline.offset, stored)) return view;
    const index = target.at.path.at(-1);
    const children = parent.timeline.children.filter((_, item) => item !== index);
    const placed = placeChild(
      { ...parent, timeline: { ...parent.timeline, children } },
      timeline,
      offset,
      path,
    );
    if (isCommandError(placed)) return placed;
    record(changes, path, target.block.id, true);
    return withTimeline(view, target.block, parent, placed);
  },
};

// ---------------------------------------------------------------- entries

/** A reader of an entry member's value, which may read it on its timeline's axis. */
type EntryReader<T> = (
  value: unknown,
  path: readonly PathSegment[],
  target: EntryTarget,
) => T | Problem;

/** A bare value on the axis of the timeline listing the entry. */
const readAxis: EntryReader<AxisValue> = (value, path, target) => {
  const json = toJson(value, path);
  if (isCommandError(json)) return json;
  const read = readOnAxis(json, target.at.timeline, path);
  return isCommandError(read) ? read : toAxisValue(read);
};

/** The member `member` of an entry of kind `kind`, read by `read` and stored as read. */
function entryValue<K extends EntryKind, M extends keyof EntryTypes[K] & string>(
  kind: K,
  member: M,
  read: EntryReader<EntryTypes[K][M]>,
): Setter<EntryTarget> {
  return (view, target, value, path, changes) => {
    if (target.kind !== kind) throw new Error(`a ${kind} setter is given a ${target.kind}`);
    const result = read(value, path, target);
    if (isCommandError(result)) return result;
    const { timeline } = target.at;
    const next = withEntryMember(timeline, kind, target.index, member, result);
    if (next === timeline) return view;
    const stored = entryAt(timeline, kind, target.index)?.[member];
    recordValue(changes, path, target.block.id, true, stored, result);
    return withTimeline(view, target.block, target.at, next);
  };
}

/**
 * The target entry replaced by `object`, read through the schema boundary
 * (`readEntry`) with the timeline listing it, its problem placed in the
 * block's manifest; the view as it is when the entry holds `object` already.
 */
function entryRead(
  view: View,
  target: EntryTarget,
  object: JsonObject,
  path: readonly PathSegment[],
  changes: ChangeSet,
): View | CommandError {
  const { block, at, kind, index } = target;
  const read = readEntry(kind, object, at.timeline, index);
  if (isCommandError(read)) {
    return { ...read, path: [block.id, "manifest", ...at.path, ...read.path] };
  }
  const stored = entryAt(at.timeline, kind, index);
  if (stored === undefined) throw new Error(`${at.timeline.id} lists ${kind} ${index}`);
  if (sameJson(stored, read)) return view;
  recordValue(changes, path, block.id, true, stored, read);
  return withTimeline(view, block, at, withEntryAt(at.timeline, kind, index, read));
}

/**
 * A member whose values only the schema reads (an enumeration, a count):
 * the entry with the value in place is read whole through the schema
 * boundary, as a conversion map is.
 */
function entrySchemaValue(member: string): Setter<EntryTarget> {
  return (view, target, value, path, changes) => {
    const json = toJson(value, path);
    if (isCommandError(json)) return json;
    const stored = entryAt(target.at.timeline, target.kind, target.index);
    const object = readObject({ ...stored, [member]: json }, [target.address]);
    if (isCommandError(object)) return object;
    return entryRead(view, target, object, path, changes);
  };
}

/** The members a break and a jump share. */
function flowSet(kind: "break" | "jump"): Setters<EntryTarget> {
  return {
    control_type: entrySchemaValue("control_type"),
    condition: entrySchemaValue("condition"),
    repeat_count: entrySchemaValue("repeat_count"),
    label: entryValue(kind, "label", readNullableString),
    meta: entryValue(kind, "meta", readObject),
  };
}

const ENTRY_SET: { readonly [kind in EntryTarget["kind"]]: Setters<EntryTarget> } = {
  map: {
    map: (view, target, value, path, changes) => {
      const map = readObject(value, path);
      if (isCommandError(map)) return map;
      if (map.id !== entryAt(target.at.timeline, "map", target.index)?.id) {
        return problem(ErrorCode.idNotSettable, "a conversion map keeps its id", [...path, "id"]);
      }
      return entryRead(view, target, map, path, changes);
    },
  },
  region: {
    name: entryValue("region", "name", readNullableString),
    start: entryValue("region", "start", readAxis),
    end: entryValue("region", "end", readAxis),
    meta: entryValue("region", "meta", readObject),
  },
  break: {
    ...flowSet("break"),
    name: entryValue("break", "name", readNullableString),
    coordinate: entryValue("break", "coordinate", readAxis),
  },
  jump: {
    ...flowSet("jump"),
    from_coordinate: entryValue("jump", "from_coordinate", readAxis),
    to_coordinate: entryValue("jump", "to_coordinate", readAxis),
    target: entryValue("jump", "target", readNullableString),
  },
  marker: {
    name: entryValue("marker", "name", readNullableString),
    coordinate: entryValue("marker", "coordinate", readAxis),
  },
};

// ---------------------------------------------------------------- the table

/** What a `set` may give each kind of target, by property. */
export const SETTABLE: { readonly [kind in TargetKind]: Setters<TargetOfKind[kind]> } = {
  workspace: WORKSPACE_SET,
  block: BLOCK_SET,
  group: GROUP_SET,
  root: ROOT_SET,
  child: CHILD_SET,
  ...ENTRY_SET,
};

/** The setter of `property` for `target`, bound to it. */
function setterOf(
  target: Target,
  property: string,
):
  | ((
      view: View,
      value: unknown,
      path: readonly PathSegment[],
      changes: ChangeSet,
    ) => View | CommandError)
  | undefined {
  const bind = <T extends Target>(setter: Setter<T> | undefined, bound: T) =>
    setter === undefined
      ? undefined
      : (view: View, value: unknown, path: readonly PathSegment[], changes: ChangeSet) =>
          setter(view, bound, value, path, changes);
  switch (target.kind) {
    case "workspace":
      return bind(SETTABLE.workspace[property], target);
    case "block":
      return bind(SETTABLE.block[property], target);
    case "group":
      return bind(SETTABLE.group[property], target);
    case "root":
    case "child":
      return bind(SETTABLE[target.kind][property], target);
    default:
      return bind(SETTABLE[target.kind][property], target);
  }
}

/** Set `property` of the target at `address` to `value`, recording the change in `changes`. */
export function setProperty(
  view: View,
  address: Address,
  property: string,
  value: unknown,
  changes: ChangeSet,
): View | CommandError {
  const target = targetOf(view, address);
  if (isCommandError(target)) return target;
  const path = [address, property];
  if (property === "id") return problem(ErrorCode.idNotSettable, "ids are never settable", path);
  const setter = setterOf(target, property);
  if (setter !== undefined) return setter(view, value, path, changes);
  const kinds = Object.entries(SETTABLE)
    .filter(([, setters]) => Object.hasOwn(setters, property))
    .map(([kind]) => kind);
  return kinds.length > 0
    ? problem(
        ErrorCode.wrongTargetKind,
        `${property} is a property of ${kinds.join(", ")}, not of ${target.kind}`,
        path,
      )
    : problem(ErrorCode.unknownProperty, `${target.kind} has no property ${property}`, path);
}
