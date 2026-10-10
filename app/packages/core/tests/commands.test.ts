import { JsonFloat } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import { TIMELINE_KEYS } from "../src/document/types.ts";
import type { Command, Document, TimelineManifest } from "../src/index.ts";
import { apply, isCommandError, parseCommand, saveDocument } from "../src/index.ts";
import { deepFreeze, goldenFixtures, load, manifestKeyOrders } from "./support.ts";

/** A coordinate dict on the quarters/fraction axis. */
const q = (numerator: number, denominator = 1) => ({
  unit: "quarters",
  number_type: "fraction",
  value: [numerator, denominator],
});
/** The same coordinate as `apply` stores it (safe integers are plain numbers). */
const Q = (numerator: bigint, denominator = 1n) => ({
  unit: "quarters",
  number_type: "fraction",
  value: [Number(numerator), Number(denominator)],
});
const seconds = (value: number) => ({ unit: "seconds", number_type: "float", value });

/** A new timeline on the quarters/fraction axis. */
const spec = (id: string, length: object = q(8)) => ({
  id,
  class: "ContinuousLogicalTimeline",
  unit: "quarters",
  number_type: "fraction",
  length,
});
const create = (id: string, length: object = q(8)) => ({
  type: "createTimeline",
  ...spec(id, length),
});

/** Apply commands in turn; each must be accepted. Inputs are frozen first. */
function run(document: Document, ...commands: object[]): Document {
  let current = deepFreeze(document);
  for (const command of commands) {
    const result = apply(current, command as Command);
    if (isCommandError(result)) throw new Error(`${JSON.stringify(command)}: ${result.message}`);
    current = deepFreeze(result);
  }
  return current;
}

/** The refusal of a command: its code and path; the frozen input proves nothing changed. */
function refusal(document: Document, command: object) {
  const result = apply(deepFreeze(document), command as Command);
  if (!isCommandError(result)) throw new Error("the command was accepted");
  return { code: result.code, path: result.path };
}

function timeline(document: Document, id: string): TimelineManifest {
  const search = (item: TimelineManifest): TimelineManifest | undefined =>
    item.id === id
      ? item
      : Object.values(item.children)
          .map((entry) => search(entry.timeline))
          .find((found) => found !== undefined);
  for (const root of Object.values(document.manifest.timelines)) {
    const found = search(root);
    if (found !== undefined) return found;
  }
  throw new Error(`no timeline ${id}`);
}

const empty = () => load("empty.json");
/** Root `a` (length 8) with child `b` (length 2) at offset 1 holding `c` (length 1) at 0. */
const tree = () =>
  run(
    empty(),
    create("a"),
    { type: "addChild", parent: "a", offset: q(1), child: spec("b", q(2)) },
    { type: "addChild", parent: "b", offset: q(0), child: spec("c", q(1)) },
  );

const fresh = {
  name: null,
  class: "ContinuousLogicalTimeline",
  unit: "quarters",
  number_type: "fraction",
  locked: false,
  meta: {},
  children: {},
  conversion_maps: [],
  regions: [],
  flow_control: { breaks: [], jumps: [], markers: {} },
  measure_map: null,
  metric_hierarchy: null,
};

describe("createTimeline", () => {
  it("creates an unlocked, empty root as the library does", () => {
    const document = run(empty(), create("a", q(6, 4)));
    expect(document.manifest.timelines).toEqual({ a: { ...fresh, id: "a", length: Q(3n, 2n) } });
    const named = run(empty(), { ...create("n"), name: "Score" });
    expect(timeline(named, "n").name).toBe("Score");
  });

  it("refuses", () => {
    const document = run(empty(), create("a"));
    expect(refusal(document, create("a"))).toEqual({ code: "duplicate_timeline", path: ["id"] });
    expect(refusal(document, { ...create("x"), unit: "seconds", length: seconds(1) })).toEqual({
      code: "unit_not_allowed",
      path: ["unit"],
    });
    expect(
      refusal(document, {
        ...create("x"),
        class: "DiscreteLogicalTimeline",
        unit: "ticks",
        length: { unit: "ticks", number_type: "fraction", value: [1, 1] },
      }),
    ).toEqual({ code: "number_type_not_allowed", path: ["number_type"] });
    expect(refusal(document, create("x", { ...q(1), number_type: "float", value: 1 }))).toEqual({
      code: "off_axis",
      path: ["length"],
    });
    expect(refusal(document, create("x", q(-1)))).toEqual({
      code: "negative_length",
      path: ["length"],
    });
    expect(refusal(document, create("x", { ...q(1), value: [2n ** 63n, 1n] }))).toEqual({
      code: "invalid_coordinate",
      path: ["length", "value"],
    });
  });
});

