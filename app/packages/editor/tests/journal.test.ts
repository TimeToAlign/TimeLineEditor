/** The Journal tab's rows and the editors' names; the expected values are derived in `README.md` ("Words"). */

import type { Address, Command, Entry, OpenEditor, Session } from "@timetoalign/tilie-core";
import { listEntries, WORKSPACE } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import type { JournalRow, JournalSource } from "../src/inspector/journal.ts";
import { journalRows } from "../src/inspector/journal.ts";
import { editorName } from "../src/inspector/words.ts";
import { MIXED, mixedStore, mixedView } from "./mixed.ts";

const { A, B, C } = MIXED;

/** The address of block `block`, or of its element `id`. */
function address(block: string, id?: string): Address {
  return id === undefined ? { block } : { block, id };
}

const view = mixedView();

const TIME = "2026-10-17T08:05:09.123Z";

function entry(command: Command, time = TIME, author = "Gerhardt"): Entry {
  return { command, author, time };
}

function set(target: Address, property = "x"): Entry {
  return entry({ type: "set", changes: [{ target, values: { [property]: 1 } }] });
}

/** A store's levels as the rows read them; nothing open and nothing journalled unless given. */
function source(levels: Partial<JournalSource>): JournalSource {
  return { editing: [], listed: [], sessions: {}, ...levels };
}

/** The level of `entries`, the first `applied` of their changes applied (all by default). */
function level(
  entries: readonly Entry[],
  sessions: { [id: string]: Session } = {},
  applied?: number,
): Pick<JournalSource, "listed" | "sessions"> {
  return { listed: listEntries(entries, sessions, applied), sessions };
}

function editor(target: Address, earlier: string | null = null): OpenEditor {
  return { session: "s9", target, kind: "group", earlier };
}

/** The text of the one row a single entry gives on the arranger. */
function textOf(only: Entry, sessions: { [id: string]: Session } = {}): string | undefined {
  const rows = journalRows(source(level([only], sessions)), view);
  expect(rows).toHaveLength(1);
  return rows[0]?.text;
}

describe("editorName", () => {
  it("names each editor's target by the manifest", () => {
    expect(
      [
        address(A),
        address(B),
        address(C),
        address(A, "group_1"),
        address(B, "group_2"),
        address(A, "excerpt"),
        address(B, "score"),
        address(A, "gone"),
        address("0000000009", "score"),
        address("0000000009"),
      ].map((target) => editorName(view, target)),
    ).toEqual([
      "Mixed",
      "mixed",
      "Anonymous bundle",
      "Performance",
      "group_2",
      "Excerpt",
      "score",
      "'gone' in bundle 'Mixed'",
      "'score' in block '0000000009'",
      "block '0000000009'",
    ]);
  });
});

