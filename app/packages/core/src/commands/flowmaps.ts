/**
 * Commands over FlowMaps and virtual timelines. A FlowMap is added into the
 * root timeline it orders (`add {into: <root>, flow_map}`), its `chunks` and
 * `name` set on its address, and removed there; a virtual timeline is added
 * into a block (`add {into: <block>, virtual_timeline}`), its `name`, its
 * groups and its card's place set on its address, and removed there. Each
 * value is read where it will lie, the whole manifest checked by the schema
 * and the TimeToShare validators (`readInPlace`), so a chunk naming the root
 * itself or nothing of its tree is refused as the validators refuse it. A
 * FlowMap computed from the flow control of its timeline (a `convention`
 * and a provenance entry of method `inferred`) is read only:
 * `computed_flow_map`. The IDs a value leaves out are given by the
 * command's `ids` (`ChangeSet.ids`): a FlowMap's of prefix `flow`, a
 * virtual timeline's of the prefix of its unit's timeline class.
 */

import { numberTypeOf } from "@timetoalign/timetoshare";
import type { CommandError, Problem } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import { compareCodePoints } from "../json.ts";
import { addressKey } from "../manifest/address.ts";
import { isUnit, timelineClass } from "../manifest/elements.ts";
import { FlowMapError, resolveFlowMap } from "../manifest/flowmaps.ts";
import { readOnAxis } from "../manifest/invariants.ts";
import { readInPlace } from "../manifest/io.ts";
import { findTimeline } from "../manifest/tree.ts";
import type { FlowMap, Manifest, VirtualTimeline } from "../manifest/types.ts";
import { resolveVirtualTimeline } from "../manifest/virtual.ts";
import { compileMap } from "../maps/compile.ts";
import type { Coordinate } from "../number/coordinate.ts";
import { toAxisValue } from "../number/coordinate.ts";
import { prettyText } from "../number/display.ts";
import { toRational } from "../number/real.ts";
import { readNullableString, readObject, toJson, unknownMember } from "../values.ts";
import { manifestIds } from "../workspace/address.ts";
import type { Block } from "../workspace/blocks.ts";
import { TIMELINE_PREFIX } from "../workspace/ids.ts";
import type { View } from "../workspace/view.ts";
import type { ChangeSet } from "./mutations.ts";
import { record, recordValue, sameJson, withBlock } from "./mutations.ts";
import type { BlockTarget, FlowMapTarget, TimelineTarget } from "./targets.ts";

/** The prefix of a FlowMap's ID. */
export const FLOW_MAP_PREFIX = "flow";

/** The members a FlowMap `add` may be given. */
const FLOW_MAP_VALUE = [
  "id",
  "timeline",
  "chunks",
  "name",
  "canonical",
  "convention",
  "provenance",
];

/** The members a virtual timeline `add` may be given: its unit, number type and length are computed. */
const VIRTUAL_VALUE = ["id", "map", "timeline", "name", "through", "length"];

/** The two lists of a manifest a command here writes. */
type Listed = "flow_maps" | "virtual_timelines";

/** `duplicate_id` for `id`, an ID the manifest holds, given again at `path`. */
function duplicated(id: string, path: readonly PathSegment[]): CommandError {
  return problem(ErrorCode.duplicateId, `'${id}' is already an ID of the manifest`, path);
}

/**
 * An entry of `list` read where it will lie in `manifest`: in place of the
 * entry at `replaced`, or appended, the whole manifest completed, ordered
 * and checked (`readInPlace`). The entry in its complete form, or the first
 * problem: below `at` where it lies in the entry (the list is ordered by
 * ID, so the entry lies where its ID orders it), else at `[<block id>,
 * "manifest", …]`.
 */