describe("edits keep member order", () => {
  it("renaming the deepest timeline of nested.json and back saves the fixture's bytes", () => {
    const fixture = goldenFixtures.find((item) => item.name === "nested.json");
    let deepest = Object.values(load("nested.json").manifest.timelines)[0] as TimelineManifest;
    while (Object.keys(deepest.children).length > 0) {
      deepest = (Object.values(deepest.children)[0] as { timeline: TimelineManifest }).timeline;
    }
    const renamed = run(load("nested.json"), { type: "setName", id: deepest.id, name: "x" });
    const back = run(renamed, { type: "setName", id: deepest.id, name: deepest.name });
    expect(saveDocument(back)).toBe(fixture?.text);
    for (const document of [
      renamed,
      run(load("nested.json"), { type: "removeChild", id: deepest.id }),
    ]) {
      const orders = manifestKeyOrders(document);
      expect(orders).toEqual(orders.map(() => [...TIMELINE_KEYS]));
    }
  });
});

describe("removeTimeline", () => {
  it("removes a root and its subtree", () => {
    const document = run(tree(), create("z"), { type: "removeTimeline", id: "a" });
    expect(Object.keys(document.manifest.timelines)).toEqual(["z"]);
  });

  it("refuses", () => {
    expect(refusal(tree(), { type: "removeTimeline", id: "q" })).toEqual({
      code: "unknown_timeline",
      path: ["id"],
    });
    expect(refusal(tree(), { type: "removeTimeline", id: "b" })).toEqual({
      code: "not_a_root",
      path: ["id"],
    });
  });
});

describe("setName", () => {
  it("sets a name and clears it", () => {
    const named = run(tree(), { type: "setName", id: "c", name: "Coda" });
    expect(timeline(named, "c").name).toBe("Coda");
    expect(timeline(run(named, { type: "setName", id: "c", name: null }), "c").name).toBe(null);
  });

  it("refuses", () => {
    expect(refusal(tree(), { type: "setName", id: "q", name: "x" })).toEqual({
      code: "unknown_timeline",
      path: ["id"],
    });
  });
});

describe("setLength", () => {
  it("lengthens, and shortens down to the end of the furthest child", () => {
    expect(
      timeline(run(tree(), { type: "setLength", id: "a", length: q(20) }), "a").length,
    ).toEqual(Q(20n));
    expect(timeline(run(tree(), { type: "setLength", id: "a", length: q(3) }), "a").length).toEqual(
      Q(3n),
    );
  });

  it("refuses", () => {
    expect(refusal(tree(), { type: "setLength", id: "q", length: q(3) })).toEqual({
      code: "unknown_timeline",
      path: ["id"],
    });
    expect(refusal(tree(), { type: "setLength", id: "b", length: q(3) })).toEqual({
      code: "locked",
      path: ["id"],
    });
    expect(refusal(tree(), { type: "setLength", id: "a", length: seconds(3) })).toEqual({
      code: "off_axis",
      path: ["length"],
    });
    expect(refusal(tree(), { type: "setLength", id: "a", length: q(5, 2) })).toEqual({
      code: "length_below_content",
      path: ["length"],
    });
  });
});

