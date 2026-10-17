/**
 * The workspace store: the current view and the command journal, which is
 * also the undo stack. Replaying the journal from the empty workspace
 * reproduces the view.
 *
 * An editor opened on an element (`open`) starts a session, a level of its
 * own above the journal: its commands are its entries, undo and redo step
 * through them and stop at its start. Done stores the session and journals
 * it as one entry on the level below; Cancel restores that level, the
 * sessions and the view exactly as they were at the opening.
 */

import { applyParsed } from "../commands/apply.ts";
import { parseCommand } from "../commands/parse.ts";
import type { Command } from "../commands/types.ts";
import type { CommandError } from "../errors.ts";
import { ErrorCode, isCommandError, problem } from "../errors.ts";
import { contains } from "../manifest/contains.ts";
import { toJson } from "../values.ts";
import { sideEffect } from "./guard.ts";
import type { Address } from "./ids.ts";
import { parseAddress } from "./ids.ts";
import type { Entry, OpenEditor, Session, SessionEntry, SessionId, Sessions } from "./sessions.ts";
import { editorKindOf, isSessionEntry, mintSessionId, reachedSessions } from "./sessions.ts";
import type { View } from "./view.ts";
import { createView } from "./view.ts";

/** A workspace: its view, the journal that produced it and the sessions its journal names. */
export interface Workspace {
  readonly view: View;
  readonly journal: readonly Entry[];
  readonly sessions: Sessions;
}

export interface StoreOptions {
  /** Who dispatches, until `setAuthor` changes it; `"Gerhardt"` by default. */
  readonly author?: string;
  /** The time of each entry; the system clock by default. */
  readonly clock?: () => Date;
}

export interface Store {
  readonly view: View;
  /** The main level's entries: commands and closed sessions. */
  readonly journal: readonly Entry[];
  /** The closed sessions, by id. */
  readonly sessions: Sessions;
  /** The editing path: the open editors, outermost first. */
  readonly editing: readonly OpenEditor[];
  /** The entries of the innermost open editor's session; the journal when no editor is open. */
  readonly entries: readonly Entry[];
  /** The undone entries of that level, the next to redo first. */
  readonly undone: readonly Entry[];
  /** How many changes Cancel would discard; 0 when no editor is open. */
  readonly changes: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Apply a command and journal it; `null` when it was accepted. */
  dispatch(command: unknown): CommandError | null;
  undo(): void;
  redo(): void;
  /** Open the editor of `target` inside the innermost open editor; `null` when it opened. */
  open(target: Address): CommandError | null;
  /** Close the innermost editor, keeping its changes. */
  done(): void;
  /** Close the innermost editor, restoring the state at its opening. */
  cancel(): void;
  /** The workspace as Save writes it, every open editor folded as Done would fold it. */
  snapshot(): Workspace;
  setAuthor(name: string): void;
  /** Call `listener` with the view after every change of it, of a level's entries, `undone` or `editing`; returns the unsubscriber. */
  subscribe(listener: (view: View) => void): () => void;
}

export const DEFAULT_AUTHOR = "Gerhardt";

/**
 * The views a journal produces from `view`: `view` itself, then the view
 * after each entry, a session's being the view after all of its entries,
 * which are expanded from `sessions` recursively.
 */
function replayFrom(view: View, journal: readonly Entry[], sessions: Sessions): View[] {
  const views = [view];
  for (const [index, entry] of journal.entries()) {
    const before = views.at(-1) as View;
    if (isSessionEntry(entry)) {
      const session = sessions[entry.session];
      if (session === undefined) throw new Error(`journal entry ${index} names no session`);
      views.push(replayFrom(before, session.entries, sessions).at(-1) as View);
      continue;
    }
    const next = applyParsed(before, entry.command);
    if (isCommandError(next)) {
      throw new Error(`journal entry ${index} is refused: ${next.code} ${next.message}`);
    }
    views.push(next);
  }
  return views;
}

/** The view a journal produces from the empty workspace, and the view after each of its entries. */
export function replay(journal: readonly Entry[], sessions: Sessions): View[] {
  return replayFrom(createView(), journal, sessions);
}

