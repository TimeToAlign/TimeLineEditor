import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isCommandError, isLoadError, JournalMismatchError } from "../src/errors.ts";
import type { Anchor, ArrangementConflict, Row } from "../src/manifest/arrangement.ts";
import { anchorChange, anchorsOf, itemOrder, rowOf } from "../src/manifest/arrangement.ts";
import type { Manifest } from "../src/manifest/types.ts";
import { Rational } from "../src/number/rational.ts";
import type { Address } from "../src/workspace/address.ts";
import { readWorkspace, writeWorkspace } from "../src/workspace/file.ts";
import type { Workspace } from "../src/workspace/store.ts";
import { createStore } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { columnsOf, createView } from "../src/workspace/view.ts";
import { A, block, changed, fileText, key, loadText, storeOf, testClock } from "./support.ts";

// ---------------------------------------------------------------- the builder

/** A child `[id, offset, length]` of a root, `null` for an unknown length. */
type Child = readonly [string, number, number | null];

interface Built {
  /** The roots by ID, each with its children; a root listed only as a member has none. */
  readonly roots?: { readonly [id: string]: readonly Child[] };
  /** The groups by ID, each with its members in display order. */
  readonly groups: { readonly [id: string]: readonly string[] };
  /** Roots holding no member and in no group. */
  readonly ungrouped?: readonly string[];
  /** Names given to groups and timelines by ID. */
  readonly names?: { readonly [id: string]: string };
}

const pair = (value: number) => [value, 1];

/**
 * The manifest `Arranged`: roots of 200 quarters, fraction, their children as
 * given, every member that is no child a root of its own, and the groups,
 * each with its display order stated.
 */
function built({ roots = {}, groups, ungrouped = [], names = {} }: Built): Manifest {
  const named = (id: string) => (names[id] === undefined ? {} : { name: names[id] });
  const timeline = (id: string, length: number | null, extra: object = {}) => ({
    id,
    ...named(id),
    unit: "quarters",
    number_type: "fraction",
    length: length === null ? null : pair(length),
    ...extra,
  });
  const children = new Set(Object.values(roots).flatMap((list) => list.map(([id]) => id)));
  const memberRoots = Object.values(groups)
    .flat()
    .filter((id) => !children.has(id) && !Object.hasOwn(roots, id));
  const child = ([id, offset, length]: Child) =>
    timeline(id, length, {
      offset: pair(offset),
      // A child of unknown length reaches 10 through one region.
      ...(length === null
        ? { regions: [{ id: `${id}_region`, start: pair(0), end: pair(10) }] }
        : {}),
    });
  const value = {
    timetoshare: "0.2.0",
    name: "Arranged",
    timelines: [
      ...Object.entries(roots).map(([id, list]) =>
        timeline(id, 200, { children: list.map(child) }),
      ),
      ...[...new Set([...memberRoots, ...ungrouped])].map((id) => timeline(id, 200)),
    ],
    groups: Object.entries(groups).map(([id, members]) => ({ id, ...named(id), members })),
    // A group's members are held by ID; its display order is stated.
    graphical: { order: Object.fromEntries(Object.entries(groups)) },
  };
  return loadText(fileText(value));
}

/** An exact quarter value. */
const q = (value: number) => Rational.of(BigInt(value));

const anchor = (group: string, root: string, member: string, start: number, end: number) => ({
  group,
  root,
  member,
  start: q(start),
  end: q(end),
});

/** `rowOf`, failing loudly on a conflict. */
function row(manifest: Manifest, order: readonly string[]): Row {
  const found = rowOf(manifest, order);
  if ("reason" in found) throw new Error(found.reason);
  return found;
}

/** `rowOf`, failing loudly where the items stand side by side. */
function conflict(manifest: Manifest, order: readonly string[] = []): ArrangementConflict {
  const found = rowOf(manifest, order);
  if (!("reason" in found)) throw new Error(`no conflict: ${found.row.join(", ")}`);
  return found;
}

// ---------------------------------------------------------------- the manifests

