/**
 * The Journal tab's rows: the entries of the level the user works on, each
 * one sentence, newest first at every depth. A session's row holds its
 * entries as rows of their own. On the arranger the main journal; in an
 * editor the open session's entries, then the read-only earlier session of
 * the same element.
 */

import type { Command, Entry, ListedEntry, Session, Store, View } from "@timetoalign/tilie-core";
import {
  ADD_KINDS,
  addressKey,
  editorKindOf,
  isCommandError,
  isSessionEntry,
  listEntries,
} from "@timetoalign/tilie-core";
import { propertyWord } from "./properties.ts";
import { editorName } from "./words.ts";

/** One row of the Journal tab. */
export interface JournalRow {
  /** The entry the row reads; listed once, so it identifies the row. */
  readonly entry: Entry;
  /** `HH:MM:SS` of the entry's UTC time. */
  readonly time: string;
  readonly author: string;
  readonly text: string;
  /** Undone, every change of it, and not redone yet: listed until a new command replaces it. */
  readonly undone: boolean;
  /** Of the earlier session of the edited element, listed read only. */
  readonly earlier: boolean;
  /** A session's entries as rows, newest first; `[]` for a command. */
  readonly children: readonly JournalRow[];
}

/** What the rows are read from: the store's editing path and its innermost level. */
export type JournalSource = Pick<Store, "editing" | "listed" | "sessions">;

/**
 * The session `id` of the store's sessions. The store keeps every session
 * its entries and open editors name, so a missing one is a broken store.
 */
function sessionOf(sessions: JournalSource["sessions"], id: string): Session {
  const session = sessions[id];
  if (session === undefined) throw new RangeError(`the store holds no session ${id}`);
  return session;
}

/** The `id` of an added value; `null` for a value without one. */
function addedId(value: unknown): string | null {
  return typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
    ? value.id
    : null;
}

/** One command as a sentence. */
function commandText(command: Command): string {
  switch (command.type) {
    case "add": {
      const kind = ADD_KINDS.find((item) => command[item] !== undefined);
      const id = kind === undefined ? null : addedId(command[kind]);
      const words = [kind, id, "to", addressKey(command.into)].filter(
        (word) => typeof word === "string",
      );
      return `Added ${words.join(" ")}`;
    }
    case "set": {
      const [first, ...more] = command.changes;
      const properties = Object.keys(first?.values ?? {})
        .map(propertyWord)
        .join(", ");
      const rest = more.length > 0 ? ` and ${more.length} more` : "";
      return `Set ${properties} of ${first === undefined ? "" : addressKey(first.target)}${rest}`;
    }
    case "remove":
      return `Removed ${command.targets.map(addressKey).join(", ")}`;
    case "style":
      return `Styled ${JSON.stringify(command.select)}`;
  }
}

/**
 * One entry as a sentence: its command, or the session it closed with its
 * kind, name and count of changes (at every depth), and how many of them are
 * undone while some are applied. A target the view no longer holds has no
 * kind word: what it was is not read back from earlier views.
 */
function entryText(
  { entry, changes, applied }: ListedEntry,
  sessions: JournalSource["sessions"],
  view: View,
): string {
  if (!isSessionEntry(entry)) return commandText(entry.command);
  const { target } = sessionOf(sessions, entry.session);
  const count = changes === 1 ? "1 change" : `${changes} changes`;
  const partly = applied > 0 && applied < changes ? `, ${changes - applied} undone` : "";
  const kind = editorKindOf(view, target);
  const word = isCommandError(kind) ? "" : `${kind} `;
  return `Edited ${word}${editorName(view, target)} (${count}${partly})`;
}

/** The Journal tab's rows for the level the user works on, newest first. */
export function journalRows(store: JournalSource, view: View): JournalRow[] {
  const innermost = store.editing.at(-1);
  const earlier =
    innermost === undefined || innermost.earlier === null
      ? []
      : listEntries(sessionOf(store.sessions, innermost.earlier).entries, store.sessions);
  const rows = (listed: readonly ListedEntry[], isEarlier: boolean): JournalRow[] =>
    listed
      .map((item) => ({
        entry: item.entry,
        time: item.entry.time.slice(11, 19),
        author: item.entry.author,
        text: entryText(item, store.sessions, view),
        undone: item.applied === 0,
        earlier: isEarlier,
        children: rows(item.children, isEarlier),
      }))
      .reverse();
  return [...rows(store.listed, false), ...rows(earlier, true)];
}
