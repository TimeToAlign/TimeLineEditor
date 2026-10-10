/**
 * Reading a command from any value, as an agent or a UI sends it.
 *
 * Numbers are read as timeskeleton's `parse` reads them: a plain integral
 * number or a `bigint` is a JSON integer (an integer beyond 2^53 must be a
 * `bigint`), a `JsonFloat` or a plain number with a fractional part is a
 * float. JavaScript numbers do not distinguish `2.0` from `2`, so an integral
 * float in a payload must be passed as a `JsonFloat`; a float coordinate
 * reads an integer as the float it equals, as timetoalign's
 * `number_from_json` does. Coordinates are normalized as the library
 * normalizes them.
 */

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
  | "child";

type Fields = { readonly [field: string]: { readonly kind: Kind; readonly optional?: true } };

const NEW_TIMELINE: Fields = {
  id: { kind: "string" },
  class: { kind: "class" },
  unit: { kind: "unit" },
  number_type: { kind: "numberType" },
  length: { kind: "coordinate" },
  name: { kind: "nullableString", optional: true },
};

const FIELDS: { readonly [type in CommandType]: Fields } = {
  createTimeline: NEW_TIMELINE,
  removeTimeline: { id: { kind: "string" } },
  setName: { id: { kind: "string" }, name: { kind: "nullableString" } },
  setLength: { id: { kind: "string" }, length: { kind: "coordinate" } },
  addChild: {
    parent: { kind: "string" },
    offset: { kind: "coordinate" },
    child: { kind: "child" },
  },
  setChildOffset: { id: { kind: "string" }, offset: { kind: "coordinate" } },
  removeChild: { id: { kind: "string" } },
  addRegion: {
    timeline: { kind: "string" },
    name: { kind: "string" },
    start: { kind: "coordinate" },
    end: { kind: "coordinate" },
    meta: { kind: "object", optional: true },
  },
  setRegion: {
    timeline: { kind: "string" },
    name: { kind: "string" },
    start: { kind: "coordinate", optional: true },
    end: { kind: "coordinate", optional: true },
    meta: { kind: "object", optional: true },
  },
  removeRegion: { timeline: { kind: "string" }, name: { kind: "string" } },
  addBreak: { timeline: { kind: "string" }, break: { kind: "break" } },
  removeBreak: { timeline: { kind: "string" }, break: { kind: "break" } },
  addJump: { timeline: { kind: "string" }, jump: { kind: "jump" } },
  removeJump: { timeline: { kind: "string" }, jump: { kind: "jump" } },
  setMarker: {
    timeline: { kind: "string" },
    name: { kind: "string" },
    coordinate: { kind: "coordinate" },
  },
  removeMarker: { timeline: { kind: "string" }, name: { kind: "string" } },
  addConversionMap: { timeline: { kind: "string" }, map: { kind: "map" } },
  removeConversionMap: { timeline: { kind: "string" }, map_id: { kind: "string" } },
};

const TIMELINE_CLASSES: readonly string[] = schema.$defs.TimelineClass.enum;

function invalid(message: string, path: readonly PathSegment[]): CommandError {
  return problem(ErrorCode.invalidCommand, message, path);
}

/** Convert any value to an exact JSON value, or refuse it. */
function toJson(value: unknown, path: readonly PathSegment[]): Json | CommandError {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "bigint") return jsonInteger(value);
  if (value instanceof JsonFloat) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return invalid(`${value} has no JSON form`, path);
    if (Object.is(value, -0)) return new JsonFloat(-0);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      return invalid(`${value} is beyond 2^53; pass an integer as a bigint`, path);
    }
    return value;
  }
  if (Array.isArray(value)) {
    const items: Json[] = [];
    for (const [index, item] of value.entries()) {
      const converted = toJson(item, [...path, index]);
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
      const converted = toJson(item, [...path, key]);
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

/** A timeline with nothing in it, for validating a member against the schema. */
function host(members: JsonObject): Json {
  const axis = { unit: "number", number_type: "int" } as const;
  return {
    meta: { schema_version: SCHEMA_VERSION },
    manifest: {
      timelines: {
        host: {
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
      },
    },
  };
}

/**
 * Validate one member against its schema definition by placing it in an
 * otherwise empty document; `at` is where it sits there.
 */
function schemaMember(
  value: Json,
  document: Json,
  at: readonly PathSegment[],
  path: readonly PathSegment[],
): CommandError | undefined {
  try {
    validate(document);
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

const FLOW_PATH = ["manifest", "timelines", "host", "flow_control"] as const;

/** Normalize the coordinate members of a break or jump. */
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
        [...FLOW_PATH, list, 0],
        path,
      );
      if (refused !== undefined) return refused;
      const keys = kind === "break" ? ["coordinate"] : ["from_coordinate", "to_coordinate"];
      return entryCoordinates(converted as JsonObject, keys, path);
    }
    case "map": {
      const converted = toJson(value, path);
      if (isCommandError(converted)) return converted;
      return (
        schemaMember(
          converted,
          host({ conversion_maps: [converted] }),
          ["manifest", "timelines", "host", "conversion_maps", 0],
          path,
        ) ?? converted
      );
    }
    case "child":
      if (typeof value === "string") return value;
      return parseFields(NEW_TIMELINE, value, path, []);
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

/**
 * Read a command, refusing a malformed one with the path of the offending
 * member. A command it returns is normalized and may be applied as is.
 */
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
