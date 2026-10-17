/** The Journal tab's rows and the editors' names; the expected values are derived in `README.md` ("The Editor and Journal tabs"). */

import type { Command, Entry, OpenEditor, Session } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import type { JournalSource } from "../src/inspector/journal.ts";
import { editorName, journalRows } from "../src/inspector/journal.ts";
import { MIXED, mixedStore, mixedView } from "./mixed.ts";

const { A, B, C } = MIXED;

const view = mixedView();

const TIME = "2026-10-17T08:05:09.123Z";

function entry(command: Command, time = TIME, author = "Gerhardt"): Entry {
  return { command, author, time };
}

function set(target: string, property = "x"): Entry {
  return entry({ type: "set", changes: [{ target, values: { [property]: 1 } }] });
}

/** A store's levels as the rows read them; nothing open and nothing journalled unless given. */
function source(levels: Partial<JournalSource>): JournalSource {
  return { editing: [], entries: [], undone: [], sessions: {}, ...levels };
}

function editor(target: string, earlier: string | null = null): OpenEditor {
  return { session: "s9", target, kind: "group", earlier };
}

/** The text of the one row a single entry gives on the arranger. */
function textOf(only: Entry, sessions: { [id: string]: Session } = {}): string | undefined {
  const rows = journalRows(source({ entries: [only], sessions }), view);
  expect(rows).toHaveLength(1);
  return rows[0]?.text;
}

describe("editorName", () => {
  it("names each editor's target by the manifest", () => {
    expect(
      [
        A,
        B,
        C,
        `${A}/group_1`,
        `${B}/group_2`,
        `${A}/excerpt`,
        `${B}/score`,
        `${A}/gone`,
        "0000000009/score",
        "0000000009",
      ].map((target) => editorName(view, target)),
    ).toEqual([
      "Mixed",
      "mixed",
      "Anonymous bundle",
      "Performance",
      "group_2",
      "Excerpt",
      "score",
      `${A}/gone`,
      "0000000009/score",
      "0000000009",
    ]);
  });
});