const ITEMS = built({
  roots: { R: [["r1", 0, 10]] },
  groups: { G1: ["p1", "q1"], G2: ["r1"] },
  ungrouped: ["U"],
});
const FIRST_INSIDE = built({
  roots: {
    R: [
      ["r1", 0, 10],
      ["r2", 5, 10],
      ["r3", 20, 10],
    ],
  },
  groups: { G1: ["r1", "r2"], G2: ["r3"] },
});
const SPREAD = built({
  roots: {
    R: [
      ["r1", 0, 10],
      ["r2", 40, 10],
      ["r3", 80, 10],
    ],
  },
  groups: { G1: ["r1", "p1"], G2: ["r2", "p2"], G3: ["r3", "p3"] },
});
const OVERLAP = built({
  roots: {
    R: [
      ["r1", 0, 10],
      ["r2", 5, 10],
    ],
  },
  groups: { G1: ["r1"], G2: ["r2"] },
});
const TWO_ROOTS = built({
  roots: {
    R: [
      ["r1", 0, 10],
      ["r2", 20, 10],
    ],
    S: [
      ["s1", 0, 5],
      ["s2", 10, 5],
    ],
  },
  groups: { G1: ["r1", "x1", "s1"], G2: ["r2", "s2"] },
});

// ---------------------------------------------------------------- the rules

