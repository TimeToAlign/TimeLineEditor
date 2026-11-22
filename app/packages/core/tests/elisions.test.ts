import type { Selector } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isCommandError } from "../src/errors.ts";
import type { ElementAddress } from "../src/manifest/address.ts";
import { contains } from "../src/manifest/contains.ts";
import { manifestElements, selectorMatches, timelineAncestry } from "../src/manifest/elements.ts";
import { elisionsUnder } from "../src/manifest/elisions.ts";
import { removedBy } from "../src/manifest/remove.ts";
import type { Manifest } from "../src/manifest/types.ts";
import type { Address, ResolvedAddress } from "../src/workspace/address.ts";
import { addressWords, manifestIds, resolveAddress } from "../src/workspace/address.ts";
import { sideEffect } from "../src/workspace/guard.ts";
import { nextId } from "../src/workspace/ids.ts";
import { editorKindOf } from "../src/workspace/sessions.ts";
import type { View } from "../src/workspace/view.ts";
import { createView } from "../src/workspace/view.ts";
import {
  A,
  at,
  block,
  changed,
  fileText,
  key,
  loadText,
  manifestValue,
  storeOf,
} from "./support.ts";

/** An elision as `graphical.elisions` states it, without `display`. */
interface Stated {
  readonly id: string;
  readonly timeline: string;
  readonly start: unknown;
  readonly end: unknown;
  readonly display?: readonly string[];
}

const elision = (
  id: string,
  timeline: string,
  start: unknown,
  end: unknown,
  display?: readonly string[],
): Stated => ({ id, timeline, start, end, ...(display === undefined ? {} : { display }) });

const DEFAULT_DISPLAY = ["strip", "name", "coordinate"];

/** An elision as core reads it: complete, its `display` the default unless stated. */
const complete = (stated: Stated) => ({ display: DEFAULT_DISPLAY, ...stated });

/** The fixture `name` given `elisions` before it is read. */
function withElisions(name: string, ...elisions: Stated[]): Manifest {
  const value = manifestValue(name);
  const graphical = (value.graphical ?? {}) as Record<string, unknown>;
  return loadText(fileText({ ...value, graphical: { ...graphical, elisions } }), name);
}

/** A view whose block `A` holds `manifest`. */
const viewWith = (manifest: Manifest): View =>
  changed(createView(), { type: "add", into: {}, block: { id: A, manifest, x: 0, y: 0 } });

const set = (id: string, values: object) => ({
  type: "set",
  changes: [{ target: at(id), values }],
});

const elisionsOf = (view: View) => block(view).manifest.graphical?.elisions;

/** A refusal's code, path and message, failing loudly where the command was taken. */
function refused(result: unknown) {
  if (!isCommandError(result)) throw new Error("expected a refusal");
  return { code: result.code, path: result.path, message: result.message };
}

/** The address of an element of block `A`. */
const element = (id: string, part?: readonly string[]): Address =>
  ({ block: A, id, ...(part === undefined ? {} : { part }) }) as Address;

/** What an address resolves to, failing loudly where it names nothing. */
function resolved(view: View, address: Address): ResolvedAddress {
  const result = resolveAddress(view, address);
  if ("code" in result) throw new Error(`${result.code}: ${result.message}`);
  return result;
}

/** A resolved address read down to words: its kind, its timeline's ID, its part words. */
function shape(found: ResolvedAddress): unknown {
  switch (found.kind) {
    case "part":
      return { part: found.word, of: shape(found.owner) };
    case "timeline":
      return { timeline: found.at.timeline.id };
    case "elision":
      return { elision: found.elision.id, on: found.at.timeline.id, index: found.index };
    default:
      return { kind: found.kind };
  }
}

/** The code of what an address resolves to where it names nothing; `null` where it resolves. */
function namesNothing(view: View, address: Address): string | null {
  const result = resolveAddress(view, address);
  return "code" in result ? result.code : null;
}

