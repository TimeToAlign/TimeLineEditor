/**
 * The workspace file, `<name>.tle.json`: `{meta, settings, blocks, journal,
 * sessions}` written by timeskeleton's `dumps` and read losslessly by its
 * `parseJson`. Any other format or version refuses the file before anything
 * else is read; any unknown member and any invalid manifest refuses it too,
 * and so does a session that the journal does not reach exactly once.
 */

import { dumps, parseJson } from "@timetoalign/timeskeleton";
import { parseCommand } from "../commands/parse.ts";
import type { LoadError, Problem } from "../errors.ts";
import { ErrorCode, isCommandError, isLoadError, problem } from "../errors.ts";
import type { JsonObject, PathSegment } from "../json.ts";
import { isJsonObject, showJson } from "../json.ts";
import { normalizeManifest } from "../manifest/io.ts";
import type { Manifest } from "../manifest/types.ts";
import {
  readBoolean,
  readFinite,
  readGraphical,
  readNullablePositive,
  readPlaces,
  readPositive,
  readString,
} from "../values.ts";
import { parseAddressSyntax } from "./address.ts";
import type { Block, BlockPlacement } from "./blocks.ts";
import { BLOCK_MEMBERS } from "./blocks.ts";
import type { Entry, Session, SessionId, Sessions } from "./sessions.ts";
import { isSessionEntry, reachedSessions, SESSION_ID } from "./sessions.ts";
import type { Workspace } from "./store.ts";
import type { View, WorkspaceSettings } from "./view.ts";
import { createView, structureProblems, WORKSPACE_META } from "./view.ts";

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
};

const META: { readonly [member: string]: Reader } = {
  format: (value, path) =>
    value === WORKSPACE_META.format
      ? value
      : problem(ErrorCode.unsupportedFormat, "not a TimeLineEditor workspace", path),
  version: (value, path) =>
    value === WORKSPACE_META.version
      ? value
      : problem(
          ErrorCode.unsupportedVersion,
          `workspace version ${showJson(value)} is not supported; this editor reads version ${WORKSPACE_META.version} only`,
          path,
        ),
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
  const manifest = normalizeManifest(value);
  if (!isLoadError(manifest)) return manifest;
  return manifest.problems.map((item) => ({
    ...item,
    path: [...path, ...item.path],
  }));
}

