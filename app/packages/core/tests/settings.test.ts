import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import type { Command, SetCommand } from "../src/commands/types.ts";
import { isCommandError } from "../src/errors.ts";
import { isSessionEntry } from "../src/workspace/sessions.ts";
import type { SettingsChange, Store } from "../src/workspace/store.ts";
import { createStore, replay } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import { A, addBlock, B, testClock } from "./support.ts";

const empty = () => ({ view: createView(), journal: [], sessions: {} });
const move = (block: string, x: number): SetCommand => ({
  type: "set",
  changes: [{ target: { block }, values: { x, y: 0 } }],
});
const STATEMENT = { select: { element: "map" as const }, set: { stroke: "#C00000" } };

/** A store holding three journalled commands, with the count of clock reads. */
function threeEntries(): { store: Store; reads: () => number } {
  const clock = testClock();
  let count = 0;
  const store = createStore(empty(), {
    clock: () => {
      count += 1;
      return clock();
    },
  });
  for (const command of [addBlock(A, "bare.json"), move(A, 8), move(A, 16)]) {
    expect(store.dispatch(command)).toBeNull();
  }
  return { store, reads: () => count };
}

/** The `block` value of a journalled `add`. */
function addedBlock(store: Store, index: number): unknown {
  const entry = store.journal[index];
  if (entry === undefined || isSessionEntry(entry)) throw new Error("a command entry");
  const command: Command = entry.command;
  if (command.type !== "add") throw new Error("an add");
  return command.block;
}

