import { JsonFloat } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply, applyChanges } from "../src/commands/apply.ts";
import { parseCommand } from "../src/commands/parse.ts";
import {
  groupstampByDefault,
  importedManifest,
  isGroupMember,
} from "../src/commands/timestamps.ts";
import { isCommandError } from "../src/errors.ts";
import { addressKey } from "../src/manifest/address.ts";
import { contains } from "../src/manifest/contains.ts";
import { groupsHolding } from "../src/manifest/tree.ts";
import type { Manifest, ManifestGraphical, NamedTimestamp } from "../src/manifest/types.ts";
import type { Address } from "../src/workspace/address.ts";
import { addressWords, manifestIds, resolveAddress } from "../src/workspace/address.ts";
import { sideEffect } from "../src/workspace/guard.ts";
import { createIdMinter } from "../src/workspace/ids.ts";
import type { EditorKind } from "../src/workspace/sessions.ts";
import type { View } from "../src/workspace/view.ts";
import {
  A,
  block,
  changed,
  deepFreeze,
  fileText,
  fixture,
  load,
  loadText,
  manifestValue,
  refusal,
  storeOf,
  unlockedView,
  viewOf,
} from "./support.ts";

const FIXTURE = "timestamps.yaml";
const view = deepFreeze(viewOf([A, FIXTURE]));
const graphical = load(FIXTURE).graphical;
const [T1, T2, T3] = graphical?.timestamps ?? [];
if (T1 === undefined || T2 === undefined || T3 === undefined) {
  throw new Error(`${FIXTURE} holds three timestamps`);
}

const at = (id: string): Address => ({ block: A, id });
const line = (id: string): Address => ({ block: A, id, part: ["line"] });
const key = (address: Address) => addressKey(address);

/**
 * An `add` of a named timestamp into `into`, its ID `id`: by default its
 * name in lower case where it has a name (`Coda` → `coda`), else none.
 */
type Value = { readonly [member: string]: unknown };
const add = (into: string, timestamp: Value, id = idOf(timestamp)) => ({
  type: "add",
  into: at(into),
  timestamp,
  ...(id === undefined ? {} : { ids: [id] }),
});
function idOf(timestamp: Value): string | undefined {
  const { name } = timestamp;
  return typeof name === "string" && name !== "" ? name.toLowerCase() : undefined;
}
const set = (target: Address, values: object) => ({ type: "set", changes: [{ target, values }] });
const remove = (...targets: Address[]) => ({ type: "remove", targets });

/** The display a timestamp is given where none is stated. */
const DEFAULT = ["wedge", "name", "cross_section"];
/** The display of the timestamps a new root is given. */
const MARK = ["wedge", "coordinate"];

/** The fixture `name` read with its `graphical` object left out. */
function withoutGraphical(name: string): Manifest {
  const { graphical: _, ...rest } = manifestValue(name);
  return loadText(fileText(rest), name);
}

/** A view whose block `A` holds `manifest`. */
const viewHolding = (manifest: Manifest): View =>
  deepFreeze(changed(viewOf(), { type: "add", into: {}, block: { id: A, manifest, x: 0, y: 0 } }));

const graphicalOf = (state: View): ManifestGraphical | undefined => block(state).manifest.graphical;
const timestampsOf = (state: View): readonly NamedTimestamp[] | undefined =>
  graphicalOf(state)?.timestamps;

/** A refusal's code, message and path. */
function refused(result: unknown): { code: string; message: string; path: readonly unknown[] } {
  if (!isCommandError(result)) throw new Error("expected a refusal");
  return { code: result.code, message: result.message, path: result.path };
}

const CODA: NamedTimestamp = {
  id: "coda",
  timeline: "clt_1",
  coordinate: [15, 2],
  name: "Coda",
  display: ["wedge", "name", "cross_section"],
  matchstamp: false,
  groupstamp: false,
};

/** The refusals of a display, by value: the message each gives. */
const BAD_DISPLAYS: [unknown, string][] = [
  [["wedge", "flag"], "'flag' is no display word"],
  [["name", "wedge", "name"], "'name' is given twice"],
  ["wedge", "a display is a list of display words"],
  [[1], "a display is a list of display words"],
];

