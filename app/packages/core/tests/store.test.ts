import { describe, expect, it } from "vitest";
import type { SetCommand } from "../src/commands/types.ts";
import { JournalMismatchError } from "../src/errors.ts";
import type { PathSegment } from "../src/json.ts";
import { isSessionEntry } from "../src/workspace/sessions.ts";
import type { Workspace } from "../src/workspace/store.ts";
import { createStore } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import { A, addBlock, B, testClock } from "./support.ts";

const empty = () => ({ view: createView(), journal: [], sessions: {} });
const move = (target: string, x: number): SetCommand => ({
  type: "set",
  changes: [{ target, values: { x, y: 0 } }],
});

describe("the store", () => {
  it("stamps every accepted command with its author and time", () => {
    const store = createStore(empty(), { clock: testClock() });
    expect(store.dispatch(addBlock(A, "bare.json"))).toBeNull();
    expect(store.dispatch(move(A, 8))).toBeNull();
    store.setAuthor("Ada");
    expect(store.dispatch(move(A, 16))).toBeNull();
    expect(store.journal.map(({ author, time }) => [author, time])).toEqual([
      ["Gerhardt", "2026-10-11T14:03:12.418Z"],
      ["Gerhardt", "2026-10-11T14:03:13.418Z"],
      ["Ada", "2026-10-11T14:03:14.418Z"],
    ]);
    const [, moved] = store.journal;
    if (moved === undefined || isSessionEntry(moved))
      throw new Error("the move is a command entry");
    expect(moved.command).toEqual(move(A, 8));
  });

  it("journals nothing for a refused command and tells no listener", () => {
    const store = createStore(empty(), { clock: testClock() });
    store.dispatch(addBlock(A, "bare.json"));
    const view = store.view;
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    expect(store.dispatch(move(B, 1))).toEqual({
      code: "unknown_target",
      message: `${B} names nothing`,
      path: [B],
    });
    expect(store.view).toBe(view);
    expect(store.journal.length).toBe(1);
    expect(calls).toBe(0);
    store.dispatch(move(A, 1));
    expect(store.journal[1]?.time).toBe("2026-10-11T14:03:13.418Z");
  });

  it("undoes and redoes to the very same views", () => {
    const store = createStore(empty(), { clock: testClock() });
    const views: View[] = [store.view];
    for (const command of [addBlock(A, "bare.json"), move(A, 8), move(A, 16)]) {
      store.dispatch(command);
      views.push(store.view);
    }
    const entries = [...store.journal];
    expect([store.canUndo, store.canRedo]).toEqual([true, false]);
    for (let k = 1; k <= 3; k += 1) {
      store.undo();
      expect(store.view).toBe(views[3 - k]);
      expect(store.journal).toEqual(entries.slice(0, 3 - k));
    }
    expect([store.canUndo, store.canRedo]).toEqual([false, true]);
    store.undo();
    expect(store.view).toBe(views[0]);
    for (let k = 1; k <= 3; k += 1) {
      store.redo();
      expect(store.view).toBe(views[k]);
      expect(store.journal).toEqual(entries.slice(0, k));
    }
    expect([store.canUndo, store.canRedo]).toEqual([true, false]);
    store.redo();
    expect(store.view).toBe(views[3]);
    store.undo();
    store.dispatch(move(A, 4));
    expect(store.canRedo).toBe(false);
  });

  it("undoes past the loaded view by replaying the journal", () => {
    const first = createStore(empty(), { clock: testClock() });
    const views: View[] = [first.view];
    for (const command of [addBlock(A, "bare.json"), move(A, 8), move(A, 16)]) {
      first.dispatch(command);
      views.push(first.view);
    }
    const second = createStore(first.snapshot());
    for (let k = 1; k <= 3; k += 1) {
      second.undo();
      expect(second.view).toEqual(views[3 - k]);
    }
    expect(second.view).toEqual(createView());
    for (let k = 0; k < 3; k += 1) second.redo();
    expect(second.view).toEqual(first.view);
  });

  it("calls each listener with the new view until it unsubscribes", () => {
    const store = createStore(empty(), { clock: testClock() });
    const seen: View[] = [];
    const unsubscribe = store.subscribe((view) => seen.push(view));
    store.dispatch(addBlock(A, "bare.json"));
    store.undo();
    store.redo();
    expect(seen.length).toBe(3);
    expect(seen[0]).toBe(seen[2]);
    expect(seen[1]).toEqual(createView());
    unsubscribe();
    store.dispatch(move(A, 2));
    expect(seen.length).toBe(3);
  });

  it("counts the editors it opens", () => {
    const store = createStore(empty(), { clock: testClock() });
    store.dispatch(addBlock(A, "bare.json"));
    expect(store.openings).toBe(0);
    expect(store.open(A)).toBeNull();
    expect(store.open(`${A}/bare`)).toBeNull();
    expect(store.openings).toBe(2);
    store.cancel();
    store.done();
    expect(store.open(`${A}/ghost`)?.code).toBe("unknown_target");
    expect(store.openings).toBe(2);
    expect(store.open(A)).toBeNull();
    expect(store.openings).toBe(3);
  });
});

describe("opening a workspace", () => {
  /** A workspace written by a store: block `A` added, then moved to 8 and to 16. */
  function written(): Workspace {
    const store = createStore(empty(), { clock: testClock() });
    for (const command of [addBlock(A, "bare.json"), move(A, 8), move(A, 16)]) {
      store.dispatch(command);
    }
    return store.snapshot();
  }

  /** What `createStore` throws for `workspace`: the entry and path its error names. */
  function mismatch(workspace: Workspace): { entry: number; path: readonly PathSegment[] } {
    try {
      createStore(workspace);
    } catch (error) {
      if (error instanceof JournalMismatchError) return { entry: error.entry, path: error.path };
      throw error;
    }
    throw new Error("the workspace opened");
  }

  it("opens a workspace whose journal reproduces its view, that very view", () => {
    const workspace = written();
    expect(createStore(workspace).view).toBe(workspace.view);
  });

  it("refuses a view the journal does not produce, at the first difference", () => {
    const workspace = written();
    const block = workspace.view.blocks[A];
    if (block === undefined) throw new Error("A was added");
    const moved = { ...workspace.view, blocks: { [A]: { ...block, x: 99 } } };
    expect(mismatch({ ...workspace, view: moved })).toEqual({ entry: 3, path: ["blocks", A, "x"] });
    const settings = { ...workspace.view.settings, grid: { size: 16, snap: true } };
    expect(mismatch({ ...workspace, view: { ...workspace.view, settings } })).toEqual({
      entry: 3,
      path: ["settings", "grid"],
    });
    expect(mismatch({ ...workspace, journal: [] })).toEqual({ entry: 0, path: ["blocks", A] });
  });

  it("refuses a journal entry the commands refuse, at that entry", () => {
    const workspace = written();
    const [first, second, third] = workspace.journal;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("three entries");
    }
    const refused = { ...second, command: move(B, 8) };
    expect(mismatch({ ...workspace, journal: [first, refused, third] })).toEqual({
      entry: 1,
      path: ["journal", 1],
    });
  });
});
