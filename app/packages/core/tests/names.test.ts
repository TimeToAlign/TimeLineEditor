/**
 * The workspace's name and the names of a manifest's elements; the cases
 * are derived in `README.md` ("Names").
 */

import { parseJson } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isLoadError, JournalMismatchError } from "../src/errors.ts";
import { readWorkspace, writeWorkspace } from "../src/workspace/file.ts";
import { createStore } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import {
  A,
  block,
  changed,
  deepFreeze,
  load,
  refusal,
  storeOf,
  testClock,
  viewOf,
} from "./support.ts";

const at = (element: string) => `${A}/${element}`;
const set = (target: string, values: object) => ({ type: "set", changes: [{ target, values }] });
const rename = (name: unknown) => set("workspace", { name });
const nothing = (target: string, property: string) => ({
  code: "invalid_value",
  message: "the command changes nothing",
  path: [target, property],
});

function rejected(view: View, command: object) {
  return refusal(apply(deepFreeze(view), command));
}

function refusedWith(view: View, command: object) {
  const result = apply(deepFreeze(view), command);
  if (!("code" in result)) throw new Error("expected a refusal");
  const { code, message, path } = result;
  return { code, message, path };
}

/** A store holding `bare.json` in block `A`, then renamed. */
function renamed() {
  const store = storeOf(viewOf([A, "bare.json"]), { clock: testClock() });
  expect(store.dispatch(rename("Eroica sketches"))).toBe(null);
  return store;
}

describe("the workspace's name", () => {
  it("is untitled in a new view", () => {
    expect(createView().name).toBe("untitled");
  });

  it("is written between meta and sessions and read back", () => {
    const store = renamed();
    const text = writeWorkspace(store.snapshot());
    expect(Object.keys(parseJson(text) as object)).toEqual([
      "blocks",
      "journal",
      "meta",
      "name",
      "sessions",
      "settings",
    ]);
    expect(text).toContain('\n  "name": "Eroica sketches",\n');
    const read = readWorkspace(text);
    if (isLoadError(read)) throw new Error("refused");
    expect(read.view.name).toBe("Eroica sketches");
    expect(writeWorkspace(read)).toBe(text);
  });

  it("is untitled for a file stating none, verified by its journal and written once it is read", () => {
    const text = writeWorkspace(storeOf(viewOf([A, "bare.json"])).snapshot());
    const without = text.replace('  "name": "untitled",\n', "");
    expect(without).not.toBe(text);
    const read = readWorkspace(without);
    if (isLoadError(read)) throw new Error("refused");
    expect(read.view.name).toBe("untitled");
    expect(createStore(read).view.name).toBe("untitled");
    expect(writeWorkspace(read)).toBe(text);
  });

  it("is reproduced after a rename, saved and reopened, and undone to untitled", () => {
    const again = readWorkspace(writeWorkspace(renamed().snapshot()));
    if (isLoadError(again)) throw new Error("refused");
    const reopened = createStore(again);
    expect(reopened.view.name).toBe("Eroica sketches");
    reopened.undo();
    expect(reopened.view.name).toBe("untitled");
  });

  it("is reproduced after a rename back to untitled, saved and reopened", () => {
    const store = renamed();
    expect(store.dispatch(rename("untitled"))).toBe(null);
    const text = writeWorkspace(store.snapshot());
    expect(text).toContain('\n  "name": "untitled",\n');
    const again = readWorkspace(text);
    if (isLoadError(again)) throw new Error("refused");
    const reopened = createStore(again);
    expect(reopened.view.name).toBe("untitled");
    reopened.undo();
    expect(reopened.view.name).toBe("Eroica sketches");
  });

  it("is untitled where the journal starts, so a name no command gave is refused", () => {
    const text = writeWorkspace(storeOf(viewOf([A, "bare.json"])).snapshot());
    const read = readWorkspace(text.replace('"name": "untitled"', '"name": "sketches"'));
    if (isLoadError(read)) throw new Error("refused");
    expect(() => createStore(read)).toThrow(JournalMismatchError);
    try {
      createStore(read);
    } catch (error) {
      expect(error instanceof JournalMismatchError ? [error.entry, error.path] : null).toEqual([
        1,
        ["name"],
      ]);
    }
  });

  it.each([[""], [3]])("refuses a file naming it %j", (name) => {
    const text = writeWorkspace(storeOf(viewOf([A, "bare.json"])).snapshot());
    const value = parseJson(text) as { [key: string]: unknown };
    const read = readWorkspace(JSON.stringify({ ...value, name }));
    expect(
      isLoadError(read) ? read.problems.map(({ code, path }) => ({ code, path })) : [],
    ).toEqual([{ code: "invalid_value", path: ["name"] }]);
  });

  it("is set by a command that changes nothing else", () => {
    const view = viewOf([A, "bare.json"]);
    const next = changed(deepFreeze(view), rename("Eroica sketches"));
    expect(next.name).toBe("Eroica sketches");
    expect(next.settings).toBe(view.settings);
    expect(next.blocks).toBe(view.blocks);
  });

  it.each([[""], [null], [3]])("refuses the name %j", (name) => {
    expect(rejected(viewOf([A, "bare.json"]), rename(name))).toEqual({
      code: "invalid_value",
      path: ["workspace", "name"],
    });
  });

  it("refuses the name it has as changing nothing", () => {
    expect(refusedWith(createView(), rename("untitled"))).toEqual(nothing("workspace", "name"));
  });

  it("is reproduced by the journal", () => {
    const store = renamed();
    const workspace = { view: store.view, journal: store.journal, sessions: store.sessions };
    expect(createStore(workspace).view.name).toBe("Eroica sketches");
    const other = { ...workspace, view: { ...store.view, name: "other" } };
    expect(() => createStore(other)).toThrow(JournalMismatchError);
    try {
      createStore(other);
    } catch (error) {
      expect(error instanceof JournalMismatchError ? error.path : null).toEqual(["name"]);
    }
  });

  it("is not changed by an editor", () => {
    const store = storeOf(viewOf([A, "bare.json"]));
    expect(store.open(A)).toBe(null);
    const refused = store.dispatch(rename("Eroica sketches"));
    expect(refused === null ? null : { ...refused }).toEqual({
      code: "side_effect",
      message: `the workspace name lies outside ${A}: an editor changes only what it edits`,
      path: ["workspace", "name"],
    });
    expect(store.view.name).toBe("untitled");
  });
});