/** One level of the store: the main journal, or the session of one open editor. */
interface Level {
  /** `null` for the main journal. */
  readonly editor: OpenEditor | null;
  readonly entries: Entry[];
  /**
   * The views after this level's last `views.length - 1` entries, preceded
   * by the view before them; the last is the level's current view. Complete
   * (one more than the entries) unless the level started from entries it
   * did not apply itself; `rebuild` completes it.
   */
  views: View[];
  readonly redone: { readonly entry: Entry; readonly view: View }[];
  /** The entries at the opening, which Cancel's count compares by identity. */
  readonly opening: readonly Entry[];
  /** The session entry the opening took off the level below, with its view. */
  readonly unfolded: { readonly entry: SessionEntry; readonly view: View } | null;
  /** The sessions at the opening. */
  readonly sessions: Sessions;
}

export function createStore(workspace: Workspace, options: StoreOptions = {}): Store {
  const clock = options.clock ?? (() => new Date());
  let author = options.author ?? DEFAULT_AUTHOR;
  let sessions: Sessions = workspace.sessions;
  const main: Level = {
    editor: null,
    entries: [...workspace.journal],
    views: [workspace.view],
    redone: [],
    opening: [],
    unfolded: null,
    sessions,
  };
  // The main level first, then one level per open editor.
  const levels: Level[] = [main];
  let editing: readonly OpenEditor[] = [];
  const listeners = new Set<(view: View) => void>();
  const top = () => levels.at(-1) as Level;
  const current = () => top().views.at(-1) as View;
  const notify = () => {
    for (const listener of [...listeners]) listener(current());
  };
  const stamp = () => ({ author, time: clock().toISOString() });

  /** Complete a level's views by replaying its entries from the view before them. */
  const rebuild = (index: number) => {
    const level = levels[index] as Level;
    if (level.views.length > level.entries.length) return;
    const before = index === 0 ? createView() : (levels[index - 1] as Level).views.at(-1);
    const views = replayFrom(before as View, level.entries, sessions);
    // The current view stays the very same object.
    views[views.length - 1] = level.views.at(-1) as View;
    level.views = views;
  };

  const drop = (gone: readonly SessionId[]) => {
    if (gone.length === 0) return;
    sessions = Object.fromEntries(Object.entries(sessions).filter(([id]) => !gone.includes(id)));
  };

  /** Drop the sessions that only `entries` name, and those they name. */
  const forget = (entries: readonly Entry[]) =>
    drop(Object.keys(reachedSessions(entries, sessions)));

  const clearRedone = (level: Level) => {
    forget(level.redone.map((last) => last.entry));
    level.redone.length = 0;
  };

  /** Whether `target` lies inside the editor `outer` and is not its target. */
  const inside = (outer: OpenEditor, target: Address): boolean => {
    if (target === outer.target) return false;
    const container = parseAddress(outer.target);
    const element = parseAddress(target);
    if (isCommandError(container) || isCommandError(element)) return false;
    if (element.block !== container.block || element.element === null) return false;
    if (container.element === null) return true;
    const manifest = current().blocks[element.block as string]?.manifest;
    return manifest !== undefined && contains(manifest, container.element, element.element);
  };

  const close = () => {
    levels.pop();
    editing = editing.slice(0, -1);
  };

  return {
    get view() {
      return current();
    },
    get journal() {
      return main.entries;
    },
    get sessions() {
      return sessions;
    },
    get editing() {
      return editing;
    },
    get entries() {
      return top().entries;
    },
    get undone() {
      return top()
        .redone.map((last) => last.entry)
        .reverse();
    },
    get changes() {
      const level = top();
      if (level.editor === null) return 0;
      const { opening, entries } = level;
      let common = 0;
      while (
        common < opening.length &&
        common < entries.length &&
        opening[common] === entries[common]
      ) {
        common += 1;
      }
      return opening.length - common + (entries.length - common);
    },
    get canUndo() {
      return top().entries.length > 0;
    },
    get canRedo() {
      return top().redone.length > 0;
    },
    dispatch(command) {
      const parsed = parseCommand(command);
      if (isCommandError(parsed)) return parsed;
      const before = current();
      const next = applyParsed(before, parsed);
      if (isCommandError(next)) return next;
      const level = top();
      if (level.editor !== null) {
        const refused = sideEffect(before, next, level.editor.target);
        if (refused !== null) return refused;
      }
      // Every value of an accepted command has been read, so it has a JSON form.
      const stored = toJson(parsed, []) as unknown as Command;
      level.entries.push({ command: stored, ...stamp() });
      level.views.push(next);
      clearRedone(level);
      notify();
      return null;
    },
    undo() {
      const level = top();
      if (level.entries.length === 0) return;
      // Before the first view this level holds: rebuild every view once.
      if (level.views.length === 1) rebuild(levels.length - 1);
      const entry = level.entries.pop() as Entry;
      level.redone.push({ entry, view: level.views.pop() as View });
      notify();
    },
    redo() {
      const level = top();
      const last = level.redone.pop();
      if (last === undefined) return;
      level.entries.push(last.entry);
      level.views.push(last.view);
      notify();
    },
    open(target) {
      const kind = editorKindOf(current(), target);
      if (isCommandError(kind)) return kind;
      const below = top();
      if (below.editor !== null && !inside(below.editor, target)) {
        return problem(
          ErrorCode.notInside,
          `${target} does not lie inside ${below.editor.target}`,
          [target],
        );
      }
      const opened = sessions;
      const last = below.entries.at(-1);
      let level: Level;
      if (last !== undefined && isSessionEntry(last) && sessions[last.session]?.target === target) {
        // The latest entry of this level is a session of the same target: it
        // is unfolded, its entries undoable again.
        if (below.views.length === 1) rebuild(levels.length - 1);
        below.entries.pop();
        const view = below.views.pop() as View;
        const session = sessions[last.session] as Session;
        drop([last.session]);
        level = {
          editor: { session: last.session, target, kind, earlier: null },
          entries: [...session.entries],
          views: [view],
          redone: [],
          opening: session.entries,
          unfolded: { entry: last, view },
          sessions: opened,
        };
      } else {
        const earlier = below.entries.findLast(
          (entry) => isSessionEntry(entry) && sessions[entry.session]?.target === target,
        ) as SessionEntry | undefined;
        let session = mintSessionId();
        while (Object.hasOwn(sessions, session)) session = mintSessionId();
        level = {
          editor: { session, target, kind, earlier: earlier?.session ?? null },
          entries: [],
          views: [current()],
          redone: [],
          opening: [],
          unfolded: null,
          sessions: opened,
        };
      }
      levels.push(level);
      editing = [...editing, level.editor as OpenEditor];
      notify();
      return null;
    },
    done() {
      const level = top();
      if (level.editor === null) return;
      close();
      clearRedone(level);
      const below = top();
      // Taking an unfolded session off the level below changed that level, so
      // its redo stack goes even when the session closes without entries.
      if (level.entries.length > 0 || level.unfolded !== null) clearRedone(below);
      if (level.entries.length > 0) {
        const { session, target } = level.editor;
        sessions = { ...sessions, [session]: { target, entries: level.entries } };
        below.entries.push({ session, ...stamp() });
        below.views.push(level.views.at(-1) as View);
      }
      notify();
    },
    cancel() {
      const level = top();
      if (level.editor === null) return;
      close();
      if (level.unfolded !== null) {
        const below = top();
        below.entries.push(level.unfolded.entry);
        below.views.push(level.unfolded.view);
      }
      sessions = level.sessions;
      notify();
    },
    snapshot() {
      let carried: SessionEntry | null = null;
      let all: { [id: SessionId]: Session } = { ...sessions };
      for (const level of levels.slice(1).reverse()) {
        const { session, target } = level.editor as OpenEditor;
        const entries = carried === null ? level.entries : [...level.entries, carried];
        carried = null;
        if (entries.length === 0) continue;
        all = { ...all, [session]: { target, entries: [...entries] } };
        carried = { session, ...stamp() };
      }
      const journal = carried === null ? [...main.entries] : [...main.entries, carried];
      return { view: current(), journal, sessions: reachedSessions(journal, all) };
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
