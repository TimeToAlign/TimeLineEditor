/** Normalize and validate every workspace and manifest command. */

import {
  JsonFloat,
  SCHEMA_VERSION,
  SchemaValidationError,
  schema,
  validate,
} from "@timetoalign/timeskeleton";
import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { Json, JsonObject, PathSegment } from "../json.ts";
import { isJsonObject, showJson } from "../json.ts";
import type { CoordinateDict } from "../number/coordinate.ts";
import {
  CoordinateError,
  coordinateFromDict,
  coordinateToDict,
  jsonInteger,
  NUMBER_TYPES,
  TIME_UNITS,
} from "../number/coordinate.ts";
import { RECORD_ID } from "../workspace/ids.ts";
import { isIndex } from "../workspace/order.ts";
import type { Command, CommandType } from "./types.ts";
import { COMMAND_TYPES } from "./types.ts";

type Kind =
  | "string"
  | "nullableString"
  | "class"
  | "unit"
  | "numberType"
  | "coordinate"
  | "object"
  | "break"
  | "jump"
  | "map"
  | "newTimeline"
  | "recordId"
  | "number"
  | "positive"
  | "manifest"
  | "moves"
  | "properties"
  | "index"
  | "ids"
  | "settings";

type Fields = { readonly [field: string]: { readonly kind: Kind; readonly optional?: true } };

const NEW_TIMELINE: Fields = {
  id: { kind: "string" },
  class: { kind: "class" },
  unit: { kind: "unit" },
  number_type: { kind: "numberType" },
  length: { kind: "coordinate" },
  name: { kind: "nullableString", optional: true },
};

const BLOCK = { block: { kind: "recordId" } } as const;
const FIELDS: { readonly [type in CommandType]: Fields } = {
  createBlock: {
    id: { kind: "recordId" },
    manifest: { kind: "manifest" },
    x: { kind: "number" },
    y: { kind: "number" },
    scale: { kind: "positive", optional: true },
    zoom: { kind: "positive", optional: true },
  },
  moveRecords: { moves: { kind: "moves" } },
  resizeRecord: { id: { kind: "recordId" }, scale: { kind: "positive" } },
  setRecordProperties: { id: { kind: "recordId" }, properties: { kind: "properties" } },
  setIndex: { id: { kind: "recordId" }, index: { kind: "index" } },
  deleteRecords: { ids: { kind: "ids" } },
  setSettings: { settings: { kind: "settings" } },
  setBlockManifest: { block: { kind: "recordId" }, manifest: { kind: "manifest" } },
  setName: { ...BLOCK, id: { kind: "string" }, name: { kind: "nullableString" } },
  setLength: { ...BLOCK, id: { kind: "string" }, length: { kind: "coordinate" } },
  addChild: {
    ...BLOCK,
    parent: { kind: "string" },
    offset: { kind: "coordinate" },
    child: { kind: "newTimeline" },
  },
  setChildOffset: { ...BLOCK, id: { kind: "string" }, offset: { kind: "coordinate" } },
  removeChild: { ...BLOCK, id: { kind: "string" } },
  addRegion: {
    ...BLOCK,
    timeline: { kind: "string" },
    name: { kind: "string" },
    start: { kind: "coordinate" },
    end: { kind: "coordinate" },
    meta: { kind: "object", optional: true },
  },
  setRegion: {
    ...BLOCK,
    timeline: { kind: "string" },
    name: { kind: "string" },
    start: { kind: "coordinate", optional: true },
    end: { kind: "coordinate", optional: true },
    meta: { kind: "object", optional: true },
  },
  removeRegion: { ...BLOCK, timeline: { kind: "string" }, name: { kind: "string" } },
  addBreak: { ...BLOCK, timeline: { kind: "string" }, break: { kind: "break" } },
  removeBreak: { ...BLOCK, timeline: { kind: "string" }, break: { kind: "break" } },
  addJump: { ...BLOCK, timeline: { kind: "string" }, jump: { kind: "jump" } },
  removeJump: { ...BLOCK, timeline: { kind: "string" }, jump: { kind: "jump" } },
  setMarker: {
    ...BLOCK,
    timeline: { kind: "string" },
    name: { kind: "string" },
    coordinate: { kind: "coordinate" },
  },
  removeMarker: { ...BLOCK, timeline: { kind: "string" }, name: { kind: "string" } },
  addConversionMap: { ...BLOCK, timeline: { kind: "string" }, map: { kind: "map" } },
  removeConversionMap: {
    ...BLOCK,
    timeline: { kind: "string" },
    map_id: { kind: "string" },
  },
};

