import type { Selector } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { apply } from "../src/commands/apply.ts";
import { isCommandError } from "../src/errors.ts";
import type { ElementAddress } from "../src/manifest/address.ts";
import { contains } from "../src/manifest/contains.ts";
import type { ElementKey } from "../src/manifest/elements.ts";
import { manifestElements, selectorMatches } from "../src/manifest/elements.ts";
import { elisionsUnder, groupElisions } from "../src/manifest/elisions.ts";
import { schemaProblems } from "../src/manifest/io.ts";
import { removedBy } from "../src/manifest/remove.ts";
import { timelineAncestry } from "../src/manifest/tree.ts";
import type { Manifest } from "../src/manifest/types.ts";
import type { Address, ResolvedAddress } from "../src/workspace/address.ts";
import { addressWords, manifestIds, resolveAddress } from "../src/workspace/address.ts";
import { sideEffect } from "../src/workspace/guard.ts";
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
  load,
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
  readonly name?: string;
  readonly display?: readonly string[];
}

const elision = (
  id: string,
  timeline: string,
  start: unknown,
  end: unknown,
  display?: readonly string[],
): Stated => ({ id, timeline, start, end, ...(display === undefined ? {} : { display }) });

/** The schema's default display: the ellipsis and the name label. */
const DEFAULT_DISPLAY = ["ellipsis", "name"];

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

/**
 * The refusal of a new timestamp given `timestamp_3`, which an elision of
 * `bare.yaml` holds: the schema names the second holder, the elision, since
 * `graphical.timestamps` precede `graphical.elisions`.
 */
const TAKEN_BY_ELISION = {
  code: "schema_violation",
  path: [A, "manifest", "graphical", "elisions", 1, "id"],
  message: "'timestamp_3' is not unique in the manifest, first at #/graphical/timestamps/1/id",
};

