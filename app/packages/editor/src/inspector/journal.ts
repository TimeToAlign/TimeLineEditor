/**
 * The Journal tab's rows: the entries of the level the user works on, each
 * one sentence. In an editor, the read-only earlier session of the same
 * element first, then the open session's entries, then its undone ones; on
 * the arranger the main journal, then its undone entries.
 */

import type { Address, Command, Entry, Session, Store, View } from "@timetoalign/tilie-core";
import {
  ADD_KINDS,
  editorKindOf,
  findTimeline,
  isCommandError,
  isSessionEntry,
  parseAddress,
} from "@timetoalign/tilie-core";

/** One row of the Journal tab. */
export interface JournalRow {
  /** The entry the row reads; listed once, so it identifies the row. */
  readonly entry: Entry;
  /** `HH:MM:SS` of the entry's UTC time. */
  readonly time: string;
  readonly author: string;
  readonly text: string;
  /** Undone and not redone yet: listed until a new command replaces it. */
  readonly undone: boolean;
  /** Of the earlier session of the edited element, listed read only. */
  readonly earlier: boolean;
}

/** What the rows are read from: the store's editing path and the entries of its levels. */
export type JournalSource = Pick<Store, "editing" | "entries" | "undone" | "sessions">;

/** What a bundle is called that has neither a `name` nor an `id`. */
export const ANONYMOUS_BUNDLE_NAME = "Anonymous bundle";

/**
 * The name an editor's target goes by: a bundle's manifest `name`, else its
 * `id`, else "Anonymous bundle"; a group's or timeline's `name`, else its
 * id. A target the view does not hold goes by its address.
 */
export function editorName(view: View, target: Address): string {
  const parsed = parseAddress(target);
  if (isCommandError(parsed) || parsed.block === null) return target;
  const block = view.blocks[parsed.block];
  if (block === undefined) return target;
  const { manifest } = block;
  if (parsed.element === null) return manifest.name ?? manifest.id ?? ANONYMOUS_BUNDLE_NAME;
  const id = parsed.element;
  const named = manifest.groups.find((group) => group.id === id) ?? findTimeline(manifest, id);
  return named === undefined ? target : (named.name ?? id);
}

/** One command as a sentence. */
function commandText(command: Command): string {
  switch (command.type) {
    case "add": {
      const kind = ADD_KINDS.find((item) => command[item] !== undefined);
      const value = kind === undefined ? undefined : (command[kind] as { readonly id?: unknown });
      return `Added ${kind} ${value?.id} to ${command.into}`;
    }
    case "set": {
      const [first, ...more] = command.changes;
      const properties = Object.keys(first?.values ?? {}).join(", ");
      const rest = more.length > 0 ? ` and ${more.length} more` : "";
      return `Set ${properties} of ${first?.target}${rest}`;
    }
    case "remove":
      return `Removed ${command.targets.join(", ")}`;
    case "style":
      return `Styled ${JSON.stringify(command.select)}`;
  }
}

/**
 * One entry as a sentence: its command, or the session it closed with its
 * kind, name and count. A target the view no longer holds has no kind word:
 * what it was is not read back from earlier views.
 */
function entryText(entry: Entry, sessions: JournalSource["sessions"], view: View): string {
  if (!isSessionEntry(entry)) return commandText(entry.command);
  // The store keeps every session its entries name.
  const { target, entries } = sessions[entry.session] as Session;
  const count = entries.length === 1 ? "1 change" : `${entries.length} changes`;
  const kind = editorKindOf(view, target);
  const word = isCommandError(kind) ? "" : `${kind} `;
  return `Edited ${word}${editorName(view, target)} (${count})`;
}

/** The Journal tab's rows for the level the user works on, in the order the entries were made. */
export function journalRows(store: JournalSource, view: View): JournalRow[] {
  const innermost = store.editing.at(-1);
  const earlier =
    innermost === undefined || innermost.earlier === null
      ? []
      : (store.sessions[innermost.earlier] as Session).entries;
  const row =
    (flags: Pick<JournalRow, "undone" | "earlier">) =>
    (entry: Entry): JournalRow => ({
      entry,
      time: entry.time.slice(11, 19),
      author: entry.author,
      text: entryText(entry, store.sessions, view),
      ...flags,
    });
  return [
    ...earlier.map(row({ undone: false, earlier: true })),
    ...store.entries.map(row({ undone: false, earlier: false })),
    ...store.undone.map(row({ undone: true, earlier: false })),
  ];
}