const TIMELINE_CLASSES: readonly string[] = schema.$defs.TimelineClass.enum;
const COLOUR = /^#[0-9A-F]{6}$/;

function invalid(message: string, path: readonly PathSegment[]): CommandError {
  return problem(ErrorCode.invalidCommand, message, path);
}

function toJson(value: unknown, path: readonly PathSegment[], canvas = false): Json | CommandError {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "bigint") return jsonInteger(value);
  if (value instanceof JsonFloat) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      return canvas
        ? problem(ErrorCode.nonFiniteNumber, "a canvas number must be finite", path)
        : invalid(`${value} has no JSON form`, path);
    if (Object.is(value, -0)) return new JsonFloat(-0);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      return invalid(`${value} is beyond 2^53; pass an integer as a bigint`, path);
    }
    return value;
  }
  if (Array.isArray(value)) {
    const items: Json[] = [];
    for (const [index, item] of value.entries()) {
      const converted = toJson(item, [...path, index], canvas);
      if (isCommandError(converted)) return converted;
      items.push(converted);
    }
    return items;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return invalid("expected a plain JSON object", path);
    }
    const entries: [string, Json][] = [];
    for (const [key, item] of Object.entries(value)) {
      const converted = toJson(item, [...path, key], canvas);
      if (isCommandError(converted)) return converted;
      entries.push([key, converted]);
    }
    return Object.fromEntries(entries);
  }
  return invalid(`${typeof value} is not a JSON value`, path);
}

function coordinate(value: unknown, path: readonly PathSegment[]): CoordinateDict | CommandError {
  const converted = toJson(value, path);
  if (isCommandError(converted)) return converted;
  if (isJsonObject(converted)) {
    const extra = Object.keys(converted).find(
      (key) => !["unit", "number_type", "value"].includes(key),
    );
    if (extra !== undefined) return invalid(`unknown coordinate member ${extra}`, [...path, extra]);
  }
  try {
    return coordinateToDict(coordinateFromDict(converted));
  } catch (error) {
    if (error instanceof CoordinateError) {
      return problem(ErrorCode.invalidCoordinate, error.message, [...path, ...error.path]);
    }
    throw error;
  }
}

function host(members: JsonObject, graphical?: Json): Json {
  const axis = { unit: "number", number_type: "int" } as const;
  return {
    meta: { schema_version: SCHEMA_VERSION },
    timeline: {
      id: "host",
      name: null,
      class: "ContinuousLogicalTimeline",
      ...axis,
      length: { ...axis, value: 0n },
      locked: false,
      meta: {},
      children: {},
      conversion_maps: [],
      regions: [],
      flow_control: { breaks: [], jumps: [], markers: {} },
      measure_map: null,
      metric_hierarchy: null,
      ...members,
    },
    ...(graphical === undefined ? {} : { graphical }),
  };
}

function schemaMember(
  value: Json,
  container: Json,
  at: readonly PathSegment[],
  path: readonly PathSegment[],
): CommandError | undefined {
  try {
    validate(container);
    return undefined;
  } catch (error) {
    if (!(error instanceof SchemaValidationError)) throw error;
    const inside = at.every((segment, index) => error.path[index] === segment);
    const rest = inside ? error.path.slice(at.length) : [];
    return problem(ErrorCode.schemaViolation, `${showJson(value).slice(0, 80)}: ${error.detail}`, [
      ...path,
      ...rest,
    ]);
  }
}

