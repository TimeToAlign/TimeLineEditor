/**
 * The workspace file, `<name>.tle.json`: `{meta, settings, blocks, journal}`
 * written by timeskeleton's `dumps` and read losslessly by its `parseJson`.
 * Any other format or version, any unknown member and any invalid manifest
 * refuses the file.
 */

import { dumps, parseJson } from "@timetoalign/timeskeleton";
import { parseCommand } from "../commands/parse.ts";
import type { LoadError, Problem } from "../errors.ts";
import { ErrorCode, isCommandError, isLoadError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import { isJsonObject } from "../json.ts";
import { readManifestValue } from "../manifest/io.ts";
import type { Manifest } from "../manifest/types.ts";
import {
  readBoolean,
  readFinite,
  readGraphical,
  readNullablePositive,
  readOrder,
  readPositive,
  readString,
} from "../values.ts";
import type { Block, BlockPlacement } from "./blocks.ts";
import { BLOCK_MEMBERS } from "./blocks.ts";
import type { Entry, Workspace } from "./store.ts";
import type { View, WorkspaceSettings } from "./view.ts";
import { structureProblems, WORKSPACE_META } from "./view.ts";

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type Reader = (value: unknown, path: readonly PathSegment[]) => unknown;

/**
 * The members of an object, each read by its reader; an unknown member is
 * `unknown_member`, an absent one `missing_member`. Problems go to `problems`.
 */
function readExact(
  value: unknown,
  path: readonly PathSegment[],
  readers: { readonly [member: string]: Reader },
  problems: Problem[],
): { [member: string]: unknown } | undefined {
  if (!isJsonObject(value)) {
    problems.push(problem(ErrorCode.invalidValue, "expected an object", path));
    return undefined;
  }
  let complete = true;
  for (const member of Object.keys(value)) {
    if (!Object.hasOwn(readers, member)) {
      problems.push(
        problem(ErrorCode.unknownMember, `unknown member ${member}`, [...path, member]),
      );
      complete = false;
    }
  }
  const result: { [member: string]: unknown } = {};
  for (const [member, read] of Object.entries(readers)) {
    if (!Object.hasOwn(value, member)) {
      problems.push(
        problem(ErrorCode.missingMember, `missing member ${member}`, [...path, member]),
      );
      complete = false;
      continue;
    }
    const item = read(value[member], [...path, member]);
    if (isCommandError(item)) {
      problems.push(item);
      complete = false;
    } else if (item === undefined) {
      complete = false;
    } else result[member] = item;
  }
  return complete ? result : undefined;
}

/** A reader that pushes its problems and returns `undefined` on failure. */
function collecting(
  problems: Problem[],
  read: (value: unknown, path: readonly PathSegment[]) => unknown,
): Reader {
  return (value, path) => {
    const result = read(value, path);
    if (isCommandError(result)) {
      problems.push(result);
      return undefined;
    }
    return result;
  };
}

const PLACEMENT: { readonly [member in keyof BlockPlacement]: Reader } = {
  scale: readPositive,
  length: readPositive,
  spacing: readPositive,
  width: readNullablePositive,
  height: readNullablePositive,
  order: readOrder,
};

const META: { readonly [member: string]: Reader } = {
  format: (value, path) =>
    value === WORKSPACE_META.format
      ? value
      : problem(ErrorCode.unsupportedFormat, "not a TimeLineEditor workspace", path),
  version: (value, path) =>
    value === WORKSPACE_META.version
      ? value
      : problem(ErrorCode.unsupportedVersion, `version ${String(value)} is not 1`, path),
};

function readSettings(problems: Problem[]): Reader {
  return (value, path) =>
    readExact(
      value,
      path,
      {
        grid: (grid, at) =>
          readExact(grid, at, { size: readPositive, snap: readBoolean }, problems),
        blockDefaults: (defaults, at) => readExact(defaults, at, PLACEMENT, problems),
        graphical: readGraphical,
      },
      problems,
    );
}

function readManifest(value: unknown, path: readonly PathSegment[]): Manifest | Problem[] {
  const manifest = readManifestValue(value);
  if (!isLoadError(manifest)) return manifest;
  return (manifest as LoadError).problems.map((item) => ({
    ...item,
    path: [...path, ...item.path],
  }));
}

function readBlock(problems: Problem[]): Reader {
  const readers: { [member: string]: Reader } = {
    ...PLACEMENT,
    id: readString,
    blockKind: readString,
    parent: (value, path) => (value === null ? null : readString(value, path)),
    index: readString,
    x: readFinite,
    y: readFinite,
    manifest: (value, path) => {
      const manifest = readManifest(value, path);
      if (!Array.isArray(manifest)) return manifest;
      problems.push(...manifest);
      return undefined;
    },
  };
  return (value, path) => {
    const block = readExact(value, path, readers, problems);
    if (block === undefined) return undefined;
    return Object.fromEntries(BLOCK_MEMBERS.map((member) => [member, block[member]]));
  };
}

function readEntry(problems: Problem[]): Reader {
  return (value, path) =>
    readExact(
      value,
      path,
      {
        command: (command, at) => {
          const parsed = parseCommand(command);
          return isCommandError(parsed) ? { ...parsed, path: [...at, ...parsed.path] } : parsed;
        },
        author: readString,
        time: (time, at) =>
          typeof time === "string" && TIME.test(time)
            ? time
            : problem(ErrorCode.invalidValue, "time is ISO 8601 UTC with milliseconds", at),
      },
      problems,
    );
}

/** Read a workspace file: the workspace, or every problem found. */
export function readWorkspace(text: string): Workspace | LoadError {
  let value: unknown;
  try {
    value = parseJson(text);
  } catch (error) {
    return { problems: [problem(ErrorCode.invalidJson, (error as Error).message, [])] };
  }
  const problems: Problem[] = [];
  const blocks = collecting(problems, (items, path) => {
    if (!isJsonObject(items)) return problem(ErrorCode.invalidValue, "expected an object", path);
    const read = readBlock(problems);
    const result: { [id: string]: Block } = {};
    let complete = true;
    for (const [id, item] of Object.entries(items as JsonObject)) {
      const block = read(item, [...path, id]);
      if (block === undefined) complete = false;
      else result[id] = block as Block;
    }
    return complete ? result : undefined;
  });
  const journal = collecting(problems, (items, path) => {
    if (!Array.isArray(items)) return problem(ErrorCode.invalidValue, "expected an array", path);
    const read = readEntry(problems);
    const result: Entry[] = [];
    let complete = true;
    for (const [index, item] of items.entries()) {
      const entry = read(item, [...path, index]);
      if (entry === undefined) complete = false;
      else result.push(entry as Entry);
    }
    return complete ? result : undefined;
  });
  const top = readExact(
    value,
    [],
    {
      meta: (meta, path) => readExact(meta, path, META, problems),
      settings: readSettings(problems),
      blocks,
      journal,
    },
    problems,
  );
  if (top === undefined) return { problems };
  const view: View = {
    meta: WORKSPACE_META,
    settings: top.settings as WorkspaceSettings,
    blocks: top.blocks as View["blocks"],
  };
  const structure = structureProblems(view);
  if (structure.length > 0) return { problems: structure };
  return { view, journal: top.journal as readonly Entry[] };
}

/** The workspace file's text. */
export function writeWorkspace(workspace: Workspace): string {
  const { view, journal } = workspace;
  return dumps({ meta: view.meta, settings: view.settings, blocks: view.blocks, journal } as never);
}
