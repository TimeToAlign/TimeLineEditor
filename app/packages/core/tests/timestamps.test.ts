import { describe, expect, it } from "vitest";
import { apply, applyChanges } from "../src/commands/apply.ts";
import { parseCommand } from "../src/commands/parse.ts";
import { isCommandError } from "../src/errors.ts";
import { addressKey } from "../src/manifest/address.ts";
import { contains } from "../src/manifest/contains.ts";
import type { ManifestGraphical, NamedTimestamp } from "../src/manifest/types.ts";
import type { Address } from "../src/workspace/address.ts";
import { addressWords, manifestIds, resolveAddress } from "../src/workspace/address.ts";
import { sideEffect } from "../src/workspace/guard.ts";
import type { View } from "../src/workspace/view.ts";
import { A, block, changed, deepFreeze, load, refusal, unlockedView, viewOf } from "./support.ts";

const FIXTURE = "timestamps.json";
const view = deepFreeze(viewOf([A, FIXTURE]));
const fixture = load(FIXTURE).graphical;
const [T1, T2, T3] = fixture?.timestamps ?? [];
if (T1 === undefined || T2 === undefined || T3 === undefined) {
  throw new Error(`${FIXTURE} holds three timestamps`);
}
const [STATEMENT] = fixture?.statements ?? [];

const at = (id: string): Address => ({ block: A, id });
const line = (id: string): Address => ({ block: A, id, part: ["line"] });
const key = (address: Address) => addressKey(address);

const add = (into: string, timestamp: object) => ({
  type: "add",
  into: at(into),
  timestamp,
});
const set = (target: Address, values: object) => ({ type: "set", changes: [{ target, values }] });
const remove = (...targets: Address[]) => ({ type: "remove", targets });
const toggle = (id: string, display: "none" | null) => ({
  type: "style",
  select: { addresses: [{ id, part: ["line"] }] },
  set: { display },
  blocks: [A],
});

const graphicalOf = (state: View): ManifestGraphical | undefined => block(state).manifest.graphical;
const timestampsOf = (state: View): readonly NamedTimestamp[] | undefined =>
  graphicalOf(state)?.timestamps;

/** A refusal's code, message and path. */
function refused(result: unknown): { code: string; message: string; path: readonly unknown[] } {
  if (!isCommandError(result)) throw new Error("expected a refusal");
  return { code: result.code, message: result.message, path: result.path };
}

const CODA: NamedTimestamp = {
  id: "timestamp_4",
  timeline: "clt_1",
  coordinate: [15, 2],
  name: "Coda",
};

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

  it("resolves its line and label as parts", () => {
    expect(addressWords(view, line("timestamp_2"))).toBe("the line of timestamp 'Climax'");
    expect(addressWords(view, { block: A, id: "timestamp_2", part: ["label"] })).toBe(
      "the label of timestamp 'Climax'",
    );
    for (const address of [line("timestamp_2"), { ...at("timestamp_2"), part: ["label"] }]) {
      const resolved = resolveAddress(view, address as Address);
      expect(isCommandError(resolved) ? resolved.code : resolved.kind).toBe("part");
    }
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
        { id: "timestamp_2", part: ["line" as const] },
      ].filter((element) => contains(manifest, timeline, element));
    expect(inside("clt_1")).toEqual([
      { id: "timestamp_1" },
      { id: "timestamp_2" },
      { id: "timestamp_3" },
      { id: "timestamp_2", part: ["line"] },
    ]);
    expect(inside("clt_2")).toEqual([{ id: "timestamp_3" }]);
  });
});