describe("reading a named timestamp's display", () => {
  it("holds it complete and in canonical order whatever the file states", () => {
    expect(T1?.display).toEqual(DEFAULT);
    expect(loadText(fixture(FIXTURE).twin).graphical).toEqual(graphical);
    const value = manifestValue(FIXTURE) as {
      graphical: { timestamps: { display: string[] }[] };
    };
    const [, , third] = value.graphical.timestamps;
    if (third === undefined) throw new Error(`${FIXTURE} holds three timestamps`);
    third.display = [...third.display].reverse();
    expect(third.display[0]).toBe("cross_section");
    expect(loadText(fileText(value)).graphical).toEqual(graphical);
  });
});

describe("resolving a named timestamp", () => {
  it("resolves to the timestamp with the timeline it lies on", () => {
    for (const [id, timeline, index, timestamp] of [
      ["timestamp_1", "clt_1", 0, T1],
      ["timestamp_3", "clt_2", 2, T3],
    ] as const) {
      const resolved = resolveAddress(view, at(id));
      if (isCommandError(resolved) || resolved.kind !== "timestamp") throw new Error(id);
      expect([resolved.at.timeline.id, resolved.index, resolved.timestamp]).toEqual([
        timeline,
        index,
        timestamp,
      ]);
    }
    expect(addressWords(view, at("timestamp_1"))).toBe("timestamp 'Downbeat'");
    expect(addressWords(view, at("timestamp_3"))).toBe("timestamp 'Entry'");
  });

  it("resolves the parts it draws, and only those", () => {
    expect(addressWords(view, line("timestamp_1"))).toBe("the line of timestamp 'Downbeat'");
    const drawn = [line("timestamp_1"), { ...at("timestamp_1"), part: ["name"] }];
    const undrawn = [line("timestamp_2"), { ...at("timestamp_1"), part: ["id"] }];
    const kinds = (addresses: object[]) =>
      addresses.map((address) => {
        const resolved = resolveAddress(view, address as Address);
        return isCommandError(resolved) ? resolved.code : resolved.kind;
      });
    expect(kinds(drawn)).toEqual(["part", "part"]);
    expect(kinds(undrawn)).toEqual(["unknown_target", "unknown_target"]);
  });

  it("names nothing for an unknown ID or a facet", () => {
    for (const address of [at("timestamp_9"), { ...at("timestamp_1"), facet: "markers" }]) {
      expect(refusal(resolveAddress(view, address as Address))).toEqual({
        code: "unknown_target",
        path: [key(address as Address)],
      });
    }
  });

  it("lies in the manifest's one ID space and inside its timeline", () => {
    const { manifest } = block(view);
    expect([...manifestIds(manifest)].sort()).toEqual([
      "clt_1",
      "clt_2",
      "timestamp_1",
      "timestamp_2",
      "timestamp_3",
    ]);
    const inside = (timeline: string) =>
      [
        { id: "timestamp_1" },
        { id: "timestamp_2" },
        { id: "timestamp_3" },
        { id: "timestamp_1", part: ["line" as const] },
      ].filter((element) => contains(manifest, timeline, element));
    expect(inside("clt_1")).toEqual([
      { id: "timestamp_1" },
      { id: "timestamp_2" },
      { id: "timestamp_3" },
      { id: "timestamp_1", part: ["line"] },
    ]);
    expect(inside("clt_2")).toEqual([{ id: "timestamp_3" }]);
  });
});