function readListed<L extends Listed>(
  block: Block,
  list: L,
  entry: JsonObject,
  replaced: number | null,
  at: readonly PathSegment[],
): NonNullable<Manifest[L]>[number] | CommandError {
  const { manifest } = block;
  const items: unknown[] = [...(manifest[list] ?? [])];
  if (replaced === null) items.push(entry);
  else items[replaced] = entry;
  const read = readInPlace({ ...manifest, [list]: items });
  const id = entry.id;
  if (typeof id !== "string") throw new Error("a listed entry carries its ID");
  if ("code" in read) {
    const others = (manifest[list] ?? []).filter((_, index) => index !== replaced);
    const index = others.filter((item) => compareCodePoints(item.id, id) < 0).length;
    const [member, place, ...below] = read.path;
    const inside = member === list && place === index;
    return { ...read, path: inside ? [...at, ...below] : [block.id, "manifest", ...read.path] };
  }
  const found = (read[list] ?? []).find((item: { readonly id: string }) => item.id === id);
  if (found === undefined) throw new Error(`the manifest lists ${list} entry ${id}`);
  return found;
}

/** `block` with `list` of its manifest replaced by `items`. */
function withListed<L extends Listed>(
  view: View,
  block: Block,
  list: L,
  items: NonNullable<Manifest[L]>,
): View {
  return withBlock(view, { ...block, manifest: { ...block.manifest, [list]: items } });
}

/**
 * The ID a value carries, or the next of the command's `ids` for `prefix`
 * where it carries none; `invalid_value` for an ID that is no string,
 * `duplicate_id` for one the manifest holds.
 */
function newId(
  object: JsonObject,
  manifest: Manifest,
  prefix: () => string,
  changes: ChangeSet,
  path: readonly PathSegment[],
): string | CommandError {
  const id = object.id === undefined ? changes.ids.take(prefix()) : object.id;
  if (typeof id !== "string") return problem(ErrorCode.invalidValue, "an ID is a string", path);
  return manifestIds(manifest).has(id) ? duplicated(id, [...path, "id"]) : id;
}

/** The value of `kind` given to `add` at `path`, read as an object of `members`, each required one present. */
function readValue(
  value: unknown,
  path: readonly PathSegment[],
  members: readonly string[],
  required: readonly string[],
  what: string,
): JsonObject | CommandError {
  const object = readObject(value, path);
  if (isCommandError(object)) return object;
  const extra = unknownMember(object, members, path, ErrorCode.unknownProperty);
  if (extra !== undefined) return extra;
  for (const member of required) {
    if (!Object.hasOwn(object, member)) {
      return problem(ErrorCode.invalidValue, `a new ${what} needs ${member}`, [...path, member]);
    }
  }
  return object;
}

/**
 * Add a FlowMap into the root timeline it orders: `{id?, timeline?, chunks,
 * name?, canonical?, convention?, provenance?}`, its `timeline` that root
 * (`invalid_value` for another), its ID the one given or the next of the
 * command's `ids`, read where it will lie (`readListed`); a problem lies at
 * `[<address key of into>, "flow_map", …]`.
 */
export function addFlowMap(
  view: View,
  target: TimelineTarget,
  value: unknown,
  changes: ChangeSet,
): View | CommandError {
  const path = [addressKey(target.address), "flow_map"];
  const object = readValue(value, path, FLOW_MAP_VALUE, ["chunks"], "FlowMap");
  if (isCommandError(object)) return object;
  const { block, at } = target;
  const root = at.timeline.id;
  if (object.timeline !== undefined && object.timeline !== root) {
    return problem(
      ErrorCode.invalidValue,
      `a FlowMap added into '${root}' orders '${root}', not ${JSON.stringify(object.timeline)}`,
      [...path, "timeline"],
    );
  }
  const id = newId(object, block.manifest, () => FLOW_MAP_PREFIX, changes, path);
  if (isCommandError(id)) return id;
  const flowMap = readListed(block, "flow_maps", { ...object, id, timeline: root }, null, path);
  if (isCommandError(flowMap)) return flowMap;
  record(changes, path, block.id, true);
  return withListed(view, block, "flow_maps", [...(block.manifest.flow_maps ?? []), flowMap]);
}

/**
 * Whether a FlowMap is computed from the flow control of its timeline: it
 * states the `convention` it follows and a provenance entry of method
 * `inferred`.
 */
export function isComputedFlowMap(flowMap: FlowMap): boolean {
  return (
    flowMap.convention !== undefined &&
    (flowMap.provenance ?? []).some((entry) => entry.method === "inferred")
  );
}

