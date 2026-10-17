/**
 * Editor sessions: the commands made in one editor (the bundle editor on a
 * block, the group editor on a group, the timeline editor on a root or a
 * child timeline) between opening it and Done or Cancel. A closed session is
 * journalled as one entry on the level it was opened on; its target is
 * stored once, with the session, never in that entry.
 */

import type { Command } from "../commands/types.ts";
import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import { elementOf, findTimeline, TITLE_ADDRESS } from "../manifest/files.ts";
import { BLOCK_ID } from "./blocks.ts";
import type { Address } from "./ids.ts";
import { manifestIds, mintBlockId, parseAddress } from "./ids.ts";
import type { View } from "./view.ts";

/** A session id: ten characters of base 36 (`mintSessionId`). */
export type SessionId = string;

/** A session id is minted as a block id is, so it is checked by the same pattern. */
export const SESSION_ID = BLOCK_ID;

/** The editor of an element: of a block, of a group, of a root or child timeline. */
export type EditorKind = "bundle" | "group" | "timeline";

/** One command as it was applied: by whom and when (ISO 8601 UTC with milliseconds). */
export interface CommandEntry {
  readonly command: Command;
  readonly author: string;
  readonly time: string;
}

/** One closed session: by whom and when it was closed with Done. */
export interface SessionEntry {
  readonly session: SessionId;
  readonly author: string;
  readonly time: string;
}

/** One entry of a journal or of a session. */
export type Entry = CommandEntry | SessionEntry;

/** One closed session: the element it edited and its entries, in order. */
export interface Session {
  readonly target: Address;
  readonly entries: readonly Entry[];
}

/** The closed sessions of a workspace, by id. */
export type Sessions = { readonly [id: SessionId]: Session };

/** One editor of the editing path. */
export interface OpenEditor {
  readonly session: SessionId;
  /** A block id, `<b>/<group>` or `<b>/<timeline>`. */
  readonly target: Address;
  readonly kind: EditorKind;
  /** The latest earlier session of the same target at the level it opened on, listed read only; null when there is none or it was unfolded. */
  readonly earlier: SessionId | null;
}

/** A fresh session id: ten random base-36 characters, drawn as a block id is (`mintBlockId`). */
export function mintSessionId(fill?: (bytes: Uint8Array) => void): SessionId {
  return mintBlockId(fill);
}

/** Whether an entry is a closed session rather than a command. */
export function isSessionEntry(entry: Entry): entry is SessionEntry {
  return "session" in entry;
}

/**
 * The sessions a journal reaches: those its session entries name, and those
 * their sessions' entries name, recursively. Each is visited once, so
 * sessions that name each other end the walk; a name of no session is
 * passed over.
 */
export function reachedSessions(journal: readonly Entry[], sessions: Sessions): Sessions {
  const result: { [id: SessionId]: Session } = {};
  const visit = (entries: readonly Entry[]) => {
    for (const entry of entries) {
      if (!isSessionEntry(entry) || Object.hasOwn(result, entry.session)) continue;
      const session = sessions[entry.session];
      if (session === undefined) continue;
      result[entry.session] = session;
      visit(session.entries);
    }
  };
  visit(journal);
  return result;
}

/**
 * The editor an address opens: a block the bundle editor, a group the group
 * editor, a root or child timeline the timeline editor; `no_editor` for a
 * part, any other element and `workspace`.
 */
export function editorKindOf(view: View, address: Address): EditorKind | CommandError {
  const parsed = parseAddress(address);
  if (isCommandError(parsed)) return parsed;
  const unknown = problem(ErrorCode.unknownTarget, `${address} names nothing`, [address]);
  const none = problem(ErrorCode.noEditor, `${address} has no editor`, [address]);
  if (parsed.block === null) return none;
  const manifest = view.blocks[parsed.block]?.manifest;
  if (manifest === undefined) return unknown;
  const { element } = parsed;
  if (element === null) return "bundle";
  const named = elementOf(manifest, element);
  if (named === element) {
    if (manifest.groups.some((group) => group.id === element)) return "group";
    if (findTimeline(manifest, element) !== undefined) return "timeline";
  }
  return named === TITLE_ADDRESS || manifestIds(manifest).has(named) ? none : unknown;
}
