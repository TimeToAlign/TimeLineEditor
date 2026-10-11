/** Pure reducers for the 16 commands that edit one manifest. */

import { canonicalOrder } from "@timetoalign/timeskeleton";
import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { PathSegment } from "../json.ts";
import { canonicalText } from "../json.ts";
import { axisProblems, childEnd, contentEnd, readOnAxis } from "../manifest/invariants.ts";
import type {
  Break,
  ChildEntry,
  Jump,
  Manifest,
  Region,
  TimelineManifest,
} from "../manifest/types.ts";
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
  ManifestCommand,
  NewTimeline,
  RemoveConversionMap,
  RemoveMarker,
  RemoveRegion,
  SetChildOffset,
  SetLength,
  SetMarker,
  SetName,
  SetRegion,
} from "./types.ts";
import { MANIFEST_COMMAND_TYPES } from "./types.ts";

interface Located {
  readonly timeline: TimelineManifest;
  readonly path: readonly string[];
  readonly parent: Located | undefined;
}

function locate(manifest: Manifest, id: string): Located | undefined {
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
  return search(manifest.timeline, ["timeline"], undefined);
}

type Tree = { readonly [key: string]: unknown };

function setIn(root: Tree, path: readonly string[], value: unknown): Tree {
  const [key, ...rest] = path as [string, ...string[]];
  const next = rest.length === 0 ? value : setIn(root[key] as Tree, rest, value);
  const entries = Object.entries(root).flatMap(([name, item]): [string, unknown][] =>
    name !== key ? [[name, item]] : next === undefined ? [] : [[name, next]],
  );
  if (next !== undefined && !Object.hasOwn(root, key)) entries.push([key, next]);
  return Object.fromEntries(entries);
}

function put(manifest: Manifest, path: readonly string[], value: unknown): Manifest {
  return setIn(manifest as unknown as Tree, path, value) as unknown as Manifest;
}

function replaceTimeline(manifest: Manifest, at: Located, timeline: TimelineManifest): Manifest {
  const ordered = canonicalOrder({ timeline }).timeline as TimelineManifest;
  return put(manifest, at.path, ordered);
}

function find(
  manifest: Manifest,
  id: string,
  path: readonly PathSegment[],
): Located | CommandError {
  return (
    locate(manifest, id) ?? problem(ErrorCode.unknownTimeline, `no timeline has the id ${id}`, path)
  );
}

function isNegative(coordinate: Coordinate): boolean {
  return compareCoordinates(coordinate, zeroCoordinate(coordinate.unit, coordinate.numberType)) < 0;
}

function newTimeline(
  manifest: Manifest,
  spec: NewTimeline,
  path: readonly PathSegment[],
): TimelineManifest | CommandError {
  if (locate(manifest, spec.id) !== undefined) {
    return problem(ErrorCode.duplicateTimeline, `the id ${spec.id} is already used`, [
      ...path,
      "id",
    ]);
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

function setName(manifest: Manifest, command: SetName): Manifest | CommandError {
  const at = find(manifest, command.id, ["id"]);
  if (isCommandError(at)) return at;
  return replaceTimeline(manifest, at, { ...at.timeline, name: command.name });
}

function setLength(manifest: Manifest, command: SetLength): Manifest | CommandError {
  const at = find(manifest, command.id, ["id"]);
  if (isCommandError(at)) return at;
  if (at.timeline.locked) {
    return problem(ErrorCode.locked, `cannot set the length of locked timeline ${command.id}`, [
      "id",
    ]);
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
  return replaceTimeline(manifest, at, { ...at.timeline, length: command.length });
}

function placeChild(
  manifest: Manifest,
  parent: Located,
  child: TimelineManifest,
  offset: Coordinate,
  childPath: readonly PathSegment[],
): Manifest | CommandError {
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
        `the child would end after locked timeline ${target.id}`,
        ["offset"],
      );
    }
    const grown = exactCoordinate(end, target.unit, target.number_type);
    if (grown === undefined) {
      return problem(
        ErrorCode.childExceedsParent,
        `the child's end is not a ${target.number_type} value`,
        ["offset"],
      );
    }
    length = coordinateToDict(grown);
  }
  const entry: ChildEntry = {
    offset: coordinateToDict(offset),
    timeline: { ...child, locked: true },
  };
  return replaceTimeline(manifest, parent, {
    ...target,
    length,
    children: { ...target.children, [child.id]: entry },
  });
}

