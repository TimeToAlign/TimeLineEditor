import { describe, expect, it } from "vitest";
import type { SetCommand } from "../src/commands/types.ts";
import { JournalMismatchError } from "../src/errors.ts";
import type { PathSegment } from "../src/json.ts";
import { addressKey } from "../src/manifest/address.ts";
import type { Address } from "../src/workspace/address.ts";
import type { CommandEntry, SessionEntry } from "../src/workspace/sessions.ts";
import { isSessionEntry } from "../src/workspace/sessions.ts";
import type { Store, Workspace } from "../src/workspace/store.ts";
import { createStore, RECENT_VIEWS, sameView, VIEW_CHECKPOINT } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import { A, addBlock, B, refusal, testClock } from "./support.ts";

const empty = () => ({ view: createView(), journal: [], sessions: {} });
const move = (block: string, x: number): SetCommand => ({
  type: "set",
  changes: [{ target: { block }, values: { x, y: 0 } }],
});

describe("the store", () => {
  it("stamps every accepted command with its author and time", () => {
    const store = createStore(empty(), { clock: testClock() });
    expect(store.dispatch(addBlock(A, "bare.yaml"))).toBeNull();
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
    store.dispatch(addBlock(A, "bare.yaml"));
    const view = store.view;
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    expect(store.dispatch(move(B, 1))).toEqual({
      code: "unknown_target",
      message: `block '${B}' names nothing`,
      path: [`{"block":"${B}"}`],
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
    for (const command of [addBlock(A, "bare.yaml"), move(A, 8), move(A, 16)]) {
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

  it("keeps the latest views and every 16th, replaying the others", () => {
    expect([RECENT_VIEWS, VIEW_CHECKPOINT]).toEqual([64, 16]);
    const store = createStore(empty(), { clock: testClock() });
    const views: View[] = [store.view];
    store.dispatch(addBlock(A, "bare.yaml"));
    views.push(store.view);
    for (let n = 1; n <= 200; n += 1) {
      expect(store.dispatch(move(A, 8 * n))).toBeNull();
      views.push(store.view);
    }
    const kept = (k: number) => k === 0 || k >= 137 || (k <= 128 && k % 16 === 0);
    let replayed121: View | undefined;
    for (let k = 200; k >= 0; k -= 1) {
      store.undo();
      expect(store.view).toEqual(views[k]);
      expect(store.view === views[k]).toBe(kept(k));
      expect([sameView(store.view, views[k] as View), sameView(store.view, null)]).toEqual([
        true,
        false,
      ]);
      if (k === 121) replayed121 = store.view;
      if (k === 120) {
        store.redo();
        expect(store.view).toBe(replayed121);
        store.undo();
      }
    }
    for (let k = 1; k <= 201; k += 1) {
      store.redo();
      expect(store.view).toEqual(views[k]);
    }
    expect(store.view.blocks[A]?.x).toBe(1600);
    expect(sameView(views[200] as View, views[201] as View)).toBe(false);
    expect(store.dispatch(move(A, 4))).toBeNull();
    expect(store.journal.length).toBe(202);
  });

  it("undoes past the loaded view by replaying the journal", () => {
    const first = createStore(empty(), { clock: testClock() });
    const views: View[] = [first.view];
    for (const command of [addBlock(A, "bare.yaml"), move(A, 8), move(A, 16)]) {
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
    store.dispatch(addBlock(A, "bare.yaml"));
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
    store.dispatch(addBlock(A, "bare.yaml"));
    expect(store.openings).toBe(0);
    expect(store.open({ block: A })).toBeNull();
    expect(store.open({ block: A, id: "bare" })).toBeNull();
    expect(store.openings).toBe(2);
    store.cancel();
    store.done();
    expect(store.open({ block: A, id: "ghost" })?.code).toBe("unknown_target");
    expect(store.openings).toBe(2);
    expect(store.open({ block: A })).toBeNull();
    expect(store.openings).toBe(3);
  });
});

describe("opening a workspace", () => {
  /** A workspace written by a store: block `A` added, then moved to 8 and to 16. */
  function written(): Workspace {
    const store = createStore(empty(), { clock: testClock() });
    for (const command of [addBlock(A, "bare.yaml"), move(A, 8), move(A, 16)]) {
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
    const graphical = {
      rules: [{ select: { element: "map" as const }, set: { stroke: "#C00000" } }],
    };
    expect(mismatch({ ...workspace, view: { ...workspace.view, graphical } })).toEqual({
      entry: 3,
      path: ["graphical"],
    });
    expect(mismatch({ ...workspace, journal: [] })).toEqual({ entry: 0, path: ["blocks", A] });
  });

  it("never compares the settings, and opens with the workspace's own", () => {
    const workspace = written();
    const settings = { ...workspace.view.settings, grid: { size: 16, snap: false } };
    const store = createStore({ ...workspace, view: { ...workspace.view, settings } });
    expect(store.view.settings.grid).toEqual({ size: 16, snap: false });
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

describe("several commands as one step", () => {
  const BUNDLE = "bundle0001";
  const at = (id: string): Address => ({ block: BUNDLE, id });
  const G1 = at("group_1");
  const G2 = at("group_2");
  const rename = (id: string, name: string) => ({
    type: "set",
    changes: [{ target: at(id), values: { name } }],
  });
  const S = rename("score", "S");
  const P = rename("performance", "P");

  /** A store whose journal holds the `add` of block `bundle0001` holding `bundle_mixed.yaml`. */
  function mixed(): Store {
    const store = createStore(empty(), { clock: testClock() });
    expect(store.dispatch(addBlock(BUNDLE, "bundles/bundle_mixed.yaml"))).toBeNull();
    return store;
  }

  it("journals them as one closed session, undone and redone in one step", () => {
    const store = mixed();
    const before = store.view;
    const seen: View[] = [];
    store.subscribe((view) => seen.push(view));
    expect(store.edit(G1, [S, P])).toBeNull();
    const after = store.view;
    expect(seen).toEqual([after]);
    expect(store.journal.length).toBe(2);
    const entry = store.journal[1] as SessionEntry;
    expect(isSessionEntry(entry)).toBe(true);
    expect(entry.time).toBe("2026-10-11T14:03:15.418Z");
    expect(store.sessions[entry.session]).toEqual({
      target: G1,
      entries: [
        { command: S, author: "Gerhardt", time: "2026-10-11T14:03:13.418Z" },
        { command: P, author: "Gerhardt", time: "2026-10-11T14:03:14.418Z" },
      ],
    });
    expect(store.listed.map(({ changes, applied }) => [changes, applied])).toEqual([
      [1, 1],
      [2, 2],
    ]);
    expect([store.editing, store.openings]).toEqual([[], 0]);
    store.undo();
    expect(store.view).toBe(before);
    store.redo();
    expect(store.view).toBe(after);
    expect(seen).toEqual([after, before, after]);
    const loaded = createStore(store.snapshot(), { clock: testClock() });
    loaded.undo();
    expect(loaded.view).toEqual(before);
  });

  it("changes nothing where one of them or the editor is refused", () => {
    const store = mixed();
    const { view, journal, sessions } = store;
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    expect(refusal(store.edit(G1, [S, rename("nowhere", "X")]))).toEqual({
      code: "unknown_target",
      path: [addressKey(at("nowhere"))],
    });
    expect(refusal(store.edit(G1, [S, rename("annotations", "A")]))).toEqual({
      code: "side_effect",
      path: [addressKey(at("annotations"))],
    });
    expect(refusal(store.edit({}, [S]))).toEqual({ code: "no_editor", path: ["{}"] });
    expect(store.edit(G1, [])).toBeNull();
    expect([store.view, store.journal, store.sessions, calls]).toEqual([
      view,
      journal,
      sessions,
      0,
    ]);
    expect(store.view).toBe(view);
  });

  it("journals one command as itself, admitted by the editor all the same", () => {
    const store = mixed();
    const { view, sessions } = store;
    expect(store.edit(G1, [S])).toBeNull();
    expect(store.journal.length).toBe(2);
    expect(store.journal[1]).toEqual({
      command: S,
      author: "Gerhardt",
      time: "2026-10-11T14:03:13.418Z",
    });
    expect(store.sessions).toBe(sessions);
    store.undo();
    expect(store.view).toBe(view);
    expect(refusal(store.edit(G1, [rename("annotations", "A")]))).toEqual({
      code: "side_effect",
      path: [addressKey(at("annotations"))],
    });
  });

  it("nests in the open editor of a target inside it", () => {
    const store = mixed();
    expect(store.open({ block: BUNDLE })).toBeNull();
    const opened = store.view;
    expect(store.edit(G1, [S, P])).toBeNull();
    expect(store.entries.map(isSessionEntry)).toEqual([true]);
    store.undo();
    expect(store.view).toBe(opened);
    store.cancel();
    expect(store.open(G2)).toBeNull();
    expect(store.edit(G1, [S, P])).toEqual({
      code: "not_inside",
      message: "group 'Performance' does not lie inside group 'Facsimile'",
      path: [addressKey(G1)],
    });
    store.cancel();
  });

  it("is one step inside the open editor of its own target, and after its Done", () => {
    const store = mixed();
    expect(store.open(G1)).toBeNull();
    const own = store.view;
    expect(store.edit(G1, [S, P])).toBeNull();
    const renamed = store.view;
    const [entry] = store.entries as SessionEntry[];
    expect(store.entries.length).toBe(1);
    expect(store.sessions[entry?.session ?? ""]).toEqual({
      target: G1,
      entries: [
        { command: S, author: "Gerhardt", time: "2026-10-11T14:03:13.418Z" },
        { command: P, author: "Gerhardt", time: "2026-10-11T14:03:14.418Z" },
      ],
    });
    store.undo();
    expect([store.view, store.canUndo]).toEqual([own, false]);
    expect(store.view).toBe(own);
    store.redo();
    expect(store.view).toBe(renamed);
    store.done();
    const closed = store.journal.at(-1) as SessionEntry;
    expect(store.sessions[closed.session]?.entries).toEqual([entry]);
    store.undo();
    expect(store.view).toEqual(own);
    expect(store.canUndo).toBe(true);
  });

  it("is one step inside the flow-control editor of its own timeline", () => {
    const store = mixed();
    const score = at("score");
    const barline = (quarter: number) => ({
      type: "add",
      into: score,
      flow_control: { role: "barline", coordinate: [quarter, 1] },
    });
    expect(store.open(score, "flow")).toBeNull();
    const opened = store.view;
    expect(store.edit(score, [barline(4), barline(8)], "flow")).toBeNull();
    expect(store.entries.map(isSessionEntry)).toEqual([true]);
    const [entry] = store.entries as SessionEntry[];
    expect(store.sessions[entry?.session ?? ""]?.kind).toBe("flow");
    store.undo();
    expect(store.view).toBe(opened);
  });

  /** The `add` of a region of quarters 0 to 4 into `score`. */
  const region = { type: "add", into: at("score"), region: { start: [0, 1], end: [4, 1] } };

  it("makes a later command from what the earlier ones made", () => {
    const store = mixed();
    const before = store.view;
    const next = store.minter().mint("region");
    let given: readonly string[] = [];
    const named = (made: readonly { readonly ids: readonly string[] }[]) => {
      given = made[0]?.ids ?? [];
      return rename(given[0] ?? "", "R");
    };
    expect(store.edit(at("score"), [region, named])).toBeNull();
    expect(given).toEqual([next]);
    const regions = store.view.blocks[BUNDLE]?.manifest.timelines.find(
      ({ id }) => id === "score",
    )?.regions;
    expect(regions?.find(({ id }) => id === next)?.name).toBe("R");
    const entry = store.journal.at(-1) as SessionEntry;
    expect(store.sessions[entry.session]?.entries[0]).toEqual({
      command: { ...region, ids: [next] },
      author: "Gerhardt",
      time: "2026-10-11T14:03:13.418Z",
    });
    store.undo();
    expect(store.view).toBe(before);
  });

  it("mints nothing when refused, nor does a refused dispatch", () => {
    const store = mixed();
    const next = store.minter().mint("region");
    expect(refusal(store.edit(at("score"), [region, rename("nowhere", "X")]))).toEqual({
      code: "unknown_target",
      path: [addressKey(at("nowhere"))],
    });
    expect(store.open(G2)).toBeNull();
    expect(refusal(store.dispatch(region)).code).toBe("side_effect");
    store.cancel();
    expect(store.minter().mint("region")).toBe(next);
    expect(store.dispatch(region)).toBeNull();
    expect((store.journal.at(-1) as CommandEntry).command).toEqual({ ...region, ids: [next] });
  });
});
