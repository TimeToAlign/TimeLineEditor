import { describe, expect, it } from "vitest";
import type { Entry, Session, SessionEntry, Store, View } from "../src/index.ts";
import {
  createStore,
  createView,
  editorKindOf,
  isLoadError,
  isSessionEntry,
  mintSessionId,
  readWorkspace,
  replay,
  writeWorkspace,
} from "../src/index.ts";
import { A, addBlock, refusal, testClock, viewOf } from "./support.ts";

const BUNDLE = "bundle0001";
const G1 = `${BUNDLE}/group_1`;
const G2 = `${BUNDLE}/group_2`;
const at = (element: string) => `${BUNDLE}/${element}`;
const rename = (element: string, name: string) => ({
  type: "set",
  changes: [{ target: at(element), values: { name } }],
});
const set = (target: string, values: object) => ({ type: "set", changes: [{ target, values }] });
const style = (select: object) => ({ type: "style", select, set: { stroke: "#FF0000" } });

/** A store whose journal holds the `add` of block `bundle0001` holding `bundle_mixed.json`. */
function mixedStore(): Store {
  const store = createStore(
    { view: createView(), journal: [], sessions: {} },
    { clock: testClock() },
  );
  expect(store.dispatch(addBlock(BUNDLE, "bundles/bundle_mixed.json"))).toBeNull();
  return store;
}

/** A store after `group_1`'s editor made two sets and closed with Done. */
function doneStore() {
  const store = mixedStore();
  const afterAdd = store.view;
  expect(store.open(G1)).toBeNull();
  const session = store.editing[0]?.session as string;
  expect(store.dispatch(rename("score", "S"))).toBeNull();
  expect(store.dispatch(rename("performance", "P"))).toBeNull();
  const entries = [...store.entries];
  store.done();
  return { store, afterAdd, session, entries, after: store.view };
}

describe("editor ids and kinds", () => {
  it("mints a session id as a block id is minted", () => {
    const bytes = [0, 1, 35, 36, 252, 255, 71, 2, 3, 4, 5, 6];
    let next = 0;
    const fill = (out: Uint8Array) => {
      out[0] = bytes[next++] as number;
    };
    expect(mintSessionId(fill)).toBe("01z0z23456");
    expect(mintSessionId()).toMatch(/^[0-9a-z]{10}$/);
  });

  it("names the editor of each address", () => {
    const view = viewOf([BUNDLE, "bundles/bundle_mixed.json"], [A, "map.json"]);
    expect(editorKindOf(view, BUNDLE)).toBe("bundle");
    expect(editorKindOf(view, G1)).toBe("group");
    expect(editorKindOf(view, at("annotations"))).toBe("timeline");
    expect(editorKindOf(view, at("excerpt"))).toBe("timeline");
    for (const address of [
      "workspace",
      at("name"),
      at("group_1/name"),
      at("score/card"),
      `${A}/melody/tempo`,
    ]) {
      expect(editorKindOf(view, address)).toEqual({
        code: "no_editor",
        message: `${address} has no editor`,
        path: [address],
      });
    }
    for (const address of [at("nothing"), "0000000009"]) {
      expect(refusal(editorKindOf(view, address))).toEqual({
        code: "unknown_target",
        path: [address],
      });
    }
  });
});