describe("add a named timestamp", () => {
  it("takes the command's ID and lists it in canonical order", () => {
    const coda = changed(view, add("clt_1", { name: "Coda", coordinate: [15, 2] }));
    expect(timestampsOf(coda)).toEqual([T1, T2, CODA, T3]);
    const exit = changed(view, add("clt_2", { name: "Exit", coordinate: [8, 2] }));
    expect(timestampsOf(exit)).toEqual([
      T1,
      T2,
      T3,
      {
        id: "exit",
        timeline: "clt_2",
        coordinate: [4, 1],
        name: "Exit",
        display: DEFAULT,
        matchstamp: false,
        groupstamp: false,
      },
    ]);
    const without = changed(view, remove(at("timestamp_1")));
    const start = { name: "Start", coordinate: [1, 1] };
    const again = changed(without, add("clt_1", start, "timestamp_1"));
    expect(timestampsOf(again)).toEqual([
      {
        id: "timestamp_1",
        timeline: "clt_1",
        coordinate: [1, 1],
        name: "Start",
        display: DEFAULT,
        matchstamp: false,
        groupstamp: false,
      },
      T2,
      T3,
    ]);
    const { ids: _, ...unnamed } = add("clt_1", start);
    expect(refusal(apply(without, unnamed))).toEqual({ code: "invalid_command", path: ["ids"] });
  });

  it("gives a manifest without a graphical object one", () => {
    const bare = changed(viewHolding(withoutGraphical("bare.yaml")), {
      type: "add",
      into: at("bare"),
      timestamp: { name: "Mid", coordinate: [5, 2] },
      ids: ["mid"],
    });
    expect(graphicalOf(bare)).toEqual({
      order: {},
      rules: [],
      styles: {},
      timestamps: [
        {
          id: "mid",
          timeline: "bare",
          coordinate: [5, 2],
          name: "Mid",
          display: DEFAULT,
          matchstamp: false,
          groupstamp: false,
        },
      ],
      matchstamps: [],
      elisions: [],
    });
  });

  it("stores a given display in canonical order", () => {
    for (const [display, stored] of [
      [
        ["cross_section", "id", "wedge"],
        ["wedge", "id", "cross_section"],
      ],
      [[], []],
    ]) {
      const coda = changed(view, add("clt_1", { name: "Coda", coordinate: [15, 2], display }));
      expect(timestampsOf(coda)).toEqual([T1, T2, { ...CODA, display: stored }, T3]);
    }
  });

  it("refuses a value at fault where it lies", () => {
    const into = key(at("clt_1"));
    const cases: [Value, string, string, string | null][] = [
      [{ name: "", coordinate: [1, 1] }, "invalid_value", "name", "a name is a non-empty string"],
      [
        { name: "Late", coordinate: [17, 2] },
        "invalid_value",
        "coordinate",
        "the coordinate lies after the end of timeline 'clt_1'",
      ],
      [
        { name: "Early", coordinate: [-1, 2] },
        "invalid_value",
        "coordinate",
        "the coordinate lies before the start of timeline 'clt_1'",
      ],
      [{ name: "Bare", coordinate: 3 }, "invalid_coordinate", "coordinate", null],
      [{ name: "None" }, "invalid_value", "coordinate", "a new timestamp needs coordinate"],
      [
        { id: "timestamp_9", name: "Given", coordinate: [1, 1] },
        "unknown_property",
        "id",
        "unknown member id",
      ],
      ...BAD_DISPLAYS.map(([display, message]): [Value, string, string, string] => [
        { name: "Shown", coordinate: [1, 1], display },
        "invalid_value",
        "display",
        message,
      ]),
    ];
    for (const [value, code, member, message] of cases) {
      const result = refused(apply(view, add("clt_1", value)));
      expect({ code: result.code, path: result.path }).toEqual({
        code,
        path: [into, "timestamp", member],
      });
      if (message !== null) expect(result.message).toBe(message);
    }
    for (const into of [{ block: A }, at("timestamp_1")]) {
      const command = { type: "add", into, timestamp: { name: "X", coordinate: [1, 1] } };
      expect(refusal(apply(view, command))).toEqual({
        code: "wrong_target_kind",
        path: [key(into), "timestamp"],
      });
    }
  });
});