describe("the rules of items side by side", () => {
  it("lists the items and completes a stored order", () => {
    expect(itemOrder(ITEMS, [])).toEqual(["G1", "G2", "U"]);
    expect(itemOrder(ITEMS, ["U", "nope", "G2", "U"])).toEqual(["U", "G2", "G1"]);
  });

  it("anchors a group on a root by its first member inside it", () => {
    const expected: Anchor[] = [anchor("G1", "R", "r1", 0, 10), anchor("G2", "R", "r3", 20, 30)];
    expect(anchorsOf(FIRST_INSIDE)).toEqual(expected);
    expect(row(FIRST_INSIDE, [])).toEqual({ row: ["G1", "G2"], roots: ["R"], anchors: expected });
  });

  it("sums the offsets down to a grandchild", () => {
    const manifest = loadText(
      fileText({
        timetoshare: "0.2.0",
        name: "Arranged",
        timelines: [
          {
            id: "R",
            unit: "quarters",
            number_type: "fraction",
            length: pair(200),
            children: [
              {
                id: "P",
                unit: "quarters",
                number_type: "fraction",
                length: pair(50),
                offset: pair(100),
                children: [
                  {
                    id: "m",
                    unit: "quarters",
                    number_type: "fraction",
                    length: pair(10),
                    offset: pair(5),
                  },
                ],
              },
              {
                id: "r2",
                unit: "quarters",
                number_type: "fraction",
                length: pair(10),
                offset: pair(50),
              },
            ],
          },
        ],
        groups: [
          { id: "G1", members: ["m"] },
          { id: "G2", members: ["r2"] },
        ],
      }),
    );
    expect(row(manifest, [])).toEqual({
      row: ["G2", "G1"],
      roots: ["R"],
      anchors: [anchor("G2", "R", "r2", 50, 60), anchor("G1", "R", "m", 105, 115)],
    });
  });

  it("takes no root member as an anchor", () => {
    const manifest = built({ roots: { R: [["r1", 0, 10]] }, groups: { G1: ["R"], G2: ["r1"] } });
    expect(anchorsOf(manifest)).toEqual([anchor("G2", "R", "r1", 0, 10)]);
    expect(row(manifest, [])).toEqual({
      row: ["G1", "G2"],
      roots: ["R"],
      anchors: [anchor("G2", "R", "r1", 0, 10)],
    });
  });

  it("ends a member of unknown length where it is drawn", () => {
    const manifest = built({
      roots: {
        R: [
          ["r1", 0, null],
          ["r2", 10, 10],
        ],
      },
      groups: { G1: ["r1"], G2: ["r2"] },
    });
    expect(row(manifest, ["G2", "G1"])).toEqual({
      row: ["G1", "G2"],
      roots: ["R"],
      anchors: [anchor("G1", "R", "r1", 0, 10), anchor("G2", "R", "r2", 10, 20)],
    });
  });

  it("orders the row by the stretches", () => {
    expect(row(SPREAD, ["G3", "G1", "G2"])).toEqual({
      row: ["G1", "G2", "G3"],
      roots: ["R"],
      anchors: [
        anchor("G1", "R", "r1", 0, 10),
        anchor("G2", "R", "r2", 40, 50),
        anchor("G3", "R", "r3", 80, 90),
      ],
    });
  });

  it("allows touching", () => {
    const manifest = built({
      roots: {
        R: [
          ["r1", 0, 10],
          ["r2", 10, 10],
        ],
      },
      groups: { G1: ["r1"], G2: ["r2"] },
    });
    expect(row(manifest, ["G2", "G1"])).toMatchObject({ row: ["G1", "G2"], roots: ["R"] });
  });

  it("stacks two roots by the groups", () => {
    expect(row(TWO_ROOTS, ["G2", "G1"])).toEqual({
      row: ["G1", "G2"],
      roots: ["R", "S"],
      anchors: [
        anchor("G1", "R", "r1", 0, 10),
        anchor("G1", "S", "s1", 0, 5),
        anchor("G2", "R", "r2", 20, 30),
        anchor("G2", "S", "s2", 10, 15),
      ],
    });
    const apart = built({
      roots: {
        R: [
          ["r1", 0, 10],
          ["r2", 10, 10],
        ],
        S: [
          ["s1", 0, 5],
          ["s2", 30, 10],
        ],
      },
      groups: { G1: ["r1", "s1"], G2: ["r2", "s2"] },
    });
    expect(row(apart, ["G2", "G1"])).toMatchObject({ row: ["G1", "G2"], roots: ["R", "S"] });
  });

  it("keeps the stored order where the stretches leave it free", () => {
    const manifest = built({
      roots: {
        R: [
          ["r1", 20, 10],
          ["r2", 0, 10],
        ],
        S: [
          ["s1", 20, 10],
          ["s2", 50, 10],
        ],
      },
      groups: { G1: ["r1", "s1"], G2: ["r2"], G3: ["s2"] },
    });
    expect(row(manifest, ["G1", "G2", "G3"])).toMatchObject({
      row: ["G2", "G1", "G3"],
      roots: ["R", "S"],
    });
  });

  it("orders the roots by a subsequence", () => {
    const manifest = built({
      roots: {
        R: [
          ["r1", 0, 10],
          ["r2", 20, 10],
        ],
        S: [["s1", 0, 10]],
        T: [
          ["t1", 0, 10],
          ["t2", 20, 10],
        ],
      },
      groups: { G1: ["r1", "t1"], G2: ["r2", "s1", "t2"] },
    });
    expect(row(manifest, ["G2", "G1"])).toMatchObject({
      row: ["G1", "G2"],
      roots: ["R", "S", "T"],
    });
  });

  it("keeps the stored order of items hanging on nothing", () => {
    expect(row(ITEMS, ["U", "G2", "G1"])).toEqual({
      row: ["U", "G2", "G1"],
      roots: ["R"],
      anchors: [anchor("G2", "R", "r1", 0, 10)],
    });
  });

  it("orders roots no group orders by ID", () => {
    const manifest = built({
      roots: { R: [["r1", 0, 10]], S: [["s1", 0, 10]] },
      groups: { G1: ["s1"], G2: ["r1"] },
    });
    expect(row(manifest, ["G1", "G2"])).toMatchObject({ row: ["G1", "G2"], roots: ["R", "S"] });
  });

  it("refuses an overlap", () => {
    expect(conflict(OVERLAP)).toEqual({
      groups: ["G1", "G2"],
      roots: ["R"],
      reason: '"G1" and "G2" overlap on "R" (5–10 ♩)',
    });
    const named = built({
      roots: {
        R: [
          ["r1", 0, 8],
          ["r2", 4, 8],
        ],
      },
      groups: { G1: ["r1"], G2: ["r2"] },
      names: { G1: "Theme A", G2: "Theme B", R: "Score" },
    });
    expect(conflict(named).reason).toBe('"Theme A" and "Theme B" overlap on "Score" (4–8 ♩)');
  });

  it("refuses stretches ordering the groups in a cycle", () => {
    const two = built({
      roots: {
        R: [
          ["r1", 0, 10],
          ["r2", 20, 10],
        ],
        S: [
          ["s1", 20, 10],
          ["s2", 0, 10],
        ],
      },
      groups: { G1: ["r1", "s1"], G2: ["r2", "s2"] },
    });
    expect(conflict(two)).toEqual({
      groups: ["G1", "G2"],
      roots: ["R", "S"],
      reason: 'on "R" "G1" comes first, on "S" "G2"',
    });
    expect(conflict(two, ["G2", "G1"])).toEqual({
      groups: ["G2", "G1"],
      roots: ["S", "R"],
      reason: 'on "S" "G2" comes first, on "R" "G1"',
    });
    const three = built({
      roots: {
        R: [
          ["r1", 0, 10],
          ["r2", 20, 10],
        ],
        S: [
          ["s1", 0, 10],
          ["s2", 20, 10],
        ],
        T: [
          ["t1", 0, 10],
          ["t2", 20, 10],
        ],
      },
      groups: { G1: ["r1", "t2"], G2: ["r2", "s1"], G3: ["s2", "t1"] },
    });
    expect(conflict(three)).toEqual({
      groups: ["G1", "G2", "G3"],
      roots: ["R", "S", "T"],
      reason: 'on "R" "G1" comes before "G2", on "S" "G2" before "G3", on "T" "G3" before "G1"',
    });
  });

  it("refuses groups ordering the roots in a cycle", () => {
    const manifest = built({
      roots: {
        R: [
          ["r1", 0, 10],
          ["r2", 20, 10],
        ],
        S: [
          ["s1", 0, 10],
          ["s2", 20, 10],
        ],
      },
      groups: { G1: ["r1", "s1"], G2: ["s2", "r2"] },
    });
    expect(conflict(manifest)).toEqual({
      groups: ["G1", "G2"],
      roots: ["R", "S"],
      reason: '"G1" holds "R" above "S", "G2" holds "S" above "R"',
    });
  });

  it("tells a drop that changes an anchor", () => {
    expect(anchorChange(FIRST_INSIDE, "G1", ["r2", "r1"])).toBe(
      'would anchor "r2" on "R" instead of "r1"',
    );
    expect(anchorChange(FIRST_INSIDE, "G1", ["r1", "r2"])).toBeNull();
    expect(anchorChange(TWO_ROOTS, "G1", ["x1", "r1", "s1"])).toBeNull();
  });
});

