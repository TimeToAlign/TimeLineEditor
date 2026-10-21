/**
 * The shape of the four commands. A malformed command has no target, so its
 * refusal names the malformed member of the command; everything a target
 * decides is checked when the command applies.
 */

import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import { isJsonObject, showJson } from "../json.ts";
import { readStatement, toJson } from "../values.ts";
import type { Address } from "../workspace/address.ts";
import { readAddress } from "../workspace/address.ts";
import type {
  AddCommand,
  Change,
  Command,
  CommandType,
  RemoveCommand,
  SetCommand,
  StyleCommand,
} from "./types.ts";
import { ADD_KINDS, COMMAND_TYPES } from "./types.ts";

type Members = { readonly [key: string]: unknown };

function invalid(message: string, path: readonly PathSegment[]): CommandError {
  return problem(ErrorCode.invalidCommand, message, path);
}

/** A plain object without its members whose value is `undefined`. */
function members(value: unknown): Members | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

const ALLOWED: { readonly [type in CommandType]: readonly string[] } = {
  add: ["type", "into", ...ADD_KINDS],
  set: ["type", "changes"],
  remove: ["type", "targets"],
  style: ["type", "select", "set", "name", "blocks"],
};

function isCommandType(value: unknown): value is CommandType {
  return COMMAND_TYPES.some((type) => type === value);
}

function strings(value: unknown, path: readonly PathSegment[]): string[] | CommandError {
  if (!Array.isArray(value)) return invalid("expected an array of strings", path);
  const read: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") return invalid("expected a string", [...path, index]);
    read.push(item);
  }
  return read;
}

function parseAdd(input: Members): AddCommand | CommandError {
  const into = readAddress(input.into, ["into"]);
  if (isCommandError(into)) return into;
  const [kind, ...more] = ADD_KINDS.filter((item) => Object.hasOwn(input, item));
  if (kind === undefined || more.length > 0) {
    return invalid(`add names exactly one of ${ADD_KINDS.join(", ")}`, []);
  }
  return { type: "add", into, [kind]: input[kind] };
}

function parseSet(input: Members): SetCommand | CommandError {
  if (!Array.isArray(input.changes) || input.changes.length === 0) {
    return invalid("changes is a non-empty array", ["changes"]);
  }
  const changes: Change[] = [];
  for (const [index, item] of input.changes.entries()) {
    const change = members(item);
    if (change === undefined) return invalid("a change is an object", ["changes", index]);
    const extra = Object.keys(change).find((key) => key !== "target" && key !== "values");
    if (extra !== undefined) return invalid(`unknown member ${extra}`, ["changes", index, extra]);
    const target = readAddress(change.target, ["changes", index, "target"]);
    if (isCommandError(target)) return target;
    const values = members(change.values);
    if (values === undefined || Object.keys(values).length === 0) {
      return invalid("values is an object setting at least one property", [
        "changes",
        index,
        "values",
      ]);
    }
    changes.push({ target, values });
  }
  return { type: "set", changes };
}

function parseRemove(input: Members): RemoveCommand | CommandError {
  if (!Array.isArray(input.targets) || input.targets.length === 0) {
    return invalid("targets is a non-empty array", ["targets"]);
  }
  const targets: Address[] = [];
  for (const [index, item] of input.targets.entries()) {
    const target = readAddress(item, ["targets", index]);
    if (isCommandError(target)) return target;
    targets.push(target);
  }
  return { type: "remove", targets };
}

/** `select` or `set` of a `style`: a JSON object. */
function styleMember(input: Members, name: "select" | "set"): JsonObject | CommandError {
  if (members(input[name]) === undefined) return invalid(`${name} is an object`, [name]);
  const value = toJson(input[name], [name]);
  if (isCommandError(value)) return { ...value, code: ErrorCode.invalidCommand };
  return isJsonObject(value) ? value : invalid(`${name} is an object`, [name]);
}

function parseStyle(input: Members): StyleCommand | CommandError {
  const select = styleMember(input, "select");
  if (isCommandError(select)) return select;
  const set = styleMember(input, "set");
  if (isCommandError(set)) return set;
  const declaration = Object.fromEntries(Object.entries(set).filter(([, item]) => item !== null));
  const read = readStatement(select, declaration, []);
  if ("code" in read) return read;
  const { name } = input;
  if (name !== undefined && (typeof name !== "string" || name === "")) {
    return invalid("name is a non-empty string", ["name"]);
  }
  const blocks = input.blocks === undefined ? undefined : strings(input.blocks, ["blocks"]);
  if (isCommandError(blocks)) return blocks;
  // The schema checked `select` as a `Selector` and `set`, its nulls aside, as a `Declaration`,
  // read plain (its numbers doubles); the nulls, which remove a property, are put back.
  const nulls = Object.keys(set).filter((member) => set[member] === null);
  const command: StyleCommand = {
    type: "style",
    select: read.select,
    set: Object.assign({ ...read.set }, Object.fromEntries(nulls.map((member) => [member, null]))),
  };
  return {
    ...command,
    ...(name === undefined ? {} : { name }),
    ...(blocks === undefined ? {} : { blocks }),
  };
}

/** A command checked for its shape; members whose value is `undefined` are dropped. */
export function parseCommand(input: unknown): Command | CommandError {
  const object = members(input);
  if (object === undefined) return invalid("a command is a JSON object", []);
  const { type } = object;
  if (!isCommandType(type)) return invalid(`unknown command type ${showJson(type)}`, ["type"]);
  const extra = Object.keys(object).find((key) => !ALLOWED[type].includes(key));
  if (extra !== undefined) return invalid(`unknown member ${extra}`, [extra]);
  switch (type) {
    case "add":
      return parseAdd(object);
    case "set":
      return parseSet(object);
    case "remove":
      return parseRemove(object);
    case "style":
      return parseStyle(object);
  }
}