/** `computed_flow_map` at `path` for a `set` on a computed FlowMap, else `undefined`. */
function computedProblem(target: FlowMapTarget, path: readonly PathSegment[]) {
  const { flowMap } = target;
  if (!isComputedFlowMap(flowMap)) return undefined;
  return problem(
    ErrorCode.computedFlowMap,
    `FlowMap '${flowMap.name ?? flowMap.id}' is computed from the flow control of '${flowMap.timeline}' and is read only`,
    path,
  );
}

/** A FlowMap's member set to `next`, read where it lies (`readListed`), unless it holds `next` already. */
function flowMapChange(
  view: View,
  target: FlowMapTarget,
  member: "chunks" | "name",
  next: unknown,
  path: readonly PathSegment[],
  changes: ChangeSet,
): View | CommandError {
  const refused = computedProblem(target, path);
  if (refused !== undefined) return refused;
  const { block, index, flowMap } = target;
  const stored = flowMap[member];
  if (sameJson(stored, next)) return view;
  const entry = { ...flowMap, [member]: next } as JsonObject;
  const read = readListed(block, "flow_maps", entry, index, path.slice(0, 1));
  if (isCommandError(read)) return read;
  recordValue(changes, path, block.id, true, stored, next);
  const items = (block.manifest.flow_maps ?? []).map((item, at) => (at === index ? read : item));
  return withListed(view, block, "flow_maps", items);
}

/**
 * What a `set` gives a FlowMap: its `chunks`, the whole list, and its
 * `name` (null for none). A computed FlowMap refuses both.
 */
export const FLOW_MAP_SET = {
  chunks: (
    view: View,
    target: FlowMapTarget,
    value: unknown,
    path: readonly PathSegment[],
    changes: ChangeSet,
  ): View | CommandError => {
    const json = toJson(value, path);
    if (isCommandError(json)) return json;
    return flowMapChange(view, target, "chunks", json, path, changes);
  },
  name: (
    view: View,
    target: FlowMapTarget,
    value: unknown,
    path: readonly PathSegment[],
    changes: ChangeSet,
  ): View | CommandError => {
    const name = readNullableString(value, path);
    if (isCommandError(name)) return name;
    return flowMapChange(view, target, "name", name, path, changes);
  },
};

/** The unit and number type of a timeline or virtual timeline of `manifest`, if `id` names one. */
function axisOf(
  manifest: Manifest,
  id: string,
): Pick<VirtualTimeline, "unit" | "number_type"> | undefined {
  const timeline = findTimeline(manifest, id);
  if (timeline !== undefined) return { unit: timeline.unit, number_type: timeline.number_type };
  const virtual = (manifest.virtual_timelines ?? []).find((item) => item.id === id);
  return virtual === undefined
    ? undefined
    : { unit: virtual.unit, number_type: virtual.number_type };
}

/** A virtual timeline's axis as core computes it: its unit, number type and length. */
interface ComputedAxis {
  readonly unit: VirtualTimeline["unit"];
  readonly number_type: VirtualTimeline["number_type"];
  readonly length: Coordinate | null;
}

/** A `FlowMapError` as a refusal at `path`: `unit_mismatch`, else `invalid_value`. */
function flowMapProblem(error: FlowMapError, path: readonly PathSegment[]): Problem {
  const code = error.code === "unit_mismatch" ? ErrorCode.unitMismatch : ErrorCode.invalidValue;
  return problem(code, error.message, path);
}

/**
 * The axis of a new virtual timeline `{id, map, timeline, through?}` in
 * `manifest`: through a FlowMap, its root's unit and number type and the
 * FlowMap's played length (`resolveFlowMap`); through a conversion map
 * core evaluates, the map's target unit, that unit's default number type
 * and the map's value at the end of the timeline holding it
 * (`resolveVirtualTimeline`); with `through`, which core does not evaluate,
 * the unit and number type of `timeline` and no length, which the value
 * states. A map naming neither is `invalid_value` at `map`.
 */
