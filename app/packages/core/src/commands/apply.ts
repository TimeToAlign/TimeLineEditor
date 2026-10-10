/**
 * The command reducers: `apply(document, command)` returns the edited
 * document or the reason the command is refused. It never mutates its
 * input, and it checks every invariant an edit could break before the edit
 * is made, as timetoalign checks it (see `tests/README.md`).
 */

import { canonicalOrder } from "@timetoalign/timeskeleton";
import { axisProblems, childEnd, contentEnd, readOnAxis } from "../document/invariants.ts";
import type {
  Break,
  ChildEntry,
  Document,
  Jump,
  Region,
  TimelineManifest,
} from "../document/types.ts";
import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { canonicalText } from "../json.ts";
import type { Coordinate, CoordinateDict } from "../number/coordinate.ts";
import {
  compareCoordinates,
  coordinateFromDict,
  coordinateToDict,
  zeroCoordinate,
} from "../number/coordinate.ts";
import { compareReal, exactCoordinate, realOf } from "../number/real.ts";
import { parseCommand } from "./parse.ts";
import type {
  AddChild,
  AddConversionMap,
  AddRegion,
  Command,
  CreateTimeline,
  NewTimeline,
  RemoveChild,
  RemoveConversionMap,
  RemoveMarker,
  RemoveRegion,
  RemoveTimeline,
  SetChildOffset,
  SetLength,
  SetMarker,
  SetName,
  SetRegion,
} from "./types.ts";

/** Where a timeline sits: its document path and, for a child, its parent. */
interface Located {
  readonly timeline: TimelineManifest;
  readonly path: readonly string[];
  readonly parent: Located | undefined;
}

