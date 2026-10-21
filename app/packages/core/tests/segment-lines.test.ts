/**
 * A segment line of known length holding no segment gains its first one;
 * the cases are derived in `README.md` ("Segment lines gain their first
 * segment").
 */

import { dumps, JsonFloat, parseJson } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { preview } from "../src/commands/preview.ts";
import type { SetCommand } from "../src/commands/types.ts";
import { isCommandError, isLoadError } from "../src/errors.ts";
import { loadManifest } from "../src/manifest/io.ts";
import { findTimeline } from "../src/manifest/tree.ts";
import type { Manifest, TimelineManifest } from "../src/manifest/types.ts";
import { createStore } from "../src/workspace/store.ts";
import type { View } from "../src/workspace/view.ts";
import {
  A,
  block,
  changed,
  deepFreeze,
  fixtureText,
  loadText,
  refusal,
  storeOf,
  viewOf,
} from "./support.ts";

const at = (element: string) => `${A}/${element}`;
const set = (target: string, values: object) => ({ type: "set", changes: [{ target, values }] });

type Value = { [key: string]: unknown };

/** A fixture's value with `change` applied to the timeline `id`, wherever it lies. */
function edited(name: string, id: string, change: (timeline: Value) => Value): Value {
  const value = parseJson(fixtureText(name)) as Value;
  const walk = (timeline: Value): Value => {
    const own = timeline.id === id ? change(timeline) : timeline;
    const children = own.children as Value[] | undefined;
    return children === undefined ? own : { ...own, children: children.map(walk) };
  };
  return { ...value, timelines: (value.timelines as Value[]).map(walk) };
}

/** The manifest a value reads as: the oracle of what a command leaves. */
function read(value: Value): Manifest {
  return loadText(dumps(value));
}

function timeline(view: View, id: string): TimelineManifest {
  const found = findTimeline(block(view).manifest, id);
  if (found === undefined) throw new Error(`no timeline ${id}`);
  return found;
}

function rejected(view: View, command: object) {
  return refusal(apply(deepFreeze(view), command));
}

const MIXED = "bundles/bundle_mixed.json";

/** `page` of the mixed bundle made a segment line holding its first segment. */
function pageCovered(locked: boolean): Value {
  return edited(MIXED, "page", (page) => ({
    ...page,
    is_segment_line: true,
    locked,
    children: [{ id: "dgt_1", unit: "pixels", number_type: "int", offset: 0, length: 1920 }],
  }));
}

describe("a segment line without segments", () => {
  it("gains its first segment when a manifest is applied, locked by its place", () => {
    const view = viewOf([A, MIXED]);
    const value = edited(MIXED, "page", (page) => ({ ...page, is_segment_line: true }));
    const next = changed(deepFreeze(view), set(A, { manifest: value }));
    expect(block(next).manifest).toEqual(read(pageCovered(true)));
    const refused = loadManifest(dumps(value));
    expect(isLoadError(refused) ? refused.problems : []).toEqual([
      {
        code: "schema_violation",
        message: 'the segments of segment line "page" do not end at its length',
        path: ["timelines", 1, "length"],
      },
    ]);
  });

  it("gains it from the setter, locked by its place, and the journal reproduces it", () => {
    const store = storeOf(viewOf([A, MIXED]));
    expect(store.dispatch(set(at("page"), { is_segment_line: true }))).toBe(null);
    expect(block(store.view).manifest).toEqual(read(pageCovered(true)));
    const workspace = { view: store.view, journal: store.journal, sessions: store.sessions };
    expect(createStore(workspace).view).toBe(store.view);
  });

  it("takes the line's number type", () => {
    const view = viewOf([A, MIXED]);
    const score = timeline(changed(view, set(at("score"), { is_segment_line: true })), "score");
    expect(
      score.children.map(({ id, offset, length, number_type, locked }) => ({
        id,
        offset,
        length,
        number_type,
        locked,
      })),
    ).toEqual([
      { id: "clt_1", offset: [0, 1], length: [12, 1], number_type: "fraction", locked: false },
    ]);
    const performance = timeline(
      changed(view, set(at("performance"), { is_segment_line: true })),
      "performance",
    );
    const [segment] = performance.children;
    expect(segment?.id).toBe("cpt_1");
    expect(segment?.offset).toEqual(new JsonFloat(0));
    expect(segment?.offset instanceof JsonFloat).toBe(true);
    expect(segment?.length).toBe(12.5);
  });

  it("is given an id no element of the manifest carries", () => {
    const view = changed(viewOf([A, MIXED]), {
      type: "add",
      into: A,
      timeline: { id: "dgt_1", unit: "pixels", length: 10 },
    });
    const page = timeline(changed(view, set(at("page"), { is_segment_line: true })), "page");
    expect(page.children.map((child) => child.id)).toEqual(["dgt_2"]);
  });

  it("stays without segments while its length is unknown", () => {
    const view = changed(viewOf([A, "bare.json"]), {
      type: "add",
      into: A,
      timeline: { id: "open", unit: "quarters", length: null },
    });
    const open = timeline(changed(view, set(at("open"), { is_segment_line: true })), "open");
    expect(open.is_segment_line).toBe(true);
    expect(open.children).toEqual([]);
    expect(open.length).toBe(null);
  });

  it("is added with its first segment", () => {
    const view = viewOf([A, "bare.json"]);
    const next = changed(view, {
      type: "add",
      into: at("bare"),
      child: {
        id: "sl",
        unit: "quarters",
        offset: [0, 1],
        length: [4, 1],
        is_segment_line: true,
      },
    });
    const line = timeline(next, "sl");
    expect(line.locked).toBe(true);
    expect(
      line.children.map(({ id, offset, length, locked }) => ({ id, offset, length, locked })),
    ).toEqual([{ id: "clt_1", offset: [0, 1], length: [4, 1], locked: false }]);
  });

  it("is previewed as it is applied", () => {
    const view = viewOf([A, MIXED]);
    const command: SetCommand = {
      type: "set",
      changes: [{ target: at("page"), values: { is_segment_line: true } }],
    };
    const shown = preview(view, command);
    if (isCommandError(shown)) throw new Error("refused");
    expect(block(shown).manifest).toEqual(block(changed(view, command)).manifest);
  });
});