function computedAxis(
  manifest: Manifest,
  object: JsonObject & { readonly id: string; readonly map: string; readonly timeline: string },
  path: readonly PathSegment[],
): ComputedAxis | CommandError {
  const { map, timeline, through } = object;
  if (through !== undefined) {
    const axis = axisOf(manifest, timeline);
    if (axis === undefined) {
      return problem(
        ErrorCode.invalidValue,
        `'${timeline}' names no timeline and no virtual timeline of this manifest`,
        [...path, "timeline"],
      );
    }
    return { ...axis, length: null };
  }
  try {
    if ((manifest.flow_maps ?? []).some((item) => item.id === map)) {
      const flow = resolveFlowMap(manifest, map);
      return { unit: flow.unit, number_type: flow.numberType, length: flow.length };
    }
    const held = conversionMap(manifest, map);
    const unit = held === undefined ? null : compileMap(held).targetUnit;
    if (unit === null || !isUnit(unit)) {
      return problem(
        ErrorCode.invalidValue,
        `'${map}' names no FlowMap and no conversion map core evaluates onto a unit`,
        [...path, "map"],
      );
    }
    const number_type = numberTypeOf({ unit });
    const probe = {
      ...manifest,
      virtual_timelines: [
        ...(manifest.virtual_timelines ?? []),
        { id: object.id, map, timeline, unit, number_type, length: 0, name: null },
      ],
    };
    const resolved = resolveVirtualTimeline(probe, object.id);
    return { unit, number_type, length: resolved.length };
  } catch (error) {
    if (error instanceof FlowMapError) return flowMapProblem(error, [...path, "map"]);
    throw error;
  }
}

/** The conversion map `id` among the top-level maps of every timeline of `manifest`. */
function conversionMap(manifest: Manifest, id: string) {
  const pending = [...manifest.timelines];
  for (let timeline = pending.pop(); timeline !== undefined; timeline = pending.pop()) {
    const map = timeline.conversion_maps.find((item) => item.id === id);
    if (map !== undefined) return map;
    pending.push(...timeline.children);
  }
  return undefined;
}

/**
 * The length a new virtual timeline is written with: the computed one, a
 * given `length` refused (`invalid_value`) where it is not exactly that;
 * with `through`, the given one, which is then required.
 */
function lengthOf(
  axis: ComputedAxis,
  given: unknown,
  through: unknown,
  path: readonly PathSegment[],
): Coordinate | CommandError {
  const at = [...path, "length"];
  if (axis.length === null) {
    if (given === undefined) {
      return problem(
        ErrorCode.invalidValue,
        `a virtual timeline carried through ${JSON.stringify(through)} states its length: core does not carry a map through it`,
        at,
      );
    }
    const json = toJson(given, at);
    if (isCommandError(json)) return json;
    return readOnAxis(json, axis, at);
  }
  if (given === undefined) return axis.length;
  const json = toJson(given, at);
  if (isCommandError(json)) return json;
  const read = readOnAxis(json, axis, at);
  if (isCommandError(read)) return read;
  if (toRational(read.value).equals(toRational(axis.length.value))) return axis.length;
  const length = prettyText(axis.length.value, axis.number_type, axis.unit);
  return problem(
    ErrorCode.invalidValue,
    `the length of a virtual timeline is computed from its map: ${length}, not ${prettyText(read.value, axis.number_type, axis.unit)}`,
    at,
  );
}

/**
 * Add a virtual timeline into a block's manifest: `{id?, map, timeline,
 * name?, through?, length?}`, map and timeline required (`invalid_value`),
 * its unit, number type and length computed (`computedAxis`, `lengthOf`),
 * its ID the one given or the next of the command's `ids` (the prefix of
 * its unit's timeline class), read where it will lie (`readListed`): the
 * validators refuse a map or timeline naming nothing, a FlowMap applied
 * outside its root's tree without `through` and a virtual timeline coming
 * from itself. A problem lies at `[<address key of into>,
 * "virtual_timeline", …]`.
 */