describe("names in a manifest", () => {
  const mixed = () => viewOf([A, "bundles/bundle_mixed.json"]);

  it("sets the manifest's own name on its block", () => {
    const view = mixed();
    const before = block(view).manifest;
    expect(before.name).toBe("Mixed");
    const named = block(changed(view, set(A, { name: "Op. 35" }))).manifest;
    expect(named).toEqual({ ...before, name: "Op. 35" });
    expect(block(changed(view, set(A, { name: null }))).manifest).toEqual({
      ...before,
      name: null,
    });
    expect(refusedWith(view, set(A, { name: "Mixed" }))).toEqual(nothing(A, "name"));
  });

  it("sets a group's name", () => {
    const view = mixed();
    const before = block(view).manifest;
    const [first, second] = before.groups;
    if (first === undefined || second === undefined) throw new Error("two groups");
    const named = block(changed(view, set(at("group_1"), { name: "Duo" }))).manifest;
    expect(named).toEqual({ ...before, groups: [{ ...first, name: "Duo" }, second] });
    const unnamed = block(changed(view, set(at("group_1"), { name: null }))).manifest;
    expect(unnamed).toEqual({ ...before, groups: [{ ...first, name: null }, second] });
    expect(rejected(view, set(at("group_1"), { name: 3 }))).toEqual({
      code: "invalid_value",
      path: [at("group_1"), "name"],
    });
    expect(refusedWith(view, set(at("group_1"), { name: "Performance" }))).toEqual(
      nothing(at("group_1"), "name"),
    );
  });

  it("sets a conversion map's name", () => {
    const view = viewOf([A, "map.json"]);
    const before = block(view).manifest;
    const [melody] = before.timelines;
    const [tempo, ...maps] = melody?.conversion_maps ?? [];
    if (melody === undefined || tempo === undefined) throw new Error("the map tempo");
    const named = block(changed(view, set(at("melody/tempo"), { name: "Beat" }))).manifest;
    expect(named.timelines[0]?.conversion_maps).toEqual([{ ...tempo, name: "Beat" }, ...maps]);
    expect(refusedWith(view, set(at("melody/tempo"), { name: tempo.name }))).toEqual(
      nothing(at("melody/tempo"), "name"),
    );
  });

  it("takes no name in a block's value", () => {
    const command = {
      type: "add",
      into: "workspace",
      block: { id: A, manifest: load("bare.json"), x: 0, y: 0, name: "Bare" },
    };
    expect(rejected(createView(), command)).toEqual({
      code: "unknown_property",
      path: [A, "name"],
    });
  });
});