function addChild(manifest: Manifest, command: AddChild): Manifest | CommandError {
  const parent = find(manifest, command.parent, ["parent"]);
  if (isCommandError(parent)) return parent;
  const offset = readOnAxis(command.offset, parent.timeline, ["offset"]);
  if (isCommandError(offset)) return offset;
  const child = newTimeline(manifest, command.child, ["child"]);
  if (isCommandError(child)) return child;
  return placeChild(manifest, parent, child, offset, ["child", "unit"]);
}

function nested(manifest: Manifest, id: string): Located | CommandError {
  const at = find(manifest, id, ["id"]);
  if (isCommandError(at)) return at;
  if (at.parent === undefined) {
    return problem(ErrorCode.notAChild, `timeline ${id} is the manifest root`, ["id"]);
  }
  return at;
}

function setChildOffset(manifest: Manifest, command: SetChildOffset): Manifest | CommandError {
  const at = nested(manifest, command.id);
  if (isCommandError(at)) return at;
  const parent = at.parent as Located;
  const offset = readOnAxis(command.offset, parent.timeline, ["offset"]);
  if (isCommandError(offset)) return offset;
  const heldUnder = at.path.at(-2) as string;
  const children = Object.fromEntries(
    Object.entries(parent.timeline.children).filter(([key]) => key !== heldUnder),
  );
  return placeChild(
    manifest,
    { ...parent, timeline: { ...parent.timeline, children } },
    at.timeline,
    offset,
    ["id"],
  );
}

function removeChild(manifest: Manifest, id: string): Manifest | CommandError {
  const at = nested(manifest, id);
  if (isCommandError(at)) return at;
  return put(manifest, at.path.slice(0, -1), undefined);
}

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

