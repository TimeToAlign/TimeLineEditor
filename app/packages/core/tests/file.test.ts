import { dumps, minimal, parseJson } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { isLoadError } from "../src/errors.ts";
import { readWorkspace, writeWorkspace } from "../src/workspace/file.ts";
import type { Workspace } from "../src/workspace/store.ts";
import { createStore, replay } from "../src/workspace/store.ts";
import { createView } from "../src/workspace/view.ts";
import { A, addBlock, B, testClock } from "./support.ts";

function built(): Workspace {
  const store = createStore(
    { view: createView(), journal: [], sessions: {} },
    { clock: testClock() },
  );
  for (const command of [
    addBlock(A, "bare.json"),
    addBlock(B, "map.json"),
    { type: "set", changes: [{ target: A, values: { x: 128, y: 64 } }] },
    { type: "style", select: { element: "map" }, set: { stroke: "#C00000" } },
    { type: "set", changes: [{ target: B, values: { x: 0.5 } }] },
  ]) {
    expect(store.dispatch(command)).toBeNull();
  }
  store.undo();
  return store.snapshot();
}

function read(text: string): Workspace {
  const workspace = readWorkspace(text);
  if (isLoadError(workspace)) throw new Error(JSON.stringify(workspace.problems));
  return workspace;
}