describe("a segment line turned off", () => {
  it("keeps its segments as children, each locked by its new place", () => {
    const view = viewOf([A, "segment_line.json"]);
    const before = timeline(view, "form");
    const form = timeline(changed(view, set(at("form"), { is_segment_line: false })), "form");
    expect(form).toEqual({ ...before, is_segment_line: false });
    expect(form.children.map((child) => child.locked)).toEqual([true, true, true]);
  });

  it.each([
    ["a group member", MIXED, "performance", undefined],
    [
      "a child",
      "bare.json",
      "c",
      { into: at("bare"), child: { id: "c", unit: "quarters", offset: [0, 1], length: [4, 1] } },
    ],
  ])("lifts the lock its place gave %s as a segment line", (_, name, id, added) => {
    const start = viewOf([A, name]);
    const view = added === undefined ? start : changed(start, { type: "add", ...added });
    const before = timeline(view, id);
    expect(before.locked).toBe(false);
    const on = changed(view, set(at(id), { is_segment_line: true }));
    expect(timeline(on, id).locked).toBe(true);
    const off = timeline(changed(on, set(at(id), { is_segment_line: false })), id);
    expect(off.locked).toBe(false);
    expect(off.children.map((child) => child.locked)).toEqual([false]);
  });

  it("keeps a lock no place decided", () => {
    const view = viewOf([A, "segment_line.json"]);
    const locked = changed(view, set(at("form"), { locked: true }));
    const form = timeline(changed(locked, set(at("form"), { is_segment_line: false })), "form");
    expect([form.locked, form.is_segment_line]).toEqual([true, false]);
  });

  it("is refused for one segment beside segment lines", () => {
    expect(
      rejected(viewOf([A, "segment_line.json"]), set(at("b"), { is_segment_line: false })),
    ).toEqual({
      code: "schema_violation",
      path: [A, "manifest", "timelines", 0, "children", 1, "is_segment_line"],
    });
  });

  it("refuses the value held and anything but a boolean", () => {
    const view = viewOf([A, "segment_line.json"]);
    const result = apply(deepFreeze(view), set(at("form"), { is_segment_line: true }));
    expect(isCommandError(result) ? { ...result } : null).toEqual({
      code: "invalid_value",
      message: "the command changes nothing",
      path: [at("form"), "is_segment_line"],
    });
    expect(rejected(view, set(at("form"), { is_segment_line: "yes" }))).toEqual({
      code: "invalid_value",
      path: [at("form"), "is_segment_line"],
    });
  });
});