describe("addChild", () => {
  it("nests a new timeline, locked, at an exact offset", () => {
    const document = run(empty(), create("a"), {
      type: "addChild",
      parent: "a",
      offset: q(2, 4),
      child: spec("b", q(2)),
    });
    expect(timeline(document, "a").children).toEqual({
      b: { offset: Q(1n, 2n), timeline: { ...fresh, id: "b", length: Q(2n), locked: true } },
    });
  });

  it("moves an existing root under a parent", () => {
    const document = run(tree(), create("m", q(1)), {
      type: "addChild",
      parent: "c",
      offset: q(0),
      child: "m",
    });
    expect(Object.keys(document.manifest.timelines)).toEqual(["a"]);
    expect(timeline(document, "c").children).toEqual({
      m: { offset: Q(0n), timeline: { ...fresh, id: "m", length: Q(1n), locked: true } },
    });
  });

  it("lengthens an unlocked parent to the end of the child", () => {
    const document = run(empty(), create("a", q(4)), {
      type: "addChild",
      parent: "a",
      offset: q(7, 2),
      child: spec("b", q(1)),
    });
    expect(timeline(document, "a").length).toEqual(Q(9n, 2n));
  });

  it("nests a child of another number type, comparing and growing as Python does", () => {
    const axis = (numberType: string, value: unknown) => ({
      unit: "number",
      number_type: numberType,
      value,
    });
    const make = (id: string, numberType: string, length: unknown) => ({
      ...spec(id, axis(numberType, length)),
      unit: "number",
      number_type: numberType,
    });
    const grow = (parent: [string, unknown], offset: unknown, child: [string, unknown]) => {
      const document = run(
        empty(),
        { type: "createTimeline", ...make("p", ...parent) },
        {
          type: "addChild",
          parent: "p",
          offset: axis(parent[0], offset),
          child: make("c", ...child),
        },
      );
      return timeline(document, "p").length;
    };
    // int parent, Fraction child ending at 5: grows to the int 5.
    expect(grow(["int", 4], 3, ["fraction", [2, 1]])).toEqual({
      unit: "number",
      number_type: "int",
      value: 5,
    });
    // Fraction parent, int child ending at 11/2.
    expect(grow(["fraction", [9, 2]], [7, 2], ["int", 2])).toEqual({
      unit: "number",
      number_type: "fraction",
      value: [11, 2],
    });
    // float parent, int child ending at 5.5.
    expect(grow(["float", 4.5], 3.5, ["int", 2])).toEqual({
      unit: "number",
      number_type: "float",
      value: 5.5,
    });
    // A child within its parent leaves the parent's length as stored.
    expect(grow(["float", 9.5], 3.5, ["int", 2])).toEqual({
      unit: "number",
      number_type: "float",
      value: 9.5,
    });
  });

  it("refuses", () => {
    const base = tree();
    const add = (child: unknown, offset: object = q(0), parent = "a") => ({
      type: "addChild",
      parent,
      offset,
      child,
    });
    const other = {
      ...create("x", seconds(1)),
      class: "ContinuousPhysicalTimeline",
      unit: "seconds",
      number_type: "float",
    };
    const withRoot = run(base, create("r", q(1)), other);
    expect(refusal(base, add(spec("x"), q(0), "q"))).toEqual({
      code: "unknown_timeline",
      path: ["parent"],
    });
    expect(refusal(base, add(spec("x"), seconds(0)))).toEqual({
      code: "off_axis",
      path: ["offset"],
    });
    expect(refusal(base, add("q"))).toEqual({ code: "unknown_timeline", path: ["child"] });
    expect(refusal(base, add("c"))).toEqual({ code: "not_a_root", path: ["child"] });
    expect(refusal(base, add("a", q(0), "c"))).toEqual({
      code: "child_is_ancestor",
      path: ["child"],
    });
    expect(refusal(base, add("a", q(0), "a"))).toEqual({
      code: "child_is_ancestor",
      path: ["child"],
    });
    expect(refusal(base, add(spec("c")))).toEqual({
      code: "duplicate_timeline",
      path: ["child", "id"],
    });
    expect(
      refusal(base, add({ ...spec("x"), unit: "ticks", length: { ...q(1), unit: "ticks" } })),
    ).toEqual({
      code: "unit_not_allowed",
      path: ["child", "unit"],
    });
    expect(refusal(base, add(spec("x", q(-1))))).toEqual({
      code: "negative_length",
      path: ["child", "length"],
    });
    expect(refusal(withRoot, add("x"))).toEqual({ code: "child_unit_mismatch", path: ["child"] });
    const counted = run(empty(), {
      ...create("n", { unit: "number", number_type: "int", value: 4 }),
      unit: "number",
      number_type: "int",
    });
    const half = { unit: "number", number_type: "fraction", value: [3, 2] };
    expect(
      refusal(counted, {
        type: "addChild",
        parent: "n",
        offset: { unit: "number", number_type: "int", value: 3 },
        child: { ...spec("h", half), unit: "number", number_type: "fraction" },
      }),
    ).toEqual({ code: "child_exceeds_parent", path: ["offset"] });
    expect(refusal(withRoot, add("r", q(-1)))).toEqual({
      code: "negative_offset",
      path: ["offset"],
    });
    expect(refusal(withRoot, add("r", q(2), "b"))).toEqual({
      code: "child_exceeds_parent",
      path: ["offset"],
    });
  });
});

