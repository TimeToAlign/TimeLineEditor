import { JsonFloat } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { Command, Manifest, ManifestCommand, TimelineManifest } from "../src/index.ts";
import {
  applyToManifest,
  isCommandError,
  parseCommand as parse,
  saveManifest,
  TIMELINE_KEYS,
} from "../src/index.ts";
import { deepFreeze, load, manifestFixtures, manifestKeyOrders } from "./support.ts";

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
const BLOCK = "0000000000";

function contextual(command: object): ManifestCommand {
  const value = { ...command } as Record<string, unknown>;
  for (const key of ["id", "parent", "timeline"] as const) {
    if (value[key] === "a") value[key] = "bare";
  }
  return { block: BLOCK, ...value } as ManifestCommand;
}

const parseCommand = (command: unknown) =>
  parse(typeof command === "object" && command !== null ? contextual(command as object) : command);
const apply = (manifest: Manifest, command: Command) =>
  applyToManifest(manifest, contextual(command));

/** Apply commands in turn; each must be accepted. Inputs are frozen first. */
function run(manifest: Manifest, ...commands: object[]): Manifest {
  let current = deepFreeze(manifest);
  for (const command of commands) {
    const result = apply(current, command as Command);
    if (isCommandError(result)) throw new Error(`${JSON.stringify(command)}: ${result.message}`);
    current = deepFreeze(result);
  }
  return current;
}

/** The refusal of a command: its code and path; the frozen input proves nothing changed. */
function refusal(manifest: Manifest, command: object) {
  const result = apply(deepFreeze(manifest), command as Command);
  if (!isCommandError(result)) throw new Error("the command was accepted");
  return { code: result.code, path: result.path };
}

function timeline(manifest: Manifest, id: string): TimelineManifest {
  const wanted = id === "a" ? "bare" : id;
  const search = (item: TimelineManifest): TimelineManifest | undefined =>
    item.id === wanted
      ? item
      : Object.values(item.children)
          .map((entry) => search(entry.timeline))
          .find((found) => found !== undefined);
  const found = search(manifest.timeline);
  if (found !== undefined) return found;
  throw new Error(`no timeline ${id}`);
}

