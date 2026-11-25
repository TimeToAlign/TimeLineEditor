/**
 * `set`: the one table of what each kind of target lets a command set
 * (`SETTABLE`). A setter reads its value, refuses what its target cannot
 * take, and stores the value; a value equal, as JSON, to the one stored
 * writes nothing and records no change, so a `set` that changes nothing is
 * recognised without comparing views.
 */

import {
  ANCHOR_DISPLAY,
  BELIEFS,
  ELISION_DISPLAY,
  TIMESTAMP_DISPLAY,
} from "@timetoalign/timetoshare";
import type { CommandError, Problem } from "../errors.ts";
import { assertNever, ErrorCode, isCommandError, isLoadError, problem } from "../errors.ts";
import type { Json, JsonObject, PathSegment } from "../json.ts";
import { compareCodePoints, isJsonObject } from "../json.ts";
import { addressKey } from "../manifest/address.ts";
import { isArrangementConflict, rowOf } from "../manifest/arrangement.ts";
import type { CardPlace, ContainerRef, ItemPlace } from "../manifest/containers.ts";
import {
  containersOf,
  ITEM_PLACE_MEMBERS,
  isMember,
  placeAt,
  placedCards,
  placedContainer,
  withPlaceAt,
} from "../manifest/containers.ts";
import type { EntryKind, EntryTypes } from "../manifest/files.ts";
import type { ElementBelief } from "../manifest/flow.ts";
import { withElementBelief } from "../manifest/flow.ts";
import { contentEnd, readOnAxis } from "../manifest/invariants.ts";
import { normalizeManifest, readEntry, readMeasureMap } from "../manifest/io.ts";
import { lockProblem, withPlaceLocks, withSegmentLine } from "../manifest/locks.ts";
import { bandOrderProblem } from "../manifest/order.ts";
import { withoutElements } from "../manifest/remove.ts";
import type {
  AlignmentAnchor,
  AxisValue,
  Elision,
  Manifest,
  NamedMatchStamp,
  NamedTimestamp,
  ProvenanceEntry,
  Region,
  Statements,
  TimelineManifest,
} from "../manifest/types.ts";
import { toAxisValue } from "../number/coordinate.ts";
import { compareReal, realOf } from "../number/real.ts";
import {
  PLACE_READERS,
  readBoolean,
  readFinite,
  readGraphical,
  readIndex,
  readName,
  readNullableString,
  readObject,
  readString,
  toJson,
  unknownMember,
} from "../values.ts";
import type { Address } from "../workspace/address.ts";
import { manifestIds } from "../workspace/address.ts";
import type { Block, BlockId, BlockPlacement } from "../workspace/blocks.ts";
import type { View } from "../workspace/view.ts";
import {
  PLACEMENT_READERS,
  placeMemberProblem,
  readCanvasArrangement,
  readItemArrangement,
} from "../workspace/view.ts";
import { readElisionEnd, readElisionStart, readElisionWidth, stretchProblem } from "./elisions.ts";
import { readAnchors, readMatchClaims, rewrittenMatchStamp } from "./matchstamps.ts";
import type { ChangeSet } from "./mutations.ts";
import {
  entryAt,
  record,
  recordValue,
  replaceTimeline,
  sameJson,
  withBlock,
  withElisions,
  withEntryAt,
  withEntryMember,
  withKey,
  withMatchStamps,
  withTimeline,
  withTimestamps,
} from "./mutations.ts";
import { withSegmentLinesCovered } from "./settle.ts";
import type {
  AnchorTarget,
  BlockTarget,
  ElisionTarget,
  EntryTarget,
  GroupTarget,
  MatchStampTarget,
  MeasureMapTarget,
  Target,
  TargetKind,
  TargetOfKind,
  TimelineTarget,
  TimestampTarget,
  WorkspaceTarget,
} from "./targets.ts";
import { targetOf } from "./targets.ts";
import { readDisplay, readGroupstamp, readTimestampCoordinate } from "./timestamps.ts";
import { lengthProblem, moveTimeline, placeChild, setGroups } from "./topology.ts";
import type { Change } from "./types.ts";

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