describe("journalRows", () => {
  it("reads the time, the author and the flags of an entry", () => {
    const removal = entry({ type: "remove", targets: [address(B)] }, TIME, "Ada");
    const rows = journalRows(source(level([removal])), view);
    expect(rows).toEqual([
      {
        entry: removal,
        time: "08:05:09",
        author: "Ada",
        text: `Removed bundle 'mixed'`,
        undone: false,
        earlier: false,
        children: [],
      },
    ]);
    expect(rows[0]?.entry).toBe(removal);
    expect(journalRows(source(level([set(address(A))])), view).map((row) => row.time)).toEqual([
      "08:05:09",
    ]);
    expect(
      journalRows(
        source(
          level([entry({ type: "remove", targets: [address(B)] }, "2026-10-17T23:59:58.999Z")]),
        ),
        view,
      )[0]?.time,
    ).toBe("23:59:58");
  });

  it("writes each command as one sentence", () => {
    expect(
      [
        entry({ type: "add", into: WORKSPACE, block: { id: "0000000003" } }),
        entry({ type: "add", into: WORKSPACE, block: { id: B } }),
        entry({ type: "add", into: address(A), timeline: { id: "viola", name: "Viola" } }),
        entry({ type: "add", into: address(A, "score"), region: { id: "region_1" } }),
        entry({ type: "add", into: address(A, "score"), region: {} }),
        entry({ type: "set", changes: [{ target: address(A), values: { x: 25, y: -3 } }] }),
        entry({
          type: "set",
          changes: [{ target: address(A), values: { width: 640, height: null } }],
        }),
        entry({
          type: "set",
          changes: [
            { target: address(A), values: { x: 25, y: -3 } },
            { target: address(B), values: { x: 1 } },
          ],
        }),
        entry({
          type: "set",
          changes: [
            { target: address(A, "group_1"), values: { place: { x: 1 } } },
            { target: address(A, "group_2"), values: { place: { x: 2 } } },
            { target: address(A, "annotations"), values: { place: { x: 3 } } },
          ],
        }),
        entry({ type: "remove", targets: [address(A, "group_2"), address(B)] }),
        entry({
          type: "style",
          select: { addresses: [{ id: "score" }] },
          set: { stroke: "#FF0000" },
        }),
        entry({
          type: "style",
          select: { addresses: [{ id: "score" }] },
          set: { stroke: "#FF0000" },
          blocks: [A],
        }),
        entry({ type: "style", select: { element: "timeline" }, set: { stroke: "#FF0000" } }),
      ].map((only) => textOf(only)),
    ).toEqual([
      "Added block '0000000003'",
      "Added bundle 'mixed'",
      "Added timeline 'Viola' to bundle 'Mixed'",
      "Added region 'region_1' to timeline 'Score' in bundle 'Mixed'",
      "Added a region to timeline 'Score' in bundle 'Mixed'",
      "Set x, y of bundle 'Mixed'",
      "Set container width, container height of bundle 'Mixed'",
      "Set x, y of bundle 'Mixed' and 1 more",
      "Set place of group 'Performance' in bundle 'Mixed' and 2 more",
      "Removed group 'Facsimile' in bundle 'Mixed', bundle 'mixed'",
      "Styled stroke of 'score'",
      "Styled stroke of timeline 'Score' in bundle 'Mixed'",
      "Styled stroke of matching elements",
    ]);
  });

  it("writes a session as its kind, name and count", () => {
    const sessions: { [id: string]: Session } = {
      s1: { target: address(A, "group_1"), entries: [set(address(A))] },
      s2: { target: address(B, "score"), entries: [set(address(A)), set(address(B))] },
      s3: { target: address(A, "excerpt"), entries: [set(address(A))] },
      s4: { target: address(C), entries: [set(address(A)), set(address(B)), set(address(C))] },
      s5: {
        target: address(A),
        entries: [set(address(A)), { session: "s8", author: "Gerhardt", time: TIME }],
      },
      s8: { target: address(A, "group_1"), entries: [set(address(A)), set(address(B))] },
    };
    expect(
      ["s1", "s2", "s3", "s4", "s5"].map((session) =>
        textOf({ session, author: "Gerhardt", time: TIME }, sessions),
      ),
    ).toEqual([
      "Edited group Performance (1 change)",
      "Edited timeline score (2 changes)",
      "Edited timeline Excerpt (1 change)",
      "Edited bundle Anonymous bundle (3 changes)",
      "Edited bundle Mixed (3 changes)",
    ]);
  });

  it("gives no kind word to a session whose target is gone", () => {
    const store = mixedStore();
    expect(store.open(address(A, "group_1"))).toBeNull();
    expect(
      store.dispatch({
        type: "set",
        changes: [{ target: address(A, "score"), values: { name: "S" } }],
      }),
    ).toBeNull();
    store.done();
    const texts = () => journalRows(store, store.view).map((row) => row.text);
    expect(texts()[0]).toBe("Edited group Performance (1 change)");
    expect(store.dispatch({ type: "remove", targets: [address(A, "group_1")] })).toBeNull();
    expect(texts().slice(0, 2)).toEqual([
      `Removed 'group_1' in bundle 'Mixed'`,
      `Edited 'group_1' in bundle 'Mixed' (1 change)`,
    ]);
  });

  const e1 = set(address(A));
  const e2 = set(address(B));
  const u1 = set(address(C));
  const u2 = set(address(A, "score"));

  /** Each row as [text, undone, earlier]. */
  function listed(levels: Partial<JournalSource>): [string, boolean, boolean][] {
    return journalRows(source(levels), view).map((row) => [row.text, row.undone, row.earlier]);
  }

  it("lists the newest first, the undone ones at the top", () => {
    expect(listed(level([e1, e2, u1, u2], {}, 2))).toEqual([
      [`Set x of timeline 'Score' in bundle 'Mixed'`, true, false],
      [`Set x of the anonymous bundle`, true, false],
      [`Set x of bundle 'mixed'`, false, false],
      [`Set x of bundle 'Mixed'`, false, false],
    ]);
    expect(listed({ editing: [editor(address(A, "group_1"))], ...level([e1, u1], {}, 1) })).toEqual(
      [
        [`Set x of the anonymous bundle`, true, false],
        [`Set x of bundle 'Mixed'`, false, false],
      ],
    );
  });

  it("lists the earlier session of the innermost editor last", () => {
    const sessions = { s0: { target: address(A, "group_1"), entries: [u2, e2] } };
    expect(
      listed({ editing: [editor(address(A, "group_1"), "s0")], ...level([e1, u1], sessions, 1) }),
    ).toEqual([
      [`Set x of the anonymous bundle`, true, false],
      [`Set x of bundle 'Mixed'`, false, false],
      [`Set x of bundle 'mixed'`, false, true],
      [`Set x of timeline 'Score' in bundle 'Mixed'`, false, true],
    ]);
    expect(
      listed({
        editing: [editor(address(A, "group_1"), "s0"), editor(address(A, "score"))],
        ...level([e1, u1], sessions, 1),
      }),
    ).toEqual([
      [`Set x of the anonymous bundle`, true, false],
      [`Set x of bundle 'Mixed'`, false, false],
    ]);
  });

  /** A row and its children as [text, undone, children], recursively. */
  type Tree = [string, boolean, Tree[]];
  function tree(rows: readonly JournalRow[]): Tree[] {
    return rows.map((row) => [row.text, row.undone, tree(row.children)]);
  }

  it("holds a session's changes as rows, newest first, with their undo state", () => {
    const at = (session: string): Entry => ({ session, author: "Gerhardt", time: TIME });
    const sessions = {
      s5: { target: address(A), entries: [e2, at("s6")] },
      s6: { target: address(A, "group_1"), entries: [u1, u2] },
    };
    expect(tree(journalRows(source(level([e1, at("s5")], sessions, 3)), view))).toEqual([
      [
        "Edited bundle Mixed (3 changes, 1 undone)",
        false,
        [
          [
            "Edited group Performance (2 changes, 1 undone)",
            false,
            [
              [`Set x of timeline 'Score' in bundle 'Mixed'`, true, []],
              [`Set x of the anonymous bundle`, false, []],
            ],
          ],
          [`Set x of bundle 'mixed'`, false, []],
        ],
      ],
      [`Set x of bundle 'Mixed'`, false, []],
    ]);
    expect(tree(journalRows(source(level([e1, at("s5")], sessions, 0)), view))).toEqual([
      [
        "Edited bundle Mixed (3 changes)",
        true,
        [
          [
            "Edited group Performance (2 changes)",
            true,
            [
              [`Set x of timeline 'Score' in bundle 'Mixed'`, true, []],
              [`Set x of the anonymous bundle`, true, []],
            ],
          ],
          [`Set x of bundle 'mixed'`, true, []],
        ],
      ],
      [`Set x of bundle 'Mixed'`, true, []],
    ]);
  });

  it("marks the earlier session's rows at every depth", () => {
    const at = (session: string): Entry => ({ session, author: "Gerhardt", time: TIME });
    const sessions = {
      s0: { target: address(A, "group_1"), entries: [at("s7")] },
      s7: { target: address(A, "score"), entries: [e2] },
    };
    const rows = journalRows(
      source({ editing: [editor(address(A, "group_1"), "s0")], ...level([e1], sessions) }),
      view,
    );
    expect(rows.map((row) => [row.text, row.earlier])).toEqual([
      [`Set x of bundle 'Mixed'`, false],
      ["Edited timeline Score (1 change)", true],
    ]);
    expect(rows[1]?.children.map((row) => [row.text, row.earlier])).toEqual([
      [`Set x of bundle 'mixed'`, true],
    ]);
  });

  it("lists nothing when nothing was done", () => {
    expect(journalRows(source({}), view)).toEqual([]);
  });
});