const empty = () => load("bare.json");
const numberRoot = (numberType: "int" | "float" | "fraction", value: unknown): Manifest => {
  const manifest = empty();
  return {
    ...manifest,
    timeline: {
      ...manifest.timeline,
      id: "p",
      class: "ContinuousLogicalTimeline",
      unit: "number",
      number_type: numberType,
      length: { unit: "number", number_type: numberType, value } as never,
      children: {},
      conversion_maps: [],
      regions: [],
      flow_control: { breaks: [], jumps: [], markers: {} },
      measure_map: null,
      metric_hierarchy: null,
    },
  };
};
/** Root `a` (length 8) with child `b` (length 2) at offset 1 holding `c` (length 1) at 0. */
const tree = () =>
  run(
    empty(),
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

describe("edits keep member order", () => {
  it("renaming the deepest timeline of nested.json and back saves the fixture's bytes", () => {
    const fixture = manifestFixtures.find((item) => item.name === "nested.json");
    let deepest = load("nested.json").timeline;
    while (Object.keys(deepest.children).length > 0) {
      deepest = (Object.values(deepest.children)[0] as { timeline: TimelineManifest }).timeline;
    }
    const renamed = run(load("nested.json"), { type: "setName", id: deepest.id, name: "x" });
    const back = run(renamed, { type: "setName", id: deepest.id, name: deepest.name });
    expect(saveManifest(back)).toBe(fixture?.text);
    for (const manifest of [
      renamed,
      run(load("nested.json"), { type: "removeChild", id: deepest.id }),
    ]) {
      const orders = manifestKeyOrders(manifest);
      expect(orders).toEqual(orders.map(() => [...TIMELINE_KEYS]));
    }
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
    const manifest = run(empty(), {
      type: "addChild",
      parent: "a",
      offset: q(2, 4),
      child: spec("b", q(2)),
    });
    expect(timeline(manifest, "a").children).toEqual({
      b: { offset: Q(1n, 2n), timeline: { ...fresh, id: "b", length: Q(2n), locked: true } },
    });
  });

  it("lengthens an unlocked parent to the end of the child", () => {
    const manifest = run(empty(), {
      type: "addChild",
      parent: "a",
      offset: q(15, 2),
      child: spec("b", q(1)),
    });
    expect(timeline(manifest, "a").length).toEqual(Q(17n, 2n));
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
      const manifest = run(numberRoot(parent[0] as never, parent[1]), {
        type: "addChild",
        parent: "p",
        offset: axis(parent[0], offset),
        child: make("c", ...child),
      });
      return timeline(manifest, "p").length;
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
      id: "x",
      class: "ContinuousPhysicalTimeline",
      unit: "seconds",
      number_type: "float",
      length: seconds(1),
    };
    expect(refusal(base, add(spec("x"), q(0), "q"))).toEqual({
      code: "unknown_timeline",
      path: ["parent"],
    });
    expect(refusal(base, add(spec("x"), seconds(0)))).toEqual({
      code: "off_axis",
      path: ["offset"],
    });
    expect(refusal(base, add("q"))).toEqual({ code: "invalid_command", path: ["child"] });
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
    expect(refusal(base, add(other))).toEqual({
      code: "child_unit_mismatch",
      path: ["child", "unit"],
    });
    const counted = numberRoot("int", 4);
    const half = { unit: "number", number_type: "fraction", value: [3, 2] };
    expect(
      refusal(counted, {
        type: "addChild",
        parent: "p",
        offset: { unit: "number", number_type: "int", value: 3 },
        child: { ...spec("h", half), unit: "number", number_type: "fraction" },
      }),
    ).toEqual({ code: "child_exceeds_parent", path: ["offset"] });
    expect(refusal(base, add(spec("r"), q(-1)))).toEqual({
      code: "negative_offset",
      path: ["offset"],
    });
    expect(refusal(base, add(spec("r"), q(2), "b"))).toEqual({
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
    const manifest = run(tree(), { type: "removeChild", id: "b" });
    expect(timeline(manifest, "a").children).toEqual({});
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
    const manifest = run(withRegions(), { type: "removeRegion", timeline: "a", name: "early" });
    expect(timeline(manifest, "a").regions.map((region) => region.name)).toEqual(["late"]);
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
  const id = () => flow().timeline.id;
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
    const manifest = run(
      tree(),
      { type: "addConversionMap", timeline: "a", map: linear("z") },
      { type: "addConversionMap", timeline: "a", map: linear("m", null) },
    );
    const stored = (id: string, sourceUnit: string | null) => ({
      ...linear(id, sourceUnit),
      scalar: [1, 2],
    });
    expect(timeline(manifest, "a").conversion_maps).toEqual([
      stored("m", null),
      stored("z", "quarters"),
    ]);
    const removed = run(manifest, { type: "removeConversionMap", timeline: "a", map_id: "z" });
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
    ["not an object", null, "invalid_command", []],
    ["an unknown type", { type: "moveTimeline" }, "invalid_command", ["type"]],
    ["a missing member", { type: "setName", id: "a" }, "invalid_command", ["name"]],
    ["an unknown member", { type: "removeChild", id: "a", at: 1 }, "invalid_command", ["at"]],
    ["a wrong type", { type: "removeChild", id: 3 }, "invalid_command", ["id"]],
    [
      "an unknown class",
      { type: "addChild", parent: "a", offset: q(0), child: { ...spec("x"), class: "Timeline" } },
      "invalid_command",
      ["child", "class"],
    ],
    [
      "an unknown unit",
      { type: "addChild", parent: "a", offset: q(0), child: { ...spec("x"), unit: "bars" } },
      "invalid_command",
      ["child", "unit"],
    ],
    [
      "an unknown number type",
      { type: "addChild", parent: "a", offset: q(0), child: { ...spec("x"), number_type: "real" } },
      "invalid_command",
      ["child", "number_type"],
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
      block: BLOCK,
      id: "bare",
      length: { unit: "seconds", number_type: "float", value: new JsonFloat(3) },
    });
    expect(parseCommand({ type: "setLength", id: "a", length: q(6, 4) })).toEqual({
      type: "setLength",
      block: BLOCK,
      id: "bare",
      length: Q(3n, 2n),
    });
  });
});