const WORKSPACE_SET: Setters<WorkspaceTarget> = {
  /** The workspace's name, the default name of its file: a non-empty string. */
  name: (view, _, value, path, changes) => {
    const name = readName(value, path);
    if (isCommandError(name)) return name;
    if (view.name === name) return view;
    recordValue(changes, path, null, false, view.name, name);
    return { ...view, name };
  },
  /** The workspace's default rules, replaced whole. */
  graphical: (view, _, value, path, changes) => {
    const graphical = readGraphical(value, path);
    if (isCommandError(graphical)) return graphical;
    if (sameJson(view.graphical, graphical)) return view;
    recordValue(changes, path, null, false, view.graphical, graphical);
    return { ...view, graphical };
  },
  /** How the blocks are arranged (`readCanvasArrangement`); `null` for none, which deletes the member. */
  arrangement: (view, _, value, path, changes) => {
    const arrangement = readCanvasArrangement(value, path);
    if (isCommandError(arrangement)) return arrangement;
    const was = view.arrangement ?? null;
    if (sameJson(was, arrangement)) return view;
    recordValue(changes, path, null, false, was, arrangement);
    const { arrangement: _dropped, ...rest } = view;
    return arrangement === null ? rest : { ...rest, arrangement };
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

/** The ids of the roots of `covered`, `withSegmentLinesCovered`'s result for `value`, whose trees gained a segment. */
function coveredRoots(value: Json, covered: unknown): ReadonlySet<unknown> {
  if (covered === value || !isJsonObject(value) || !isJsonObject(covered)) return new Set();
  const { timelines: before } = value;
  const { timelines: after } = covered;
  if (!Array.isArray(before) || !Array.isArray(after)) return new Set();
  return new Set(
    after.flatMap((root, index) => (root !== before[index] && isJsonObject(root) ? [root.id] : [])),
  );
}

/**
 * A whole manifest for block `id`, its segment lines covered
 * (`withSegmentLinesCovered`) and the tree of every line covered given the
 * locks its places decide (`withPlaceLocks`), as `set is_segment_line`
 * gives them; its problems located below `[id, "manifest"]`.
 */
export function readBlockManifest(value: unknown, id: BlockId): Manifest | CommandError {
  const path = [id, "manifest"];
  const json = toJson(value, path);
  if (isCommandError(json)) return json;
  const covered = withSegmentLinesCovered(json);
  const manifest = normalizeManifest(covered);
  if (isLoadError(manifest)) {
    const [first] = manifest.problems;
    if (first === undefined) throw new Error("a refused manifest names its problem");
    return { ...first, path: [...path, ...first.path] };
  }
  const roots = coveredRoots(json, covered);
  if (roots.size === 0) return manifest;
  const member = (timeline: string) => isMember(manifest, timeline);
  const timelines = manifest.timelines.map((root) =>
    roots.has(root.id) ? withPlaceLocks(root, undefined, member) : root,
  );
  return { ...manifest, timelines };
}

// ---------------------------------------------------------------- statements

/** The members of an element that state something about the thing it stands for. */
type DescribingMember = "statements" | "provenance";

/** What an element states: its statements and their provenance, each present only where it is stated. */
interface Described {
  readonly statements?: Statements;
  readonly provenance?: readonly ProvenanceEntry[];
}

/**
 * The statements given to a `set`, as a whole: a JSON object of
 * property–value pairs, or `null`, which states none (`{}`). Their rules are
 * the schema check's of the settled manifest.
 */
function readStatements(value: unknown, path: readonly PathSegment[]): Described | Problem {
  const json = toJson(value, path);
  if (isCommandError(json)) return json;
  if (json === null) return {};
  if (isJsonObject(json)) return { statements: json as Statements };
  return problem(
    ErrorCode.invalidValue,
    "statements is an object of property–value pairs, or null",
    path,
  );
}

/** The provenance given to a `set`, as a whole: a JSON list of annotations, or `null`, which states none (`{}`). */
function readProvenance(value: unknown, path: readonly PathSegment[]): Described | Problem {
  const json = toJson(value, path);
  if (isCommandError(json)) return json;
  if (json === null) return {};
  if (Array.isArray(json)) return { provenance: json as readonly ProvenanceEntry[] };
  return problem(ErrorCode.invalidValue, "provenance is a list of annotations, or null", path);
}

const DESCRIBED_READERS: { readonly [M in DescribingMember]: Reader<Described> } = {
  statements: readStatements,
  provenance: readProvenance,
};

/**
 * What `element` states with `member` replaced by what `given` holds of it,
 * absent where `given` holds none.
 */
function describedWith(element: Described, given: Described, member: DescribingMember): Described {
  const { statements, provenance } =
    member === "statements"
      ? { statements: given.statements, provenance: element.provenance }
      : { statements: element.statements, provenance: given.provenance };
  return {
    ...(statements === undefined ? {} : { statements }),
    ...(provenance === undefined ? {} : { provenance }),
  };
}

/** The manifest's own `member` as a whole, recorded as reaching past its path. */
function manifestDescribed(member: DescribingMember): Setter<BlockTarget> {
  return (view, target, value, path, changes) => {
    const given = DESCRIBED_READERS[member](value, path);
    if (isCommandError(given)) return given;
    const { block } = target;
    const { manifest } = block;
    if (sameJson(manifest[member], given[member])) return view;
    const { statements: _, provenance: __, ...rest } = manifest;
    record(changes, path, block.id, true);
    return withBlock(view, {
      ...block,
      manifest: { ...rest, ...describedWith(manifest, given, member) },
    });
  };
}

/** A timeline's `member` as a whole, at any depth. */
function timelineDescribed(member: DescribingMember): Setter<TimelineTarget> {
  return (view, target, value, path, changes) => {
    const given = DESCRIBED_READERS[member](value, path);
    if (isCommandError(given)) return given;
    const { timeline } = target.at;
    const { statements: _, provenance: __, ...rest } = timeline;
    const next = { ...rest, ...describedWith(timeline, given, member) };
    return timelineChange(view, target, path, changes, timeline[member], next, given[member]);
  };
}

/** A region's `member` as a whole. */
function regionDescribed(member: DescribingMember): Setter<EntryTarget> {
  return (view, target, value, path, changes) => {
    if (target.kind !== "region") throw new Error(`a region setter is given a ${target.kind}`);
    const given = DESCRIBED_READERS[member](value, path);
    if (isCommandError(given)) return given;
    const { block, at, index } = target;
    const region = entryAt(at.timeline, "region", index);
    if (region === undefined) throw new Error(`${at.timeline.id} lists region ${index}`);
    const stored = region[member];
    if (sameJson(stored, given[member])) return view;
    const { statements: _, provenance: __, ...rest } = region;
    const next: Region = { ...rest, ...describedWith(region, given, member) };
    recordValue(changes, path, block.id, true, stored, given[member]);
    return withTimeline(view, block, at, withEntryAt(at.timeline, "region", index, next));
  };
}

const BLOCK_SET: Setters<BlockTarget> = {
  /** The name of the block's manifest, its title; null for none. */
  name: (view, target, value, path, changes) => {
    const name = readNullableString(value, path);
    if (isCommandError(name)) return name;
    const { block } = target;
    const { manifest } = block;
    if (manifest.name === name) return view;
    recordValue(changes, path, block.id, true, manifest.name, name);
    return withBlock(view, { ...block, manifest: { ...manifest, name } });
  },
  /**
   * The statements of the block's manifest, about the thing the bundle
   * stands for, as a whole (`readStatements`). They lie outside every element
   * of the manifest, so the change reaches past its path: an editor of a
   * group or a timeline never makes it.
   */
  statements: manifestDescribed("statements"),
  /** The provenance of the block's manifest's own pairs, as a whole (`readProvenance`), as `statements` is set. */
  provenance: manifestDescribed("provenance"),
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
      return problem(
        ErrorCode.duplicateIndex,
        `block '${sibling.id}' already has that index`,
        path,
      );
    }
    recordValue(changes, path, block.id, false, block.index, index);
    return withBlock(view, { ...block, index });
  },
  scale: blockValue("scale", PLACEMENT_READERS.scale),
  length: blockValue("length", PLACEMENT_READERS.length),
  spacing: blockValue("spacing", PLACEMENT_READERS.spacing),
  margin: blockValue("margin", PLACEMENT_READERS.margin),
  width: blockValue("width", PLACEMENT_READERS.width),
  height: blockValue("height", PLACEMENT_READERS.height),
  /**
   * How the block's items are arranged (`readItemArrangement`); `null` for
   * none, which deletes the member. Side by side, the order stored is the
   * row the rules give from the order given (`rowOf`), and an arrangement
   * the rules refuse is `arrangement_conflict` with the conflict's reason.
   */
  arrangement: (view, target, value, path, changes) => {
    const read = readItemArrangement(value, path);
    if (isCommandError(read)) return read;
    const { block } = target;
    let arrangement = read;
    if (arrangement?.direction === "horizontal") {
      const row = rowOf(block.manifest, arrangement.order);
      if (isArrangementConflict(row)) {
        return problem(ErrorCode.arrangementConflict, row.reason, path);
      }
      arrangement = { direction: "horizontal", order: row.row };
    }
    const was = block.arrangement ?? null;
    if (sameJson(was, arrangement)) return view;
    recordValue(changes, path, block.id, false, was, arrangement);
    const { arrangement: _dropped, ...rest } = block;
    return withBlock(view, arrangement === null ? rest : { ...rest, arrangement });
  },
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

/** The properties of a block target that are its manifest's: its name, its statements and their provenance. */
const MANIFEST_PROPERTIES: readonly string[] = ["name", "statements", "provenance"];

/**
 * The names of a block's own members a `set` may give, in the order a new
 * block's are applied; `name`, `statements` and `provenance` are its
 * manifest's.
 */
export const BLOCK_PROPERTIES: readonly string[] = Object.keys(BLOCK_SET).filter(
  (property) => !MANIFEST_PROPERTIES.includes(property),
);

// ---------------------------------------------------------------- places and orders

/** A target that `places` and `graphical.order` may name: a group, a root or a child timeline. */
type KeyedTarget = GroupTarget | TimelineTarget;

/** The id a group or timeline target carries, the key it has in `graphical.order`. */
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
  margin: nullable(PLACE_READERS.margin),
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
 * The container whose place a `set` of `place` on `target` states: a
 * group's frame, or the one card a timeline is drawn in (an ungrouped
 * root's, or a member's in its group's frame); a refusal for a timeline
 * drawn in no card or in the frames of several groups, whose cards are
 * placed through their groups' `cards`.
 */
function placedOf(target: KeyedTarget, path: readonly PathSegment[]): ContainerRef | CommandError {
  const containers = containersOf(target.block.manifest);
  if (target.kind === "group") {
    const frame = containers.frames.get(target.group.id);
    if (frame === undefined) throw new Error(`group ${target.group.id} draws no frame`);
    return frame;
  }
  const { id } = target.at.timeline;
  const [card, ...others] = placedCards(target.block.manifest, id);
  if (card === undefined) {
    return problem(ErrorCode.notAnItem, `'${id}' is not drawn in a card of its own`, path);
  }
  if (others.length > 0) {
    return problem(ErrorCode.notAnItem, `'${id}' is drawn in the frames of several groups`, path);
  }
  return card;
}

/**
 * Merge `value`, members of a place, into the stated place of `container`
 * in `block`, where its place key puts it in `places`: a value states a
 * member, null unstates it, and a place left without members is no place.
 * Only a frame or a card has a place, and only the members its holder lets
 * it state (`placeMembersOf`): a block-held one its full place, a
 * frame-held card its size, spacing and margin, the length and scale it is drawn
 * with being its group's.
 */
function mergePlace(
  view: View,
  block: Block,
  container: ContainerRef,
  value: unknown,
  path: readonly PathSegment[],
  changes: ChangeSet,
): View | CommandError {
  const { key } = container;
  if (key === null) throw new Error("a frame or a card has a place key");
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
  const stored = placeAt(block.places, key);
  const place = mergedPlace(stored, given);
  if (sameJson(stored, place)) return view;
  recordValue(changes, path, block.id, false, stored, place);
  return withBlock(view, { ...block, places: withPlaceAt(block.places, key, place) });
}

/** The place of a group's frame or of a timeline's one card (`placedOf`), merged (`mergePlace`). */
const setPlace: Setter<KeyedTarget> = (view, target, value, path, changes) => {
  const container = placedOf(target, path);
  if (isCommandError(container)) return container;
  return mergePlace(view, target.block, container, value, path, changes);
};

/**
 * The places of the cards of a group's members, in its frame
 * (`places[G].cards[T]`): an object of at least one member's card place by
 * member ID, each merged as `place` merges a card's (`mergePlace`), so a
 * timeline that several groups have as a member has each of its cards
 * placed through its group. An ID that is no member of the group is
 * `unknown_place`.
 */
const setCards: Setter<GroupTarget> = (view, target, value, path, changes) => {
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const members = Object.keys(object);
  if (members.length === 0) {
    return problem(ErrorCode.invalidValue, "cards states at least one card's place", path);
  }
  const { group } = target;
  let current = view;
  for (const member of members) {
    const at = [...path, member];
    const card = placedContainer(target.block.manifest, { item: group.id, member });
    if (card === undefined) {
      return problem(ErrorCode.unknownPlace, `'${member}' is no member of group '${group.id}'`, at);
    }
    const block = current.blocks[target.block.id];
    if (block === undefined) throw new Error(`block ${target.block.id} holds the group`);
    const next = mergePlace(current, block, card, object[member], at, changes);
    if (isCommandError(next)) return next;
    current = next;
  }
  return current;
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
  /** The group's name; null for none. */
  name: (view, target, value, path, changes) => {
    const name = readNullableString(value, path);
    if (isCommandError(name)) return name;
    const { block, group } = target;
    if (group.name === name) return view;
    const { manifest } = block;
    const groups = manifest.groups.map((item) => (item === group ? { ...group, name } : item));
    recordValue(changes, path, block.id, true, group.name, name);
    return withBlock(view, { ...block, manifest: { ...manifest, groups } });
  },
  /** The group's display order; null deletes its entry. */
  order: (view, target, value, path, changes) => {
    const { id, members } = target.group;
    if (value === null) return withOrder(view, target, null, path, changes);
    const listsMembers =
      isStrings(value) &&
      value.length === members.length &&
      members.every((member) => value.includes(member));
    if (!listsMembers) {
      return problem(ErrorCode.invalidOrder, `order must list every member of '${id}' once`, path);
    }
    return withOrder(view, target, value, path, changes);
  },
  place: setPlace,
  cards: setCards,
};

// ---------------------------------------------------------------- measure maps

/**
 * A member of a measure map (`name`, `meta`, `rows`): the measure map with
 * the value in place is read whole through the schema boundary
 * (`readMeasureMap`), its problem placed in the block's manifest.
 */
function measureMapMember(member: string): Setter<MeasureMapTarget> {
  return (view, target, value, path, changes) => {
    const json = toJson(value, path);
    if (isCommandError(json)) return json;
    const { block, map, index, address } = target;
    const object = readObject({ ...map, [member]: json }, [addressKey(address)]);
    if (isCommandError(object)) return object;
    const read = readMeasureMap(object);
    if (isCommandError(read)) {
      return { ...read, path: [block.id, "manifest", "measure_maps", index, ...read.path] };
    }
    if (sameJson(map, read)) return view;
    recordValue(changes, path, block.id, true, map, read);
    const { manifest } = block;
    const measure_maps = manifest.measure_maps.map((item, at) => (at === index ? read : item));
    return withBlock(view, { ...block, manifest: { ...manifest, measure_maps } });
  };
}

const MEASURE_MAP_SET: Setters<MeasureMapTarget> = {
  name: measureMapMember("name"),
  meta: measureMapMember("meta"),
  rows: measureMapMember("rows"),
};

// ---------------------------------------------------------------- timelines

/**
 * The view with the target timeline replaced by `next`, unless the member it
 * sets holds what is stored. Where the replacement changed more than the
 * timeline (the named timestamps at its end followed a new length,
 * `replaceTimeline`), the change reaches past its path.
 */
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
  const { block, at } = target;
  const manifest = replaceTimeline(block.manifest, at, next);
  if (manifest.graphical === block.manifest.graphical) {
    recordValue(changes, path, block.id, true, stored, value);
  } else {
    record(changes, path, block.id, true);
  }
  return withBlock(view, { ...block, manifest });
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
  /** What the timeline states about the thing it is the axis of, as a whole. */
  statements: timelineDescribed("statements"),
  /** The provenance of the timeline's pairs, as a whole. */
  provenance: timelineDescribed("provenance"),
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
  /**
   * Whether the timeline is a segment line: its children become its
   * segments, or plain children again; it and its subtree take the locks
   * their places decide (`withSegmentLine`: turned off, the lock its place
   * gave it as a segment line is lifted), and a line holding no segment is
   * given its first when the command settles (`withSegmentLinesCovered`).
   */
  is_segment_line: (view, target, value, path, changes) => {
    const line = readBoolean(value, path);
    if (isCommandError(line)) return line;
    const { block, at } = target;
    if (at.timeline.is_segment_line === line) return view;
    const member = (id: string) => isMember(block.manifest, id);
    const next = withSegmentLine(at.timeline, line, at.parent?.timeline, member);
    record(changes, path, block.id, true);
    return withTimeline(view, block, at, next);
  },
  length: (view, target, value, path, changes) => {
    const { timeline } = target.at;
    if (timeline.locked) {
      return problem(ErrorCode.locked, `timeline '${timeline.id}' is locked`, path);
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
    const { block, at } = target;
    const refused = lengthProblem(block.manifest, at, length, path);
    if (refused !== undefined) return refused;
    const stored = toAxisValue(length);
    const next = { ...timeline, length: stored };
    return timelineChange(view, target, path, changes, timeline.length, next, stored);
  },
  parent: moveTimeline,
  groups: setGroups,
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
      target.block.manifest,
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
  const read = readEntry(kind, object, at, index, block.manifest);
  if (isCommandError(read)) {
    return { ...read, path: [block.id, "manifest", ...at.path, ...read.path] };
  }
  const stored = entryAt(at.timeline, kind, index);
  if (stored === undefined) throw new Error(`${at.timeline.id} lists ${kind} ${index}`);
  if (sameJson(stored, read)) return view;
  recordValue(changes, path, block.id, true, stored, read);
  return withTimeline(view, block, at, withEntryAt(at.timeline, kind, index, read));
}

/** A reader of each member of the belief a `set` records in a flow-control element. */
const BELIEF_READERS: Readers<ElementBelief> = {
  actor: (value, path) =>
    typeof value === "string" && value !== ""
      ? value
      : problem(ErrorCode.invalidValue, "an actor is a non-empty string", path),
  belief: (value, path) =>
    BELIEFS.find((word) => word === value) ??
    problem(
      ErrorCode.invalidValue,
      `expected a belief (${BELIEFS.map((word) => `"${word}"`).join(", ")})`,
      path,
    ),
  date: readString,
};

/**
 * An actor's belief recorded in a flow-control element: the one way a
 * command changes the element's `provenance`. The value is `{actor, belief,
 * date}`, all three; the stored provenance takes it as `withElementBelief`
 * says (the actor's earlier belief replaced, every entry's paradata and
 * every other actor's belief kept), and the element is then read whole
 * through the schema boundary. So no command removes an entry, its paradata
 * or another actor's belief, and an element is believed again only by a
 * belief of the actor who rejected it.
 */
const elementBelief: Setter<EntryTarget> = (view, target, value, path, changes) => {
  const read = readMembers<ElementBelief>(value, path, BELIEF_READERS);
  if (isCommandError(read)) return read;
  const { actor, belief, date } = read;
  if (actor === undefined || belief === undefined || date === undefined) {
    return problem(ErrorCode.invalidValue, "a belief is an actor, a belief and a date", path);
  }
  const stored = entryAt(target.at.timeline, "flow_control", target.index);
  if (stored === undefined) throw new Error(`a belief is recorded in a ${target.kind}`);
  const provenance = withElementBelief(stored.provenance, target.block.manifest["@context"], {
    actor,
    belief,
    date,
  });
  const object = readObject({ ...stored, provenance }, [addressKey(target.address)]);
  if (isCommandError(object)) return object;
  return entryRead(view, target, object, path, changes);
};

/** The whole entry of kind `kind`, replaced by the value, which keeps the entry's id. */
function entryWhole(kind: EntryKind, what: string): Setter<EntryTarget> {
  return (view, target, value, path, changes) => {
    const object = readObject(value, path);
    if (isCommandError(object)) return object;
    if (object.id !== entryAt(target.at.timeline, kind, target.index)?.id) {
      return problem(ErrorCode.idNotSettable, `${what} keeps its id`, [...path, "id"]);
    }
    return entryRead(view, target, object, path, changes);
  };
}

const ENTRY_SET: { readonly [kind in EntryTarget["kind"]]: Setters<EntryTarget> } = {
  map: {
    name: entryValue("map", "name", readNullableString),
    map: entryWhole("map", "a conversion map"),
  },
  region: {
    name: entryValue("region", "name", readNullableString),
    start: entryValue("region", "start", readAxis),
    end: entryValue("region", "end", readAxis),
    meta: entryValue("region", "meta", readObject),
    statements: regionDescribed("statements"),
    provenance: regionDescribed("provenance"),
  },
  // A flow-control element is never changed in place: its role, its coordinate and what decides
  // the flow stay as they were added. It is renamed, and rejected by a belief `false`; its
  // `provenance` is no property a `set` gives, so no command erases it.
  flow_control: {
    name: entryValue("flow_control", "name", readNullableString),
    label: entryValue("flow_control", "label", readNullableString),
    belief: elementBelief,
  },
};

// ---------------------------------------------------------------- named timestamps

/**
 * The view with the target timestamp replaced by `next`, unless the member
 * it sets holds what is stored (`stored`, `value`).
 */
function timestampChange(
  view: View,
  target: TimestampTarget,
  path: readonly PathSegment[],
  changes: ChangeSet,
  stored: unknown,
  value: unknown,
  next: NamedTimestamp,
): View {
  if (sameJson(stored, value)) return view;
  const { block, index } = target;
  const { manifest } = block;
  recordValue(changes, path, block.id, true, stored, value);
  const timestamps = (manifest.graphical?.timestamps ?? []).map((item, at) =>
    at === index ? next : item,
  );
  return withBlock(view, { ...block, manifest: withTimestamps(manifest, timestamps) });
}

const TIMESTAMP_SET: Setters<TimestampTarget> = {
  /**
   * The timestamp's name, which its label shows: a non-empty string; `null`
   * deletes the name of a match timestamp, the one kind a name is optional
   * for, and is refused for an ordinary timestamp like any other non-name.
   */
  name: (view, target, value, path, changes) => {
    const { timestamp } = target;
    const name = value === null && timestamp.matchstamp ? null : readName(value, path);
    if (isCommandError(name)) return name;
    const { name: _, ...unnamed } = timestamp;
    const next = name === null ? unnamed : { ...timestamp, name };
    return timestampChange(view, target, path, changes, timestamp.name ?? null, name, next);
  },
  /** Where the timestamp lies on its timeline's own axis (`readTimestampCoordinate`). */
  coordinate: (view, target, value, path, changes) => {
    const coordinate = readTimestampCoordinate(value, target.at.timeline, path);
    if (isCommandError(coordinate)) return coordinate;
    const { timestamp } = target;
    return timestampChange(view, target, path, changes, timestamp.coordinate, coordinate, {
      ...timestamp,
      coordinate,
    });
  },
  /** What of the timestamp is drawn (`readDisplay` over `TIMESTAMP_DISPLAY`): stored in canonical order. */
  display: (view, target, value, path, changes) => {
    const display = readDisplay(value, TIMESTAMP_DISPLAY, path);
    if (isCommandError(display)) return display;
    const { timestamp } = target;
    return timestampChange(view, target, path, changes, timestamp.display, display, {
      ...timestamp,
      display,
    });
  } /**
   * Whether the timestamp is a groupstamp (`readGroupstamp`): `true` only on
   * a group member, a match timestamp included; its line then extends
   * across every member of each group having its timeline as a member.
   */,
  groupstamp: (view, target, value, path, changes) => {
    const { block, timestamp } = target;
    const groupstamp = readGroupstamp(value, block.manifest, timestamp.timeline, path);
    if (isCommandError(groupstamp)) return groupstamp;
    return timestampChange(view, target, path, changes, timestamp.groupstamp, groupstamp, {
      ...timestamp,
      groupstamp,
    });
  },
};

// ---------------------------------------------------------------- elisions

/**
 * The view with the target elision replaced by `next`, unless the member it
 * sets holds what is stored (`stored`, `value`).
 */
function elisionChange(
  view: View,
  target: ElisionTarget,
  path: readonly PathSegment[],
  changes: ChangeSet,
  stored: unknown,
  value: unknown,
  next: Elision,
): View {
  if (sameJson(stored, value)) return view;
  const { block, index } = target;
  const { manifest } = block;
  recordValue(changes, path, block.id, true, stored, value);
  const elisions = (manifest.graphical?.elisions ?? []).map((item, at) =>
    at === index ? next : item,
  );
  return withBlock(view, { ...block, manifest: withElisions(manifest, elisions) });
}

const ELISION_SET: Setters<ElisionTarget> = {
  /**
   * The elision's name, which its name label shows: a non-empty string;
   * `null` deletes it, so that the label shows the name of the timeline it
   * lies on.
   */
  name: (view, target, value, path, changes) => {
    const name = value === null ? null : readName(value, path);
    if (isCommandError(name)) return name;
    const { elision } = target;
    const { name: stored = null, ...unnamed } = elision;
    const next = name === null ? unnamed : { ...elision, name };
    return elisionChange(view, target, path, changes, stored, name, next);
  },
  /**
   * Where the elided stretch starts on its timeline's own axis, at or after 0
   * (`readElisionStart`); that it lies before the end is checked once the
   * change is made (`elisionProblem`).
   */
  start: (view, target, value, path, changes) => {
    const { at, elision } = target;
    const start = readElisionStart(value, at.timeline, elision.id, path);
    if (isCommandError(start)) return start;
    return elisionChange(view, target, path, changes, elision.start, start, {
      ...elision,
      start,
    });
  },
  /** Where it ends, at or before a known length of its timeline (`readElisionEnd`). */
  end: (view, target, value, path, changes) => {
    const { at, elision } = target;
    const end = readElisionEnd(value, at.timeline, elision.id, path);
    if (isCommandError(end)) return end;
    return elisionChange(view, target, path, changes, elision.end, end, { ...elision, end });
  },
  /**
   * How wide its gap is drawn: one of the three forms (`readElisionWidth`),
   * or `null`, which deletes the width so that the gap takes the standard
   * width.
   */
  width: (view, target, value, path, changes) => {
    const { at, elision } = target;
    const { width: stored = null, ...unsized } = elision;
    if (value === null) {
      return elisionChange(view, target, path, changes, stored, null, unsized);
    }
    const width = readElisionWidth(value, at.timeline, path);
    if (isCommandError(width)) return width;
    return elisionChange(view, target, path, changes, stored, width, { ...elision, width });
  },
  /** What of the elision is drawn (`readDisplay` over `ELISION_DISPLAY`): stored in canonical order. */
  display: (view, target, value, path, changes) => {
    const display = readDisplay(value, ELISION_DISPLAY, path);
    if (isCommandError(display)) return display;
    const { elision } = target;
    return elisionChange(view, target, path, changes, elision.display, display, {
      ...elision,
      display,
    });
  },
};

/**
 * Why one change of a `set`, its values all set, leaves its target refused,
 * if it does: an elision whose end does not lie after its start
 * (`stretchProblem`), at the change's `end` where it gives one, else at its
 * `start`. Checked once per change, so that one change may move both ends
 * of an elision past the other's old value.
 */
export function changeProblem(view: View, change: Change): CommandError | undefined {
  const { target: address, values } = change;
  const end = Object.hasOwn(values, "end");
  if (!end && !Object.hasOwn(values, "start")) return undefined;
  const target = targetOf(view, address);
  if (isCommandError(target) || target.kind !== "elision") return undefined;
  const path = [addressKey(address), end ? "end" : "start"];
  return stretchProblem(target.elision, target.at.timeline, path);
}

// ---------------------------------------------------------------- named MatchStamps

/**
 * The view with the named MatchStamp at `index` of `block`'s manifest
 * replaced by `next`, its named timestamps by `timestamps` where given, and
 * the match timestamps no MatchStamp names any more removed
 * (`withoutElements`).
 */
function withMatchStampAt(
  view: View,
  block: Block,
  index: number,
  next: NamedMatchStamp,
  timestamps?: readonly NamedTimestamp[],
): View {
  const { manifest } = block;
  const matchstamps = (manifest.graphical?.matchstamps ?? []).map((item, at) =>
    at === index ? next : item,
  );
  const kept = timestamps ?? manifest.graphical?.timestamps ?? [];
  const placed = withoutElements(withMatchStamps(manifest, kept, matchstamps), []);
  return withBlock(view, { ...block, manifest: placed });
}

/** A MatchStamp's anchors by ID, for comparing them whatever their order. */
const anchorsById = (anchors: readonly AlignmentAnchor[]): AlignmentAnchor[] =>
  [...anchors].sort((left, right) => compareCodePoints(left.id, right.id));

const MATCHSTAMP_SET: Setters<MatchStampTarget> = {
  /** The MatchStamp's name, which its anchors showing `name` draw: a non-empty string. */
  name: (view, target, value, path, changes) => {
    const name = readName(value, path);
    if (isCommandError(name)) return name;
    const { block, index, matchstamp } = target;
    if (sameJson(matchstamp.name, name)) return view;
    recordValue(changes, path, block.id, true, matchstamp.name, name);
    return withMatchStampAt(view, block, index, { ...matchstamp, name });
  },
  /**
   * Its alignment anchors, rewritten from pairs of coordinates in screen
   * order (`readAnchors`, `rewrittenMatchStamp`): what an Update gives from
   * the current potential MatchStamp. The match timestamps the new anchors
   * need are created or reused; those no MatchStamp names any more go. The
   * same anchors in any order change nothing.
   */
  anchors: (view, target, value, path, changes) => {
    const { block, index, matchstamp } = target;
    const { manifest } = block;
    const anchors = readAnchors(value, manifest, path);
    if (isCommandError(anchors)) return anchors;
    const taken = manifestIds(manifest);
    const rewritten = rewrittenMatchStamp(manifest, taken, matchstamp, anchors);
    const before = anchorsById(matchstamp.alignment_anchors);
    if (sameJson(before, anchorsById(rewritten.matchstamp.alignment_anchors))) return view;
    record(changes, path, block.id, true);
    return withMatchStampAt(view, block, index, rewritten.matchstamp, rewritten.timestamps);
  },
  /** The IDs of the MatchClaims behind it (`readMatchClaims`), in the order given. */
  match_claims: (view, target, value, path, changes) => {
    const claims = readMatchClaims(value, path);
    if (isCommandError(claims)) return claims;
    const { block, index, matchstamp } = target;
    if (sameJson(matchstamp.match_claims, claims)) return view;
    recordValue(changes, path, block.id, true, matchstamp.match_claims, claims);
    return withMatchStampAt(view, block, index, { ...matchstamp, match_claims: claims });
  },
};

const ANCHOR_SET: Setters<AnchorTarget> = {
  /** What of the anchor is drawn (`readDisplay` over `ANCHOR_DISPLAY`): stored in canonical order. */
  display: (view, target, value, path, changes) => {
    const display = readDisplay(value, ANCHOR_DISPLAY, path);
    if (isCommandError(display)) return display;
    const { block, index, matchstamp, position, anchor } = target;
    if (sameJson(anchor.display, display)) return view;
    recordValue(changes, path, block.id, true, anchor.display, display);
    const anchors = matchstamp.alignment_anchors.map((item, at) =>
      at === position ? { ...anchor, display } : item,
    );
    const [first, ...more] = anchors;
    if (first === undefined) throw new Error("a MatchStamp holds its anchor");
    return withMatchStampAt(view, block, index, {
      ...matchstamp,
      alignment_anchors: [first, ...more],
    });
  },
};

// ---------------------------------------------------------------- the table

/** What a `set` may give each kind of target, by property. */
export const SETTABLE: { readonly [kind in TargetKind]: Setters<TargetOfKind[kind]> } = {
  workspace: WORKSPACE_SET,
  block: BLOCK_SET,
  group: GROUP_SET,
  measure_map: MEASURE_MAP_SET,
  root: ROOT_SET,
  child: CHILD_SET,
  ...ENTRY_SET,
  timestamp: TIMESTAMP_SET,
  elision: ELISION_SET,
  matchstamp: MATCHSTAMP_SET,
  anchor: ANCHOR_SET,
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
    case "measure_map":
      return bind(SETTABLE.measure_map[property], target);
    case "root":
    case "child":
      return bind(SETTABLE[target.kind][property], target);
    case "timestamp":
      return bind(SETTABLE.timestamp[property], target);
    case "elision":
      return bind(SETTABLE.elision[property], target);
    case "matchstamp":
      return bind(SETTABLE.matchstamp[property], target);
    case "anchor":
      return bind(SETTABLE.anchor[property], target);
    case "map":
    case "region":
    case "flow_control":
      return bind(SETTABLE[target.kind][property], target);
    default:
      return assertNever(target);
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
  const path = [addressKey(address), property];
  if (property === "id") return problem(ErrorCode.idNotSettable, "ids are never settable", path);
  const setter = setterOf(target, property);
  if (setter !== undefined) {
    const recorded = changes.paths.length;
    const result = setter(view, value, path, changes);
    if (changes.paths.length > recorded) changes.targets.push(address);
    return result;
  }
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