function readBlock(problems: Problem[]): Reader {
  const readers: { [member: string]: Reader } = {
    ...PLACEMENT,
    id: readString,
    parent: (value, path) => (value === null ? null : readString(value, path)),
    index: readString,
    x: readFinite,
    y: readFinite,
    places: readPlaces,
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

const readTime: Reader = (time, at) =>
  typeof time === "string" && TIME.test(time)
    ? time
    : problem(ErrorCode.invalidValue, "time is ISO 8601 UTC with milliseconds", at);

const readSessionId: Reader = (id, at) =>
  typeof id === "string" && SESSION_ID.test(id)
    ? id
    : problem(ErrorCode.invalidValue, "a session id is ten characters of 0-9 and a-z", at);

/** An entry: `{command, author, time}`, or `{session, author, time}` when it names a session. */
function readEntry(problems: Problem[]): Reader {
  const command: Reader = (value, at) => {
    const parsed = parseCommand(value);
    return isCommandError(parsed) ? { ...parsed, path: [...at, ...parsed.path] } : parsed;
  };
  return (value, path) =>
    readExact(
      value,
      path,
      isJsonObject(value) && Object.hasOwn(value, "session")
        ? { session: readSessionId, author: readString, time: readTime }
        : { command, author: readString, time: readTime },
      problems,
    );
}

/** A list of entries: the journal, or a session's entries. */
function readEntries(problems: Problem[]): Reader {
  return collecting(problems, (items, path) => {
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
}

function readSessions(problems: Problem[]): Reader {
  const session: Reader = (value, path) =>
    readExact(
      value,
      path,
      {
        target: (target, at) => {
          if (typeof target !== "string") return readString(target, at);
          const parsed = parseAddressSyntax(target);
          return isCommandError(parsed) ? { ...parsed, path: at } : target;
        },
        entries: (entries, at) => {
          // A session without entries is never closed with Done.
          if (Array.isArray(entries) && entries.length === 0) {
            return problem(ErrorCode.invalidValue, "a session holds at least one entry", at);
          }
          return readEntries(problems)(entries, at);
        },
      },
      problems,
    );
  return collecting(problems, (items, path) => {
    if (!isJsonObject(items)) return problem(ErrorCode.invalidValue, "expected an object", path);
    const result: { [id: SessionId]: Session } = {};
    let complete = true;
    for (const [id, item] of Object.entries(items as JsonObject)) {
      const at = [...path, id];
      const bad = readSessionId(id, at);
      if (isCommandError(bad)) problems.push(bad);
      const read = isCommandError(bad) ? undefined : session(item, at);
      if (read === undefined) complete = false;
      else result[id] = read as Session;
    }
    return complete ? result : undefined;
  });
}

/**
 * The problems of how a journal names its sessions: every session entry in
 * turn, the journal's, then each session's, names a session no earlier
 * entry named (else `unknown_session` or `session_referenced_twice`); then
 * every session is reached from the journal (else `unreferenced_session`,
 * also for sessions that only name each other).
 */
function sessionProblems(journal: readonly Entry[], sessions: Sessions): Problem[] {
  const problems: Problem[] = [];
  const named = new Set<SessionId>();
  const check = (entries: readonly Entry[], path: readonly PathSegment[]) => {
    for (const [index, entry] of entries.entries()) {
      if (!isSessionEntry(entry)) continue;
      const at = [...path, index, "session"];
      if (!Object.hasOwn(sessions, entry.session)) {
        problems.push(problem(ErrorCode.unknownSession, `${entry.session} names no session`, at));
      } else if (named.has(entry.session)) {
        problems.push(
          problem(
            ErrorCode.sessionReferencedTwice,
            `session ${entry.session} is named by more than one entry`,
            at,
          ),
        );
      } else named.add(entry.session);
    }
  };
  check(journal, ["journal"]);
  for (const [id, session] of Object.entries(sessions)) {
    check(session.entries, ["sessions", id, "entries"]);
  }
  const reached = reachedSessions(journal, sessions);
  for (const id of Object.keys(sessions)) {
    if (!Object.hasOwn(reached, id)) {
      problems.push(
        problem(ErrorCode.unreferencedSession, `session ${id} is reached from no journal entry`, [
          "sessions",
          id,
        ]),
      );
    }
  }
  return problems;
}

/** Read a workspace file: the workspace, or every problem found. */
export function readWorkspace(text: string): Workspace | LoadError {
  let value: unknown;
  try {
    value = parseJson(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { problems: [problem(ErrorCode.invalidJson, message, [])] };
  }
  const problems: Problem[] = [];
  // A file of another format or version is refused for that alone: its other
  // members follow rules this editor does not know.
  if (isJsonObject(value) && isJsonObject(value.meta)) {
    readExact(value.meta, ["meta"], META, problems);
    if (problems.length > 0) return { problems };
  }
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
  const top = readExact(
    value,
    [],
    {
      meta: (meta, path) => readExact(meta, path, META, problems),
      settings: readSettings(problems),
      blocks,
      journal: readEntries(problems),
      sessions: readSessions(problems),
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
  const journal = top.journal as readonly Entry[];
  const sessions = top.sessions as Workspace["sessions"];
  const named = sessionProblems(journal, sessions);
  if (named.length > 0) return { problems: named };
  return { view, journal, sessions };
}

/** The workspace file's text. */
export function writeWorkspace(workspace: Workspace): string {
  const { view, journal, sessions } = workspace;
  const { meta, settings, blocks } = view;
  return dumps({ meta, settings, blocks, journal, sessions });
}

/** A workspace holding nothing: the empty view, an empty journal, no sessions. */
export function emptyWorkspace(): Workspace {
  return { view: createView(), journal: [], sessions: {} };
}
