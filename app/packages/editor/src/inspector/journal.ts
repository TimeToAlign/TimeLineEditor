/**
 * The Journal tab's rows: the entries of the level the user works on, each
 * one sentence, newest first at every depth. A session's row holds its
 * entries as rows of their own. On the arranger the main journal; in an
 * editor the open session's entries, then the read-only earlier session of
 * the same element.
 */

import type {
  AddCommand,
  AddKind,
  Command,
  Entry,
  ListedEntry,
  Session,
  Store,
  StyleCommand,
  View,
} from "@timetoalign/tilie-core";
import {
  ADD_KINDS,
  addressWords,
  editorKindOf,
  inBlock,
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

/** The word of each kind of element `add` puts in. */
const ADD_WORDS: { readonly [kind in AddKind]: string } = {
  block: "block",
  timeline: "timeline",
  group: "group",
  measure_map: "measure map",
  child: "child timeline",
  map: "conversion map",
  region: "region",
  flow_control: "flow-control element",
};

/** The string member `member` of an added value; `null` for a value without one. */
function addedMember(value: unknown, member: "id" | "name"): string | null {
  if (typeof value !== "object" || value === null) return null;
  const found: unknown = Reflect.get(value, member);
  return typeof found === "string" ? found : null;
}

/** What one `add` put in: an added block by its bundle while the view holds it, else by its kind and its name or id. */
function addedWords(command: AddCommand, view: View): string {
  const kind = ADD_KINDS.find((item) => command[item] !== undefined);
  if (kind === undefined) return "nothing";
  const value = command[kind];
  const id = addedMember(value, "id");
  if (kind === "block" && id !== null && view.blocks[id] !== undefined) {
    return addressWords(view, { block: id });
  }
  const name = kind === "block" ? null : addedMember(value, "name");
  const named = name ?? id;
  const added = named === null ? `a ${ADD_WORDS[kind]}` : `${ADD_WORDS[kind]} '${named}'`;
  return kind === "block" ? added : `${added} to ${addressWords(view, command.into)}`;
}

/** What a `style` selects: the addresses it lists, else the elements its selector matches. */
function styledWords(command: StyleCommand, view: View): string {
  const { addresses } = command.select;
  if (addresses === undefined) return "matching elements";
  const [block] = command.blocks ?? [];
  const alone = command.blocks?.length === 1 ? block : undefined;
  return addresses
    .map((address) => addressWords(view, alone === undefined ? address : inBlock(alone, address)))
    .join(", ");
}

/** One command as a sentence, every address worded (`addressWords`). */
function commandText(command: Command, view: View): string {
  switch (command.type) {
    case "add":
      return `Added ${addedWords(command, view)}`;
    case "set": {
      const [first, ...more] = command.changes;
      const properties = Object.keys(first?.values ?? {})
        .map(propertyWord)
        .join(", ");
      const rest = more.length > 0 ? ` and ${more.length} more` : "";
      const target = first === undefined ? "" : addressWords(view, first.target);
      return `Set ${properties} of ${target}${rest}`;
    }
    case "remove":
      return `Removed ${command.targets.map((target) => addressWords(view, target)).join(", ")}`;
    case "style":
      return `Styled ${Object.keys(command.set).join(", ")} of ${styledWords(command, view)}`;
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
  if (!isSessionEntry(entry)) return commandText(entry.command, view);
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