describe("setChildOffset", () => {
  it("moves a child, lengthening an unlocked parent", () => {
    const moved = run(tree(), { type: "setChildOffset", id: "b", offset: q(5, 2) });
    expect(timeline(moved, "a").children.b?.offset).toEqual(Q(5n, 2n));
    expect(timeline(moved, "a").length).toEqual(Q(8n));
    const past = run(tree(), { type: "setChildOffset", id: "b", offset: q(7) });
    expect(timeline(past, "a").length).toEqual(Q(9n));
  });

  it("refuses", () => {
    expect(refusal(tree(), { type: "setChildOffset", id: "q", offset: q(0) })).toEqual({
      code: "unknown_timeline",
      path: ["id"],
    });
    expect(refusal(tree(), { type: "setChildOffset", id: "a", offset: q(0) })).toEqual({
      code: "not_a_child",
      path: ["id"],
    });
    expect(refusal(tree(), { type: "setChildOffset", id: "c", offset: seconds(0) })).toEqual({
      code: "off_axis",
      path: ["offset"],
    });
    expect(refusal(tree(), { type: "setChildOffset", id: "c", offset: q(-1, 2) })).toEqual({
      code: "negative_offset",
      path: ["offset"],
    });
    expect(refusal(tree(), { type: "setChildOffset", id: "c", offset: q(3, 2) })).toEqual({
      code: "child_exceeds_parent",
      path: ["offset"],
    });
  });
});

describe("removeChild", () => {
  it("removes a nested timeline and its subtree", () => {
    const document = run(tree(), { type: "removeChild", id: "b" });
    expect(timeline(document, "a").children).toEqual({});
  });

  it("refuses", () => {
    expect(refusal(tree(), { type: "removeChild", id: "q" })).toEqual({
      code: "unknown_timeline",
      path: ["id"],
    });
    expect(refusal(tree(), { type: "removeChild", id: "a" })).toEqual({
      code: "not_a_child",
      path: ["id"],
    });
  });
});