describe("elisions in ordinary edits", () => {
  it("are skipped by every ID minted and refused as a given one", () => {
    const first = elision("elision_1", "bare", [1, 1], [2, 1]);
    const named = elision("timestamp_3", "bare", [3, 1], [4, 1]);
    const manifest = withElisions("bare.yaml", first, named);
    const ids = manifestIds(manifest);
    expect([ids.has("elision_1"), ids.has("timestamp_3")]).toEqual([true, true]);
    expect(nextId("elision", ids)).toBe("elision_2");
    const view = viewWith(manifest);
    const added = changed(view, {
      type: "add",
      into: at("bare"),
      timestamp: { name: "Bar 2", coordinate: [2, 1] },
    });
    const timestamps = block(added).manifest.graphical?.timestamps ?? [];
    expect(timestamps.map((timestamp) => timestamp.id)).toEqual([
      "timestamp_1",
      "timestamp_4",
      "timestamp_2",
    ]);
    expect(elisionsOf(added)).toEqual([complete(first), complete(named)]);
    const region = { id: "elision_1", start: [0, 1], end: [1, 1] };
    expect(refused(apply(view, { type: "add", into: at("bare"), region }))).toEqual({
      code: "duplicate_id",
      path: [key(at("bare")), "region", "id"],
      message: "'elision_1' is already an ID of the manifest",
    });
  });

  describe("on nested timelines", () => {
    const onRoot = elision("elision_1", "clt_1", [13, 1], [15, 1]);
    const onChild = elision("elision_2", "clt_3", [1, 1], [2, 1]);
    const onGrandchild = elision("elision_3", "clt_2", [1, 2], [1, 1]);
    const manifest = withElisions("nested.yaml", onRoot, onChild, onGrandchild);
    const view = viewWith(manifest);
    const beyond = {
      code: "elision_exceeds_length",
      path: [key(at("clt_1")), "length"],
      message: "elision 'elision_1' reaches beyond the end of its timeline 'clt_1'",
    };
    const lengthStamp = (shown: View) =>
      (block(shown).manifest.graphical?.timestamps ?? []).find(
        (timestamp) => timestamp.name === "length",
      )?.coordinate;

    it("go with the timeline they lie on, and with its removed descendants", () => {
      expect([...removedBy(manifest, ["clt_3"])].sort()).toEqual([
        "clt_2",
        "clt_3",
        "elision_2",
        "elision_3",
      ]);
      const removed = changed(view, { type: "remove", targets: [at("clt_3")] });
      expect(elisionsOf(removed)).toEqual([complete(onRoot)]);
    });

    it("lie inside the timeline editor of the timeline holding them", () => {
      const removed = changed(view, { type: "remove", targets: [at("clt_2")] });
      expect(elisionsOf(removed)).toEqual([complete(onRoot), complete(onChild)]);
      expect(sideEffect(view, removed, at("clt_3"))).toBeNull();
    });

    it("keep their place when they end before the end, as a named timestamp there does", () => {
      expect(refused(apply(view, set("clt_1", { length: [29, 2] })))).toEqual(beyond);
      const shortened = changed(view, set("clt_1", { length: [15, 1] }));
      // In canonical order: by timeline, then start, then ID.
      expect(elisionsOf(shortened)).toEqual([
        complete(onRoot),
        complete(onGrandchild),
        complete(onChild),
      ]);
      expect(lengthStamp(shortened)).toEqual([15, 1]);
      const unknown = changed(view, set("clt_1", { length: null }));
      expect(block(unknown).manifest.timelines[0]?.length).toBeNull();
      expect(elisionsOf(unknown)).toEqual(elisionsOf(view));
    });

    it("follow the end when they end at it, while the new length lies after their start", () => {
      const atEnd = elision("elision_1", "clt_1", [13, 1], [16, 1]);
      const ending = viewWith(withElisions("nested.yaml", atEnd));
      const shortened = changed(ending, set("clt_1", { length: [15, 1] }));
      expect(elisionsOf(shortened)).toEqual([complete({ ...atEnd, end: [15, 1] })]);
      expect(lengthStamp(shortened)).toEqual([15, 1]);
      const longer = changed(ending, set("clt_1", { length: [20, 1] }));
      expect(elisionsOf(longer)).toEqual([complete({ ...atEnd, end: [20, 1] })]);
      expect(refused(apply(ending, set("clt_1", { length: [13, 1] })))).toEqual(beyond);
      const unknown = changed(ending, set("clt_1", { length: null }));
      expect(elisionsOf(unknown)).toEqual([complete(atEnd)]);
    });
  });
});