function addRegion(manifest: Manifest, command: AddRegion): Manifest | CommandError {
  const at = find(manifest, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  if (at.timeline.regions.some((region) => region.name === command.name)) {
    return problem(ErrorCode.duplicateRegion, `region ${command.name} already exists`, ["name"]);
  }
  const refused = regionBounds(at.timeline, command.start, command.end, ["start"], ["end"]);
  if (refused !== undefined) return refused;
  const region: Region = {
    name: command.name,
    start: command.start,
    end: command.end,
    meta: command.meta ?? {},
  };
  return replaceTimeline(manifest, at, {
    ...at.timeline,
    regions: [...at.timeline.regions, region],
  });
}

function setRegion(manifest: Manifest, command: SetRegion): Manifest | CommandError {
  const at = find(manifest, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  const index = at.timeline.regions.findIndex((region) => region.name === command.name);
  const current = at.timeline.regions[index];
  if (current === undefined) {
    return problem(ErrorCode.unknownRegion, `no region is named ${command.name}`, ["name"]);
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
  return replaceTimeline(manifest, at, { ...at.timeline, regions });
}

function removeRegion(manifest: Manifest, command: RemoveRegion): Manifest | CommandError {
  const at = find(manifest, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  if (!at.timeline.regions.some((region) => region.name === command.name)) {
    return problem(ErrorCode.unknownRegion, `no region is named ${command.name}`, ["name"]);
  }
  return replaceTimeline(manifest, at, {
    ...at.timeline,
    regions: at.timeline.regions.filter((region) => region.name !== command.name),
  });
}

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
  manifest: Manifest,
  timelineId: string,
  list: "breaks" | "jumps",
  entry: Break | Jump,
  keys: readonly string[],
  field: string,
): Manifest | CommandError {
  const at = find(manifest, timelineId, ["timeline"]);
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
  return replaceTimeline(manifest, at, {
    ...at.timeline,
    flow_control: { ...flow, [list]: [...flow[list], entry] },
  });
}

function removeFlowEntry(
  manifest: Manifest,
  timelineId: string,
  list: "breaks" | "jumps",
  entry: Break | Jump,
  keys: readonly string[],
  field: string,
): Manifest | CommandError {
  const at = find(manifest, timelineId, ["timeline"]);
  if (isCommandError(at)) return at;
  const flow = at.timeline.flow_control;
  const wanted = entryKey(entry, keys);
  const entries = flow[list] as readonly (Break | Jump)[];
  const index = entries.findIndex((item) => entryKey(item, keys) === wanted);
  if (index < 0) {
    return problem(
      list === "breaks" ? ErrorCode.unknownBreak : ErrorCode.unknownJump,
      `no equal ${field} on timeline ${timelineId}`,
      [field],
    );
  }
  return replaceTimeline(manifest, at, {
    ...at.timeline,
    flow_control: {
      ...flow,
      [list]: entries.filter((_, position) => position !== index),
    },
  });
}

function setMarker(manifest: Manifest, command: SetMarker): Manifest | CommandError {
  const at = find(manifest, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  const read = readOnAxis(command.coordinate, at.timeline, ["coordinate"]);
  if (isCommandError(read)) return read;
  const flow = at.timeline.flow_control;
  return replaceTimeline(manifest, at, {
    ...at.timeline,
    flow_control: { ...flow, markers: { ...flow.markers, [command.name]: command.coordinate } },
  });
}

function removeMarker(manifest: Manifest, command: RemoveMarker): Manifest | CommandError {
  const at = find(manifest, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  const flow = at.timeline.flow_control;
  if (!Object.hasOwn(flow.markers, command.name)) {
    return problem(ErrorCode.unknownMarker, `no marker is named ${command.name}`, ["name"]);
  }
  const markers = Object.fromEntries(
    Object.entries(flow.markers).filter(([name]) => name !== command.name),
  );
  return replaceTimeline(manifest, at, {
    ...at.timeline,
    flow_control: { ...flow, markers },
  });
}

function addConversionMap(manifest: Manifest, command: AddConversionMap): Manifest | CommandError {
  const at = find(manifest, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  const { map } = command;
  if (at.timeline.conversion_maps.some((item) => item.id === map.id)) {
    return problem(ErrorCode.duplicateMap, `conversion map ${map.id} is already attached`, [
      "map",
      "id",
    ]);
  }
  if (map.source_unit !== null && map.source_unit !== at.timeline.unit) {
    return problem(
      ErrorCode.mapSourceUnitMismatch,
      `map source unit ${map.source_unit} does not match timeline unit ${at.timeline.unit}`,
      ["map", "source_unit"],
    );
  }
  return replaceTimeline(manifest, at, {
    ...at.timeline,
    conversion_maps: [...at.timeline.conversion_maps, map],
  });
}

function removeConversionMap(
  manifest: Manifest,
  command: RemoveConversionMap,
): Manifest | CommandError {
  const at = find(manifest, command.timeline, ["timeline"]);
  if (isCommandError(at)) return at;
  if (!at.timeline.conversion_maps.some((item) => item.id === command.map_id)) {
    return problem(ErrorCode.unknownMap, `no conversion map has the id ${command.map_id}`, [
      "map_id",
    ]);
  }
  return replaceTimeline(manifest, at, {
    ...at.timeline,
    conversion_maps: at.timeline.conversion_maps.filter((item) => item.id !== command.map_id),
  });
}

function reduce(manifest: Manifest, command: ManifestCommand): Manifest | CommandError {
  switch (command.type) {
    case "setName":
      return setName(manifest, command);
    case "setLength":
      return setLength(manifest, command);
    case "addChild":
      return addChild(manifest, command);
    case "setChildOffset":
      return setChildOffset(manifest, command);
    case "removeChild":
      return removeChild(manifest, command.id);
    case "addRegion":
      return addRegion(manifest, command);
    case "setRegion":
      return setRegion(manifest, command);
    case "removeRegion":
      return removeRegion(manifest, command);
    case "addBreak":
      return addFlowEntry(manifest, command.timeline, "breaks", command.break, BREAK_KEYS, "break");
    case "removeBreak":
      return removeFlowEntry(
        manifest,
        command.timeline,
        "breaks",
        command.break,
        BREAK_KEYS,
        "break",
      );
    case "addJump":
      return addFlowEntry(manifest, command.timeline, "jumps", command.jump, JUMP_KEYS, "jump");
    case "removeJump":
      return removeFlowEntry(manifest, command.timeline, "jumps", command.jump, JUMP_KEYS, "jump");
    case "setMarker":
      return setMarker(manifest, command);
    case "removeMarker":
      return removeMarker(manifest, command);
    case "addConversionMap":
      return addConversionMap(manifest, command);
    case "removeConversionMap":
      return removeConversionMap(manifest, command);
  }
}

/**
 * Apply a manifest command to one manifest. A refusal's path names the member
 * of the command at fault; `apply` on a view puts it below
 * `["records", <block id>, "manifest"]`.
 */
export function applyToManifest(
  manifest: Manifest,
  command: ManifestCommand,
): Manifest | CommandError {
  const parsed = parseCommand(command);
  if (isCommandError(parsed)) return parsed;
  if (!(MANIFEST_COMMAND_TYPES as readonly string[]).includes(parsed.type)) {
    return problem(ErrorCode.invalidCommand, `${parsed.type} does not edit a manifest`, ["type"]);
  }
  return reduce(manifest, parsed as ManifestCommand);
}