describe("workspace settings", () => {
  it("changes outside the journal, and no undo, redo or Cancel reverts it", () => {
    const { store, reads } = threeEntries();
    const journal = store.journal;
    const before = store.view;
    const heard: View[] = [];
    store.subscribe((view) => heard.push(view));
    const clockReads = reads();
    expect(store.configure({ grid: { size: 16, snap: false } })).toBeNull();
    expect(store.journal).toEqual(journal);
    expect(store.journal.length).toBe(3);
    expect(store.journal.every((entry, index) => entry === journal[index])).toBe(true);
    expect(store.view.settings.grid).toEqual({ size: 16, snap: false });
    expect(store.view).not.toBe(before);
    expect(store.view.blocks).toBe(before.blocks);
    expect(heard).toEqual([store.view]);
    expect(reads()).toBe(clockReads);
    store.undo();
    expect(store.view.blocks[A]?.x).toBe(8);
    expect(store.view.settings.grid).toEqual({ size: 16, snap: false });
    store.redo();
    expect(store.view.blocks[A]?.x).toBe(16);
    expect(store.view.settings.grid).toEqual({ size: 16, snap: false });
    expect(store.open({ block: A })).toBeNull();
    expect(store.configure({ grid: { size: 4, snap: true } })).toBeNull();
    store.cancel();
    expect(store.view.settings.grid).toEqual({ size: 4, snap: true });
  });

  it("keeps a member the change leaves as it was the same object", () => {
    const { store } = threeEntries();
    const before = store.view.settings;
    expect(store.configure({ grid: { size: 16 } })).toBeNull();
    const after = store.view.settings;
    expect([
      after.grid === before.grid,
      after.blockDefaults === before.blockDefaults,
      after.granularity === before.granularity,
    ]).toEqual([false, true, true]);
    expect(store.configure({ granularity: { int: { step: 2, refine: true } } })).toBeNull();
    expect([
      store.view.settings.grid === after.grid,
      store.view.settings.granularity === after.granularity,
    ]).toEqual([true, false]);
  });

  it("journals the workspace's graphical, and undoes it", () => {
    const { store } = threeEntries();
    const settings = store.view.settings;
    expect(
      store.dispatch({
        type: "set",
        changes: [{ target: {}, values: { graphical: { statements: [STATEMENT] } } }],
      }),
    ).toBeNull();
    expect(store.journal.length).toBe(4);
    expect(store.view.graphical).toEqual({ statements: [STATEMENT] });
    expect(store.view.settings).toBe(settings);
    store.undo();
    expect(store.view.graphical).toEqual({});
    store.redo();
    expect(store.view.graphical).toEqual({ statements: [STATEMENT] });
  });

  it("states every placement member in a journalled add, so a replay reads no setting", () => {
    const store = createStore(empty(), { clock: testClock() });
    expect(store.dispatch(addBlock(A, "bare.json"))).toBeNull();
    expect(store.configure({ blockDefaults: { length: 600 } })).toBeNull();
    expect(store.dispatch(addBlock(B, "bare.json"))).toBeNull();
    const placement = { scale: 1, spacing: 8, margin: 0, width: null, height: null };
    expect(addedBlock(store, 0)).toMatchObject({ ...placement, length: 400 });
    expect(addedBlock(store, 1)).toMatchObject({ ...placement, length: 600 });
    const replayed = replay(store.journal, store.sessions).at(-1);
    expect(replayed?.blocks).toEqual(store.view.blocks);
    expect(replayed?.blocks[A]?.length).toBe(400);
    expect(replayed?.blocks[B]?.length).toBe(600);
    expect(() => createStore(store.snapshot())).not.toThrow();
  });

  it("applies a journalled add under any block defaults to the same block", () => {
    const store = createStore(empty(), { clock: testClock() });
    expect(store.dispatch(addBlock(A, "bare.json"))).toBeNull();
    const entry = store.journal[0];
    if (entry === undefined || isSessionEntry(entry)) throw new Error("a command entry");
    const other = createView({
      ...createView().settings,
      blockDefaults: { scale: 3, length: 999, spacing: 1, margin: 5, width: 50, height: 60 },
    });
    const applied = apply(other, entry.command);
    if (isCommandError(applied)) throw new Error(applied.message);
    expect(applied.blocks[A]).toEqual(store.view.blocks[A]);
  });

  it("takes the view's block defaults for an add applied outside the store that leaves them out", () => {
    const other = createView({
      ...createView().settings,
      blockDefaults: { scale: 3, length: 999, spacing: 1, margin: 5, width: 50, height: 60 },
    });
    const applied = apply(other, addBlock(A, "bare.json"));
    if (isCommandError(applied)) throw new Error(applied.message);
    expect(applied.blocks[A]).toMatchObject({
      scale: 3,
      length: 999,
      spacing: 1,
      margin: 5,
      width: 50,
      height: 60,
    });
  });

  it("keeps a placement member the add states", () => {
    const store = createStore(empty(), { clock: testClock() });
    const add = addBlock(A, "bare.json");
    if (add.type !== "add") throw new Error("an add");
    const block = { ...(add.block as object), scale: 2 };
    expect(store.dispatch({ ...add, block })).toBeNull();
    expect(addedBlock(store, 0)).toMatchObject({ scale: 2, length: 400 });
    expect(store.view.blocks[A]?.scale).toBe(2);
  });

  type Refused = [SettingsChange, string, readonly (string | number)[]];
  it.each<Refused>([
    [{ grid: { size: 0 } }, "non_positive_number", ["settings", "grid", "size"]],
    [
      { granularity: { fraction: { denominator: 1.5, refine: true } } },
      "invalid_value",
      ["settings", "granularity", "fraction", "denominator"],
    ],
    ...["0", "-1", "1e-3", ".5"].map(
      (step): Refused => [
        { granularity: { float: { step, refine: true } } },
        "invalid_value",
        ["settings", "granularity", "float", "step"],
      ],
    ),
    [
      { granularity: { int: { step: 0, refine: true } } },
      "non_positive_number",
      ["settings", "granularity", "int", "step"],
    ],
  ])("refuses %j with %s at its path", (change, code, path) => {
    const { store } = threeEntries();
    const view = store.view;
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    const refused = store.configure(change);
    expect(refused && { code: refused.code, path: refused.path }).toEqual({ code, path });
    expect(store.view).toBe(view);
    expect(calls).toBe(0);
  });

  it("accepts a change to the values held, changing nothing", () => {
    const { store } = threeEntries();
    const view = store.view;
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    expect(store.configure({ grid: { size: 8, snap: true } })).toBeNull();
    expect(store.view).toBe(view);
    expect(calls).toBe(0);
  });

  it("is accepted inside an editor, and leaves its session's entries", () => {
    const { store } = threeEntries();
    expect(store.open({ block: A })).toBeNull();
    expect(store.dispatch(move(A, 24))).toBeNull();
    const entries = store.entries;
    expect(store.configure({ granularity: { float: { step: "0.2", refine: false } } })).toBeNull();
    expect(store.entries).toEqual(entries);
    expect(store.view.settings.granularity.float).toEqual({ step: "0.2", refine: false });
  });
});