describe("elisions in ordinary edits", () => {
  it("are IDs of the manifest, which no new element takes", () => {
    const first = elision("elision_1", "bare", [1, 1], [2, 1]);
    const named = elision("timestamp_3", "bare", [3, 1], [4, 1]);
    const manifest = withElisions("bare.yaml", first, named);
    const ids = manifestIds(manifest);
    expect([ids.has("elision_1"), ids.has("timestamp_3")]).toEqual([true, true]);
    const view = viewWith(manifest);
    const stamp = { name: "Bar 2", coordinate: [2, 1] };
    const added = changed(view, { type: "add", into: at("bare"), timestamp: stamp, ids: ["bar2"] });
    const timestamps = block(added).manifest.graphical?.timestamps ?? [];
    expect(timestamps.map((timestamp) => timestamp.id)).toEqual([
      "timestamp_1",
      "bar2",
      "timestamp_2",
    ]);
    expect(elisionsOf(added)).toEqual([complete(first), complete(named)]);
    const taken = { type: "add", into: at("bare"), timestamp: stamp, ids: ["timestamp_3"] };
    expect(refused(apply(view, taken))).toEqual(TAKEN_BY_ELISION);
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
  const add = (value: object) => ({ type: "add", into: at("bare"), elision: value, ids: ["gap"] });
  const path = (...rest: (string | number)[]) => [key(at("bare")), "elision", ...rest];
  const stretch = { start: [3, 1], end: [5, 1] };

  it("takes the command's next ID and fills the timeline from the target", () => {
    expect(elisionsOf(changed(view, add(stretch)))).toEqual([
      complete(first),
      { id: "gap", timeline: "bare", start: [3, 1], end: [5, 1], display: DEFAULT_DISPLAY },
    ]);
    const sized = changed(
      view,
      add({
        ...stretch,
        name: "Development",
        width: { ratio: 0.25 },
        display: ["coordinate", "name", "ellipsis"],
      }),
    );
    expect(elisionsOf(sized)?.[1]).toEqual({
      id: "gap",
      timeline: "bare",
      start: [3, 1],
      end: [5, 1],
      name: "Development",
      width: { ratio: 0.25 },
      display: ["ellipsis", "name", "coordinate"],
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
          message: "start [-1, 1] of 'gap' lies before the start of its timeline 'bare'",
        },
      ],
      [
        { start: [1, 1], end: [9, 1] },
        {
          code: "elision_stretch",
          path: path("end"),
          message: "end [9, 1] of 'gap' is beyond the length [8, 1] of its timeline 'bare'",
        },
      ],
      [
        { start: [2, 1], end: [2, 1] },
        {
          code: "elision_stretch",
          path: path("end"),
          message: "end [2, 1] of 'gap' does not lie after its start [2, 1]",
        },
      ],
      [
        { ...stretch, name: "" },
        { code: "invalid_value", path: path("name"), message: "a name is a non-empty string" },
      ],
      [
        { ...stretch, name: 3 },
        { code: "invalid_value", path: path("name"), message: "a name is a non-empty string" },
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
        { ...stretch, display: ["ellipsis", "ellipsis"] },
        { code: "invalid_value", path: path("display"), message: "'ellipsis' is given twice" },
      ],
      [
        { ...stretch, display: ["strip"] },
        { code: "invalid_value", path: path("display"), message: "'strip' is no display word" },
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

  it("takes a name, and null deletes it", () => {
    const named = changed(view, set("elision_1", { name: "Development" }));
    expect(elisionsOf(named)).toEqual([complete({ ...first, name: "Development" })]);
    expect(addressWords(named, element("elision_1"))).toBe("elision 'Development'");
    const unnamed = changed(named, set("elision_1", { name: null }));
    expect(elisionsOf(unnamed)).toEqual([complete(first)]);
    const nothing = {
      code: "invalid_value",
      path: path("name"),
      message: "the command changes nothing",
    };
    expect(refused(apply(view, set("elision_1", { name: null })))).toEqual(nothing);
    expect(refused(apply(named, set("elision_1", { name: "Development" })))).toEqual(nothing);
    expect(refused(apply(view, set("elision_1", { name: "" })))).toEqual({
      code: "invalid_value",
      path: path("name"),
      message: "a name is a non-empty string",
    });
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
    const shown = changed(view, set("elision_1", { display: ["coordinate", "ellipsis"] }));
    expect(elisionsOf(shown)?.[0]?.display).toEqual(["ellipsis", "coordinate"]);
    const again = apply(shown, set("elision_1", { display: ["coordinate", "ellipsis"] }));
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
  const addAll = (value: unknown, ids: readonly string[] = ["e1", "e2"]) => ({
    type: "add",
    into: blockAddress,
    elision: value,
    ids,
  });

  it("stores a card's default elisions and resets them, one entry each", () => {
    const store = storeOf(view);
    const entries = store.journal.length;
    expect(store.dispatch(addAll(defaults, ["e1", "e2", "e3"]))).toBeNull();
    expect(store.journal.length).toBe(entries + 1);
    const stored = [
      complete(elision("e1", "movement", [0, 1], [8, 1])),
      complete(elision("e2", "score", [0, 1], [16, 1])),
      complete(elision("e3", "score", [32, 1], [64, 1])),
    ];
    expect(elisionsOf(store.view)).toEqual(stored);
    // Group elisions of `group_1`: on its member root and on its child member.
    for (const [timeline, start, end, id] of [
      ["recording", 1, 2, "e4"],
      ["theme", [1, 1], [2, 1], "e5"],
    ] as const) {
      expect(
        store.dispatch({ type: "add", into: at(timeline), elision: { start, end }, ids: [id] }),
      ).toBeNull();
    }
    const manifest = block(store.view).manifest;
    const under = elisionsUnder(manifest, "score");
    expect(under.map((item) => item.id)).toEqual(["e1", "e2", "e3"]);
    const before = store.journal.length;
    expect(
      store.dispatch({ type: "remove", targets: under.map((item) => at(item.id)) }),
    ).toBeNull();
    expect(store.journal.length).toBe(before + 1);
    expect(elisionsOf(store.view)?.map((item) => item.id)).toEqual(["e4", "e5"]);
  });

  it("store the name an item gives", () => {
    const named = changed(view, addAll([{ ...defaults[0], name: "Exposition" }], ["e1"]));
    expect(elisionsOf(named)).toEqual([
      complete({ ...elision("e1", "movement", [0, 1], [8, 1]), name: "Exposition" }),
    ]);
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
          message: "'nowhere' names no timeline or virtual timeline of this manifest",
        },
      ],
      [
        [movement, { timeline: "movement", start: [4, 1], end: [2, 1] }],
        {
          code: "elision_stretch",
          path: path(1, "end"),
          message: "end [2, 1] of 'e2' does not lie after its start [4, 1]",
        },
      ],
    ];
    for (const [value, expected] of cases) {
      expect(refused(apply(view, addAll(value)))).toEqual(expected);
    }
  });
});

describe("card and group elisions", () => {
  const stored = load("bundles/bundle_elisions_stored.yaml");
  const ids = (elisions: readonly { readonly id: string }[]) => elisions.map((item) => item.id);

  it("tell an elision on a timeline lying in a group from one in no group", () => {
    expect(
      ["score", "page", "session", "recording", "nowhere"].map((root) =>
        ids(elisionsUnder(stored, root)),
      ),
    ).toEqual([
      ["elision_1", "elision_4", "elision_5", "elision_6"],
      ["elision_2"],
      ["elision_7"],
      [],
      [],
    ]);
    expect(ids(groupElisions(stored, "group_1"))).toEqual(["elision_3"]);
    expect(ids(groupElisions(stored, "nowhere"))).toEqual([]);
    const onTheme = changed(viewWith(stored), {
      type: "add",
      into: at("theme"),
      elision: { start: [1, 1], end: [2, 1] },
      ids: ["theme_gap"],
    });
    const manifest = block(onTheme).manifest;
    expect(ids(groupElisions(manifest, "group_1"))).toEqual(["elision_3", "theme_gap"]);
    expect(ids(elisionsUnder(manifest, "score"))).toEqual(ids(elisionsUnder(stored, "score")));
  });

  it("make an elision on a member of two groups a group elision of each", () => {
    const shared = load("bundles/bundle_groupstamp_shared_member.yaml");
    expect([ids(groupElisions(shared, "g1")), ids(groupElisions(shared, "g2"))]).toEqual([
      ["elision_1"],
      ["elision_1"],
    ]);
    expect(ids(elisionsUnder(shared, "t"))).toEqual([]);
  });
});

describe("elision addresses", () => {
  const view = viewWith(withElisions("groups/group_grandchild.yaml"));

  it("resolve a derived elision as a part of its timeline, where one may be derived", () => {
    expect(shape(resolved(view, element("score", ["elision"])))).toEqual({
      part: "elision",
      of: { timeline: "score" },
    });
    for (const word of ["coordinate", "name", "ellipsis"]) {
      expect(shape(resolved(view, element("movement", ["elision", word])))).toEqual({
        part: word,
        of: { part: "elision", of: { timeline: "movement" } },
      });
    }
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

  it("resolve a stored card elision by its ID, its parts where its display draws them", () => {
    const shown = ["ellipsis", "name", "coordinate"];
    const stored = elision("elision_1", "movement", [0, 1], [8, 1], shown);
    const manifest = withElisions("groups/group_grandchild.yaml", stored);
    const holding = viewWith(manifest);
    // A rule may still state `proportional`, which derives elisions beside the stored one.
    expect(namesNothing(holding, element("score", ["elision"]))).toBeNull();
    expect(shape(resolved(holding, element("elision_1")))).toEqual({
      elision: "elision_1",
      on: "movement",
      index: 0,
    });
    for (const word of shown) {
      expect(shape(resolved(holding, element("elision_1", [word])))).toEqual({
        part: word,
        of: { elision: "elision_1", on: "movement", index: 0 },
      });
    }
    expect(namesNothing(holding, element("elision_1", ["id"]))).toBe("unknown_target");
    expect(addressWords(holding, element("elision_1"))).toBe("elision 'elision_1'");
    expect(refused(editorKindOf(holding, element("elision_1"))).code).toBe("no_editor");
    const address: ElementAddress = { id: "elision_1" };
    expect(
      ["movement", "score", "theme"].map((timeline) => contains(manifest, timeline, address)),
    ).toEqual([true, true, false]);
    expect(contains(manifest, "movement", { id: "movement", part: ["elision"] })).toBe(true);
  });

  it("resolve a group elision with the parts its frame draws, and a bare gap without parts", () => {
    const onMember = elision("elision_1", "recording", 1, 2);
    const holding = viewWith(withElisions("groups/group_grandchild.yaml", onMember));
    expect(shape(resolved(holding, element("elision_1")))).toEqual({
      elision: "elision_1",
      on: "recording",
      index: 0,
    });
    // Stated without `display`: the default draws its ellipsis and its name label.
    expect(namesNothing(holding, element("elision_1", ["ellipsis"]))).toBeNull();
    expect(namesNothing(holding, element("elision_1", ["name"]))).toBeNull();
    const unnamed = elision("elision_1", "recording", 1, 2, ["ellipsis"]);
    const unlabelled = viewWith(withElisions("groups/group_grandchild.yaml", unnamed));
    expect(namesNothing(unlabelled, element("elision_1", ["ellipsis"]))).toBeNull();
    expect(namesNothing(unlabelled, element("elision_1", ["name"]))).toBe("unknown_target");
    const gap = elision("elision_1", "bare", [1, 1], [2, 1], []);
    const bare = viewWith(withElisions("bare.yaml", gap));
    expect(namesNothing(bare, element("elision_1"))).toBeNull();
    expect(namesNothing(bare, element("elision_1", ["ellipsis"]))).toBe("unknown_target");
    expect(namesNothing(bare, element("elision_1", ["name"]))).toBe("unknown_target");
    expect(namesNothing(bare, element("bare", ["elision"]))).toBe("unknown_target");
  });
});

describe("elision elements", () => {
  /** The keys of a manifest's gaps and what they hold, as type and address. */
  const gapsOf = (keys: readonly ElementKey[]) =>
    keys
      .filter(
        (item) =>
          item.type === "elision" ||
          item.type === "ellipsis" ||
          (item.type === "label" && item.inside.at(-1) === "elision"),
      )
      .map((item) => [item.type, item.address]);
  const gap = (id: string) => ["elision", { id }];
  const ellipsis = (id: string) => ["ellipsis", { id, part: ["ellipsis"] }];
  const label = (id: string, word: string) => ["label", { id, part: [word] }];

  it("are listed in the cards drawing a root whole and across the frames", () => {
    const manifest = load("bundles/bundle_elisions_stored.yaml");
    const keys = manifestElements(manifest);
    expect(gapsOf(keys)).toEqual([
      // The ancestor card of `score`: `coda`'s, held inside the children band, then `score`'s.
      gap("elision_1"),
      ellipsis("elision_1"),
      label("elision_1", "name"),
      gap("elision_4"),
      ellipsis("elision_4"),
      label("elision_4", "id"),
      gap("elision_5"),
      label("elision_5", "name"),
      gap("elision_6"),
      // The gap of `group_1`'s frame carried into it, without labels.
      gap("elision_3"),
      ellipsis("elision_3"),
      // The ancestor card of `session`, whose `elision-mode` the cascade reads.
      gap("elision_7"),
      ellipsis("elision_7"),
      label("elision_7", "name"),
      gap("elision_3"),
      ellipsis("elision_3"),
      // The ungrouped root `page`'s card.
      gap("elision_2"),
      ellipsis("elision_2"),
      label("elision_2", "name"),
      label("elision_2", "coordinate"),
      // After every item, the frame's own gap of its group elision.
      gap("elision_3"),
      ellipsis("elision_3"),
      label("elision_3", "coordinate"),
    ]);
    const score = keys.find((item) => item.address.id === "elision_4" && item.type === "elision");
    const own = {
      type: "elision",
      address: { id: "elision_4" },
      timeline: "score",
      domain: "logical",
      modality: "continuous",
      class: "ContinuousLogicalTimeline",
      facet: null,
      inside: ["block", "timeline"],
    };
    expect(score).toEqual(own);
    expect(
      keys.find((item) => item.address.id === "elision_4" && item.type === "ellipsis"),
    ).toEqual({
      ...own,
      type: "ellipsis",
      address: { id: "elision_4", part: ["ellipsis"] },
      inside: ["block", "timeline", "elision"],
    });
    const index = keys.indexOf(score as ElementKey);
    expect(keys[index - 1]?.address).toEqual({ id: "score", facet: "flow_control" });
    const recording = keys.filter((item) => item.address.id === "elision_3");
    expect(
      recording
        .filter((item) => item.type === "elision")
        .map((item) => [item.timeline, item.domain, item.modality, item.class, item.inside]),
    ).toEqual(
      Array(3).fill([
        "recording",
        "physical",
        "continuous",
        "ContinuousPhysicalTimeline",
        ["block", "frame"],
      ]),
    );
    const ancestry = timelineAncestry(manifest);
    const matching = (select: Selector) =>
      keys.filter((item) => selectorMatches(select, item, ancestry)).map((item) => item.address);
    expect(matching({ element: "elision", within: "score" })).toEqual([
      { id: "elision_1" },
      { id: "elision_4" },
      { id: "elision_5" },
      { id: "elision_6" },
    ]);
    expect(matching({ element: "elision", inside: "frame" })).toEqual(
      Array(3).fill({ id: "elision_3" }),
    );
    expect(matching({ element: "ellipsis" })).toEqual(
      [
        "elision_1",
        "elision_4",
        "elision_3",
        "elision_7",
        "elision_3",
        "elision_2",
        "elision_3",
      ].map((id) => ({ id, part: ["ellipsis"] })),
    );
    expect(matching({ element: "label", inside: "elision" })).toEqual([
      { id: "elision_1", part: ["name"] },
      { id: "elision_4", part: ["id"] },
      { id: "elision_5", part: ["name"] },
      { id: "elision_7", part: ["name"] },
      { id: "elision_2", part: ["name"] },
      { id: "elision_2", part: ["coordinate"] },
      { id: "elision_3", part: ["coordinate"] },
    ]);
  });

  it("list a shared member's group elision once in each frame", () => {
    const keys = manifestElements(load("bundles/bundle_groupstamp_shared_member.yaml"));
    expect(
      keys
        .filter((item) => item.address.id === "elision_1")
        .map((item) => [item.type, item.inside]),
    ).toEqual([
      ["elision", ["block", "frame"]],
      ["ellipsis", ["block", "frame", "elision"]],
      ["label", ["block", "frame", "elision"]],
      ["elision", ["block", "frame"]],
      ["ellipsis", ["block", "frame", "elision"]],
      ["label", ["block", "frame", "elision"]],
    ]);
    // Both after every item: the last frame's member drawings come first.
    const lastCard = keys.findLastIndex((item) => item.type === "card");
    const first = keys.findIndex((item) => item.type === "elision");
    expect(first).toBeGreaterThan(lastCard);
  });

  it("are listed in an ungrouped root's card", () => {
    const manifest = withElisions("bare.yaml", elision("elision_1", "bare", [1, 1], [2, 1]));
    const strips = manifestElements(manifest).filter((item) => item.type === "elision");
    expect(strips.map((item) => [item.address, item.inside])).toEqual([
      [{ id: "elision_1" }, ["block", "timeline"]],
    ]);
  });
});

describe("elisions on a virtual timeline", () => {
  const VIRTUAL = "allegro_default";
  const cards = () => viewWith(load("flow/virtual_cards.yaml"));
  const into = element(VIRTUAL);
  const added = (end: unknown = [4241, 2]) =>
    apply(cards(), {
      type: "add",
      into,
      elision: { start: [2121, 2], end },
      ids: ["gap"],
    });
  const BEYOND =
    "end [2121, 1] of 'gap' is beyond the length [4241, 2] of its timeline 'allegro_default'";
  const stored = (result: ReturnType<typeof apply>): View => {
    if (isCommandError(result)) throw new Error(`${result.code}: ${result.message}`);
    return result;
  };

  it("adds one on the played axis, bounded by the virtual timeline's length", () => {
    const view = stored(added());
    expect(elisionsOf(view)).toEqual([
      {
        id: "gap",
        timeline: VIRTUAL,
        start: [2121, 2],
        end: [4241, 2],
        display: DEFAULT_DISPLAY,
      },
    ]);
    expect(schemaProblems(block(view).manifest)).toEqual([]);
    expect(refused(added([2121, 1]))).toEqual({
      code: "elision_stretch",
      path: [key(into), "elision", "end"],
      message: BEYOND,
    });
    const listed = stored(
      apply(cards(), {
        type: "add",
        into: { block: A },
        elision: [{ timeline: "allegro_single", start: [0, 1], end: [1, 1] }],
        ids: ["gap"],
      }),
    );
    expect(elisionsOf(listed)).toEqual([
      {
        id: "gap",
        timeline: "allegro_single",
        start: [0, 1],
        end: [1, 1],
        display: DEFAULT_DISPLAY,
      },
    ]);
  });

  it("resolves, sets and removes it", () => {
    const view = stored(added());
    expect(shape(resolved(view, element("gap")))).toEqual({
      elision: "gap",
      on: VIRTUAL,
      index: 0,
    });
    expect(addressWords(view, element("gap"))).toBe("elision 'gap'");
    for (const word of ["ellipsis", "name"]) {
      expect(shape(resolved(view, element("gap", [word])))).toEqual({
        part: word,
        of: { elision: "gap", on: VIRTUAL, index: 0 },
      });
    }
    expect(namesNothing(view, element("gap", ["coordinate"]))).toBe("unknown_target");
    const moved = changed(view, set("gap", { start: [10, 1] }));
    expect(elisionsOf(moved)?.[0]?.start).toEqual([10, 1]);
    expect(refused(apply(view, set("gap", { end: [2121, 1] })))).toEqual({
      code: "elision_stretch",
      path: [key(at("gap")), "end"],
      message: BEYOND,
    });
    expect(elisionsOf(changed(view, { type: "remove", targets: [at("gap")] }))).toEqual([]);
  });

  it("goes with the virtual timeline it lies on", () => {
    const gone = changed(stored(added()), { type: "remove", targets: [into] });
    expect(elisionsOf(gone)).toEqual([]);
  });

  it("lists it in the virtual timeline's card alone", () => {
    const keys = manifestElements(block(stored(added())).manifest);
    const own = {
      type: "elision",
      address: { id: "gap" },
      timeline: VIRTUAL,
      domain: "logical",
      modality: "continuous",
      class: "ContinuousLogicalTimeline",
      facet: null,
      inside: ["block", "timeline"],
    };
    expect(keys.filter((item) => item.address.id === "gap")).toEqual([
      own,
      {
        ...own,
        type: "ellipsis",
        address: { id: "gap", part: ["ellipsis"] },
        inside: ["block", "timeline", "elision"],
      },
      {
        ...own,
        type: "label",
        address: { id: "gap", part: ["name"] },
        inside: ["block", "timeline", "elision"],
      },
    ]);
    const gapAt = keys.findIndex((item) => item.address.id === "gap");
    const band = keys.findIndex(
      (item) => item.address.id === VIRTUAL && item.address.facet === "regions",
    );
    const card = keys.findIndex((item) => item.type === "card" && item.address.id === VIRTUAL);
    const nextCard = keys.findIndex((item, index) => index > card && item.type === "card");
    expect([card < band, band < gapAt, gapAt < nextCard]).toEqual([true, true, true]);
  });

  it("makes them the card elisions of the virtual timeline", () => {
    const manifest = block(stored(added())).manifest;
    expect(elisionsUnder(manifest, VIRTUAL).map((item) => item.id)).toEqual(["gap"]);
    expect(elisionsUnder(manifest, "allegro_single")).toEqual([]);
  });

  it("makes one on a virtual member a group elision of its frame", () => {
    const manifest = withElisions(
      "groups/virtual_member.yaml",
      elision("gap", VIRTUAL, [500, 1], [1000, 1]),
    );
    expect(groupElisions(manifest, "performance").map((item) => item.id)).toEqual(["gap"]);
    expect(elisionsUnder(manifest, VIRTUAL)).toEqual([]);
    const keys = manifestElements(manifest);
    const own = {
      type: "elision",
      address: { id: "gap" },
      timeline: VIRTUAL,
      domain: "logical",
      modality: "continuous",
      class: "ContinuousLogicalTimeline",
      facet: null,
      inside: ["block", "frame"],
    };
    expect(keys.filter((item) => item.address.id === "gap")).toEqual([
      own,
      {
        ...own,
        type: "ellipsis",
        address: { id: "gap", part: ["ellipsis"] },
        inside: ["block", "frame", "elision"],
      },
      {
        ...own,
        type: "label",
        address: { id: "gap", part: ["name"] },
        inside: ["block", "frame", "elision"],
      },
    ]);
    const lastCard = keys.findLastIndex((item) => item.type === "card");
    expect(keys.findIndex((item) => item.address.id === "gap")).toBeGreaterThan(lastCard);
  });
});