describe("regions", () => {
  const withRegions = () =>
    run(
      tree(),
      { type: "addRegion", timeline: "a", name: "late", start: q(4), end: q(6) },
      { type: "addRegion", timeline: "a", name: "early", start: q(0), end: q(2), meta: { n: 1 } },
    );

  it("adds regions in canonical order", () => {
    expect(timeline(withRegions(), "a").regions).toEqual([
      { name: "early", start: Q(0n), end: Q(2n), meta: { n: 1 } },
      { name: "late", start: Q(4n), end: Q(6n), meta: {} },
    ]);
  });

  it("sets each of start, end and meta", () => {
    const base = withRegions();
    const set = (change: object) =>
      timeline(run(base, { type: "setRegion", timeline: "a", name: "late", ...change }), "a")
        .regions[1];
    expect(set({ start: q(5) })).toEqual({ name: "late", start: Q(5n), end: Q(6n), meta: {} });
    expect(set({ end: q(9) })).toEqual({ name: "late", start: Q(4n), end: Q(9n), meta: {} });
    expect(set({ meta: { a: "b" } })).toEqual({
      name: "late",
      start: Q(4n),
      end: Q(6n),
      meta: { a: "b" },
    });
  });

  it("removes a region", () => {
    const document = run(withRegions(), { type: "removeRegion", timeline: "a", name: "early" });
    expect(timeline(document, "a").regions.map((region) => region.name)).toEqual(["late"]);
  });

  it("refuses", () => {
    const base = withRegions();
    const add = { type: "addRegion", timeline: "a", name: "x", start: q(1), end: q(2) };
    expect(refusal(base, { ...add, timeline: "q" })).toEqual({
      code: "unknown_timeline",
      path: ["timeline"],
    });
    expect(refusal(base, { ...add, name: "late" })).toEqual({
      code: "duplicate_region",
      path: ["name"],
    });
    expect(refusal(base, { ...add, end: seconds(2) })).toEqual({ code: "off_axis", path: ["end"] });
    expect(refusal(base, { ...add, end: q(1, 2) })).toEqual({
      code: "region_end_before_start",
      path: ["end"],
    });
    const set = { type: "setRegion", timeline: "a", name: "late" };
    expect(refusal(base, { ...set, timeline: "q", meta: {} })).toEqual({
      code: "unknown_timeline",
      path: ["timeline"],
    });
    expect(refusal(base, { ...set, name: "x", meta: {} })).toEqual({
      code: "unknown_region",
      path: ["name"],
    });
    expect(refusal(base, { ...set, start: seconds(1) })).toEqual({
      code: "off_axis",
      path: ["start"],
    });
    expect(refusal(base, { ...set, start: q(7) })).toEqual({
      code: "region_end_before_start",
      path: ["start"],
    });
    expect(refusal(base, { ...set, end: q(3) })).toEqual({
      code: "region_end_before_start",
      path: ["end"],
    });
    const remove = { type: "removeRegion", timeline: "a", name: "x" };
    expect(refusal(base, { ...remove, timeline: "q" })).toEqual({
      code: "unknown_timeline",
      path: ["timeline"],
    });
    expect(refusal(base, remove)).toEqual({ code: "unknown_region", path: ["name"] });
  });
});

describe("breaks and jumps", () => {
  const fine = {
    coordinate: q(12),
    control_type: "fine",
    condition: "after_dc_ds",
    repeat_count: 1,
    label: "Fine",
    name: "fine",
    meta: { source: "synthetic" },
  };
  const section = { ...fine, coordinate: q(4), control_type: "section_break", label: null };
  const repeat = {
    from_coordinate: q(8),
    to_coordinate: q(2),
    control_type: "repeat_end",
    condition: "first_n",
    repeat_count: 2,
    target_name: "repeat-start",
    label: "Repeat",
    meta: { source: "synthetic" },
  };
  const flow = () => load("flow_control.json");
  const id = () => Object.keys(flow().manifest.timelines)[0] as string;
  // Entries are stored as given; their coordinates are already normalized.
  const stored = (entry: object, _keys: string[]) => entry;

  it("adds breaks in canonical order and removes the first equal one", () => {
    const twice = run(
      flow(),
      { type: "addBreak", timeline: id(), break: section },
      { type: "addBreak", timeline: id(), break: fine },
    );
    expect(timeline(twice, id()).flow_control.breaks).toEqual([
      stored(section, ["coordinate"]),
      stored(fine, ["coordinate"]),
      stored(fine, ["coordinate"]),
    ]);
    const once = run(twice, { type: "removeBreak", timeline: id(), break: fine });
    expect(timeline(once, id()).flow_control.breaks).toEqual([
      stored(section, ["coordinate"]),
      stored(fine, ["coordinate"]),
    ]);
  });

  it("adds and removes jumps", () => {
    const keys = ["from_coordinate", "to_coordinate"];
    const back = { ...repeat, from_coordinate: q(4), to_coordinate: q(0) };
    const added = run(flow(), { type: "addJump", timeline: id(), jump: back });
    expect(timeline(added, id()).flow_control.jumps).toEqual([
      stored(back, keys),
      stored(repeat, keys),
    ]);
    const removed = run(added, { type: "removeJump", timeline: id(), jump: repeat });
    expect(timeline(removed, id()).flow_control.jumps).toEqual([stored(back, keys)]);
  });

  it("refuses", () => {
    const base = flow();
    expect(refusal(base, { type: "addBreak", timeline: "q", break: fine })).toEqual({
      code: "unknown_timeline",
      path: ["timeline"],
    });
    expect(
      refusal(base, {
        type: "addBreak",
        timeline: id(),
        break: { ...fine, coordinate: seconds(1) },
      }),
    ).toEqual({ code: "off_axis", path: ["break", "coordinate"] });
    expect(refusal(base, { type: "removeBreak", timeline: id(), break: section })).toEqual({
      code: "unknown_break",
      path: ["break"],
    });
    expect(
      refusal(base, {
        type: "addJump",
        timeline: id(),
        jump: { ...repeat, to_coordinate: seconds(1) },
      }),
    ).toEqual({ code: "off_axis", path: ["jump", "to_coordinate"] });
    expect(
      refusal(base, { type: "removeJump", timeline: id(), jump: { ...repeat, repeat_count: 3 } }),
    ).toEqual({ code: "unknown_jump", path: ["jump"] });
  });
});