describe("set a named timestamp", () => {
  it("sets its name, its coordinate and its display, kept in canonical order", () => {
    const renamed = changed(view, set(at("timestamp_1"), { name: "One" }));
    expect(timestampsOf(renamed)).toEqual([{ ...T1, name: "One" }, T2, T3]);
    const moved = changed(view, set(at("timestamp_1"), { coordinate: [7, 1] }));
    expect(timestampsOf(moved)).toEqual([T2, { ...T1, coordinate: [7, 1] }, T3]);
    const end = changed(view, set(at("timestamp_3"), { coordinate: [4, 1] }));
    expect(timestampsOf(end)).toEqual([T1, T2, { ...T3, coordinate: [4, 1] }]);
    const lined = changed(
      view,
      set(at("timestamp_2"), { display: ["cross_section", "wedge", "name"] }),
    );
    expect(timestampsOf(lined)).toEqual([T1, { ...T2, display: DEFAULT }, T3]);
    const bare = changed(view, set(at("timestamp_3"), { display: [] }));
    expect(timestampsOf(bare)).toEqual([T1, T2, { ...T3, display: [] }]);
  });

  it("refuses a value at fault, a value that changes nothing and what it has not", () => {
    const cases: [Address, object, string, string][] = [
      [at("timestamp_1"), { name: "" }, "invalid_value", "a name is a non-empty string"],
      [
        at("timestamp_3"),
        { coordinate: [9, 2] },
        "invalid_value",
        "the coordinate lies after the end of timeline 'clt_2'",
      ],
      ...BAD_DISPLAYS.map(([display, message]): [Address, object, string, string] => [
        at("timestamp_1"),
        { display },
        "invalid_value",
        message,
      ]),
      [at("timestamp_1"), { name: "Downbeat" }, "invalid_value", "the command changes nothing"],
      [at("timestamp_1"), { coordinate: [3, 2] }, "invalid_value", "the command changes nothing"],
      [at("timestamp_1"), { coordinate: [6, 4] }, "invalid_value", "the command changes nothing"],
      [
        at("timestamp_2"),
        { display: ["name", "wedge"] },
        "invalid_value",
        "the command changes nothing",
      ],
      [
        at("timestamp_1"),
        { timeline: "clt_2" },
        "unknown_property",
        "timestamp has no property timeline",
      ],
    ];
    for (const [target, values, code, message] of cases) {
      const [property = ""] = Object.keys(values);
      expect(refused(apply(view, set(target, values)))).toEqual({
        code,
        message,
        path: [key(target), property],
      });
    }
    expect(refusal(apply(view, set(at("timestamp_1"), { start: [1, 1] })))).toEqual({
      code: "wrong_target_kind",
      path: [key(at("timestamp_1")), "start"],
    });
    expect(refusal(apply(view, set(at("timestamp_1"), { id: "timestamp_5" })))).toEqual({
      code: "id_not_settable",
      path: [key(at("timestamp_1")), "id"],
    });
    for (const command of [set(line("timestamp_2"), { name: "X" }), remove(line("timestamp_2"))]) {
      expect(refusal(apply(view, command))).toEqual({
        code: "unknown_target",
        path: [key(line("timestamp_2"))],
      });
    }
  });
});

describe("remove a named timestamp", () => {
  it("removes it and every rule address naming it", () => {
    const styled = changed(view, {
      type: "style",
      select: { addresses: [{ id: "timestamp_2", part: ["label"] }] },
      set: { display: "none" },
      blocks: [A],
    });
    expect(graphicalOf(styled)?.rules).toHaveLength(1);
    const removed = changed(styled, remove(at("timestamp_2")));
    expect(timestampsOf(removed)).toEqual([T1, T3]);
    expect(graphicalOf(removed)?.rules).toEqual([]);
  });

  it("goes with the timeline it lies on", () => {
    const child = changed(view, remove(at("clt_2")));
    expect(timestampsOf(child)).toEqual([T1, T2]);
    const root = changed(view, remove(at("clt_1")));
    expect(block(root).manifest.timelines).toEqual([]);
    expect(timestampsOf(root)).toEqual([]);
  });
});

/** A default timestamp of `timeline`, `origin` or `length`, showing its wedge and coordinate. */
const mark = (id: string, timeline: string, name: string, coordinate: unknown) => ({
  id,
  timeline,
  coordinate,
  name,
  display: MARK,
  matchstamp: false,
  groupstamp: false,
});