describe("add a named timestamp", () => {
  it("mints the smallest free ID and lists it in canonical order", () => {
    const coda = changed(view, add("clt_1", { name: "Coda", coordinate: [15, 2] }));
    expect(timestampsOf(coda)).toEqual([T1, T2, CODA, T3]);
    expect(graphicalOf(coda)?.statements).toEqual([STATEMENT]);
    const exit = changed(view, add("clt_2", { name: "Exit", coordinate: [8, 2] }));
    expect(timestampsOf(exit)).toEqual([
      T1,
      T2,
      T3,
      { id: "timestamp_4", timeline: "clt_2", coordinate: [4, 1], name: "Exit" },
    ]);
    const without = changed(view, remove(at("timestamp_1")));
    const again = changed(without, add("clt_1", { name: "Start", coordinate: [1, 1] }));
    expect(timestampsOf(again)).toEqual([
      { id: "timestamp_1", timeline: "clt_1", coordinate: [1, 1], name: "Start" },
      T2,
      T3,
    ]);
  });

  it("gives a manifest without a graphical object one", () => {
    const bare = changed(deepFreeze(viewOf([A, "bare.json"])), {
      type: "add",
      into: at("bare"),
      timestamp: { name: "Mid", coordinate: [5, 2] },
    });
    expect(graphicalOf(bare)).toEqual({
      order: {},
      statements: [],
      styles: {},
      timestamps: [{ id: "timestamp_1", timeline: "bare", coordinate: [5, 2], name: "Mid" }],
    });
  });

  it("refuses a value at fault where it lies", () => {
    const into = key(at("clt_1"));
    const cases: [object, string, string, string | null][] = [
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
  it("sets its name and its coordinate, kept in canonical order", () => {
    const renamed = changed(view, set(at("timestamp_1"), { name: "One" }));
    expect(timestampsOf(renamed)).toEqual([{ ...T1, name: "One" }, T2, T3]);
    const moved = changed(view, set(at("timestamp_1"), { coordinate: [7, 1] }));
    expect(timestampsOf(moved)).toEqual([T2, { ...T1, coordinate: [7, 1] }, T3]);
    const end = changed(view, set(at("timestamp_3"), { coordinate: [4, 1] }));
    expect(timestampsOf(end)).toEqual([T1, T2, { ...T3, coordinate: [4, 1] }]);
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
      [at("timestamp_1"), { name: "Downbeat" }, "invalid_value", "the command changes nothing"],
      [at("timestamp_1"), { coordinate: [3, 2] }, "invalid_value", "the command changes nothing"],
      [at("timestamp_1"), { coordinate: [6, 4] }, "invalid_value", "the command changes nothing"],
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
  it("removes it and every statement address naming it", () => {
    const removed = changed(view, remove(at("timestamp_2")));
    expect(timestampsOf(removed)).toEqual([T1, T3]);
    expect(graphicalOf(removed)?.statements).toEqual([]);
  });

  it("goes with the timeline it lies on", () => {
    const child = changed(view, remove(at("clt_2")));
    expect(timestampsOf(child)).toEqual([T1, T2]);
    expect(graphicalOf(child)?.statements).toEqual([STATEMENT]);
    const root = changed(view, remove(at("clt_1")));
    expect(block(root).manifest.timelines).toEqual([]);
    expect(timestampsOf(root)).toEqual([]);
    expect(graphicalOf(root)?.statements).toEqual([]);
  });
});

describe("a new length and the named timestamps", () => {
  it("never leaves a timestamp beyond the end of its timeline", () => {
    const coda = changed(view, add("clt_1", { name: "Coda", coordinate: [15, 2] }));
    expect(refused(apply(coda, set(at("clt_1"), { length: [7, 1] })))).toEqual({
      code: "timestamp_exceeds_length",
      message: "timestamp 'timestamp_4' lies after the end of its timeline 'clt_1'",
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
});

describe("the cross-section line toggle", () => {
  it("is a style on a statement addressing exactly the line", () => {
    const hidden = changed(view, toggle("timestamp_1", "none"));
    expect(graphicalOf(hidden)).toEqual({
      order: {},
      statements: [
        STATEMENT,
        {
          select: { addresses: [{ id: "timestamp_1", part: ["line"] }] },
          set: { display: "none" },
        },
      ],
      styles: {},
      timestamps: [T1, T2, T3],
    });
    expect(graphicalOf(changed(hidden, toggle("timestamp_1", null)))).toEqual(fixture);
    expect(graphicalOf(changed(view, toggle("timestamp_2", null)))?.statements).toEqual([]);
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
    add("clt_2", { name: "Exit", coordinate: [3, 1] }),
  ];
  const outOfChild: [object, string, readonly unknown[]][] = [
    [set(at("timestamp_1"), { name: "One" }), "timestamp 'Downbeat'", [key(at("timestamp_1"))]],
    [
      add("clt_1", { name: "Coda", coordinate: [15, 2] }),
      "timestamp 'Coda'",
      [key(at("timestamp_4"))],
    ],
    [remove(at("timestamp_2")), "timestamp 'Climax'", [key(at("timestamp_2"))]],
    [
      toggle("timestamp_1", "none"),
      "the graphical statements of the anonymous bundle",
      [A, "manifest", "graphical", "statements"],
    ],
  ];

  it("lets the editor of a timeline change the timestamps lying on it", () => {
    for (const command of inChild) expect(guarded("clt_2", command)).toBeNull();
  });

  it("refuses a change of a timestamp lying outside it", () => {
    for (const [command, what, path] of outOfChild) {
      expect(guarded("clt_2", command)).toEqual(outside(what, path));
    }
  });

  it("removes a timestamp and its statement, or a timeline with its timestamps, inside it", () => {
    const commands = [
      remove(at("timestamp_2")),
      remove(at("clt_2")),
      ...inChild,
      ...outOfChild.map(([command]) => command),
    ];
    for (const command of commands) expect(guarded("clt_1", command)).toBeNull();
  });
});