// ---------------------------------------------------------------- the commands

/** A view whose block `A` holds `manifest`. */
const viewWith = (manifest: Manifest): View =>
  changed(createView(), { type: "add", into: {}, block: { id: A, manifest, x: 0, y: 0 } });

const setBlock = (values: object) => ({
  type: "set",
  changes: [{ target: { block: A }, values }],
});
const setWorkspace = (values: object) => ({ type: "set", changes: [{ target: {}, values }] });

/** The code, path and message of a refusal. */
function refused(result: unknown): { code: string; path: readonly unknown[]; message: string } {
  if (!isCommandError(result)) throw new Error("expected a refusal");
  return { code: result.code, path: result.path, message: result.message };
}

const BLOCK_KEY = key({ block: A });
const HORIZONTAL = { direction: "horizontal", order: ["G1", "G2", "G3"] };

describe("a block's arrangement", () => {
  it("stores the row a horizontal set gives, in one journal entry", () => {
    const store = storeOf(viewWith(SPREAD));
    const before = store.journal.length;
    const command = setBlock({
      arrangement: { direction: "horizontal", order: ["G3", "G1", "G2"] },
    });
    expect(store.dispatch(command)).toBeNull();
    expect(block(store.view).arrangement).toEqual(HORIZONTAL);
    expect(store.journal.length).toBe(before + 1);
    expect(store.journal.at(-1)).toMatchObject({ command });
  });

  it("stores a vertical order as given and deletes on null", () => {
    let view = changed(
      viewWith(SPREAD),
      setBlock({ arrangement: { direction: "vertical", order: ["G2", "nope"] } }),
    );
    expect(block(view).arrangement).toEqual({ direction: "vertical", order: ["G2", "nope"] });
    view = changed(view, setBlock({ arrangement: null }));
    expect(Object.hasOwn(block(view), "arrangement")).toBe(false);
    expect(refused(apply(view, setBlock({ arrangement: null })))).toEqual({
      code: "invalid_value",
      path: [BLOCK_KEY, "arrangement"],
      message: "the command changes nothing",
    });
  });

  it("refuses side by side where the rules refuse it", () => {
    const view = viewWith(OVERLAP);
    expect(
      refused(apply(view, setBlock({ arrangement: { direction: "horizontal", order: [] } }))),
    ).toEqual({
      code: "arrangement_conflict",
      path: [BLOCK_KEY, "arrangement"],
      message: '"G1" and "G2" overlap on "R" (5–10 ♩)',
    });
  });

  it("refuses a malformed arrangement", () => {
    const view = viewWith(SPREAD);
    const at = [BLOCK_KEY, "arrangement"];
    const of = (arrangement: unknown) => refused(apply(view, setBlock({ arrangement })));
    expect(of({ direction: "diagonal", order: [] })).toEqual({
      code: "invalid_value",
      path: [...at, "direction"],
      message: 'expected "vertical" or "horizontal"',
    });
    expect(of({ direction: "vertical" })).toEqual({
      code: "missing_member",
      path: [...at, "order"],
      message: "missing member order",
    });
    expect(of({ direction: "vertical", order: ["G1", "G1"] })).toEqual({
      code: "invalid_value",
      path: [...at, "order", 1],
      message: "'G1' is listed twice",
    });
    expect(of({ direction: "vertical", order: [], columns: 2 })).toEqual({
      code: "unknown_member",
      path: [...at, "columns"],
      message: "unknown member columns",
    });
    expect(of({ direction: "vertical", order: [1] })).toEqual({
      code: "invalid_value",
      path: [...at, "order"],
      message: "expected a list of item IDs",
    });
  });

  it("keeps a horizontal arrangement a later edit breaks", () => {
    let view = changed(
      viewWith(SPREAD),
      setBlock({ arrangement: { direction: "horizontal", order: [] } }),
    );
    view = changed(view, {
      type: "set",
      changes: [{ target: { block: A, id: "r2" }, values: { offset: [5, 1] } }],
    });
    const { arrangement, manifest } = block(view);
    expect(arrangement).toEqual(HORIZONTAL);
    expect(conflict(manifest, arrangement?.order)).toEqual({
      groups: ["G1", "G2"],
      roots: ["R"],
      reason: '"G1" and "G2" overlap on "R" (5–10 ♩)',
    });
  });
});

