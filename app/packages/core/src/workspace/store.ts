/**
 * The workspace store: the current view and the command journal, which is
 * also the undo stack. Replaying the journal from the empty workspace
 * reproduces the view.
 *
 * An editor opened on an element (`open`) starts a session, a level of its
 * own above the journal: its commands are its entries. Done stores the
 * session and journals it as one entry on the level below; Cancel restores
 * that level, the sessions and the view exactly as they were at the
 * opening.
 *
 * Undo and redo move by steps on the innermost level, a change being one
 * command at any depth and its owner the innermost session whose own
 * entries hold it. A change the level owns itself (a command of the open
 * editor's session, or of the main journal) is a step of its own; the
 * changes of a closed session go in runs, a step being a maximal run of
 * consecutive changes owned by one closed session. Undo reverts the level's
 * latest applied step and stops at the level's start; redo re-applies the
 * earliest undone one, so redo mirrors undo step for step. The undone
 * changes of a level are always its last ones, and a new entry on the level
 * discards them, keeping a partly undone session with its applied changes.
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
import type {
  CommandEntry,
  Entry,
  ListedEntry,
  OpenEditor,
  OwnedChange,
  Session,
  SessionEntry,
  SessionId,
  Sessions,
} from "./sessions.ts";
import {
  changesOf,
  editorKindOf,
  isSessionEntry,
  keepChanges,
  listEntries,
  mintSessionId,
  reachedSessions,
} from "./sessions.ts";
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
  /** The main level's entries holding an applied change: commands and closed sessions. */
  readonly journal: readonly Entry[];
  /**
   * The closed sessions, by id, their undone changes included until a new
   * entry discards them; `snapshot()` is the replayable form.
   */
  readonly sessions: Sessions;
  /** The editing path: the open editors, outermost first. */
  readonly editing: readonly OpenEditor[];
  /** The entries of the innermost open editor's session holding an applied change; the journal when no editor is open. */
  readonly entries: readonly Entry[];
  /** Every entry of that level in order, its undone ones included, each with its undo state. */
  readonly listed: readonly ListedEntry[];
  /** How many changes Cancel would discard; 0 when no editor is open. */
  readonly changes: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Apply a command and journal it; `null` when it was accepted. */
  dispatch(command: unknown): CommandError | null;
  /** Revert the innermost level's latest applied step: one change of its own, or a closed session's run. */
  undo(): void;
  /** Re-apply the innermost level's earliest undone step. */
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
  /** Call `listener` with the view after every change of it, of a level's entries or undo state, or of `editing`; returns the unsubscriber. */
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
  /** The level's entries in order, its undone ones included. */
  entries: Entry[];
  /**
   * The level's changes in order (`changesOf(entries)`), the undone ones
   * last; the level's own are owned by its session, or by none on the main
   * journal.
   */
  readonly changes: OwnedChange[];
  /** How many of `changes` are applied. */
  applied: number;
  /**
   * `views[k]` is the view after the level's first k changes, where it is
   * known; `views[applied]`, the current view, always is, and so is
   * `views[0]` on an editor's level. `viewAt` fills the gaps.
   */
  readonly views: View[];
  /** The applied changes at the opening, which Cancel's count compares by their command entries. */
  readonly opening: readonly OwnedChange[];
  /** Whether the opening took a session entry off the level below. */
  readonly unfolded: boolean;
  /** The level below as it was at the opening, which Cancel puts back. */
  readonly below: Level | null;
  /** The sessions at the opening. */
  readonly sessions: Sessions;
}

/** A level's own copy, which the store changes while the original stays as it was. */
function copyLevel(level: Level): Level {
  return {
    ...level,
    entries: [...level.entries],
    changes: [...level.changes],
    views: level.views.slice(),
  };
}