describe("markers", () => {
  const base = () =>
    run(tree(), { type: "setMarker", timeline: "a", name: "segno", coordinate: q(2) });

  it("adds, replaces and removes a marker", () => {
    expect(timeline(base(), "a").flow_control.markers).toEqual({ segno: Q(2n) });
    const moved = run(base(), {
      type: "setMarker",
      timeline: "a",
      name: "segno",
      coordinate: q(3),
    });
    expect(timeline(moved, "a").flow_control.markers).toEqual({ segno: Q(3n) });
    const removed = run(base(), { type: "removeMarker", timeline: "a", name: "segno" });
    expect(timeline(removed, "a").flow_control.markers).toEqual({});
  });

  it("refuses", () => {
    expect(
      refusal(base(), { type: "setMarker", timeline: "q", name: "coda", coordinate: q(1) }),
    ).toEqual({ code: "unknown_timeline", path: ["timeline"] });
    expect(
      refusal(base(), { type: "setMarker", timeline: "a", name: "coda", coordinate: seconds(1) }),
    ).toEqual({ code: "off_axis", path: ["coordinate"] });
    expect(refusal(base(), { type: "removeMarker", timeline: "a", name: "coda" })).toEqual({
      code: "unknown_marker",
      path: ["name"],
    });
  });
});

describe("conversion maps", () => {
  const linear = (id: string, sourceUnit: string | null = "quarters") => ({
    type: "LinearMap",
    id,
    name: null,
    source_unit: sourceUnit,
    target_unit: "seconds",
    scalar: [1, 2],
    offset: 0.5,
  });

  it("adds a payload verbatim, in id order, and removes it", () => {
    const document = run(
      tree(),
      { type: "addConversionMap", timeline: "a", map: linear("z") },
      { type: "addConversionMap", timeline: "a", map: linear("m", null) },
    );
    const stored = (id: string, sourceUnit: string | null) => ({
      ...linear(id, sourceUnit),
      scalar: [1, 2],
    });
    expect(timeline(document, "a").conversion_maps).toEqual([
      stored("m", null),
      stored("z", "quarters"),
    ]);
    const removed = run(document, { type: "removeConversionMap", timeline: "a", map_id: "z" });
    expect(timeline(removed, "a").conversion_maps).toEqual([stored("m", null)]);
  });

  it("refuses", () => {
    const base = run(tree(), { type: "addConversionMap", timeline: "a", map: linear("z") });
    expect(refusal(base, { type: "addConversionMap", timeline: "q", map: linear("y") })).toEqual({
      code: "unknown_timeline",
      path: ["timeline"],
    });
    expect(refusal(base, { type: "addConversionMap", timeline: "a", map: linear("z") })).toEqual({
      code: "duplicate_map",
      path: ["map", "id"],
    });
    expect(
      refusal(base, { type: "addConversionMap", timeline: "a", map: linear("y", "seconds") }),
    ).toEqual({ code: "map_source_unit_mismatch", path: ["map", "source_unit"] });
    expect(refusal(base, { type: "removeConversionMap", timeline: "a", map_id: "y" })).toEqual({
      code: "unknown_map",
      path: ["map_id"],
    });
  });
});