describe("the default timestamps", () => {
  const late = {
    id: "late",
    unit: "quarters",
    number_type: "fraction",
    length: [4, 1],
    children: [
      { id: "inner", unit: "quarters", number_type: "fraction", length: [1, 1], offset: [1, 1] },
    ],
  };
  /** An `add` of a root, the IDs of its `origin` and `length` given. */
  const addRoot = (timeline: Value & { readonly id: string }, ids = ["origin", "length"]) => ({
    type: "add",
    into: { block: A },
    timeline,
    ids: ids.map((name) => `${timeline.id}-${name}`),
  });

  it("are given to a new root, never to a timeline below it", () => {
    expect(timestampsOf(changed(view, addRoot(late)))).toEqual([
      T1,
      T2,
      T3,
      mark("late-origin", "late", "origin", [0, 1]),
      mark("late-length", "late", "length", [4, 1]),
    ]);
  });

  it("stand at the zero of each number type, and only at a known length", () => {
    const ticks = changed(
      view,
      addRoot({ id: "midi", unit: "ticks", number_type: "int", length: 960 }),
    );
    expect(timestampsOf(ticks)?.slice(3)).toEqual([
      mark("midi-origin", "midi", "origin", 0),
      mark("midi-length", "midi", "length", 960),
    ]);
    const audio = changed(
      view,
      addRoot({ id: "audio", unit: "seconds", number_type: "float", length: null }, ["origin"]),
    );
    const [origin, ...more] =
      timestampsOf(audio)?.filter((item) => item.timeline === "audio") ?? [];
    expect(more).toEqual([]);
    expect(origin).toEqual(mark("audio-origin", "audio", "origin", new JsonFloat(0)));
    expect(origin?.coordinate).toBeInstanceOf(JsonFloat);
  });

  it("come with the root in one journal entry, undone in one step", () => {
    const store = storeOf(view);
    const before = store.view;
    const entries = store.journal.length;
    expect(store.dispatch(addRoot(late))).toBeNull();
    expect(store.journal.length).toBe(entries + 1);
    expect(timestampsOf(store.view)?.map((item) => item.name)).toEqual([
      "Downbeat",
      "Climax",
      "Entry",
      "origin",
      "length",
    ]);
    store.undo();
    expect(store.view).toBe(before);
  });

  it("are given on import to the roots of a manifest without a graphical object", () => {
    // The IDs a minter of seed 1 mints first and second, `origin` before `length`.
    const [FIRST, SECOND] = ["timestamp_3b7gu4iwqkg9i", "timestamp_3my3bzv32t8mj"];
    const imported = (name: string) =>
      importedManifest(withoutGraphical(name), createIdMinter({ seed: 1n }));
    expect(imported("bare.yaml").graphical).toEqual({
      order: {},
      rules: [],
      styles: {},
      timestamps: [mark(FIRST, "bare", "origin", [0, 1]), mark(SECOND, "bare", "length", [8, 1])],
      matchstamps: [],
      elisions: [],
    });
    expect(imported("nested.yaml").graphical?.timestamps).toEqual([
      mark(FIRST, "clt_1", "origin", [0, 1]),
      mark(SECOND, "clt_1", "length", [16, 1]),
    ]);
    const unknown = imported("unknown_length.yaml");
    expect(unknown.graphical?.timestamps).toEqual([mark(FIRST, "score", "origin", [0, 1])]);
    const stated = load(FIXTURE);
    expect(importedManifest(stated)).toBe(stated);
  });

  it("are added with an imported block in one journal entry", () => {
    const store = storeOf(viewOf());
    const manifest = importedManifest(withoutGraphical("bare.yaml"));
    const command = { type: "add", into: {}, block: { id: A, manifest, x: 0, y: 0 } };
    expect(store.dispatch(command)).toBeNull();
    expect(store.journal).toHaveLength(1);
    expect(timestampsOf(store.view)).toEqual(manifest.graphical?.timestamps);
  });
});

