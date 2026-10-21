import { describe, expect, it } from "vitest";
import { isLoadError } from "../src/errors.ts";
import { readWorkspace, writeWorkspace } from "../src/workspace/file.ts";
import type { Entry, ListedEntry, Session, SessionEntry } from "../src/workspace/sessions.ts";
import { editorKindOf, isSessionEntry, mintSessionId } from "../src/workspace/sessions.ts";
import type { Store } from "../src/workspace/store.ts";
import { createStore, replay } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
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
  const afterFirst = store.view;
  expect(store.dispatch(rename("performance", "P"))).toBeNull();
  const entries = [...store.entries];
  store.done();
  return { store, afterAdd, afterFirst, session, entries, after: store.view };
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
      at("group_1/score/card"),
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
    const bundle = view.blocks[BUNDLE];
    if (bundle === undefined) throw new Error("the bundle block exists");
    const withId = {
      ...view,
      blocks: {
        ...view.blocks,
        [BUNDLE]: { ...bundle, manifest: { ...bundle.manifest, id: "takes" } },
      },
    };
    expect(refusal(editorKindOf(withId, at("takes")))).toEqual({
      code: "no_editor",
      path: [at("takes")],
    });
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
    const afterFirst = store.view;
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
    const [add, closed] = store.journal as [Entry, Entry];
    const [first, second] = entries as [Entry, Entry];
    const applied = (entry: Entry) => ({ entry, changes: 1, applied: 1, children: [] });
    const undone = (entry: Entry) => ({ entry, changes: 1, applied: 0, children: [] });
    // Both sets are one run of the closed session: one undo reverts both.
    store.undo();
    expect(store.view).toBe(opening);
    expect(store.view).not.toBe(afterFirst);
    expect([store.journal, store.canUndo]).toEqual([[add], true]);
    expect(store.listed).toEqual([
      applied(add),
      { entry: closed, changes: 2, applied: 0, children: [undone(first), undone(second)] },
    ]);
    store.redo();
    expect(store.view).toBe(after);
    expect(store.listed).toEqual([
      applied(add),
      { entry: closed, changes: 2, applied: 2, children: [applied(first), applied(second)] },
    ]);
    expect(store.canRedo).toBe(false);
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
    expect(store.listed).toEqual([{ entry, changes: 1, applied: 0, children: [] }]);
    expect(store.view).toBe(opening);
    expect(store.journal.length).toBe(1);
  });

  it("counts Cancel's changes and restores the opening exactly", () => {
    const store = mixedStore();
    store.dispatch(set(BUNDLE, { x: 40 }));
    store.undo();
    const opening = store.view;
    const journal = [...store.journal];
    const listed = store.listed;
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
    expect(store.listed).toEqual(listed);
    expect(store.canRedo).toBe(true);
    expect(store.changes).toBe(0);
  });

  it("unfolds a reopened session that is the latest entry of its level", () => {
    const { store, afterAdd, afterFirst, session, entries } = doneStore();
    expect(store.open(G1)).toBeNull();
    expect(store.editing).toEqual([{ session, target: G1, kind: "group", earlier: null }]);
    expect(store.entries).toEqual(entries);
    expect(store.entries[0]).toBe(entries[0]);
    expect(store.entries[1]).toBe(entries[1]);
    expect([store.canUndo, store.changes, store.journal.length]).toEqual([true, 0, 1]);
    expect(store.sessions).toEqual({});
    // Its own changes are the open level's again: one at a time.
    store.undo();
    expect(store.view).toBe(afterFirst);
    expect(store.changes).toBe(1);
    store.undo();
    expect(store.view).toBe(afterAdd);
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
    const renamed = store.view;
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
    expect(store.view).toBe(renamed);
    store.undo();
    expect(store.view).toBe(afterAdd);
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

  it("snapshots only applied changes", () => {
    const { store, session } = doneStore();
    store.undo();
    expect(Object.keys(store.sessions)).toEqual([session]);
    const snapshot = store.snapshot();
    expect([snapshot.journal, snapshot.sessions]).toEqual([store.journal, {}]);
    expect(snapshot.journal.length).toBe(1);
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

const SCORE = at("score");
const leaf = (entry: Entry, applied: number) => ({ entry, changes: 1, applied, children: [] });
const commandOf = (entry: Entry) => (entry as { command: unknown }).command;
const nameOf = (view: View, id: string) =>
  view.blocks[BUNDLE]?.manifest.timelines.find((timeline) => timeline.id === id)?.name;

/**
 * The scenario of three nested editors: the bundle editor `A`, the group
 * editor `B` of `group_1`, the timeline editor `C` of its member `score`;
 * one change in each, `c` in `C`, `b` in `B`, `a` in `A`, each closed with
 * Done. Without `withA`, `A` closes holding only `B`'s session.
 */
function nestedStore(withA = true) {
  const store = mixedStore();
  const v0 = store.view;
  expect(store.open(BUNDLE)).toBeNull();
  expect(store.open(G1)).toBeNull();
  expect(store.open(SCORE)).toBeNull();
  expect(store.dispatch(rename("score", "c-name"))).toBeNull();
  const vc = store.view;
  const c = store.entries[0] as Entry;
  store.done();
  const sc = store.entries[0] as SessionEntry;
  expect(store.dispatch(rename("performance", "b-name"))).toBeNull();
  const vb = store.view;
  const b = store.entries[1] as Entry;
  store.done();
  const sb = store.entries[0] as SessionEntry;
  let a: Entry | undefined;
  if (withA) {
    expect(store.dispatch(rename("annotations", "a-name"))).toBeNull();
    a = store.entries[1];
  }
  const va = store.view;
  store.done();
  const [add, sa] = store.journal as [Entry, SessionEntry];
  return { store, v0, vc, vb, va, add, sa, sb, sc, a: a as Entry, b, c };
}

/** A new command on the arranger. */
const MOVE = set(BUNDLE, { x: 40 });

describe("undo by runs through three nested sessions", () => {
  it("reverts the latest session's run first and redoes the earliest undone first", () => {
    const { store, v0, vc, vb, va, add, sa, sb, sc, a, b, c } = nestedStore();
    expect(store.journal).toEqual([add, sa]);
    expect(store.sessions[sa.session]?.entries).toEqual([sb, a]);
    expect(store.sessions[sb.session]?.entries).toEqual([sc, b]);
    expect(store.sessions[sc.session]?.entries).toEqual([c]);
    const tree = (cApplied: number, bApplied: number, aApplied: number) => [
      leaf(add, 1),
      {
        entry: sa,
        changes: 3,
        applied: cApplied + bApplied + aApplied,
        children: [
          {
            entry: sb,
            changes: 2,
            applied: cApplied + bApplied,
            children: [
              { entry: sc, changes: 1, applied: cApplied, children: [leaf(c, cApplied)] },
              leaf(b, bApplied),
            ],
          },
          leaf(a, aApplied),
        ],
      },
    ];
    expect(store.listed).toEqual(tree(1, 1, 1));
    store.undo();
    expect(store.view).toBe(vb);
    expect(store.journal).toEqual([add, sa]);
    expect(store.listed).toEqual(tree(1, 1, 0));
    store.undo();
    expect(store.view).toBe(vc);
    expect(store.listed).toEqual(tree(1, 0, 0));
    store.undo();
    expect(store.view).toBe(v0);
    expect(store.journal).toEqual([add]);
    expect(store.listed).toEqual(tree(0, 0, 0));
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(store.canUndo).toBe(false);
    const redone: View[] = [];
    for (let step = 0; step < 4; step += 1) {
      store.redo();
      redone.push(store.view);
    }
    expect(redone.slice(1)).toEqual([vc, vb, va]);
    expect(redone[0]).toBe(v0);
    expect(redone[1]).toBe(vc);
    expect(redone[2]).toBe(vb);
    expect(redone[3]).toBe(va);
    expect(store.canRedo).toBe(false);
  });

  it("keeps the applied changes, at every depth, under the same ids when a command follows", () => {
    const { store, add, sa, sb, sc, b, c } = nestedStore();
    store.undo();
    expect(store.dispatch(MOVE)).toBeNull();
    expect(store.journal.length).toBe(3);
    expect(store.journal.slice(0, 2)).toEqual([add, sa]);
    expect(store.journal[1]).toBe(sa);
    expect(commandOf(store.journal[2] as Entry)).toEqual(MOVE);
    expect(Object.keys(store.sessions).sort()).toEqual([sa.session, sb.session, sc.session].sort());
    expect(store.sessions[sa.session]?.entries).toEqual([sb]);
    expect(store.sessions[sa.session]?.entries[0]).toBe(sb);
    expect(store.sessions[sb.session]?.entries).toEqual([sc, b]);
    expect(store.sessions[sb.session]?.entries[1]).toBe(b);
    expect(store.sessions[sc.session]?.entries[0]).toBe(c);
    expect(store.canRedo).toBe(false);
    const snapshot = store.snapshot();
    expect(replay(snapshot.journal, snapshot.sessions).at(-1)).toEqual(store.view);
    const text = writeWorkspace(snapshot);
    expect(text.includes("a-name")).toBe(false);
    expect([text.includes("b-name"), text.includes("c-name")]).toEqual([true, true]);
    expect(readWorkspace(text)).toEqual(snapshot);
  });

  it("drops a nested session's undone changes and keeps the session that still holds one", () => {
    const { store, sa, sb, sc, c } = nestedStore();
    store.undo();
    store.undo();
    expect(store.dispatch(MOVE)).toBeNull();
    expect(store.sessions[sa.session]?.entries).toEqual([sb]);
    expect(store.sessions[sb.session]?.entries).toEqual([sc]);
    expect(store.sessions[sc.session]?.entries).toEqual([c]);
    const snapshot = store.snapshot();
    expect(replay(snapshot.journal, snapshot.sessions).at(-1)).toEqual(store.view);
  });

  it("drops a session left with no applied change", () => {
    const { store, add } = nestedStore();
    for (let step = 0; step < 3; step += 1) store.undo();
    expect(store.dispatch(MOVE)).toBeNull();
    expect(store.journal.length).toBe(2);
    expect(store.journal[0]).toBe(add);
    expect(commandOf(store.journal[1] as Entry)).toEqual(MOVE);
    expect(store.sessions).toEqual({});
  });

  it("hands a reopened session's undone changes to its editor, and Cancel puts them back", () => {
    const { store, vb, va, add, sa, sb, a } = nestedStore();
    store.undo();
    const sessions = store.sessions;
    expect(store.open(BUNDLE)).toBeNull();
    expect(store.editing).toEqual([
      { session: sa.session, target: BUNDLE, kind: "bundle", earlier: null },
    ]);
    expect(store.entries).toEqual([sb]);
    expect(store.listed).toEqual([
      expect.objectContaining({ entry: sb, changes: 2, applied: 2 }),
      leaf(a, 0),
    ]);
    expect([store.canRedo, store.changes, store.journal]).toEqual([true, 0, [add]]);
    expect(store.view).toBe(vb);
    store.redo();
    expect(store.view).toBe(va);
    expect(store.changes).toBe(1);
    store.cancel();
    expect(store.journal).toEqual([add, sa]);
    expect(store.journal[1]).toBe(sa);
    expect(store.listed[1]).toEqual(expect.objectContaining({ entry: sa, changes: 3, applied: 2 }));
    expect(store.canRedo).toBe(true);
    expect(store.sessions).toEqual(sessions);
    expect(store.view).toBe(vb);
    store.redo();
    expect(store.view).toBe(va);
  });

  it("undoes a closed sub-session inside an editor by its run and stops at the opening", () => {
    const store = mixedStore();
    const add = store.journal;
    expect(store.open(BUNDLE)).toBeNull();
    const opening = store.view;
    expect(store.open(G1)).toBeNull();
    store.dispatch(rename("score", "S"));
    store.dispatch(rename("performance", "P"));
    const both = store.view;
    store.done();
    const [inner] = store.entries as [SessionEntry];
    expect(store.entries).toEqual([inner]);
    store.undo();
    expect(store.view).toBe(opening);
    expect([store.entries, store.canUndo]).toEqual([[], false]);
    expect(store.listed).toEqual([
      expect.objectContaining({ entry: inner, changes: 2, applied: 0 }),
    ]);
    store.undo();
    expect(store.view).toBe(opening);
    expect(store.journal).toEqual(add);
    store.redo();
    expect(store.view).toBe(both);
    expect(store.listed).toEqual([
      expect.objectContaining({ entry: inner, changes: 2, applied: 2 }),
    ]);
    expect(store.canRedo).toBe(false);
  });

  it("counts Cancel's changes as changes, by the command entries", () => {
    const { store, sb, sc, c } = nestedStore(false);
    expect(store.open(BUNDLE)).toBeNull();
    expect(store.entries).toEqual([sb]);
    expect(store.changes).toBe(0);
    store.undo();
    expect(store.changes).toBe(1);
    expect(nameOf(store.view, "performance")).toBe("Performance");
    const before = store.sessions[sb.session];
    expect(store.dispatch(rename("annotations", "z"))).toBeNull();
    expect(store.sessions[sb.session]).not.toBe(before);
    expect(store.sessions[sb.session]?.entries).toEqual([sc]);
    expect(store.sessions[sc.session]?.entries[0]).toBe(c);
    expect(store.changes).toBe(2);
  });

  it("counts a session's changes at every depth", () => {
    const { store, sa } = nestedStore();
    expect(store.listed[1]).toEqual(expect.objectContaining({ entry: sa, changes: 3, applied: 3 }));
  });
});

/** A session entry listed with its children, its counts summed from them. */
const node = (entry: Entry, children: ListedEntry[]): ListedEntry => ({
  entry,
  changes: children.reduce((sum, child) => sum + child.changes, 0),
  applied: children.reduce((sum, child) => sum + child.applied, 0),
  children,
});

/**
 * The interleaved scenario: in `A`, `a1`; in `B`, `b1`; in `C`, `c1` and
 * `c2`, Done; `b2`, Done; `a2`, and Done unless `close` is false. The six
 * changes' runs are `[a1] [b1] [c1 c2] [b2] [a2]`. Each change is kept as
 * its entry and the view right after it.
 */
function interleavedStore(close = true) {
  const store = mixedStore();
  const v0 = store.view;
  const [add] = store.journal as [Entry];
  const beforeA = { journal: store.journal, sessions: store.sessions, listed: store.listed };
  const change = (id: string, name: string) => {
    expect(store.dispatch(rename(id, name))).toBeNull();
    return { entry: store.entries.at(-1) as Entry, view: store.view };
  };
  expect(store.open(BUNDLE)).toBeNull();
  const a1 = change("annotations", "name-a1");
  expect(store.open(G1)).toBeNull();
  const b1 = change("performance", "name-b1");
  expect(store.open(SCORE)).toBeNull();
  const c1 = change("score", "name-c1");
  const c2 = change("score", "name-c2");
  store.done();
  const sc = store.entries.at(-1) as SessionEntry;
  const b2 = change("performance", "name-b2");
  store.done();
  const sb = store.entries.at(-1) as SessionEntry;
  const a2 = change("annotations", "name-a2");
  if (close) store.done();
  /** `SB` listed with its first `k` changes (`b1 c1 c2 b2`) applied. */
  const listedSB = (k: number) =>
    node(sb, [
      leaf(b1.entry, k > 0 ? 1 : 0),
      node(sc, [leaf(c1.entry, k > 1 ? 1 : 0), leaf(c2.entry, k > 2 ? 1 : 0)]),
      leaf(b2.entry, k > 3 ? 1 : 0),
    ]);
  return { store, v0, add, beforeA, a1, b1, c1, c2, b2, a2, sb, sc, listedSB };
}

describe("undo by runs through an interleaved session", () => {
  it("undoes a2, b2, c1 with c2, b1, a1 on the arranger and redoes in mirror", () => {
    const { store, v0, add, a1, b1, c1, c2, b2, a2, sb, sc, listedSB } = interleavedStore();
    const sa = store.journal[1] as SessionEntry;
    expect(store.journal).toEqual([add, sa]);
    expect(store.sessions[sa.session]?.entries).toEqual([a1.entry, sb, a2.entry]);
    expect(store.sessions[sb.session]?.entries).toEqual([b1.entry, sc, b2.entry]);
    expect(store.sessions[sc.session]?.entries).toEqual([c1.entry, c2.entry]);
    /** The arranger's `listed` with the first `k` of the six changes applied. */
    const tree = (k: number) => [
      leaf(add, 1),
      node(sa, [leaf(a1.entry, k > 0 ? 1 : 0), listedSB(k - 1), leaf(a2.entry, k > 5 ? 1 : 0)]),
    ];
    expect(store.listed).toEqual(tree(6));
    const before: { view: View; listed: unknown }[] = [];
    const steps: [View, number, Entry[]][] = [
      [b2.view, 5, [add, sa]],
      [c2.view, 4, [add, sa]],
      [b1.view, 2, [add, sa]],
      [a1.view, 1, [add, sa]],
      [v0, 0, [add]],
    ];
    for (const [view, applied, journal] of steps) {
      before.push({ view: store.view, listed: store.listed });
      store.undo();
      expect(store.view).toBe(view);
      expect(store.listed).toEqual(tree(applied));
      expect(store.listed[1]?.applied).toBe(applied);
      expect(store.journal).toEqual(journal);
    }
    expect(store.listed[1]?.children[1]?.children[1]).toEqual(
      node(sc, [leaf(c1.entry, 0), leaf(c2.entry, 0)]),
    );
    expect(store.canUndo).toBe(true);
    before.push({ view: store.view, listed: store.listed });
    store.undo();
    expect(store.canUndo).toBe(false);
    const redone: View[] = [];
    for (const expected of before.reverse()) {
      store.redo();
      redone.push(store.view);
      expect(store.listed).toEqual(expected.listed);
    }
    for (const [index, view] of [v0, a1.view, b1.view, c2.view, b2.view, a2.view].entries()) {
      expect(redone[index]).toBe(view);
    }
    expect(redone).not.toContain(c1.view);
    expect(store.canRedo).toBe(false);
  });

  it("discards a whole undone run when a command follows", () => {
    const { store, v0, add, a1, b1, sb, sc } = interleavedStore();
    const sa = store.journal[1] as SessionEntry;
    for (let step = 0; step < 3; step += 1) store.undo();
    const partly = store.snapshot();
    expect(partly.journal).toEqual([add, sa]);
    expect(partly.sessions).toEqual({
      [sa.session]: { target: BUNDLE, entries: [a1.entry, sb] },
      [sb.session]: { target: G1, entries: [b1.entry] },
    });
    expect(replay(partly.journal, partly.sessions).at(-1)).toEqual(store.view);
    expect(Object.keys(store.sessions).sort()).toEqual([sa.session, sb.session, sc.session].sort());
    expect(store.dispatch(MOVE)).toBeNull();
    expect(store.journal.length).toBe(3);
    expect(store.journal[0]).toBe(add);
    expect(store.journal[1]).toBe(sa);
    expect(commandOf(store.journal[2] as Entry)).toEqual(MOVE);
    expect(Object.keys(store.sessions).sort()).toEqual([sa.session, sb.session].sort());
    const [first, second] = store.sessions[sa.session]?.entries ?? [];
    expect([first, second]).toEqual([a1.entry, sb]);
    expect(first).toBe(a1.entry);
    expect(second).toBe(sb);
    expect(store.sessions[sb.session]?.entries).toEqual([b1.entry]);
    expect(store.sessions[sb.session]?.entries[0]).toBe(b1.entry);
    expect(store.canRedo).toBe(false);
    const snapshot = store.snapshot();
    expect(replay(snapshot.journal, snapshot.sessions).at(-1)).toEqual(store.view);
    const text = writeWorkspace(snapshot);
    expect(
      ["a1", "b1", "c1", "c2", "b2", "a2"].map((name) => text.includes(`name-${name}`)),
    ).toEqual([true, true, false, false, false, false]);
    const read = readWorkspace(text);
    if (isLoadError(read)) throw new Error(JSON.stringify(read.problems));
    expect(read).toEqual(snapshot);
    const reloaded = createStore(read, { clock: testClock() });
    for (const view of [b1.view, a1.view, v0]) {
      reloaded.undo();
      expect(reloaded.view).toEqual(view);
    }
    expect(reloaded.canUndo).toBe(true);
  });

  it("undoes the open editor's own changes one at a time and a closed sub-session by its runs", () => {
    const { store, v0, add, beforeA, a1, b1, c2, b2, a2, sb } = interleavedStore(false);
    expect(store.dispatch(rename("annotations", "name-a3"))).toBeNull();
    const a3 = { entry: store.entries.at(-1) as Entry, view: store.view };
    expect(store.entries).toEqual([a1.entry, sb, a2.entry, a3.entry]);
    for (const view of [a2.view, b2.view, c2.view, b1.view, a1.view, v0]) {
      expect(store.canUndo).toBe(true);
      store.undo();
      expect(store.view).toBe(view);
      expect(store.journal).toEqual([add]);
    }
    expect([store.entries, store.canUndo]).toEqual([[], false]);
    store.undo();
    expect(store.view).toBe(v0);
    expect(store.journal).toEqual([add]);
    for (const view of [a1.view, b1.view, c2.view, b2.view, a2.view, a3.view]) {
      store.redo();
      expect(store.view).toBe(view);
    }
    expect(store.canRedo).toBe(false);
    store.undo();
    store.undo();
    expect(store.view).toBe(b2.view);
    expect(store.changes).toBe(5);
    store.cancel();
    expect(store.editing).toEqual([]);
    expect(store.view).toBe(v0);
    expect([store.journal, store.sessions, store.listed]).toEqual([
      beforeA.journal,
      beforeA.sessions,
      beforeA.listed,
    ]);
    expect(store.journal).toEqual([add]);
    expect(store.sessions).toEqual({});
  });

  it("unfolds a reopened session whose own changes step alone and whose sub-sessions keep their runs", () => {
    const { store, v0, add, a1, b1, c2, b2, a2, sb, listedSB } = interleavedStore();
    const sa = store.journal[1] as SessionEntry;
    store.undo();
    expect(store.view).toBe(b2.view);
    const sessions = store.sessions;
    expect(store.open(BUNDLE)).toBeNull();
    expect(store.editing).toEqual([
      { session: sa.session, target: BUNDLE, kind: "bundle", earlier: null },
    ]);
    expect(store.entries).toEqual([a1.entry, sb]);
    expect(store.listed).toEqual([leaf(a1.entry, 1), listedSB(4), leaf(a2.entry, 0)]);
    expect([store.canRedo, store.changes, store.journal]).toEqual([true, 0, [add]]);
    expect(store.view).toBe(b2.view);
    store.redo();
    expect(store.view).toBe(a2.view);
    expect(store.changes).toBe(1);
    for (const view of [b2.view, c2.view, b1.view, a1.view, v0]) {
      store.undo();
      expect(store.view).toBe(view);
    }
    expect([store.canUndo, store.changes]).toEqual([false, 5]);
    store.cancel();
    expect(store.journal).toEqual([add, sa]);
    expect(store.journal[1]).toBe(sa);
    expect(store.listed[1]).toEqual(expect.objectContaining({ entry: sa, changes: 6, applied: 5 }));
    expect(store.canRedo).toBe(true);
    expect(store.sessions).toEqual(sessions);
    expect(store.view).toBe(b2.view);
    store.redo();
    expect(store.view).toBe(a2.view);
  });

  it("keeps the runs of the scenario loaded from its file into a new store", () => {
    const { store, v0, a1, b1, c1, c2, b2, a2 } = interleavedStore();
    const snapshot = store.snapshot();
    const read = readWorkspace(writeWorkspace(snapshot));
    if (isLoadError(read)) throw new Error(JSON.stringify(read.problems));
    expect(read).toEqual(snapshot);
    const reloaded = createStore(read, { clock: testClock() });
    expect(reloaded.view).toEqual(a2.view);
    const shown: View[] = [];
    for (const view of [b2.view, c2.view, b1.view, a1.view, v0]) {
      reloaded.undo();
      shown.push(reloaded.view);
      expect(reloaded.view).toEqual(view);
    }
    expect(shown).not.toContainEqual(c1.view);
    expect(reloaded.canUndo).toBe(true);
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