describe("the workspace's arrangement", () => {
  it("stores and deletes it", () => {
    let view = changed(
      createView(),
      setWorkspace({ arrangement: { direction: "matrix", columns: 3 } }),
    );
    expect(view.arrangement).toEqual({ direction: "matrix", columns: 3 });
    view = changed(view, setWorkspace({ arrangement: { direction: "matrix" } }));
    expect(view.arrangement).toEqual({ direction: "matrix" });
    view = changed(view, setWorkspace({ arrangement: { direction: "horizontal" } }));
    expect(view.arrangement).toEqual({ direction: "horizontal" });
    view = changed(view, setWorkspace({ arrangement: null }));
    expect(Object.hasOwn(view, "arrangement")).toBe(false);
  });

  it("gives a matrix its columns", () => {
    expect(columnsOf({ direction: "matrix" }, 5)).toBe(3);
    expect(columnsOf({ direction: "matrix" }, 0)).toBe(1);
    expect(columnsOf({ direction: "matrix", columns: 2 }, 5)).toBe(2);
  });

  it("refuses a malformed arrangement", () => {
    const at = [key({}), "arrangement"];
    const of = (arrangement: unknown) =>
      refused(apply(createView(), setWorkspace({ arrangement })));
    expect(of({ direction: "vertical", columns: 2 })).toEqual({
      code: "invalid_value",
      path: [...at, "columns"],
      message: "only a matrix has columns",
    });
    expect(of({ direction: "matrix", columns: 0 })).toEqual({
      code: "non_positive_number",
      path: [...at, "columns"],
      message: "the number must be positive",
    });
    expect(of({ direction: "matrix", columns: 2.5 })).toEqual({
      code: "invalid_value",
      path: [...at, "columns"],
      message: "expected a positive safe integer",
    });
    expect(of({ direction: "diagonal" })).toEqual({
      code: "invalid_value",
      path: [...at, "direction"],
      message: 'expected "vertical", "horizontal" or "matrix"',
    });
  });
});

// ---------------------------------------------------------------- the file

function read(text: string): Workspace {
  const workspace = readWorkspace(text);
  if (isLoadError(workspace)) throw new Error(JSON.stringify(workspace.problems));
  return workspace;
}