function exactObject(
  value: unknown,
  path: readonly PathSegment[],
  allowed: readonly string[],
): JsonObject | CommandError {
  const converted = toJson(value, path, true);
  if (isCommandError(converted)) return converted;
  if (!isJsonObject(converted)) return invalid("expected an object", path);
  const extra = Object.keys(converted).find((key) => !allowed.includes(key));
  return extra === undefined ? converted : invalid(`unknown member ${extra}`, [...path, extra]);
}

function entryCoordinates(
  entry: JsonObject,
  keys: readonly string[],
  path: readonly PathSegment[],
): JsonObject | CommandError {
  const result: [string, Json][] = Object.entries(entry);
  for (const key of keys) {
    const read = coordinate(entry[key], [...path, key]);
    if (isCommandError(read)) return read;
    result[result.findIndex(([name]) => name === key)] = [key, read as unknown as Json];
  }
  return Object.fromEntries(result);
}

function finiteNumber(value: unknown, path: readonly PathSegment[]): number | CommandError {
  if (typeof value !== "number") return invalid("expected a number", path);
  if (!Number.isFinite(value)) {
    return problem(ErrorCode.nonFiniteNumber, "a canvas number must be finite", path);
  }
  return value;
}

function positiveNumber(value: unknown, path: readonly PathSegment[]): number | CommandError {
  const read = finiteNumber(value, path);
  if (isCommandError(read)) return read;
  return read > 0
    ? read
    : problem(ErrorCode.nonPositiveNumber, "the number must be positive", path);
}

function recordId(value: unknown, path: readonly PathSegment[]): string | CommandError {
  if (typeof value !== "string" || !RECORD_ID.test(value)) {
    return problem(ErrorCode.invalidRecordId, "expected a ten-character lowercase record id", path);
  }
  return value;
}

/** A style layer: a value of the shape of a manifest's `graphical` block. */
function styles(value: unknown, path: readonly PathSegment[]): Json | CommandError {
  const converted = toJson(value, path);
  if (isCommandError(converted)) return converted;
  const refused = schemaMember(converted, host({}, converted), ["graphical"], path);
  return refused ?? converted;
}

function margins(value: unknown, path: readonly PathSegment[]): JsonObject | CommandError {
  const input = exactObject(value, path, ["top", "right", "bottom", "left"]);
  if (isCommandError(input)) return input;
  const result: Record<string, number> = {};
  for (const side of ["top", "right", "bottom", "left"] as const) {
    if (!Object.hasOwn(input, side)) return invalid(`missing member ${side}`, [...path, side]);
    const read = finiteNumber(input[side], [...path, side]);
    if (isCommandError(read)) return read;
    result[side] = read;
  }
  return result as unknown as JsonObject;
}

function nameColumn(value: unknown, path: readonly PathSegment[]): JsonObject | CommandError {
  const input = exactObject(value, path, ["visible", "width"]);
  if (isCommandError(input)) return input;
  if (typeof input.visible !== "boolean")
    return invalid("expected a boolean", [...path, "visible"]);
  if (!Array.isArray(input.width) || input.width.length !== 2) {
    return invalid("width must be a pair", [...path, "width"]);
  }
  const width: number[] = [];
  for (const [index, value] of input.width.entries()) {
    const read = finiteNumber(value, [...path, "width", index]);
    if (isCommandError(read)) return read;
    width.push(read);
  }
  return { visible: input.visible, width } as unknown as JsonObject;
}

function properties(value: unknown, path: readonly PathSegment[]): JsonObject | CommandError {
  const input = exactObject(value, path, [
    "zoom",
    "margins",
    "background",
    "nameColumn",
    "overrides",
  ]);
  if (isCommandError(input)) return input;
  if (Object.keys(input).length === 0) return invalid("properties cannot be empty", path);
  const result: [string, unknown][] = [];
  for (const [key, value] of Object.entries(input)) {
    let read: unknown;
    if (key === "zoom") read = positiveNumber(value, [...path, key]);
    else if (key === "margins") read = margins(value, [...path, key]);
    else if (key === "nameColumn") read = nameColumn(value, [...path, key]);
    else if (key === "overrides") read = styles(value, [...path, key]);
    else if (value === null || (typeof value === "string" && COLOUR.test(value))) read = value;
    else read = invalid("expected an upper-case #RRGGBB colour or null", [...path, key]);
    if (isCommandError(read)) return read;
    result.push([key, read]);
  }
  return Object.fromEntries(result) as JsonObject;
}