function locate(document: Document, id: string): Located | undefined {
  const search = (
    timeline: TimelineManifest,
    path: readonly string[],
    parent: Located | undefined,
  ): Located | undefined => {
    const here: Located = { timeline, path, parent };
    if (timeline.id === id) return here;
    for (const [key, entry] of Object.entries(timeline.children)) {
      const found = search(entry.timeline, [...path, "children", key, "timeline"], here);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  for (const [key, timeline] of Object.entries(document.manifest.timelines)) {
    const found = search(timeline, ["manifest", "timelines", key], undefined);
    if (found !== undefined) return found;
  }
  return undefined;
}

type Tree = { readonly [key: string]: unknown };

/**
 * A copy of `root` with the value at `path` replaced, or removed when `value`
 * is undefined. Every object keeps the order of its members; a new member is
 * appended.
 */
function setIn(root: Tree, path: readonly string[], value: unknown): Tree {
  const [key, ...rest] = path as [string, ...string[]];
  const next = rest.length === 0 ? value : setIn(root[key] as Tree, rest, value);
  const entries = Object.entries(root).flatMap(([name, item]): [string, unknown][] =>
    name !== key ? [[name, item]] : next === undefined ? [] : [[name, next]],
  );
  if (next !== undefined && !Object.hasOwn(root, key)) entries.push([key, next]);
  return Object.fromEntries(entries);
}

function put(document: Document, path: readonly string[], value: unknown): Document {
  return setIn(document as unknown as Tree, path, value) as unknown as Document;
}

/** The document with one timeline replaced, its lists back in canonical order. */
function replaceTimeline(document: Document, at: Located, timeline: TimelineManifest): Document {
  const { id } = timeline;
  const ordered = canonicalOrder({ manifest: { timelines: { [id]: timeline } } });
  return put(document, at.path, ordered.manifest.timelines[id]);
}

function find(
  document: Document,
  id: string,
  path: readonly PathSegment[],
): Located | CommandError {
  return (
    locate(document, id) ??
    problem(ErrorCode.unknownTimeline, `no timeline has the id ${JSON.stringify(id)}`, path)
  );
}

function isNegative(coordinate: Coordinate): boolean {
  return compareCoordinates(coordinate, zeroCoordinate(coordinate.unit, coordinate.numberType)) < 0;
}

/** Check a timeline to create; returns its manifest, unlocked and empty as timetoalign makes it. */
function newTimeline(
  document: Document,
  spec: NewTimeline,
  path: readonly PathSegment[],
): TimelineManifest | CommandError {
  if (locate(document, spec.id) !== undefined) {
    return problem(
      ErrorCode.duplicateTimeline,
      `the id ${JSON.stringify(spec.id)} is already used`,
      [...path, "id"],
    );
  }
  const [axis] = axisProblems(spec, path);
  if (axis !== undefined) return axis;
  const length = readOnAxis(spec.length, spec, [...path, "length"]);
  if (isCommandError(length)) return length;
  if (isNegative(length)) {
    return problem(ErrorCode.negativeLength, "a timeline length cannot be negative", [
      ...path,
      "length",
    ]);
  }
  return {
    id: spec.id,
    name: spec.name ?? null,
    class: spec.class,
    unit: spec.unit,
    number_type: spec.number_type,
    length: spec.length,
    locked: false,
    meta: {},
    children: {},
    conversion_maps: [],
    regions: [],
    flow_control: { breaks: [], jumps: [], markers: {} },
    measure_map: null,
    metric_hierarchy: null,
  };
}

function createTimeline(document: Document, command: CreateTimeline): Document | CommandError {
  const { type: _, ...spec } = command;
  const timeline = newTimeline(document, spec, []);
  if (isCommandError(timeline)) return timeline;
  return put(document, ["manifest", "timelines", timeline.id], timeline);
}

function removeTimeline(document: Document, command: RemoveTimeline): Document | CommandError {
  const at = find(document, command.id, ["id"]);
  if (isCommandError(at)) return at;
  if (at.parent !== undefined) {
    return problem(
      ErrorCode.notARoot,
      `timeline ${JSON.stringify(command.id)} is nested; remove it with removeChild`,
      ["id"],
    );
  }
  return put(document, at.path, undefined);
}

function setName(document: Document, command: SetName): Document | CommandError {
  const at = find(document, command.id, ["id"]);
  if (isCommandError(at)) return at;
  return replaceTimeline(document, at, { ...at.timeline, name: command.name });
}

function setLength(document: Document, command: SetLength): Document | CommandError {
  const at = find(document, command.id, ["id"]);
  if (isCommandError(at)) return at;
  if (at.timeline.locked) {
    return problem(
      ErrorCode.locked,
      `cannot set the length of locked timeline ${JSON.stringify(command.id)}`,
      ["id"],
    );
  }
  const length = readOnAxis(command.length, at.timeline, ["length"]);
  if (isCommandError(length)) return length;
  if (compareReal(realOf(length), contentEnd(at.timeline)) < 0) {
    return problem(
      ErrorCode.lengthBelowContent,
      "the length cannot be less than the end of the furthest child",
      ["length"],
    );
  }
  return replaceTimeline(document, at, { ...at.timeline, length: command.length });
}

/**
 * Place `child` in `parent` at `offset`, as timetoalign's `add_child` does:
 * the child is locked, and a child ending past the parent lengthens an
 * unlocked parent and is refused by a locked one.
 */
function placeChild(
  document: Document,
  parent: Located,
  child: TimelineManifest,
  offset: Coordinate,
  childPath: readonly PathSegment[],
): Document | CommandError {
  const target = parent.timeline;
  if (child.unit !== target.unit) {
    return problem(
      ErrorCode.childUnitMismatch,
      `child unit ${child.unit} does not match parent unit ${target.unit}`,
      childPath,
    );
  }
  if (isNegative(offset)) {
    return problem(ErrorCode.negativeOffset, "a child offset cannot be negative", ["offset"]);
  }
  const end = childEnd(offset, coordinateFromDict(child.length));
  let length = target.length;
  if (compareReal(end, realOf(coordinateFromDict(target.length))) > 0) {
    if (target.locked) {
      return problem(
        ErrorCode.childExceedsParent,
        `the child would end after locked timeline ${JSON.stringify(target.id)}`,
        ["offset"],
      );
    }
    // The parent grows to the child's end, which must be a value of the
    // parent's own number type; a stored value is never re-expressed.
    const grown = exactCoordinate(end, target.unit, target.number_type);
    if (grown === undefined) {
      return problem(
        ErrorCode.childExceedsParent,
        `the child's end is not a ${target.number_type} value, so timeline ${JSON.stringify(target.id)} cannot grow to it`,
        ["offset"],
      );
    }
    length = coordinateToDict(grown);
  }
  const entry: ChildEntry = {
    offset: coordinateToDict(offset),
    timeline: { ...child, locked: true },
  };
  const children = { ...target.children, [child.id]: entry };
  return replaceTimeline(document, parent, { ...target, length, children });
}

function addChild(document: Document, command: AddChild): Document | CommandError {
  const parent = find(document, command.parent, ["parent"]);
  if (isCommandError(parent)) return parent;
  const offset = readOnAxis(command.offset, parent.timeline, ["offset"]);
  if (isCommandError(offset)) return offset;
  if (typeof command.child !== "string") {
    const child = newTimeline(document, command.child, ["child"]);
    if (isCommandError(child)) return child;
    return placeChild(document, parent, child, offset, ["child", "unit"]);
  }
  const moved = find(document, command.child, ["child"]);
  if (isCommandError(moved)) return moved;
  if (moved.parent !== undefined) {
    return problem(
      ErrorCode.notARoot,
      `timeline ${JSON.stringify(command.child)} is nested; only a root timeline can be moved`,
      ["child"],
    );
  }
  for (let ancestor: Located | undefined = parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.timeline.id === moved.timeline.id) {
      return problem(
        ErrorCode.childIsAncestor,
        `timeline ${JSON.stringify(command.child)} contains ${JSON.stringify(command.parent)}`,
        ["child"],
      );
    }
  }
  const without = put(document, moved.path, undefined);
  const parentAgain = locate(without, command.parent) as Located;
  return placeChild(without, parentAgain, moved.timeline, offset, ["child"]);
}

function nested(document: Document, id: string): Located | CommandError {
  const at = find(document, id, ["id"]);
  if (isCommandError(at)) return at;
  if (at.parent === undefined) {
    return problem(ErrorCode.notAChild, `timeline ${JSON.stringify(id)} is a root`, ["id"]);
  }
  return at;
}

function setChildOffset(document: Document, command: SetChildOffset): Document | CommandError {
  const at = nested(document, command.id);
  if (isCommandError(at)) return at;
  const parent = at.parent as Located;
  const offset = readOnAxis(command.offset, parent.timeline, ["offset"]);
  if (isCommandError(offset)) return offset;
  const children = Object.fromEntries(
    Object.entries(parent.timeline.children).filter(([key]) => key !== at.timeline.id),
  );
  const without: Located = { ...parent, timeline: { ...parent.timeline, children } };
  return placeChild(document, without, at.timeline, offset, ["id"]);
}

function removeChild(document: Document, command: RemoveChild): Document | CommandError {
  const at = nested(document, command.id);
  if (isCommandError(at)) return at;
  return put(document, at.path.slice(0, -1), undefined);
}

/** Check a region's coordinates on its timeline. */
function regionBounds(
  timeline: TimelineManifest,
  start: CoordinateDict,
  end: CoordinateDict,
  starts: readonly PathSegment[],
  ends: readonly PathSegment[],
): CommandError | undefined {
  const from = readOnAxis(start, timeline, starts);
  if (isCommandError(from)) return from;
  const to = readOnAxis(end, timeline, ends);
  if (isCommandError(to)) return to;
  if (compareCoordinates(to, from) < 0) {
    return problem(ErrorCode.regionEndBeforeStart, "a region cannot end before it starts", ends);
  }
  return undefined;
}

function addRegion(document: Document, command: AddRegion): Document | CommandError {
  const at = find(document, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  if (at.timeline.regions.some((region) => region.name === command.name)) {
    return problem(
      ErrorCode.duplicateRegion,
      `region ${JSON.stringify(command.name)} already exists`,
      ["name"],
    );
  }
  const refused = regionBounds(at.timeline, command.start, command.end, ["start"], ["end"]);
  if (refused !== undefined) return refused;
  const region: Region = {
    name: command.name,
    start: command.start,
    end: command.end,
    meta: command.meta ?? {},
  };
  return replaceTimeline(document, at, {
    ...at.timeline,
    regions: [...at.timeline.regions, region],
  });
}

function setRegion(document: Document, command: SetRegion): Document | CommandError {
  const at = find(document, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  const index = at.timeline.regions.findIndex((region) => region.name === command.name);
  const current = at.timeline.regions[index];
  if (current === undefined) {
    return problem(ErrorCode.unknownRegion, `no region is named ${JSON.stringify(command.name)}`, [
      "name",
    ]);
  }
  const region: Region = {
    name: current.name,
    start: command.start ?? current.start,
    end: command.end ?? current.end,
    meta: command.meta ?? current.meta,
  };
  const refused = regionBounds(
    at.timeline,
    region.start,
    region.end,
    command.start === undefined ? ["name"] : ["start"],
    command.end !== undefined ? ["end"] : command.start !== undefined ? ["start"] : ["name"],
  );
  if (refused !== undefined) return refused;
  const regions = at.timeline.regions.map((item, position) => (position === index ? region : item));
  return replaceTimeline(document, at, { ...at.timeline, regions });
}

function removeRegion(document: Document, command: RemoveRegion): Document | CommandError {
  const at = find(document, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  if (!at.timeline.regions.some((region) => region.name === command.name)) {
    return problem(ErrorCode.unknownRegion, `no region is named ${JSON.stringify(command.name)}`, [
      "name",
    ]);
  }
  const regions = at.timeline.regions.filter((region) => region.name !== command.name);
  return replaceTimeline(document, at, { ...at.timeline, regions });
}

/** The identity of a break or jump: its canonical text with normalized coordinates. */
function entryKey(entry: Break | Jump, keys: readonly string[]): string {
  const normalized = Object.fromEntries(
    Object.entries(entry).map(([key, value]) => {
      if (!keys.includes(key)) return [key, value];
      try {
        return [key, coordinateToDict(coordinateFromDict(value))];
      } catch {
        return [key, value];
      }
    }),
  );
  return canonicalText(normalized);
}

const BREAK_KEYS = ["coordinate"] as const;
const JUMP_KEYS = ["from_coordinate", "to_coordinate"] as const;

function addFlowEntry(
  document: Document,
  timelineId: string,
  list: "breaks" | "jumps",
  entry: Break | Jump,
  keys: readonly string[],
  field: string,
): Document | CommandError {
  const at = find(document, timelineId, ["timeline"]);
  if (isCommandError(at)) return at;
  for (const key of keys) {
    const read = readOnAxis(
      (entry as unknown as Record<string, CoordinateDict>)[key] as CoordinateDict,
      at.timeline,
      [field, key],
    );
    if (isCommandError(read)) return read;
  }
  const flow = at.timeline.flow_control;
  const flowControl = { ...flow, [list]: [...flow[list], entry] };
  return replaceTimeline(document, at, { ...at.timeline, flow_control: flowControl });
}

function removeFlowEntry(
  document: Document,
  timelineId: string,
  list: "breaks" | "jumps",
  entry: Break | Jump,
  keys: readonly string[],
  field: string,
): Document | CommandError {
  const at = find(document, timelineId, ["timeline"]);
  if (isCommandError(at)) return at;
  const flow = at.timeline.flow_control;
  const wanted = entryKey(entry, keys);
  const entries = flow[list] as readonly (Break | Jump)[];
  const index = entries.findIndex((item) => entryKey(item, keys) === wanted);
  if (index < 0) {
    const code = list === "breaks" ? ErrorCode.unknownBreak : ErrorCode.unknownJump;
    return problem(code, `no equal ${field} on timeline ${JSON.stringify(timelineId)}`, [field]);
  }
  const flowControl = { ...flow, [list]: entries.filter((_, position) => position !== index) };
  return replaceTimeline(document, at, { ...at.timeline, flow_control: flowControl });
}

function setMarker(document: Document, command: SetMarker): Document | CommandError {
  const at = find(document, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  const read = readOnAxis(command.coordinate, at.timeline, ["coordinate"]);
  if (isCommandError(read)) return read;
  const flow = at.timeline.flow_control;
  const markers = { ...flow.markers, [command.name]: command.coordinate };
  return replaceTimeline(document, at, { ...at.timeline, flow_control: { ...flow, markers } });
}

function removeMarker(document: Document, command: RemoveMarker): Document | CommandError {
  const at = find(document, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  const flow = at.timeline.flow_control;
  if (!Object.hasOwn(flow.markers, command.name)) {
    return problem(ErrorCode.unknownMarker, `no marker is named ${JSON.stringify(command.name)}`, [
      "name",
    ]);
  }
  const markers = Object.fromEntries(
    Object.entries(flow.markers).filter(([name]) => name !== command.name),
  );
  return replaceTimeline(document, at, { ...at.timeline, flow_control: { ...flow, markers } });
}

function addConversionMap(document: Document, command: AddConversionMap): Document | CommandError {
  const at = find(document, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  const { map } = command;
  if (at.timeline.conversion_maps.some((item) => item.id === map.id)) {
    return problem(
      ErrorCode.duplicateMap,
      `conversion map ${JSON.stringify(map.id)} is already attached`,
      ["map", "id"],
    );
  }
  if (map.source_unit !== null && map.source_unit !== at.timeline.unit) {
    return problem(
      ErrorCode.mapSourceUnitMismatch,
      `map source unit ${map.source_unit} does not match timeline unit ${at.timeline.unit}`,
      ["map", "source_unit"],
    );
  }
  const maps = [...at.timeline.conversion_maps, map];
  return replaceTimeline(document, at, { ...at.timeline, conversion_maps: maps });
}

function removeConversionMap(
  document: Document,
  command: RemoveConversionMap,
): Document | CommandError {
  const at = find(document, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  if (!at.timeline.conversion_maps.some((item) => item.id === command.map_id)) {
    return problem(
      ErrorCode.unknownMap,
      `no conversion map has the id ${JSON.stringify(command.map_id)}`,
      ["map_id"],
    );
  }
  const maps = at.timeline.conversion_maps.filter((item) => item.id !== command.map_id);
  return replaceTimeline(document, at, { ...at.timeline, conversion_maps: maps });
}

function reduce(document: Document, command: Command): Document | CommandError {
  switch (command.type) {
    case "createTimeline":
      return createTimeline(document, command);
    case "removeTimeline":
      return removeTimeline(document, command);
    case "setName":
      return setName(document, command);
    case "setLength":
      return setLength(document, command);
    case "addChild":
      return addChild(document, command);
    case "setChildOffset":
      return setChildOffset(document, command);
    case "removeChild":
      return removeChild(document, command);
    case "addRegion":
      return addRegion(document, command);
    case "setRegion":
      return setRegion(document, command);
    case "removeRegion":
      return removeRegion(document, command);
    case "addBreak":
      return addFlowEntry(document, command.timeline, "breaks", command.break, BREAK_KEYS, "break");
    case "removeBreak":
      return removeFlowEntry(
        document,
        command.timeline,
        "breaks",
        command.break,
        BREAK_KEYS,
        "break",
      );
    case "addJump":
      return addFlowEntry(document, command.timeline, "jumps", command.jump, JUMP_KEYS, "jump");
    case "removeJump":
      return removeFlowEntry(document, command.timeline, "jumps", command.jump, JUMP_KEYS, "jump");
    case "setMarker":
      return setMarker(document, command);
    case "removeMarker":
      return removeMarker(document, command);
    case "addConversionMap":
      return addConversionMap(document, command);
    case "removeConversionMap":
      return removeConversionMap(document, command);
  }
}

/**
 * Apply one command to a document.
 *
 * The command is read by `parseCommand` first, so an unparsed value is
 * refused with `invalid_command` rather than applied. Returns the new
 * document, or the `CommandError` that refuses the command; `document` is
 * never modified.
 */
export function apply(document: Document, command: Command): Document | CommandError {
  const parsed = parseCommand(command);
  if (isCommandError(parsed)) return parsed;
  return reduce(document, parsed);
}