describe("add kind elision into a timeline", () => {
  const first = elision("elision_1", "bare", [1, 1], [2, 1]);
  const view = viewWith(withElisions("bare.yaml", first));
  const add = (value: object) => ({ type: "add", into: at("bare"), elision: value });
  const path = (...rest: (string | number)[]) => [key(at("bare")), "elision", ...rest];
  const stretch = { start: [3, 1], end: [5, 1] };

  it("mints the next elision_N and fills the timeline from the target", () => {
    expect(elisionsOf(changed(view, add(stretch)))).toEqual([
      complete(first),
      { id: "elision_2", timeline: "bare", start: [3, 1], end: [5, 1], display: DEFAULT_DISPLAY },
    ]);
    const sized = changed(
      view,
      add({ ...stretch, width: { ratio: 0.25 }, display: ["name", "strip"] }),
    );
    expect(elisionsOf(sized)?.[1]).toEqual({
      id: "elision_2",
      timeline: "bare",
      start: [3, 1],
      end: [5, 1],
      width: { ratio: 0.25 },
      display: ["strip", "name"],
    });
    expect(elisionsOf(changed(view, add({ ...stretch, width: { ratio: 1 } })))?.[1]?.width).toEqual(
      { ratio: 1 },
    );
  });

  it("refuses each value as TimeToShare does, at its member", () => {
    const cases: readonly (readonly [object, unknown])[] = [
      [
        { start: [3, 1] },
        { code: "invalid_value", path: path("end"), message: "a new elision needs end" },
      ],
      [
        { ...stretch, timeline: "bare" },
        {
          code: "unknown_property",
          path: path("timeline"),
          message: "unknown member timeline",
        },
      ],
      [
        { start: [-1, 1], end: [2, 1] },
        {
          code: "elision_stretch",
          path: path("start"),
          message: "start [-1, 1] of 'elision_2' lies before the start of its timeline 'bare'",
        },
      ],
      [
        { start: [1, 1], end: [9, 1] },
        {
          code: "elision_stretch",
          path: path("end"),
          message: "end [9, 1] of 'elision_2' is beyond the length [8, 1] of its timeline 'bare'",
        },
      ],
      [
        { start: [2, 1], end: [2, 1] },
        {
          code: "elision_stretch",
          path: path("end"),
          message: "end [2, 1] of 'elision_2' does not lie after its start [2, 1]",
        },
      ],
      [
        { ...stretch, width: { ratio: 0.5, canvas: 10 } },
        {
          code: "invalid_value",
          path: path("width"),
          message: "a width is exactly one of ratio, span and canvas",
        },
      ],
      [
        { ...stretch, width: {} },
        {
          code: "invalid_value",
          path: path("width"),
          message: "a width is exactly one of ratio, span and canvas",
        },
      ],
      [
        { ...stretch, width: { ratio: 0 } },
        {
          code: "invalid_value",
          path: path("width", "ratio"),
          message: "a ratio lies above 0 and at most 1",
        },
      ],
      [
        { ...stretch, width: { ratio: 1.5 } },
        {
          code: "invalid_value",
          path: path("width", "ratio"),
          message: "a ratio lies above 0 and at most 1",
        },
      ],
      [
        { ...stretch, width: { span: [0, 1] } },
        {
          code: "non_positive_number",
          path: path("width", "span"),
          message: "the span must be positive",
        },
      ],
      [
        { ...stretch, width: { canvas: -3 } },
        {
          code: "non_positive_number",
          path: path("width", "canvas"),
          message: "the number must be positive",
        },
      ],
      [
        { ...stretch, width: { ratio: 0.5, x: 1 } },
        { code: "unknown_property", path: path("width", "x"), message: "unknown member x" },
      ],
      [
        { ...stretch, display: ["strip", "strip"] },
        { code: "invalid_value", path: path("display"), message: "'strip' is given twice" },
      ],
    ];
    for (const [value, expected] of cases) {
      expect(refused(apply(view, add(value)))).toEqual(expected);
    }
  });
});

