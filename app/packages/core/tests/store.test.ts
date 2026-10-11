import { describe, expect, it } from "vitest";
import type { View } from "../src/index.ts";
import { createStore, createView } from "../src/index.ts";
import { A, addBlock, B, testClock } from "./support.ts";

const empty = () => ({ view: createView(), journal: [] });
const move = (target: string, x: number) => ({
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
    expect(store.journal[1]?.command).toEqual(move(A, 8));
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

  it("undoes past the session's start by replaying the journal", () => {
    const first = createStore(empty(), { clock: testClock() });
    const views: View[] = [first.view];
    for (const command of [addBlock(A, "bare.json"), move(A, 8), move(A, 16)]) {
      first.dispatch(command);
      views.push(first.view);
    }
    const second = createStore({ view: first.view, journal: first.journal });
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
});