describe("a new length and the named timestamps", () => {
  it("never leaves a timestamp beyond the end of its timeline", () => {
    const coda = changed(view, add("clt_1", { name: "Coda", coordinate: [15, 2] }));
    expect(refused(apply(coda, set(at("clt_1"), { length: [7, 1] })))).toEqual({
      code: "timestamp_exceeds_length",
      message: "timestamp 'coda' lies after the end of its timeline 'clt_1'",
      path: [key(at("clt_1")), "length"],
    });
    for (const length of [[15, 2], null]) {
      const result = apply(coda, set(at("clt_1"), { length }));
      expect(isCommandError(result)).toBe(false);
    }
    const unlocked = deepFreeze(unlockedView(FIXTURE, "clt_2"));
    expect(refused(apply(unlocked, set(at("clt_2"), { length: [1, 2] })))).toEqual({
      code: "timestamp_exceeds_length",
      message: "timestamp 'timestamp_3' lies after the end of its timeline 'clt_2'",
      path: [key(at("clt_2")), "length"],
    });
    expect(isCommandError(apply(unlocked, set(at("clt_2"), { length: [1, 1] })))).toBe(false);
    expect(refusal(apply(view, set(at("clt_1"), { length: [11, 2] })))).toEqual({
      code: "length_below_content",
      path: [key(at("clt_1")), "length"],
    });
  });

  const ended = deepFreeze(changed(view, add("clt_1", { name: "End", coordinate: [8, 1] })));
  const END = {
    id: "end",
    timeline: "clt_1",
    coordinate: [8, 1],
    name: "End",
    display: DEFAULT,
    matchstamp: false,
    groupstamp: false,
  };

  it("moves a timestamp at the end with the end", () => {
    expect(timestampsOf(ended)).toEqual([T1, T2, END, T3]);
    const longer = changed(ended, set(at("clt_1"), { length: [10, 1] }));
    expect(timestampsOf(longer)).toEqual([T1, T2, { ...END, coordinate: [10, 1] }, T3]);
    const shorter = changed(ended, set(at("clt_1"), { length: [7, 1] }));
    expect(timestampsOf(shorter)).toEqual([T1, T2, { ...END, coordinate: [7, 1] }, T3]);
    const unknown = changed(ended, set(at("clt_1"), { length: null }));
    expect(timestampsOf(unknown)).toEqual([T1, T2, END, T3]);
    const tail = { id: "tail", unit: "quarters", number_type: "fraction", length: [4, 1] };
    const grown = changed(ended, {
      type: "add",
      into: at("clt_1"),
      child: { ...tail, offset: [6, 1] },
    });
    expect(block(grown).manifest.timelines[0]?.length).toEqual([10, 1]);
    expect(timestampsOf(grown)).toEqual([T1, T2, { ...END, coordinate: [10, 1] }, T3]);
  });

  it("follows every change of one set, which changes what it moved", () => {
    const there = changed(ended, {
      type: "set",
      changes: [
        { target: at("clt_1"), values: { length: [6, 1] } },
        { target: at("clt_1"), values: { length: [8, 1] } },
      ],
    });
    expect(block(there).manifest.timelines[0]?.length).toEqual([8, 1]);
    // Both at [8, 1]: canonical order puts `end` before `timestamp_2`, by ID.
    expect(timestampsOf(there)).toEqual([T1, END, { ...T2, coordinate: [8, 1] }, T3]);
  });

  it("is one journal entry, undone in one step", () => {
    const store = storeOf(ended);
    const before = store.view;
    const entries = store.journal.length;
    expect(store.dispatch(set(at("clt_1"), { length: [10, 1] }))).toBeNull();
    expect(store.journal.length).toBe(entries + 1);
    expect(timestampsOf(store.view)?.[2]?.coordinate).toEqual([10, 1]);
    store.undo();
    expect(store.view).toBe(before);
  });
});

describe("the guard and the named timestamps", () => {
  /** The guard's result for `command` in the editor of `editor`, the same with the change set and without. */
  function guarded(editor: string, command: object): unknown {
    const parsed = parseCommand(command);
    if (isCommandError(parsed)) throw new Error(parsed.message);
    const applied = applyChanges(view, parsed);
    if (isCommandError(applied)) throw new Error(`${applied.code} ${applied.message}`);
    const result = sideEffect(view, applied.view, at(editor), applied.changes);
    expect(sideEffect(view, applied.view, at(editor))).toEqual(result);
    return result;
  }
  const outside = (what: string, path: readonly unknown[]) => ({
    code: "side_effect",
    message: `${what} lies outside timeline 'clt_2': an editor changes only what it edits`,
    path,
  });
  const inChild = [
    set(at("timestamp_3"), { name: "In" }),
    set(at("timestamp_3"), { display: [] }),
    add("clt_2", { name: "Exit", coordinate: [3, 1] }),
  ];
  const outOfChild: [object, string, readonly unknown[]][] = [
    [set(at("timestamp_1"), { name: "One" }), "timestamp 'Downbeat'", [key(at("timestamp_1"))]],
    [add("clt_1", { name: "Coda", coordinate: [15, 2] }), "timestamp 'Coda'", [key(at("coda"))]],
    [remove(at("timestamp_2")), "timestamp 'Climax'", [key(at("timestamp_2"))]],
  ];

  it("lets the editor of a timeline change the timestamps lying on it", () => {
    for (const command of inChild) expect(guarded("clt_2", command)).toBeNull();
  });

  it("refuses a change of a timestamp lying outside it", () => {
    for (const [command, what, path] of outOfChild) {
      expect(guarded("clt_2", command)).toEqual(outside(what, path));
    }
  });

  it("removes a timestamp, or a timeline with its timestamps, inside it", () => {
    const commands = [
      remove(at("timestamp_2")),
      remove(at("clt_2")),
      ...inChild,
      ...outOfChild.map(([command]) => command),
    ];
    for (const command of commands) expect(guarded("clt_1", command)).toBeNull();
  });
});