function settings(value: unknown, path: readonly PathSegment[]): JsonObject | CommandError {
  const input = exactObject(value, path, ["styles", "blockDefaults", "grid"]);
  if (isCommandError(input)) return input;
  const result: [string, unknown][] = [];
  if (input.styles !== undefined) {
    const read = styles(input.styles, [...path, "styles"]);
    if (isCommandError(read)) return read;
    result.push(["styles", read]);
  }
  if (input.blockDefaults !== undefined) {
    const defaults = exactObject(
      input.blockDefaults,
      [...path, "blockDefaults"],
      ["scale", "zoom", "margins", "background", "nameColumn"],
    );
    if (isCommandError(defaults)) return defaults;
    const parsed: [string, unknown][] = [];
    for (const [key, item] of Object.entries(defaults)) {
      let read: unknown;
      if (key === "scale" || key === "zoom") {
        read = positiveNumber(item, [...path, "blockDefaults", key]);
      } else if (key === "margins") {
        read = margins(item, [...path, "blockDefaults", key]);
      } else if (key === "nameColumn") {
        read = nameColumn(item, [...path, "blockDefaults", key]);
      } else if (item === null || (typeof item === "string" && COLOUR.test(item))) read = item;
      else
        read = invalid("expected an upper-case #RRGGBB colour or null", [
          ...path,
          "blockDefaults",
          key,
        ]);
      if (isCommandError(read)) return read;
      parsed.push([key, read]);
    }
    result.push(["blockDefaults", Object.fromEntries(parsed)]);
  }
  if (input.grid !== undefined) {
    const grid = exactObject(input.grid, [...path, "grid"], ["size", "snap"]);
    if (isCommandError(grid)) return grid;
    const parsed: [string, unknown][] = [];
    if (grid.size !== undefined) {
      const size = finiteNumber(grid.size, [...path, "grid", "size"]);
      if (isCommandError(size)) return size;
      parsed.push(["size", size]);
    }
    if (grid.snap !== undefined) {
      if (typeof grid.snap !== "boolean")
        return invalid("expected a boolean", [...path, "grid", "snap"]);
      parsed.push(["snap", grid.snap]);
    }
    result.push(["grid", Object.fromEntries(parsed)]);
  }
  return Object.fromEntries(result) as JsonObject;
}

function moves(value: unknown, path: readonly PathSegment[]): Json | CommandError {
  if (!Array.isArray(value)) return invalid("expected an array", path);
  const result: Json[] = [];
  for (const [index, item] of value.entries()) {
    const at = [...path, index];
    const input = exactObject(item, at, ["id", "x", "y"]);
    if (isCommandError(input)) return input;
    const id = recordId(input.id, [...at, "id"]);
    if (isCommandError(id)) return id;
    const x = finiteNumber(input.x, [...at, "x"]);
    if (isCommandError(x)) return x;
    const y = finiteNumber(input.y, [...at, "y"]);
    if (isCommandError(y)) return y;
    result.push({ id, x, y });
  }
  return result;
}

function ids(value: unknown, path: readonly PathSegment[]): Json | CommandError {
  if (!Array.isArray(value)) return invalid("expected an array", path);
  const result: string[] = [];
  for (const [index, item] of value.entries()) {
    const read = recordId(item, [...path, index]);
    if (isCommandError(read)) return read;
    result.push(read);
  }
  return result;
}

