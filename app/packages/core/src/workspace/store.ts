/**
 * The workspace store: the current view and the command journal, which is
 * also the undo stack. Replaying the journal from the empty workspace
 * reproduces the view.
 */

import { applyParsed } from "../commands/apply.ts";
import { parseCommand } from "../commands/parse.ts";
import type { Command } from "../commands/types.ts";
import type { CommandError } from "../errors.ts";
import { isCommandError } from "../errors.ts";
import { toJson } from "../values.ts";
import type { View } from "./view.ts";
import { createView } from "./view.ts";

/** One command as it was applied: by whom and when (ISO 8601 UTC with milliseconds). */
export interface Entry {
  readonly command: Command;
  readonly author: string;
  readonly time: string;
}

/** A workspace: its view and the journal that produced it. */
export interface Workspace {
  readonly view: View;
  readonly journal: readonly Entry[];
}

export interface StoreOptions {
  /** Who dispatches, until `setAuthor` changes it; `"Gerhardt"` by default. */
  readonly author?: string;
  /** The time of each entry; the system clock by default. */
  readonly clock?: () => Date;
}

export interface Store {
  readonly view: View;
  readonly journal: readonly Entry[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Apply a command and journal it; `null` when it was accepted. */
  dispatch(command: unknown): CommandError | null;
  undo(): void;
  redo(): void;
  setAuthor(name: string): void;
  /** Call `listener` with the new view after every change; returns the unsubscriber. */
  subscribe(listener: (view: View) => void): () => void;
}

export const DEFAULT_AUTHOR = "Gerhardt";

/** The view a journal produces from the empty workspace, and every view on the way. */
export function replay(journal: readonly Entry[]): View[] {
  const views = [createView()];
  for (const [index, entry] of journal.entries()) {
    const next = applyParsed(views.at(-1) as View, entry.command);
    if (isCommandError(next)) {
      throw new Error(`journal entry ${index} is refused: ${next.code} ${next.message}`);
    }
    views.push(next);
  }
  return views;
}

export function createStore(workspace: Workspace, options: StoreOptions = {}): Store {
  const clock = options.clock ?? (() => new Date());
  let author = options.author ?? DEFAULT_AUTHOR;
  const journal: Entry[] = [...workspace.journal];
  // The views of the session: the last is the view after the whole journal.
  let views: View[] = [workspace.view];
  const redone: { readonly entry: Entry; readonly view: View }[] = [];
  const listeners = new Set<(view: View) => void>();
  const current = () => views.at(-1) as View;
  const notify = () => {
    for (const listener of [...listeners]) listener(current());
  };

  return {
    get view() {
      return current();
    },
    get journal() {
      return journal;
    },
    get canUndo() {
      return journal.length > 0;
    },
    get canRedo() {
      return redone.length > 0;
    },
    dispatch(command) {
      const parsed = parseCommand(command);
      if (isCommandError(parsed)) return parsed;
      const next = applyParsed(current(), parsed);
      if (isCommandError(next)) return next;
      // Every value of an accepted command has been read, so it has a JSON form.
      const stored = toJson(parsed, []) as unknown as Command;
      journal.push({ command: stored, author, time: clock().toISOString() });
      views.push(next);
      redone.length = 0;
      notify();
      return null;
    },
    undo() {
      if (journal.length === 0) return;
      if (views.length === 1) {
        // Before the session's first entry: rebuild every view of the journal once.
        views = replay(journal);
      }
      const entry = journal.pop() as Entry;
      redone.push({ entry, view: views.pop() as View });
      notify();
    },
    redo() {
      const last = redone.pop();
      if (last === undefined) return;
      journal.push(last.entry);
      views.push(last.view);
      notify();
    },
    setAuthor(name) {
      author = name;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