describe("groupstamps", () => {
  const GROUPED = "groups/group_groupstamp.yaml";
  const grouped = deepFreeze(viewOf([A, GROUPED]));
  const stampOf = (of: View, id: string) =>
    block(of).manifest.graphical?.timestamps?.find((item) => item.id === id);
  const problemOf = (result: unknown) => {
    if (!isCommandError(result)) throw new Error("expected a refusal");
    return [result.code, result.message, result.path];
  };

  it("are stored by add where a group has the timeline as a member", () => {
    const cue = { name: "Cue", coordinate: 1.0 };
    const added = changed(grouped, add("performance", { ...cue, groupstamp: true }));
    expect(stampOf(added, "cue")).toEqual({
      id: "cue",
      timeline: "performance",
      coordinate: new JsonFloat(1),
      name: "Cue",
      display: ["wedge", "name", "cross_section"],
      matchstamp: false,
      groupstamp: true,
    });
    const plain = changed(grouped, add("performance", cue));
    expect(stampOf(plain, "cue")?.groupstamp).toBe(false);
    const path = (into: string) => [key(at(into)), "timestamp", "groupstamp"];
    expect(problemOf(apply(grouped, add("performance", { ...cue, groupstamp: "yes" })))).toEqual([
      "invalid_value",
      "a groupstamp is true or false",
      path("performance"),
    ]);
    const exit = { name: "Exit", coordinate: [1, 1] };
    expect(problemOf(apply(view, add("clt_1", { ...exit, groupstamp: true })))).toEqual([
      "invalid_value",
      "'clt_1' is a member of no group, so no timestamp on it is a groupstamp",
      path("clt_1"),
    ]);
    const kept = changed(view, add("clt_1", { ...exit, groupstamp: false }));
    expect(stampOf(kept, "exit")?.groupstamp).toBe(false);
  });

  it("are set and unset by set, a match timestamp's too, never off a member", () => {
    const off = changed(grouped, set(at("timestamp_1"), { groupstamp: false }));
    expect(stampOf(off, "timestamp_1")?.groupstamp).toBe(false);
    const on = changed(off, set(at("timestamp_1"), { groupstamp: true }));
    expect(stampOf(on, "timestamp_1")?.groupstamp).toBe(true);
    const target = key(at("timestamp_1"));
    expect(problemOf(apply(grouped, set(at("timestamp_1"), { groupstamp: true })))).toEqual([
      "invalid_value",
      "the command changes nothing",
      [target, "groupstamp"],
    ]);
    expect(problemOf(apply(view, set(at("timestamp_1"), { groupstamp: true })))).toEqual([
      "invalid_value",
      "'clt_1' is a member of no group, so no timestamp on it is a groupstamp",
      [target, "groupstamp"],
    ]);
    const cards = viewOf([A, "bundles/bundle_matchstamp_cards.yaml"]);
    const matchOn = changed(cards, set(at("timestamp_1"), { groupstamp: true }));
    expect(stampOf(cards, "timestamp_1")?.groupstamp).toBe(false);
    expect(stampOf(matchOn, "timestamp_1")).toEqual({
      ...stampOf(cards, "timestamp_1"),
      groupstamp: true,
    });
    expect(stampOf(matchOn, "timestamp_1")?.matchstamp).toBe(true);
    const matches = viewOf([A, "bundles/bundle_matchstamps.yaml"]);
    expect(problemOf(apply(matches, set(at("timestamp_1"), { groupstamp: true })))).toEqual([
      "invalid_value",
      "'score' is a member of no group, so no timestamp on it is a groupstamp",
      [target, "groupstamp"],
    ]);
  });

  it("become ordinary timestamps when their timeline leaves every group", () => {
    const store = storeOf(grouped);
    const before = block(store.view).manifest.graphical?.timestamps ?? [];
    expect(store.dispatch(remove(at("group_1")))).toBeNull();
    expect(block(store.view).manifest.groups).toEqual([]);
    expect(block(store.view).manifest.graphical?.timestamps).toEqual(
      before.map((item) => (item.id === "timestamp_1" ? { ...item, groupstamp: false } : item)),
    );
    store.undo();
    expect(stampOf(store.view, "timestamp_1")?.groupstamp).toBe(true);
  });

  it("are made by default above a timeline editor on a group's member", () => {
    const manifest = load(GROUPED);
    expect(
      [null, "bundle", "group", "timeline"].map((editor) =>
        groupstampByDefault(manifest, "score", editor as EditorKind | null),
      ),
    ).toEqual([true, true, true, false]);
    expect(groupstampByDefault(load(FIXTURE), "clt_1", null)).toBe(false);
    expect(
      ["score", "performance", "clt_1", "nope"].map((id) => isGroupMember(manifest, id)),
    ).toEqual([true, true, false, false]);
  });

  it("count a member's descendants as its group's members, never its ancestors", () => {
    const motif = { id: "motif", unit: "quarters", number_type: "fraction", length: [4, 1] };
    const nested = changed(grouped, {
      type: "add",
      into: at("score"),
      child: { ...motif, offset: [2, 1] },
    });
    const manifest = block(nested).manifest;
    expect(isGroupMember(manifest, "motif")).toBe(true);
    expect(groupstampByDefault(manifest, "motif", null)).toBe(true);
    const added = changed(
      nested,
      add("motif", { name: "Motif", coordinate: [1, 1], groupstamp: true }, "motif-stamp"),
    );
    expect(stampOf(added, "motif-stamp")).toEqual({
      id: "motif-stamp",
      timeline: "motif",
      coordinate: [1, 1],
      name: "Motif",
      display: ["wedge", "name", "cross_section"],
      matchstamp: false,
      groupstamp: true,
    });
    const child = load("groups/group_child_member.yaml");
    expect(["second-half", "recording", "piece"].map((id) => isGroupMember(child, id))).toEqual([
      true,
      true,
      false,
    ]);
    const ids = (of: Manifest, id: string) => groupsHolding(of, id).map((group) => group.id);
    expect([
      ids(manifest, "motif"),
      ids(child, "second-half"),
      ids(child, "piece"),
      ids(child, "nope"),
    ]).toEqual([["group_1"], ["group_1"], [], []]);
  });

  it("are given to a child joining a group, as its origin and length", () => {
    const store = storeOf(viewOf([A, "nested.yaml"]));
    const stamps = () => block(store.view).manifest.graphical?.timestamps ?? [];
    expect(
      store.dispatch(add("clt_2", { name: "origin", coordinate: [0, 1], display: ["wedge"] })),
    ).toBeNull();
    const before = store.view;
    const own = stamps();
    expect(
      store.dispatch({
        type: "add",
        into: { block: A },
        group: { id: "group_1", members: ["clt_3"] },
        ids: ["clt_3-origin", "clt_3-length"],
      }),
    ).toBeNull();
    const given = (id: string, timeline: string, coordinate: unknown, name: string) => ({
      id,
      timeline,
      coordinate,
      name,
      display: ["wedge", "coordinate", "cross_section"],
      matchstamp: false,
      groupstamp: true,
    });
    expect(stamps()).toEqual([
      ...own,
      given("clt_3-origin", "clt_3", [0, 1], "origin"),
      given("clt_3-length", "clt_3", [8, 1], "length"),
    ]);
    store.undo();
    expect(store.view).toBe(before);
    store.redo();
    expect(
      store.dispatch({ type: "add", into: { block: A }, group: { id: "group_2", members: [] } }),
    ).toBeNull();
    const joined = stamps();
    expect(
      store.dispatch({ ...set(at("clt_2"), { groups: ["group_2"] }), ids: ["clt_2-length"] }),
    ).toBeNull();
    // In canonical order: by timeline, then coordinate.
    const [first, second, origin, ...onClt3] = joined;
    expect(stamps()).toEqual([
      first,
      second,
      { ...origin, display: ["wedge", "cross_section"], groupstamp: true },
      given("clt_2-length", "clt_2", [2, 1], "length"),
      ...onClt3,
    ]);
    expect(origin?.id).toBe("origin");
    expect(store.dispatch(remove(at("clt_3-origin")))).toBeNull();
    const removed = stamps();
    expect(store.dispatch(set(at("clt_3"), { name: "Inner" }))).toBeNull();
    expect(stamps()).toEqual(removed);
  });

  it("are not given to a root joining a group", () => {
    const rooted = viewOf([A, "groups/group_grandchild.yaml"]);
    const joined = changed(rooted, {
      type: "add",
      into: { block: A },
      group: { id: "group_2", members: ["recording"] },
    });
    expect(block(joined).manifest.groups.map((group) => group.id)).toEqual(["group_1", "group_2"]);
    expect(block(joined).manifest.graphical?.timestamps).toEqual(
      block(rooted).manifest.graphical?.timestamps,
    );
  });
});