function parseField(kind: Kind, value: unknown, path: readonly PathSegment[]): unknown {
  switch (kind) {
    case "string":
      return typeof value === "string" ? value : invalid("expected a string", path);
    case "nullableString":
      return typeof value === "string" || value === null
        ? value
        : invalid("expected a string or null", path);
    case "class":
      return TIMELINE_CLASSES.includes(value as string)
        ? value
        : invalid(`unknown timeline class ${showJson(value)}`, path);
    case "unit":
      return (TIME_UNITS as readonly unknown[]).includes(value)
        ? value
        : invalid(`unknown unit ${showJson(value)}`, path);
    case "numberType":
      return (NUMBER_TYPES as readonly unknown[]).includes(value)
        ? value
        : invalid(`unknown number type ${showJson(value)}`, path);
    case "coordinate":
      return coordinate(value, path);
    case "object": {
      const converted = toJson(value, path);
      if (isCommandError(converted)) return converted;
      return isJsonObject(converted) ? converted : invalid("expected a JSON object", path);
    }
    case "break":
    case "jump": {
      const converted = toJson(value, path);
      if (isCommandError(converted)) return converted;
      const list = kind === "break" ? "breaks" : "jumps";
      const refused = schemaMember(
        converted,
        host({ flow_control: { breaks: [], jumps: [], markers: {}, [list]: [converted] } }),
        ["timeline", "flow_control", list, 0],
        path,
      );
      if (refused !== undefined) return refused;
      return entryCoordinates(
        converted as JsonObject,
        kind === "break" ? ["coordinate"] : ["from_coordinate", "to_coordinate"],
        path,
      );
    }
    case "map": {
      const converted = toJson(value, path);
      if (isCommandError(converted)) return converted;
      return (
        schemaMember(
          converted,
          host({ conversion_maps: [converted] }),
          ["timeline", "conversion_maps", 0],
          path,
        ) ?? converted
      );
    }
    case "newTimeline":
      return parseFields(NEW_TIMELINE, value, path, []);
    case "recordId":
      return recordId(value, path);
    case "number":
      return finiteNumber(value, path);
    case "positive":
      return positiveNumber(value, path);
    case "manifest": {
      const converted = toJson(value, path);
      if (isCommandError(converted)) return converted;
      return isJsonObject(converted) ? converted : invalid("expected a manifest object", path);
    }
    case "moves":
      return moves(value, path);
    case "properties":
      return properties(value, path);
    case "index":
      return typeof value !== "string" || !isIndex(value)
        ? problem(ErrorCode.invalidIndex, "expected a valid fractional index", path)
        : value;
    case "ids":
      return ids(value, path);
    case "settings":
      return settings(value, path);
  }
}

function parseFields(
  fields: Fields,
  input: unknown,
  path: readonly PathSegment[],
  allowed: readonly string[],
): JsonObject | CommandError {
  if (!isJsonObject(input as Json)) return invalid("expected an object", path);
  const object = input as { readonly [key: string]: unknown };
  const extra = Object.keys(object).find((key) => !(key in fields) && !allowed.includes(key));
  if (extra !== undefined) return invalid(`unknown member ${extra}`, [...path, extra]);
  const result: [string, unknown][] = [];
  for (const [name, spec] of Object.entries(fields)) {
    if (!Object.hasOwn(object, name) || object[name] === undefined) {
      if (spec.optional) continue;
      return invalid(`missing member ${name}`, [...path, name]);
    }
    const parsed = parseField(spec.kind, object[name], [...path, name]);
    if (isCommandError(parsed)) return parsed;
    result.push([name, parsed]);
  }
  return Object.fromEntries(result) as JsonObject;
}

export function parseCommand(input: unknown): Command | CommandError {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalid("a command is a JSON object", []);
  }
  const type = (input as { type?: unknown }).type;
  if (!(COMMAND_TYPES as readonly unknown[]).includes(type)) {
    return invalid(`unknown command type ${showJson(type)}`, ["type"]);
  }
  const fields = parseFields(FIELDS[type as CommandType], input, [], ["type"]);
  if (isCommandError(fields)) return fields;
  if (type === "setRegion" && !("start" in fields || "end" in fields || "meta" in fields)) {
    return invalid("setRegion changes at least one of start, end and meta", []);
  }
  return { type, ...fields } as unknown as Command;
}