describe("set and remove on a stored elision", () => {
  const first = elision("elision_1", "bare", [1, 1], [2, 1]);
  const view = viewWith(withElisions("bare.yaml", first));
  const target = at("elision_1");
  const path = (property: string) => [key(target), property];
  const stretch = (message: string, property: string) => ({
    code: "elision_stretch",
    path: path(property),
    message,
  });

  it("checks the stretch once each change is made", () => {
    const moved = changed(view, set("elision_1", { start: [3, 1], end: [5, 1] }));
    expect(elisionsOf(moved)).toEqual([complete({ ...first, start: [3, 1], end: [5, 1] })]);
    expect(refused(apply(view, set("elision_1", { start: [3, 1] })))).toEqual(
      stretch("end [2, 1] of 'elision_1' does not lie after its start [3, 1]", "start"),
    );
    expect(refused(apply(view, set("elision_1", { end: [1, 1] })))).toEqual(
      stretch("end [1, 1] of 'elision_1' does not lie after its start [1, 1]", "end"),
    );
    expect(refused(apply(view, set("elision_1", { end: [9, 1] })))).toEqual(
      stretch(
        "end [9, 1] of 'elision_1' is beyond the length [8, 1] of its timeline 'bare'",
        "end",
      ),
    );
    expect(refused(apply(view, set("elision_1", { start: [-1, 1] })))).toEqual(
      stretch("start [-1, 1] of 'elision_1' lies before the start of its timeline 'bare'", "start"),
    );
  });

  it("takes every form of its width, and null deletes it", () => {
    for (const width of [{ ratio: 0.25 }, { span: [1, 2] }, { canvas: 160 }]) {
      const sized = changed(view, set("elision_1", { width }));
      expect(elisionsOf(sized)).toEqual([complete({ ...first, width } as Stated)]);
      const unsized = changed(sized, set("elision_1", { width: null }));
      expect(elisionsOf(unsized)).toEqual([complete(first)]);
    }
    expect(refused(apply(view, set("elision_1", { width: null })))).toEqual({
      code: "invalid_value",
      path: path("width"),
      message: "the command changes nothing",
    });
  });

  it("stores its display in canonical order", () => {
    const shown = changed(view, set("elision_1", { display: ["coordinate", "strip"] }));
    expect(elisionsOf(shown)?.[0]?.display).toEqual(["strip", "coordinate"]);
    const again = apply(shown, set("elision_1", { display: ["coordinate", "strip"] }));
    expect(refused(again).code).toBe("invalid_value");
    expect(refused(again).message).toBe("the command changes nothing");
  });

  it("has no timeline to set and keeps its ID", () => {
    expect(refused(apply(view, set("elision_1", { timeline: "bare" })))).toEqual({
      code: "unknown_property",
      path: path("timeline"),
      message: "elision has no property timeline",
    });
    expect(refused(apply(view, set("elision_1", { id: "other" }))).code).toBe("id_not_settable");
  });

  it("goes with a remove", () => {
    expect(elisionsOf(changed(view, { type: "remove", targets: [target] }))).toEqual([]);
  });
});