describe("journalRows", () => {
  it("reads the time, the author and the flags of an entry", () => {
    const removal = entry({ type: "remove", targets: [B] }, TIME, "Ada");
    const rows = journalRows(source({ entries: [removal] }), view);
    expect(rows).toEqual([
      {
        entry: removal,
        time: "08:05:09",
        author: "Ada",
        text: `Removed ${B}`,
        undone: false,
        earlier: false,
      },
    ]);
    expect(rows[0]?.entry).toBe(removal);
    expect(journalRows(source({ entries: [set(A)] }), view).map((row) => row.time)).toEqual([
      "08:05:09",
    ]);
    expect(
      journalRows(
        source({ entries: [entry({ type: "remove", targets: [B] }, "2026-10-17T23:59:58.999Z")] }),
        view,
      )[0]?.time,
    ).toBe("23:59:58");
  });

  it("writes each command as one sentence", () => {
    expect(
      [
        entry({ type: "add", into: "workspace", block: { id: "0000000003" } }),
        entry({ type: "add", into: `${A}/score`, region: { id: "region_1" } }),
        entry({ type: "set", changes: [{ target: A, values: { x: 25, y: -3 } }] }),
        entry({
          type: "set",
          changes: [
            { target: A, values: { x: 25, y: -3 } },
            { target: B, values: { x: 1 } },
          ],
        }),
        entry({
          type: "set",
          changes: [
            { target: `${A}/group_1`, values: { place: { x: 1 } } },
            { target: `${A}/group_2`, values: { place: { x: 2 } } },
            { target: `${A}/annotations`, values: { place: { x: 3 } } },
          ],
        }),
        entry({ type: "remove", targets: [`${A}/group_2`, B] }),
        entry({ type: "style", select: { ids: ["score"] }, set: { stroke: "#FF0000" } }),
        entry({ type: "style", select: { element: "timeline" }, set: { stroke: "#FF0000" } }),
      ].map((only) => textOf(only)),
    ).toEqual([
      "Added block 0000000003 to workspace",
      `Added region region_1 to ${A}/score`,
      `Set x, y of ${A}`,
      `Set x, y of ${A} and 1 more`,
      `Set place of ${A}/group_1 and 2 more`,
      `Removed ${A}/group_2, ${B}`,
      'Styled {"ids":["score"]}',
      'Styled {"element":"timeline"}',
    ]);
  });

  it("writes a session as its kind, name and count", () => {
    const sessions: { [id: string]: Session } = {
      s1: { target: `${A}/group_1`, entries: [set(A)] },
      s2: { target: `${B}/score`, entries: [set(A), set(B)] },
      s3: { target: `${A}/excerpt`, entries: [set(A)] },
      s4: { target: C, entries: [set(A), set(B), set(C)] },
    };
    expect(
      ["s1", "s2", "s3", "s4"].map((session) =>
        textOf({ session, author: "Gerhardt", time: TIME }, sessions),
      ),
    ).toEqual([
      "Edited group Performance (1 change)",
      "Edited timeline score (2 changes)",
      "Edited timeline Excerpt (1 change)",
      "Edited bundle Anonymous bundle (3 changes)",
    ]);
  });

  it("gives no kind word to a session whose target is gone", () => {
    const store = mixedStore();
    expect(store.open(`${A}/group_1`)).toBeNull();
    expect(
      store.dispatch({ type: "set", changes: [{ target: `${A}/score`, values: { name: "S" } }] }),
    ).toBeNull();
    store.done();
    const texts = () => journalRows(store, store.view).map((row) => row.text);
    expect(texts().at(-1)).toBe("Edited group Performance (1 change)");
    expect(store.dispatch({ type: "remove", targets: [`${A}/group_1`] })).toBeNull();
    expect(texts().slice(-2)).toEqual([`Edited ${A}/group_1 (1 change)`, `Removed ${A}/group_1`]);
  });

  const e1 = set(A);
  const e2 = set(B);
  const u1 = set(C);
  const u2 = set(`${A}/score`);

  /** Each row as [text, undone, earlier]. */
  function listed(levels: Partial<JournalSource>): [string, boolean, boolean][] {
    return journalRows(source(levels), view).map((row) => [row.text, row.undone, row.earlier]);
  }

  it("lists the entries in the order they were made, the undone ones last", () => {
    expect(listed({ entries: [e1, e2], undone: [u1, u2] })).toEqual([
      [`Set x of ${A}`, false, false],
      [`Set x of ${B}`, false, false],
      [`Set x of ${C}`, true, false],
      [`Set x of ${A}/score`, true, false],
    ]);
    expect(listed({ editing: [editor(`${A}/group_1`)], entries: [e1], undone: [u1] })).toEqual([
      [`Set x of ${A}`, false, false],
      [`Set x of ${C}`, true, false],
    ]);
  });

  it("lists the earlier session of the innermost editor first", () => {
    const sessions = { s0: { target: `${A}/group_1`, entries: [u2, e2] } };
    expect(
      listed({ editing: [editor(`${A}/group_1`, "s0")], entries: [e1], undone: [u1], sessions }),
    ).toEqual([
      [`Set x of ${A}/score`, false, true],
      [`Set x of ${B}`, false, true],
      [`Set x of ${A}`, false, false],
      [`Set x of ${C}`, true, false],
    ]);
    expect(
      listed({
        editing: [editor(`${A}/group_1`, "s0"), editor(`${A}/score`)],
        entries: [e1],
        undone: [u1],
        sessions,
      }),
    ).toEqual([
      [`Set x of ${A}`, false, false],
      [`Set x of ${C}`, true, false],
    ]);
  });

  it("lists nothing when nothing was done", () => {
    expect(journalRows(source({}), view)).toEqual([]);
  });
});