export function createStore(workspace: Workspace, options: StoreOptions = {}): Store {
  const clock = options.clock ?? (() => new Date());
  let author = options.author ?? DEFAULT_AUTHOR;
  let sessions: Sessions = workspace.sessions;
  const loaded = changesOf(workspace.journal, sessions);
  const loadedViews: View[] = [];
  loadedViews[loaded.length] = workspace.view;
  // The main level first, then one level per open editor.
  const levels: Level[] = [
    {
      editor: null,
      entries: [...workspace.journal],
      changes: loaded,
      applied: loaded.length,
      views: loadedViews,
      opening: [],
      unfolded: false,
      below: null,
      sessions,
    },
  ];
  let editing: readonly OpenEditor[] = [];
  const listeners = new Set<(view: View) => void>();
  // Counts the changes of the store, so the derived getters are computed once per state.
  let revision = 0;
  const top = () => levels.at(-1) as Level;
  const current = () => top().views[top().applied] as View;
  const notify = () => {
    revision += 1;
    for (const listener of [...listeners]) listener(current());
  };
  const stamp = () => ({ author, time: clock().toISOString() });

  /** `compute`, computed again only after the store changed. */
  const cached = <T>(compute: () => T): (() => T) => {
    let at = -1;
    let value: T;
    return () => {
      if (at !== revision) {
        value = compute();
        at = revision;
      }
      return value;
    };
  };

  /** The view after the level's first `k` changes, applying them from the latest view it knows. */
  const viewAt = (level: Level, k: number): View => {
    let known = k;
    while (known > 0 && level.views[known] === undefined) known -= 1;
    // Only the main level may not know its first view: the empty workspace.
    if (level.views[known] === undefined) level.views[known] = createView();
    for (let next = known + 1; next <= k; next += 1) {
      if (level.views[next] !== undefined) continue;
      const change = level.changes[next - 1] as OwnedChange;
      const view = applyParsed(level.views[next - 1] as View, change.entry.command);
      if (isCommandError(view)) {
        throw new Error(`change ${next - 1} is refused: ${view.code} ${view.message}`);
      }
      level.views[next] = view;
    }
    return level.views[k] as View;
  };

  /**
   * Whether the level's changes `k − 1` and `k` belong to one step: both
   * owned by the same closed session, never by the level itself.
   */
  const joined = (level: Level, k: number): boolean => {
    const owner = level.changes[k - 1]?.owner;
    return (
      owner !== undefined &&
      owner !== (level.editor?.session ?? null) &&
      level.changes[k]?.owner === owner
    );
  };

  /** How many changes an entry holds. */
  const count = (entry: Entry): number =>
    isSessionEntry(entry) ? changesOf([entry], sessions).length : 1;

  /** The level's last entry holding an applied change, with the number of changes before it. */
  const lastApplied = (level: Level): { index: number; start: number } | null => {
    let start = level.changes.length;
    for (let index = level.entries.length - 1; index >= 0; index -= 1) {
      start -= count(level.entries[index] as Entry);
      if (start < level.applied) return { index, start };
    }
    return null;
  };

  /** The level's entries holding an applied change. */
  const appliedEntries = (level: Level): Entry[] =>
    level.entries.slice(0, (lastApplied(level)?.index ?? -1) + 1);

  const journal = cached(() => appliedEntries(levels[0] as Level));
  const entries = cached(() => appliedEntries(top()));
  const listed = cached(() => listEntries(top().entries, sessions, top().applied));

  /** Discard the level's undone changes: a session left with none goes, one left with some keeps those. */
  const discard = (level: Level) => {
    if (level.applied === level.changes.length) return;
    const kept = keepChanges(level.entries, level.applied, sessions);
    level.entries = kept.entries;
    sessions = kept.sessions;
    level.changes.length = level.applied;
    level.views.length = level.applied + 1;
  };

  const drop = (gone: SessionId) => {
    sessions = Object.fromEntries(Object.entries(sessions).filter(([id]) => id !== gone));
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
      return journal();
    },
    get sessions() {
      return sessions;
    },
    get editing() {
      return editing;
    },
    get entries() {
      return entries();
    },
    get listed() {
      return listed();
    },
    get changes() {
      const level = top();
      if (level.editor === null) return 0;
      const { opening, changes, applied } = level;
      let common = 0;
      while (
        common < opening.length &&
        common < applied &&
        opening[common]?.entry === changes[common]?.entry
      ) {
        common += 1;
      }
      return opening.length - common + (applied - common);
    },
    get canUndo() {
      return top().applied > 0;
    },
    get canRedo() {
      const level = top();
      return level.applied < level.changes.length;
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
      const entry: CommandEntry = { command: stored, ...stamp() };
      discard(level);
      level.entries.push(entry);
      level.changes.push({ entry, owner: level.editor?.session ?? null });
      level.applied += 1;
      level.views[level.applied] = next;
      notify();
      return null;
    },
    undo() {
      const level = top();
      if (level.applied === 0) return;
      do {
        level.applied -= 1;
      } while (joined(level, level.applied));
      viewAt(level, level.applied);
      notify();
    },
    redo() {
      const level = top();
      if (level.applied === level.changes.length) return;
      do {
        level.applied += 1;
      } while (joined(level, level.applied));
      viewAt(level, level.applied);
      notify();
    },
    open(target) {
      const kind = editorKindOf(current(), target);
      if (isCommandError(kind)) return kind;
      const original = top();
      if (original.editor !== null && !inside(original.editor, target)) {
        return problem(
          ErrorCode.notInside,
          `${target} does not lie inside ${original.editor.target}`,
          [target],
        );
      }
      const opened = sessions;
      const below = copyLevel(original);
      levels[levels.length - 1] = below;
      const last = lastApplied(below);
      const entry = last === null ? undefined : below.entries[last.index];
      let level: Level;
      if (
        last !== null &&
        entry !== undefined &&
        isSessionEntry(entry) &&
        sessions[entry.session]?.target === target
      ) {
        // The level's last entry holding an applied change is a session of the
        // same target: it is unfolded, its applied changes the editor's
        // entries, its undone ones the editor's to redo. Its own changes keep
        // their owner, now the open level's, so they step one at a time.
        const { index, start } = last;
        const total = count(entry);
        viewAt(below, start);
        level = {
          editor: { session: entry.session, target, kind, earlier: null },
          entries: [...(sessions[entry.session] as Session).entries],
          changes: below.changes.slice(start, start + total),
          applied: below.applied - start,
          views: below.views.slice(start, start + total + 1),
          opening: below.changes.slice(start, below.applied),
          unfolded: true,
          below: original,
          sessions: opened,
        };
        // The undone entries after it stay on the level below until Done discards them.
        below.entries.splice(index, 1);
        below.changes.splice(start, total);
        below.applied = start;
        below.views.length = start + 1;
        drop(entry.session);
      } else {
        const earlier = below.entries
          .slice(0, (last?.index ?? -1) + 1)
          .findLast((item) => isSessionEntry(item) && sessions[item.session]?.target === target) as
          | SessionEntry
          | undefined;
        let session = mintSessionId();
        while (Object.hasOwn(sessions, session)) session = mintSessionId();
        level = {
          editor: { session, target, kind, earlier: earlier?.session ?? null },
          entries: [],
          changes: [],
          applied: 0,
          views: [current()],
          opening: [],
          unfolded: false,
          below: original,
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
      discard(level);
      close();
      const below = top();
      // Taking an unfolded session off the level below changed that level, so
      // its undone changes go even when the session closes without entries.
      if (level.entries.length > 0 || level.unfolded) discard(below);
      if (level.entries.length > 0) {
        const { session, target } = level.editor;
        sessions = { ...sessions, [session]: { target, entries: level.entries } };
        below.entries.push({ session, ...stamp() });
        // The session's own changes, owned by it, now go in runs below.
        for (let k = 1; k <= level.applied; k += 1) {
          below.changes.push(level.changes[k - 1] as OwnedChange);
          const view = level.views[k];
          if (view !== undefined) below.views[below.applied + k] = view;
        }
        below.applied += level.applied;
      }
      notify();
    },
    cancel() {
      const level = top();
      if (level.editor === null) return;
      close();
      levels[levels.length - 1] = level.below as Level;
      sessions = level.sessions;
      notify();
    },
    snapshot() {
      let all = sessions;
      /** The level's applied changes only, a partly undone session with its applied ones. */
      const applied = (level: Level): Entry[] => {
        if (level.applied === level.changes.length) return [...level.entries];
        const kept = keepChanges(level.entries, level.applied, all);
        all = kept.sessions;
        return kept.entries;
      };
      let carried: SessionEntry | null = null;
      for (const level of levels.slice(1).reverse()) {
        const { session, target } = level.editor as OpenEditor;
        const entries = applied(level);
        if (carried !== null) entries.push(carried);
        carried = null;
        if (entries.length === 0) continue;
        all = { ...all, [session]: { target, entries } };
        carried = { session, ...stamp() };
      }
      const journal = applied(levels[0] as Level);
      if (carried !== null) journal.push(carried);
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