describe("many elisions in one journal entry", () => {
  const view = viewWith(withElisions("groups/group_grandchild.yaml"));
  const blockAddress = { block: A };
  const path = (...rest: (string | number)[]) => [key(blockAddress), "elision", ...rest];
  const defaults = [
    { timeline: "movement", start: [0, 1], end: [8, 1] },
    { timeline: "score", start: [0, 1], end: [16, 1] },
    { timeline: "score", start: [32, 1], end: [64, 1] },
  ];
  const addAll = (value: unknown) => ({ type: "add", into: blockAddress, elision: value });

  it("stores a card's default elisions and resets them, one entry each", () => {
    const store = storeOf(view);
    const entries = store.journal.length;
    expect(store.dispatch(addAll(defaults))).toBeNull();
    expect(store.journal.length).toBe(entries + 1);
    const stored = [
      complete(elision("elision_1", "movement", [0, 1], [8, 1])),
      complete(elision("elision_2", "score", [0, 1], [16, 1])),
      complete(elision("elision_3", "score", [32, 1], [64, 1])),
    ];
    expect(elisionsOf(store.view)).toEqual(stored);
    expect(
      store.dispatch({
        type: "add",
        into: at("recording"),
        elision: { start: 1, end: 2 },
      }),
    ).toBeNull();
    const manifest = block(store.view).manifest;
    const under = elisionsUnder(manifest, "score");
    expect(under.map((item) => item.id)).toEqual(["elision_1", "elision_2", "elision_3"]);
    const before = store.journal.length;
    expect(
      store.dispatch({ type: "remove", targets: under.map((item) => at(item.id)) }),
    ).toBeNull();
    expect(store.journal.length).toBe(before + 1);
    expect(elisionsOf(store.view)?.map((item) => item.id)).toEqual(["elision_4"]);
  });

  it("refuses what is no list of elisions, at the item at fault", () => {
    const [movement] = defaults;
    const cases: readonly (readonly [unknown, unknown])[] = [
      [
        movement,
        { code: "invalid_value", path: path(), message: "a block takes a list of elisions" },
      ],
      [
        [],
        { code: "invalid_value", path: path(), message: "a list of elisions holds at least one" },
      ],
      [
        [{ start: [0, 1], end: [8, 1] }],
        {
          code: "invalid_value",
          path: path(0, "timeline"),
          message: "a new elision needs timeline",
        },
      ],
      [
        [{ ...movement, timeline: "nowhere" }],
        {
          code: "elision_timeline",
          path: path(0, "timeline"),
          message: "'nowhere' names no timeline of this manifest",
        },
      ],
      [
        [movement, { timeline: "movement", start: [4, 1], end: [2, 1] }],
        {
          code: "elision_stretch",
          path: path(1, "end"),
          message: "end [2, 1] of 'elision_2' does not lie after its start [4, 1]",
        },
      ],
    ];
    for (const [value, expected] of cases) {
      expect(refused(apply(view, addAll(value)))).toEqual(expected);
    }
  });
});

describe("elision addresses", () => {
  const view = viewWith(withElisions("groups/group_grandchild.yaml"));

  it("resolve a default elision as a part of its timeline, where one may be drawn", () => {
    expect(shape(resolved(view, element("score", ["elision"])))).toEqual({
      part: "elision",
      of: { timeline: "score" },
    });
    expect(shape(resolved(view, element("movement", ["elision", "coordinate"])))).toEqual({
      part: "coordinate",
      of: { part: "elision", of: { timeline: "movement" } },
    });
    expect(shape(resolved(view, element("movement", ["elision", "name"])))).toEqual({
      part: "name",
      of: { part: "elision", of: { timeline: "movement" } },
    });
    for (const address of [
      element("theme", ["elision"]),
      element("recording", ["elision"]),
      element("score", ["elision", "id"]),
    ]) {
      expect(namesNothing(view, address)).toBe("unknown_target");
    }
    expect(addressWords(view, element("score", ["elision"]))).toBe(
      "the elision of timeline 'Score'",
    );
    const setPart = apply(view, {
      type: "set",
      changes: [{ target: element("score", ["elision"]), values: { width: { ratio: 0.5 } } }],
    });
    expect(refused(setPart).code).toBe("unknown_target");
  });

  it("resolve a stored elision by its ID, its labels where a card draws them", () => {
    const stored = elision("elision_1", "movement", [0, 1], [8, 1]);
    const manifest = withElisions("groups/group_grandchild.yaml", stored);
    const holding = viewWith(manifest);
    expect(namesNothing(holding, element("score", ["elision"]))).toBe("unknown_target");
    expect(shape(resolved(holding, element("elision_1")))).toEqual({
      elision: "elision_1",
      on: "movement",
      index: 0,
    });
    for (const word of ["name", "coordinate"]) {
      expect(shape(resolved(holding, element("elision_1", [word])))).toEqual({
        part: word,
        of: { elision: "elision_1", on: "movement", index: 0 },
      });
    }
    expect(addressWords(holding, element("elision_1"))).toBe("elision 'elision_1'");
    expect(refused(editorKindOf(holding, element("elision_1"))).code).toBe("no_editor");
    const address: ElementAddress = { id: "elision_1" };
    expect(
      ["movement", "score", "theme"].map((timeline) => contains(manifest, timeline, address)),
    ).toEqual([true, true, false]);
    expect(contains(manifest, "movement", { id: "movement", part: ["elision"] })).toBe(true);
  });

  it("resolve a stored elision drawn nowhere, but none of its labels", () => {
    const onMember = elision("elision_1", "recording", 1, 2);
    const holding = viewWith(withElisions("groups/group_grandchild.yaml", onMember));
    expect(shape(resolved(holding, element("elision_1")))).toEqual({
      elision: "elision_1",
      on: "recording",
      index: 0,
    });
    expect(namesNothing(holding, element("elision_1", ["name"]))).toBe("unknown_target");
    const strip = elision("elision_1", "bare", [1, 1], [2, 1], ["strip"]);
    const bare = viewWith(withElisions("bare.yaml", strip));
    expect(namesNothing(bare, element("elision_1"))).toBeNull();
    expect(namesNothing(bare, element("elision_1", ["name"]))).toBe("unknown_target");
    expect(namesNothing(bare, element("bare", ["elision"]))).toBe("unknown_target");
  });
});