describe("editor sessions", () => {
  it("journals a session closed with Done as one entry", () => {
    const store = mixedStore();
    const opening = store.view;
    expect(store.open(G1)).toBeNull();
    expect(store.editing).toEqual([
      {
        session: expect.stringMatching(/^[0-9a-z]{10}$/),
        target: G1,
        kind: "group",
        earlier: null,
      },
    ]);
    const session = store.editing[0]?.session as string;
    expect([store.entries, store.canUndo, store.view]).toEqual([[], false, opening]);
    expect(store.view).toBe(opening);
    expect(store.dispatch(rename("score", "S"))).toBeNull();
    expect(store.dispatch(rename("performance", "P"))).toBeNull();
    expect(store.entries.length).toBe(2);
    expect(store.journal.length).toBe(1);
    const entries = [...store.entries];
    const after = store.view;
    store.done();
    expect(store.editing).toEqual([]);
    expect(store.journal.length).toBe(2);
    expect(store.journal[1]).toEqual({
      session,
      author: "Gerhardt",
      time: "2026-10-11T14:03:15.418Z",
    });
    expect(store.sessions).toEqual({ [session]: { target: G1, entries } });
    expect(store.view).toBe(after);
    const closed = store.journal[1];
    store.undo();
    expect(store.view).toBe(opening);
    expect(store.undone).toEqual([closed]);
    store.redo();
    expect(store.view).toBe(after);
  });

  it("stops undo at the start of a session", () => {
    const store = mixedStore();
    const opening = store.view;
    store.open(G1);
    store.dispatch(rename("score", "S"));
    const [entry] = store.entries;
    store.undo();
    store.undo();
    expect(store.entries).toEqual([]);
    expect(store.undone).toEqual([entry]);
    expect(store.view).toBe(opening);
    expect(store.journal.length).toBe(1);
  });

  it("counts Cancel's changes and restores the opening exactly", () => {
    const store = mixedStore();
    store.dispatch(set(BUNDLE, { x: 40 }));
    store.undo();
    const opening = store.view;
    const journal = [...store.journal];
    const undone = store.undone;
    expect(store.changes).toBe(0);
    store.open(G1);
    store.dispatch(rename("score", "S"));
    store.dispatch(rename("performance", "P"));
    store.undo();
    expect(store.changes).toBe(1);
    store.cancel();
    expect(store.editing).toEqual([]);
    expect(store.view).toBe(opening);
    expect(store.journal).toEqual(journal);
    expect(store.sessions).toEqual({});
    expect(store.undone).toEqual(undone);
    expect(store.canRedo).toBe(true);
    expect(store.changes).toBe(0);
  });

  it("unfolds a reopened session that is the latest entry of its level", () => {
    const { store, afterAdd, session, entries } = doneStore();
    expect(store.open(G1)).toBeNull();
    expect(store.editing).toEqual([{ session, target: G1, kind: "group", earlier: null }]);
    expect(store.entries).toEqual(entries);
    expect(store.entries[0]).toBe(entries[0]);
    expect(store.entries[1]).toBe(entries[1]);
    expect([store.canUndo, store.changes, store.journal.length]).toEqual([true, 0, 1]);
    expect(store.sessions).toEqual({});
    store.undo();
    store.undo();
    expect(store.view).toEqual(afterAdd);
    expect(store.changes).toBe(2);
    store.done();
    expect(store.journal.length).toBe(1);
    expect(store.sessions).toEqual({});
  });

  it("puts an unfolded session back on Cancel", () => {
    const { store, after } = doneStore();
    const closed = store.journal[1];
    const sessions = store.sessions;
    store.open(G1);
    store.undo();
    expect(store.changes).toBe(1);
    store.cancel();
    expect(store.journal.length).toBe(2);
    expect(store.journal[1]).toBe(closed);
    expect(store.sessions).toEqual(sessions);
    expect(store.view).toBe(after);
  });

  it("counts changes from the common prefix of the entries", () => {
    const { store } = doneStore();
    store.open(G1);
    store.undo();
    store.dispatch(rename("score", "T"));
    expect(store.changes).toBe(2);
  });

  it("opens a fresh session when a later entry follows the earlier one", () => {
    const { store, session } = doneStore();
    store.dispatch(set(BUNDLE, { x: 40 }));
    expect(store.open(G1)).toBeNull();
    const [editor] = store.editing;
    expect(editor?.session).not.toBe(session);
    expect(editor?.earlier).toBe(session);
    expect([store.entries, store.canUndo, store.journal.length]).toEqual([[], false, 3]);
    store.cancel();
    store.open(G2);
    expect(store.editing[0]?.earlier).toBeNull();
  });

  it("nests sessions and replays them in place", () => {
    const store = mixedStore();
    const afterAdd = store.view;
    expect(store.open(BUNDLE)).toBeNull();
    expect(store.editing[0]?.kind).toBe("bundle");
    store.dispatch(rename("annotations", "A"));
    expect(store.open(G1)).toBeNull();
    const inner = store.editing[1]?.session as string;
    store.dispatch(rename("score", "S"));
    store.done();
    expect(store.entries.length).toBe(2);
    expect(store.entries[1]).toEqual({
      session: inner,
      author: "Gerhardt",
      time: "2026-10-11T14:03:15.418Z",
    });
    const outer = store.editing[0]?.session as string;
    store.done();
    expect(store.journal.length).toBe(2);
    expect((store.journal[1] as SessionEntry).session).toBe(outer);
    expect(Object.keys(store.sessions).sort()).toEqual([inner, outer].sort());
    const bundleSession = store.sessions[outer] as Session;
    expect(bundleSession.target).toBe(BUNDLE);
    expect(bundleSession.entries.length).toBe(2);
    expect((bundleSession.entries[1] as SessionEntry).session).toBe(inner);
    const views = replay(store.journal, store.sessions);
    expect(views.length).toBe(3);
    expect(views.at(-1)).toEqual(store.view);
    store.undo();
    expect(store.view).toEqual(afterAdd);
  });

  it("cancels only the innermost editor", () => {
    const store = mixedStore();
    store.open(BUNDLE);
    store.dispatch(rename("annotations", "A"));
    const renamed = store.view;
    store.open(G1);
    store.dispatch(rename("score", "S"));
    store.cancel();
    expect(store.editing.map((editor) => editor.target)).toEqual([BUNDLE]);
    expect(store.entries.length).toBe(1);
    expect(store.view).toBe(renamed);
    store.done();
    const closed = store.journal.at(-1) as SessionEntry;
    expect(store.sessions[closed.session]?.entries.length).toBe(1);
  });

  it("refuses to open what has no editor or does not lie inside", () => {
    const store = mixedStore();
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });
    expect(refusal(store.open("workspace"))).toEqual({ code: "no_editor", path: ["workspace"] });
    expect(refusal(store.open(at("nothing")))).toEqual({
      code: "unknown_target",
      path: [at("nothing")],
    });
    store.open(G1);
    expect(store.open(G1)).toEqual({
      code: "not_inside",
      message: `${G1} does not lie inside ${G1}`,
      path: [G1],
    });
    store.cancel();
    store.open(BUNDLE);
    expect(refusal(store.open(BUNDLE))).toEqual({ code: "not_inside", path: [BUNDLE] });
    expect(store.editing.length).toBe(1);
    expect(calls).toBe(3);
    store.cancel();
    const { view, journal } = store;
    store.done();
    store.cancel();
    expect([store.view, store.journal.length, calls]).toEqual([view, journal.length, 4]);
  });

  it("snapshots open editors folded as Done folds them", () => {
    const store = mixedStore();
    store.open(G1);
    store.dispatch(rename("score", "S"));
    const snapshot = store.snapshot();
    expect(snapshot.view).toBe(store.view);
    expect(snapshot.journal.length).toBe(2);
    const last = snapshot.journal.at(-1) as Entry;
    expect(isSessionEntry(last) && last.session).toBe(store.editing[0]?.session);
    expect(snapshot.sessions[(last as SessionEntry).session]).toEqual({
      target: G1,
      entries: [store.entries[0]],
    });
    expect([store.editing.length, store.entries.length]).toEqual([1, 1]);
    const read = readWorkspace(writeWorkspace(snapshot));
    if (isLoadError(read)) throw new Error(JSON.stringify(read.problems));
    expect([read.journal, read.sessions]).toEqual([snapshot.journal, snapshot.sessions]);
  });

  it("snapshots nested editors innermost first", () => {
    const store = mixedStore();
    store.open(BUNDLE);
    store.dispatch(rename("annotations", "A"));
    store.open(G1);
    store.dispatch(rename("score", "S"));
    const snapshot = store.snapshot();
    expect(snapshot.journal.length).toBe(2);
    expect(Object.keys(snapshot.sessions).length).toBe(2);
    const last = snapshot.journal[1] as Entry;
    expect(isSessionEntry(last) && last.session).toBe(store.editing[0]?.session);
    const inner = (snapshot.sessions[(last as SessionEntry).session] as Session).entries.at(-1);
    expect(isSessionEntry(inner as Entry) && (inner as SessionEntry).session).toBe(
      store.editing[1]?.session,
    );
    expect(replay(snapshot.journal, snapshot.sessions).at(-1)).toEqual(store.view);
  });

  it("snapshots only the sessions its journal reaches", () => {
    const { store } = doneStore();
    store.undo();
    expect(Object.keys(store.sessions).length).toBe(1);
    const snapshot = store.snapshot();
    expect([snapshot.journal.length, snapshot.sessions]).toEqual([1, {}]);
  });

  it("clears the redo stack below when an unfolded session closes without entries", () => {
    const store = mixedStore();
    const afterAdd = store.view;
    store.open(G1);
    expect(store.dispatch(rename("score", "S"))).toBeNull();
    store.done();
    expect(store.dispatch(set(BUNDLE, { x: 40 }))).toBeNull();
    store.undo();
    expect(store.canRedo).toBe(true);
    expect(store.open(G1)).toBeNull();
    store.undo();
    store.done();
    expect(store.canRedo).toBe(false);
    store.redo();
    expect(store.journal.length).toBe(1);
    expect(store.view).toEqual(afterAdd);
    const snapshot = store.snapshot();
    expect(replay(snapshot.journal, snapshot.sessions).at(-1)).toEqual(snapshot.view);
  });

  it("tells each listener once per open, dispatch, undo, redo, Done and Cancel", () => {
    const store = mixedStore();
    const seen: View[] = [];
    store.subscribe((view) => seen.push(view));
    const counts: number[] = [];
    const step = (action: () => unknown) => {
      const before = seen.length;
      action();
      counts.push(seen.length - before);
    };
    step(() => store.open(G1));
    step(() => store.dispatch(rename("score", "S")));
    step(() => store.undo());
    step(() => store.redo());
    step(() => store.done());
    step(() => store.open(G1));
    step(() => store.cancel());
    expect(counts).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("the side-effect guard through the store", () => {
  it("refuses in group_1's editor exactly what lies outside it", () => {
    const store = mixedStore();
    store.open(G1);
    expect(store.dispatch(set(G1, { place: { length: 300 } }))).toBeNull();
    expect(refusal(store.dispatch(set(G2, { place: { x: 10 } })))).toEqual({
      code: "side_effect",
      path: [G2],
    });
    expect(store.dispatch(rename("score", "S"))).toBeNull();
    expect(refusal(store.dispatch(rename("annotations", "A")))).toEqual({
      code: "side_effect",
      path: [at("annotations")],
    });
    expect(refusal(store.dispatch(set(BUNDLE, { length: 500 })))).toEqual({
      code: "side_effect",
      path: [BUNDLE, "length"],
    });
    expect(store.dispatch(set(BUNDLE, { width: 900 }))).toBeNull();
    expect(refusal(store.dispatch(style({ element: "timeline" })))).toEqual({
      code: "side_effect",
      path: [BUNDLE, "manifest", "graphical", "statements"],
    });
    expect(store.dispatch(style({ ids: ["score"] }))).toBeNull();
    expect(refusal(store.open(G2))).toEqual({ code: "not_inside", path: [G2] });
    expect(store.entries.length).toBe(4);
  });

  it("names a removed member's parent in its group's editor", () => {
    const store = mixedStore();
    store.open(G2);
    expect(store.dispatch({ type: "remove", targets: [at("excerpt")] })).toEqual({
      code: "side_effect",
      message:
        "bundle0001/recording lies outside bundle0001/group_2: an editor changes only what it edits",
      path: [at("recording")],
    });
    expect(store.entries).toEqual([]);
  });

  it("lets a group's editor remove a root member", () => {
    const store = mixedStore();
    store.open(G2);
    const command = { type: "remove", targets: [at("page")] };
    expect(store.dispatch(command)).toBeNull();
    expect(store.entries.map((entry) => (entry as { command: unknown }).command)).toEqual([
      command,
    ]);
    const manifest = store.view.blocks[BUNDLE]?.manifest;
    expect(manifest?.timelines.some((timeline) => timeline.id === "page")).toBe(false);
    expect(manifest?.groups.find((group) => group.id === "group_2")?.members).toEqual(["excerpt"]);
    expect(manifest?.graphical?.order?.group_2).toEqual(["excerpt"]);
  });

  it("refuses the bundle editor's removal of its own block", () => {
    const store = mixedStore();
    store.open(BUNDLE);
    const editing = store.editing;
    expect(store.dispatch({ type: "remove", targets: [BUNDLE] })).toEqual({
      code: "side_effect",
      message:
        "the removal of bundle0001 lies outside bundle0001: an editor changes only what it edits",
      path: [BUNDLE],
    });
    expect(store.editing).toBe(editing);
    expect(store.entries).toEqual([]);
  });
});
