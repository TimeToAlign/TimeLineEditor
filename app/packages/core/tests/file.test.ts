import { dumps, parseJson } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { Workspace } from "../src/index.ts";
import {
  createStore,
  createView,
  isLoadError,
  readWorkspace,
  replay,
  writeWorkspace,
} from "../src/index.ts";
import { A, addBlock, B, testClock } from "./support.ts";

function built(): Workspace {
  const store = createStore({ view: createView(), journal: [] }, { clock: testClock() });
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
  return { view: store.view, journal: store.journal };
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
    expect(Object.keys(value).sort()).toEqual(["blocks", "journal", "meta", "settings"]);
    expect(value.meta).toEqual({ format: "tilie-workspace", version: 1 });
    expect((value.journal as unknown[]).length).toBe(4);
  });

  it("replays its journal to its settings and blocks", () => {
    const workspace = read(writeWorkspace(built()));
    const replayed = replay(workspace.journal).at(-1);
    expect(replayed?.settings).toEqual(workspace.view.settings);
    expect(replayed?.blocks).toEqual(workspace.view.blocks);
  });

  type Value = { [key: string]: unknown };
  const text = writeWorkspace(built());
  const edited = (change: (value: Value) => void): string => {
    const value = parseJson(text) as Value;
    change(value);
    return dumps(value as never);
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
      "another version",
      edited((value) => Object.assign(value.meta as Value, { version: 2 })),
      "unsupported_version",
      ["meta", "version"],
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
      "a block position as text",
      edited((value) => Object.assign(blockOf(value), { x: "0" })),
      "invalid_value",
      ["blocks", A, "x"],
    ],
    [
      "a manifest of another schema version",
      edited((value) =>
        Object.assign((blockOf(value).manifest as Value).meta as Value, {
          schema_version: "0.0.0",
        }),
      ),
      "schema_violation",
      ["blocks", A, "manifest", "meta", "schema_version"],
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

  it("refuses a manifest invariant at its location in the file", () => {
    const value = parseJson(writeWorkspace(built())) as Value;
    const manifest = (blockOf(value).manifest as Value).timeline as Value;
    Object.assign(manifest, {
      children: {
        c: {
          offset: { unit: "quarters", number_type: "fraction", value: [0, 1] },
          timeline: { ...manifest, id: "c", children: {} },
        },
      },
    });
    const result = readWorkspace(dumps(value as never));
    expect(isLoadError(result) && result.problems.map((item) => [item.code, item.path])).toEqual([
      [
        "child_not_locked",
        ["blocks", A, "manifest", "timeline", "children", "c", "timeline", "locked"],
      ],
    ]);
  });
});