describe("elision elements", () => {
  it("are listed in the cards drawing a timeline whole outside a frame", () => {
    const manifest = withElisions(
      "groups/group_grandchild.yaml",
      elision("elision_1", "movement", [0, 1], [8, 1]),
      elision("elision_2", "theme", [1, 1], [2, 1], ["strip"]),
      elision("elision_3", "recording", 1, 2),
    );
    const keys = manifestElements(manifest);
    const strips = keys.filter((item) => item.type === "elision");
    expect(strips.map((item) => item.address)).toEqual([{ id: "elision_2" }, { id: "elision_1" }]);
    const strip = {
      type: "elision",
      address: { id: "elision_1" },
      timeline: "movement",
      domain: "logical",
      modality: "continuous",
      class: "ContinuousLogicalTimeline",
      facet: null,
      inside: ["block", "timeline", "band", "child"],
    };
    const index = keys.findIndex((item) => item.address.id === "elision_1");
    expect(keys[index - 1]?.address).toEqual({ id: "movement", facet: "flow_control" });
    expect(keys.slice(index, index + 3)).toEqual([
      strip,
      {
        ...strip,
        type: "label",
        address: { id: "elision_1", part: ["name"] },
        inside: [...strip.inside, "elision"],
      },
      {
        ...strip,
        type: "label",
        address: { id: "elision_1", part: ["coordinate"] },
        inside: [...strip.inside, "elision"],
      },
    ]);
    expect(keys.filter((item) => item.address.id === "elision_2")).toHaveLength(1);
    const ancestry = timelineAncestry(manifest);
    const matching = (select: Selector) =>
      keys.filter((item) => selectorMatches(select, item, ancestry)).map((item) => item.address);
    expect(matching({ element: "elision", within: "score" })).toEqual([
      { id: "elision_2" },
      { id: "elision_1" },
    ]);
    expect(matching({ element: "elision", within: "recording" })).toEqual([]);
    expect(matching({ element: "label", inside: "elision" })).toEqual([
      { id: "elision_1", part: ["name"] },
      { id: "elision_1", part: ["coordinate"] },
    ]);
  });

  it("are listed in an ungrouped root's card", () => {
    const manifest = withElisions("bare.yaml", elision("elision_1", "bare", [1, 1], [2, 1]));
    const strips = manifestElements(manifest).filter((item) => item.type === "elision");
    expect(strips.map((item) => [item.address, item.inside])).toEqual([
      [{ id: "elision_1" }, ["block", "timeline"]],
    ]);
  });
});