describe("the workspace file", () => {
  it("round-trips a workspace byte for byte", () => {
    const workspace = built();
    const text = writeWorkspace(workspace);
    const again = read(text);
    expect(again).toEqual(workspace);
    expect(writeWorkspace(again)).toBe(text);
    const value = parseJson(text) as { readonly [key: string]: unknown };
    expect(Object.keys(value).sort()).toEqual([
      "blocks",
      "journal",
      "meta",
      "sessions",
      "settings",
    ]);
    expect(value.meta).toEqual({ format: "tilie-workspace", version: 4 });
    expect((value.journal as unknown[]).length).toBe(4);
    expect(value.sessions).toEqual({});
  });

  it("replays its journal to its settings and blocks", () => {
    const workspace = read(writeWorkspace(built()));
    const replayed = replay(workspace.journal, workspace.sessions).at(-1);
    expect(replayed?.settings).toEqual(workspace.view.settings);
    expect(replayed?.blocks).toEqual(workspace.view.blocks);
  });

  type Value = { [key: string]: unknown };
  const text = writeWorkspace(built());
  const edited = (change: (value: Value) => void): string => {
    const value = parseJson(text) as Value;
    change(value);
    return dumps(value);
  };
  const blockOf = (value: Value) => (value.blocks as Value)[A] as Value;
  const entry = (value: Value) => (value.journal as Value[])[0] as Value;

  it.each([
    ["invalid JSON", "{", "invalid_json", []],
    [
      "another format",
      edited((value) => Object.assign(value.meta as Value, { format: "other" })),
      "unsupported_format",
      ["meta", "format"],
    ],
    [
      "a later version",
      edited((value) => Object.assign(value.meta as Value, { version: 5 })),
      "unsupported_version",
      ["meta", "version"],
    ],
    [
      "a block's kind",
      edited((value) => Object.assign(blockOf(value), { blockKind: "timeline" })),
      "unknown_member",
      ["blocks", A, "blockKind"],
    ],
    [
      "an unknown member",
      edited((value) => Object.assign(value, { extra: 1 })),
      "unknown_member",
      ["extra"],
    ],
    [
      "an unknown meta member",
      edited((value) => Object.assign(value.meta as Value, { created: "today" })),
      "unknown_member",
      ["meta", "created"],
    ],
    [
      "an unknown settings member",
      edited((value) => Object.assign(value.settings as Value, { styles: {} })),
      "unknown_member",
      ["settings", "styles"],
    ],
    [
      "an unknown block member",
      edited((value) => Object.assign(blockOf(value), { overrides: {} })),
      "unknown_member",
      ["blocks", A, "overrides"],
    ],
    [
      "an unknown entry member",
      edited((value) => Object.assign(entry(value), { note: "" })),
      "unknown_member",
      ["journal", 0, "note"],
    ],
    [
      "a missing member",
      edited((value) => {
        delete value.journal;
      }),
      "missing_member",
      ["journal"],
    ],
    [
      "a missing sessions member",
      edited((value) => {
        delete value.sessions;
      }),
      "missing_member",
      ["sessions"],
    ],
    [
      "a block position as text",
      edited((value) => Object.assign(blockOf(value), { x: "0" })),
      "invalid_value",
      ["blocks", A, "x"],
    ],
    [
      "a manifest of another schema version",
      edited((value) => Object.assign(blockOf(value).manifest as Value, { timeskeleton: "0.6.0" })),
      "schema_violation",
      ["blocks", A, "manifest", "timeskeleton"],
    ],
    [
      "an entry time without milliseconds",
      edited((value) => Object.assign(entry(value), { time: "yesterday" })),
      "invalid_value",
      ["journal", 0, "time"],
    ],
    [
      "an entry command of no known type",
      edited((value) => Object.assign(entry(value).command as Value, { type: "move" })),
      "invalid_command",
      ["journal", 0, "command", "type"],
    ],
  ] as [string, string, string, (string | number)[]][])("refuses %s", (_, input, code, path) => {
    const result = readWorkspace(input);
    expect(isLoadError(result) && result.problems.map((item) => [item.code, item.path])).toEqual([
      [code, path],
    ]);
  });

  it("refuses a workspace of version 3 for its version alone", () => {
    const groups = ["children", "regions", "flow"];
    const older = edited((value) => {
      Object.assign(value.meta as Value, { version: 3 });
      for (const block of Object.values(value.blocks as Value)) {
        Object.assign(block as Value, { order: groups, bands: {} });
      }
      Object.assign((value.settings as Value).blockDefaults as Value, { order: groups });
    });
    const result = readWorkspace(older);
    expect(isLoadError(result) && result.problems).toEqual([
      {
        code: "unsupported_version",
        message: "workspace version 3 is not supported; this editor reads version 4 only",
        path: ["meta", "version"],
      },
    ]);
  });

  it("reads block manifests written in the minimal form as the complete form", () => {
    const short = edited((value) => {
      for (const block of Object.values(value.blocks as Value)) {
        (block as Value).manifest = minimal((block as Value).manifest);
      }
    });
    expect(short).not.toBe(text);
    expect(read(short)).toEqual(read(text));
  });

  it("refuses a manifest invariant at its location in the file", () => {
    const value = parseJson(writeWorkspace(built())) as Value;
    const [root] = (blockOf(value).manifest as Value).timelines as Value[];
    Object.assign(root as Value, { regions: [{ id: "region_1", start: [4, 1], end: [2, 1] }] });
    const result = readWorkspace(dumps(value));
    expect(isLoadError(result) && result.problems.map((item) => [item.code, item.path])).toEqual([
      ["region_end_before_start", ["blocks", A, "manifest", "timelines", 0, "regions", 0, "end"]],
    ]);
  });

  it("reads places with a scale and spacing and a member's card, and refuses a card beyond it", () => {
    const store = createStore(
      { view: createView(), journal: [], sessions: {} },
      { clock: testClock() },
    );
    for (const command of [
      addBlock(A, "bundles/bundle_mixed.json"),
      {
        type: "set",
        changes: [
          { target: `${A}/group_1`, values: { place: { length: 300, scale: 1.25, spacing: 2 } } },
        ],
      },
      {
        type: "set",
        changes: [{ target: `${A}/score`, values: { place: { width: 650, spacing: 1.5 } } }],
      },
    ]) {
      expect(store.dispatch(command)).toBeNull();
    }
    const placed = writeWorkspace(store.snapshot());
    const again = read(placed);
    expect(again).toEqual(store.snapshot());
    expect(writeWorkspace(again)).toBe(placed);
    expect(again.view.blocks[A]?.places).toEqual({
      group_1: { length: 300, scale: 1.25, spacing: 2 },
      score: { width: 650, spacing: 1.5 },
    });
    const changedPlace = (key: string, values: Value) => {
      const value = parseJson(placed) as Value;
      Object.assign((blockOf(value).places as Value)[key] as Value, values);
      return readWorkspace(dumps(value));
    };
    expect(changedPlace("score", { length: 300 })).toMatchObject({
      problems: [
        {
          code: "unknown_member",
          message: "score is a member: its card takes only width, height and spacing",
          path: ["blocks", A, "places", "score", "length"],
        },
      ],
    });
    for (const [key, member] of [
      ["score", "spacing"],
      ["group_1", "scale"],
    ] as const) {
      const zero = changedPlace(key, { [member]: 0 });
      expect(isLoadError(zero) && zero.problems.map((item) => [item.code, item.path])).toEqual([
        ["non_positive_number", ["blocks", A, "places", key, member]],
      ]);
    }
  });

  describe("with sessions", () => {
    const S = "session001";
    // A store's two entries, the second then moved into session S.
    const sessionText = (() => {
      const store = createStore(
        { view: createView(), journal: [], sessions: {} },
        { clock: testClock() },
      );
      expect(store.dispatch(addBlock(A, "bundles/bundle_mixed.json"))).toBeNull();
      const set = { type: "set", changes: [{ target: `${A}/score`, values: { name: "S" } }] };
      expect(store.dispatch(set)).toBeNull();
      const value = parseJson(writeWorkspace(store.snapshot())) as Value;
      const [added, command] = value.journal as Value[];
      value.journal = [added, { session: S, author: "Gerhardt", time: (command as Value).time }];
      value.sessions = { [S]: { target: `${A}/group_1`, entries: [command] } };
      return dumps(value);
    })();
    const withSessions = (change: (value: Value) => void): string => {
      const value = parseJson(sessionText) as Value;
      change(value);
      return dumps(value);
    };
    const sessionsOf = (value: Value) => value.sessions as Value;
    const sessionEntry = (value: Value) => (value.journal as Value[])[1] as Value;
    const named = (id: string, target: string) => ({
      target: `${A}/${target}`,
      entries: [{ session: id, author: "Gerhardt", time: "2026-10-11T14:03:12.418Z" }],
    });

    it("reads them back to a journal that replays to the view", () => {
      const workspace = read(sessionText);
      expect(Object.keys(workspace.sessions)).toEqual([S]);
      expect(workspace.journal[1]).toEqual({
        session: S,
        author: "Gerhardt",
        time: "2026-10-11T14:03:13.418Z",
      });
      expect(replay(workspace.journal, workspace.sessions).at(-1)).toEqual(workspace.view);
      expect(writeWorkspace(workspace)).toBe(sessionText);
    });

    it.each([
      [
        "an entry naming no session",
        withSessions((value) => Object.assign(sessionEntry(value), { session: "0000000099" })),
        [
          ["unknown_session", ["journal", 1, "session"]],
          ["unreferenced_session", ["sessions", S]],
        ],
      ],
      [
        "a session nothing names",
        withSessions((value) =>
          Object.assign(sessionsOf(value), {
            "0000000098": {
              target: `${A}/group_2`,
              entries: (sessionsOf(value)[S] as Value).entries,
            },
          }),
        ),
        [["unreferenced_session", ["sessions", "0000000098"]]],
      ],
      [
        "two sessions naming only each other",
        withSessions((value) =>
          Object.assign(sessionsOf(value), {
            "0000000097": named("0000000098", "group_1"),
            "0000000098": named("0000000097", "group_1"),
          }),
        ),
        [
          ["unreferenced_session", ["sessions", "0000000097"]],
          ["unreferenced_session", ["sessions", "0000000098"]],
        ],
      ],
      [
        "a session naming itself",
        withSessions((value) => {
          const session = sessionsOf(value)[S] as Value;
          session.entries = [...(session.entries as Value[]), ...named(S, "group_1").entries];
        }),
        [["session_referenced_twice", ["sessions", S, "entries", 1, "session"]]],
      ],
      [
        "an entry with a command and a session",
        withSessions((value) =>
          Object.assign(sessionEntry(value), {
            command: { type: "remove", targets: [`${A}/score`] },
          }),
        ),
        [["unknown_member", ["journal", 1, "command"]]],
      ],
      [
        "an unknown session member",
        withSessions((value) => Object.assign(sessionsOf(value)[S] as Value, { note: "" })),
        [["unknown_member", ["sessions", S, "note"]]],
      ],
      [
        "a session without a target",
        withSessions((value) => {
          delete (sessionsOf(value)[S] as Value).target;
        }),
        [["missing_member", ["sessions", S, "target"]]],
      ],
      [
        "a session target that is no address",
        withSessions((value) =>
          Object.assign(sessionsOf(value)[S] as Value, { target: "nowhere" }),
        ),
        [["invalid_address", ["sessions", S, "target"]]],
      ],
      [
        "a session id in upper case",
        withSessions((value) => Object.assign(sessionEntry(value), { session: "Session001" })),
        [["invalid_value", ["journal", 1, "session"]]],
      ],
      [
        "a sessions key that is no session id",
        withSessions((value) => Object.assign(sessionsOf(value), { bad: sessionsOf(value)[S] })),
        [["invalid_value", ["sessions", "bad"]]],
      ],
      [
        "a session without entries",
        withSessions((value) => Object.assign(sessionsOf(value)[S] as Value, { entries: [] })),
        [["invalid_value", ["sessions", S, "entries"]]],
      ],
    ] as [string, string, [string, (string | number)[]][]][])(
      "refuses %s",
      (_, input, expected) => {
        const result = readWorkspace(input);
        expect(
          isLoadError(result) && result.problems.map((item) => [item.code, item.path]),
        ).toEqual(expected);
      },
    );

    it("names why a session without entries is refused", () => {
      const result = readWorkspace(
        withSessions((value) => Object.assign(sessionsOf(value)[S] as Value, { entries: [] })),
      );
      expect(isLoadError(result) && result.problems).toEqual([
        {
          code: "invalid_value",
          message: "a session holds at least one entry",
          path: ["sessions", S, "entries"],
        },
      ]);
    });
  });
});