/** A workspace with block `A` holding `SPREAD`, after `commands`. */
function arranged(...commands: object[]): Workspace {
  const store = createStore(
    { view: createView(), journal: [], sessions: {} },
    { clock: testClock() },
  );
  expect(
    store.dispatch({ type: "add", into: {}, block: { id: A, manifest: SPREAD, x: 0, y: 0 } }),
  ).toBeNull();
  for (const command of commands) expect(store.dispatch(command)).toBeNull();
  return store.snapshot();
}

/** The text of a workspace file with `edit` applied to its value. */
function edited(text: string, edit: (value: Record<string, unknown>) => void): string {
  const value = JSON.parse(text) as Record<string, unknown>;
  edit(value);
  return JSON.stringify(value, null, 2);
}

describe("arrangements in the workspace file", () => {
  it("round-trips them byte for byte", () => {
    const workspace = arranged(
      setBlock({ arrangement: HORIZONTAL }),
      setWorkspace({ arrangement: { direction: "matrix", columns: 2 } }),
    );
    const text = writeWorkspace(workspace);
    const again = read(text);
    expect(again).toEqual(workspace);
    expect(writeWorkspace(again)).toBe(text);
    const value = JSON.parse(text) as {
      arrangement: unknown;
      blocks: { [id: string]: { arrangement: unknown } };
    };
    expect(value.arrangement).toEqual({ direction: "matrix", columns: 2 });
    expect(value.blocks[A]?.arrangement).toEqual(HORIZONTAL);
  });

  it("writes nothing for no arrangement and reads null as none", () => {
    const text = writeWorkspace(arranged());
    expect(text.includes('"arrangement"')).toBe(false);
    const stated = edited(text, (value) => {
      value.arrangement = null;
      (value.blocks as { [id: string]: Record<string, unknown> })[A] = {
        ...(value.blocks as { [id: string]: Record<string, unknown> })[A],
        arrangement: null,
      };
    });
    const { view } = read(stated);
    expect(Object.hasOwn(view, "arrangement")).toBe(false);
    expect(Object.hasOwn(block(view), "arrangement")).toBe(false);
  });

  it("refuses a malformed block arrangement", () => {
    const text = edited(writeWorkspace(arranged()), (value) => {
      const blocks = value.blocks as { [id: string]: Record<string, unknown> };
      blocks[A] = { ...blocks[A], arrangement: { direction: "vertical", order: ["G1", "G1"] } };
    });
    const found = readWorkspace(text);
    expect(isLoadError(found) ? found.problems : []).toEqual([
      {
        code: "invalid_value",
        message: "'G1' is listed twice",
        path: ["blocks", A, "arrangement", "order", 1],
      },
    ]);
  });

  it("refuses a view arrangement the journal never set", () => {
    const workspace = arranged();
    const view = { ...workspace.view, arrangement: { direction: "vertical" as const } };
    expect(() => createStore({ ...workspace, view })).toThrow(JournalMismatchError);
    try {
      createStore({ ...workspace, view });
    } catch (error) {
      expect(error instanceof JournalMismatchError ? error.path : null).toEqual(["arrangement"]);
    }
  });
});

// ---------------------------------------------------------------- the guard

describe("arrangements and editors", () => {
  const group: Address = { block: A, id: "G1" };

  it("refuses both arrangements in an element's editor", () => {
    const store = storeOf(viewWith(SPREAD));
    expect(store.open(group)).toBeNull();
    expect(refused(store.dispatch(setBlock({ arrangement: HORIZONTAL })))).toEqual({
      code: "side_effect",
      path: [BLOCK_KEY, "arrangement"],
      message:
        "the arrangement of bundle 'Arranged' lies outside group 'G1': an editor changes only what it edits",
    });
    expect(
      refused(store.dispatch(setWorkspace({ arrangement: { direction: "vertical" } }))),
    ).toEqual({
      code: "side_effect",
      path: [key({}), "arrangement"],
      message:
        "the workspace's arrangement lies outside group 'G1': an editor changes only what it edits",
    });
  });

  it("arranges in the bundle's editor", () => {
    const store = storeOf(viewWith(SPREAD));
    expect(store.open({ block: A })).toBeNull();
    expect(store.dispatch(setBlock({ arrangement: HORIZONTAL }))).toBeNull();
    expect(block(store.view).arrangement).toEqual(HORIZONTAL);
  });
});
