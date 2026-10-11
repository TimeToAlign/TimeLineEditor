/**
 * The shape of the four commands. A malformed command has no target, so its
 * refusal names the malformed member of the command; everything a target
 * decides is checked when the command applies.
 */

import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import type { Json, JsonObject, PathSegment } from "../json.ts";
import { showJson } from "../json.ts";
import { statementProblem, toJson } from "../values.ts";
import type { Command, CommandType } from "./types.ts";
import { ADD_KINDS, COMMAND_TYPES } from "./types.ts";

function invalid(message: string, path: readonly PathSegment[]): CommandError {
  return problem(ErrorCode.invalidCommand, message, path);
}

/** The members of a plain object whose value is not `undefined`. */
function members(value: unknown): [string, unknown][] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  return Object.entries(value).filter(([, item]) => item !== undefined);
}

const ALLOWED: { readonly [type in CommandType]: readonly string[] } = {
  add: ["type", "into", ...ADD_KINDS],
  set: ["type", "changes"],
  remove: ["type", "targets"],
  style: ["type", "select", "set", "name", "blocks"],
};

function strings(value: unknown, path: readonly PathSegment[]): string[] | CommandError {
  if (!Array.isArray(value)) return invalid("expected an array of strings", path);
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") return invalid("expected a string", [...path, index]);
  }
  return [...value];
}

function parseAdd(input: { readonly [key: string]: unknown }): JsonObject | CommandError {
  if (typeof input.into !== "string") return invalid("into is an address", ["into"]);
  const kinds = ADD_KINDS.filter((kind) => Object.hasOwn(input, kind));
  if (kinds.length !== 1) {
    return invalid(`add names exactly one of ${ADD_KINDS.join(", ")}`, []);
  }
  return input as JsonObject;
}

function parseSet(input: { readonly [key: string]: unknown }): JsonObject | CommandError {
  if (!Array.isArray(input.changes) || input.changes.length === 0) {
    return invalid("changes is a non-empty array", ["changes"]);
  }
  const changes: JsonObject[] = [];
  for (const [index, item] of input.changes.entries()) {
    const entries = members(item);
    if (entries === undefined) return invalid("a change is an object", ["changes", index]);
    const change = Object.fromEntries(entries);
    const extra = Object.keys(change).find((key) => key !== "target" && key !== "values");
    if (extra !== undefined) return invalid(`unknown member ${extra}`, ["changes", index, extra]);
    if (typeof change.target !== "string") {
      return invalid("target is an address", ["changes", index, "target"]);
    }
    const values = members(change.values);
    if (values === undefined || values.length === 0) {
      return invalid("values is an object setting at least one property", [
        "changes",
        index,
        "values",
      ]);
    }
    changes.push({ target: change.target, values: Object.fromEntries(values) } as JsonObject);
  }
  return { ...input, changes } as JsonObject;
}

function parseRemove(input: { readonly [key: string]: unknown }): JsonObject | CommandError {
  const targets = strings(input.targets, ["targets"]);
  if (isCommandError(targets)) return targets;
  if (targets.length === 0) return invalid("targets is a non-empty array", ["targets"]);
  return { ...input, targets } as JsonObject;
}

function parseStyle(input: { readonly [key: string]: unknown }): JsonObject | CommandError {
  const parts: [string, Json][] = [];
  for (const name of ["select", "set"]) {
    if (members(input[name]) === undefined) return invalid(`${name} is an object`, [name]);
    const value = toJson(input[name], [name]);
    if (isCommandError(value)) return { ...value, code: ErrorCode.invalidCommand };
    parts.push([name, value]);
  }
  const [[, select], [, set]] = parts as [[string, JsonObject], [string, JsonObject]];
  const declaration = Object.fromEntries(Object.entries(set).filter(([, item]) => item !== null));
  const refused = statementProblem(select, declaration, []);
  if (refused !== undefined) return refused;
  if (input.name !== undefined && (typeof input.name !== "string" || input.name === "")) {
    return invalid("name is a non-empty string", ["name"]);
  }
  if (input.blocks !== undefined) {
    const blocks = strings(input.blocks, ["blocks"]);
    if (isCommandError(blocks)) return blocks;
  }
  return { ...input, select, set } as JsonObject;
}

/** A command checked for its shape; members whose value is `undefined` are dropped. */
export function parseCommand(input: unknown): Command | CommandError {
  const entries = members(input);
  if (entries === undefined) return invalid("a command is a JSON object", []);
  const object = Object.fromEntries(entries);
  const type = object.type;
  if (!(COMMAND_TYPES as readonly unknown[]).includes(type)) {
    return invalid(`unknown command type ${showJson(type)}`, ["type"]);
  }
  const allowed = ALLOWED[type as CommandType];
  const extra = Object.keys(object).find((key) => !allowed.includes(key));
  if (extra !== undefined) return invalid(`unknown member ${extra}`, [extra]);
  const parsed =
    type === "add"
      ? parseAdd(object)
      : type === "set"
        ? parseSet(object)
        : type === "remove"
          ? parseRemove(object)
          : parseStyle(object);
  if (isCommandError(parsed)) return parsed;
  return parsed as unknown as Command;
}
