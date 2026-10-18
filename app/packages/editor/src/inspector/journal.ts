/**
 * The Journal tab's rows: the entries of the level the user works on, each
 * one sentence, newest first at every depth. A session's row holds its
 * entries as rows of their own. On the arranger the main journal; in an
 * editor the open session's entries, then the read-only earlier session of
 * the same element.
 */

import type {
  Address,
  Command,
  Entry,
  ListedEntry,
  Session,
  Store,
  View,
} from "@timetoalign/tilie-core";
import {
  ADD_KINDS,
  editorKindOf,
  findTimeline,
  isCommandError,
  isSessionEntry,
  listEntries,
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
  /** Undone, every change of it, and not redone yet: listed until a new command replaces it. */
  readonly undone: boolean;
  /** Of the earlier session of the edited element, listed read only. */
  readonly earlier: boolean;
  /** A session's entries as rows, newest first; `[]` for a command. */
  readonly children: readonly JournalRow[];
}

/** What the rows are read from: the store's editing path and its innermost level. */
export type JournalSource = Pick<Store, "editing" | "listed" | "sessions">;

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
  // The store keeps every session its entries name.
  const { target } = sessions[entry.session] as Session;
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
      : listEntries((store.sessions[innermost.earlier] as Session).entries, store.sessions);
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