export function addVirtualTimeline(
  view: View,
  target: BlockTarget,
  value: unknown,
  changes: ChangeSet,
): View | CommandError {
  const path = [addressKey(target.address), "virtual_timeline"];
  const object = readValue(value, path, VIRTUAL_VALUE, ["map", "timeline"], "virtual timeline");
  if (isCommandError(object)) return object;
  const { map, timeline } = object;
  for (const [member, item] of [
    ["map", map],
    ["timeline", timeline],
  ] as const) {
    if (typeof item !== "string") {
      return problem(ErrorCode.invalidValue, `a virtual timeline's ${member} is an ID`, [
        ...path,
        member,
      ]);
    }
  }
  if (typeof map !== "string" || typeof timeline !== "string") throw new Error("read above");
  const { block } = target;
  const { manifest } = block;
  // The ID is taken only once the axis is known: its prefix is the class of its unit.
  const provisional = typeof object.id === "string" ? object.id : "\u0000new";
  const axis = computedAxis(manifest, { ...object, id: provisional, map, timeline }, path);
  if (isCommandError(axis)) return axis;
  const length = lengthOf(axis, object.length, object.through, path);
  if (isCommandError(length)) return length;
  const prefix = () => TIMELINE_PREFIX[timelineClass(axis.unit)];
  const id = newId(object, manifest, prefix, changes, path);
  if (isCommandError(id)) return id;
  const entry = {
    ...object,
    id,
    unit: axis.unit,
    number_type: axis.number_type,
    length: toAxisValue(length),
  } as JsonObject;
  const virtual = readListed(block, "virtual_timelines", entry, null, path);
  if (isCommandError(virtual)) return virtual;
  record(changes, path, block.id, true);
  const items = [...(manifest.virtual_timelines ?? []), virtual];
  return withListed(view, block, "virtual_timelines", items);
}

/**
 * A virtual timeline's `name` set (null for none), read where it lies;
 * nothing written when it holds that name.
 */
export function setVirtualName(
  view: View,
  block: Block,
  index: number,
  value: unknown,
  path: readonly PathSegment[],
  changes: ChangeSet,
): View | CommandError {
  const name = readNullableString(value, path);
  if (isCommandError(name)) return name;
  const virtual = (block.manifest.virtual_timelines ?? [])[index];
  if (virtual === undefined) throw new Error(`no virtual timeline at ${index}`);
  if (virtual.name === name) return view;
  const read = readListed(block, "virtual_timelines", { ...virtual, name } as JsonObject, index, [
    path[0] ?? "",
  ]);
  if (isCommandError(read)) return read;
  recordValue(changes, path, block.id, true, virtual.name, name);
  const items = (block.manifest.virtual_timelines ?? []).map((item, at) =>
    at === index ? read : item,
  );
  return withListed(view, block, "virtual_timelines", items);
}

/**
 * Why the elements `removed` of `manifest` cannot go with what else the
 * command removes, `others` (the IDs of the other targets in the same
 * block): a FlowMap while a virtual timeline left applies it, a virtual
 * timeline while another left comes from it or a FlowMap left names it as a
 * chunk; `not_removable` at `path`, naming what still names it.
 */
export function namedProblem(
  manifest: Manifest,
  id: string,
  kind: "flow_map" | "virtual_timeline",
  gone: ReadonlySet<string>,
  path: readonly PathSegment[],
): CommandError | undefined {
  const virtual = (manifest.virtual_timelines ?? []).filter((item) => !gone.has(item.id));
  const quoted = (ids: readonly string[]) => ids.map((item) => `'${item}'`).join(", ");
  if (kind === "flow_map") {
    const users = virtual.filter((item) => item.map === id).map((item) => item.id);
    if (users.length === 0) return undefined;
    return problem(
      ErrorCode.notRemovable,
      `FlowMap '${id}' is applied by the virtual ${users.length === 1 ? "timeline" : "timelines"} ${quoted(users)}`,
      path,
    );
  }
  const from = virtual.filter((item) => item.timeline === id).map((item) => item.id);
  const chunks = (manifest.flow_maps ?? [])
    .filter((item) => !gone.has(item.id) && item.chunks.includes(id))
    .map((item) => item.id);
  if (from.length === 0 && chunks.length === 0) return undefined;
  const named = [
    ...(from.length === 0 ? [] : [`the virtual timelines ${quoted(from)} come from it`]),
    ...(chunks.length === 0 ? [] : [`the FlowMaps ${quoted(chunks)} name it as a chunk`]),
  ];
  return problem(
    ErrorCode.notRemovable,
    `virtual timeline '${id}' is still named: ${named.join(" and ")}`,
    path,
  );
}