describe("parseCommand refuses malformed commands", () => {
  const cases: [string, unknown, string, (string | number)[]][] = [
    ["not an object", [], "invalid_command", []],
    ["an unknown type", { type: "moveTimeline" }, "invalid_command", ["type"]],
    ["a missing member", { type: "setName", id: "a" }, "invalid_command", ["name"]],
    ["an unknown member", { type: "removeTimeline", id: "a", at: 1 }, "invalid_command", ["at"]],
    ["a wrong type", { type: "removeTimeline", id: 3 }, "invalid_command", ["id"]],
    ["an unknown class", { ...create("x"), class: "Timeline" }, "invalid_command", ["class"]],
    ["an unknown unit", { ...create("x"), unit: "bars" }, "invalid_command", ["unit"]],
    [
      "an unknown number type",
      { ...create("x"), number_type: "real" },
      "invalid_command",
      ["number_type"],
    ],
    [
      "an extra coordinate member",
      { type: "setLength", id: "a", length: { ...q(1), id: "x" } },
      "invalid_command",
      ["length", "id"],
    ],
    [
      "an unreadable coordinate",
      { type: "setLength", id: "a", length: { ...q(1), value: [1, 0] } },
      "invalid_coordinate",
      ["length", "value"],
    ],
    [
      "a non-finite number",
      {
        type: "addRegion",
        timeline: "a",
        name: "r",
        start: q(0),
        end: q(1),
        meta: { x: Infinity },
      },
      "invalid_command",
      ["meta", "x"],
    ],
    [
      "a non-plain object",
      { type: "addRegion", timeline: "a", name: "r", start: q(0), end: q(1), meta: new Date(0) },
      "invalid_command",
      ["meta"],
    ],
    ["an empty setRegion", { type: "setRegion", timeline: "a", name: "r" }, "invalid_command", []],
    [
      "a break off the schema",
      { type: "addBreak", timeline: "a", break: { coordinate: q(1), control_type: "fine" } },
      "schema_violation",
      ["break"],
    ],
    [
      "a break with an unknown condition",
      {
        type: "addBreak",
        timeline: "a",
        break: {
          coordinate: q(1),
          control_type: "fine",
          condition: "sometimes",
          repeat_count: 1,
          label: null,
          name: null,
          meta: {},
        },
      },
      "schema_violation",
      ["break", "condition"],
    ],
    [
      "a map of an unknown type",
      { type: "addConversionMap", timeline: "a", map: { type: "WarpMap", id: "w" } },
      "schema_violation",
      ["map"],
    ],
  ];

  it.each(cases)("%s", (_, input, code, path) => {
    const result = parseCommand(input);
    expect(isCommandError(result) ? { code: result.code, path: result.path } : result).toEqual({
      code,
      path,
    });
    expect(
      isCommandError(apply(empty(), input as Command)) &&
        (apply(empty(), input as Command) as { code: string }).code,
    ).toBe(code);
  });

  it("normalizes numbers: safe integers as integers, a float coordinate as a float", () => {
    expect(
      parseCommand({ type: "setLength", id: "a", length: { ...seconds(0), value: 3 } }),
    ).toEqual({
      type: "setLength",
      id: "a",
      length: { unit: "seconds", number_type: "float", value: new JsonFloat(3) },
    });
    expect(parseCommand({ type: "setLength", id: "a", length: q(6, 4) })).toEqual({
      type: "setLength",
      id: "a",
      length: Q(3n, 2n),
    });
  });
});
