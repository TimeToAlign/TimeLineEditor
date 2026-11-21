import type { TimeUnit } from "@timetoalign/timetoshare";
import {
  dumps,
  JsonFloat,
  loads,
  SCHEMA_VERSION,
  UNITS,
  withBareIds,
} from "@timetoalign/timetoshare";
import { describe, expect, it, vi } from "vitest";
import { apply } from "../src/commands/apply.ts";
import type { LoadError } from "../src/errors.ts";
import { InvalidManifestError, isCommandError, isLoadError } from "../src/errors.ts";
import {
  completeOrdered,
  loadManifest,
  normalizeManifest,
  readEntry,
  saveManifest,
  unknownKeys,
} from "../src/manifest/io.ts";
import type { Located } from "../src/manifest/tree.ts";
import { locateTimeline } from "../src/manifest/tree.ts";
import type { Manifest, TimelineManifest } from "../src/manifest/types.ts";
import { createView } from "../src/workspace/view.ts";
import {
  A,
  allFixtures,
  at,
  block,
  changed,
  fileText,
  fixture,
  load,
  loadText,
  manifestValue,
  NON_FINITE,
  refusal,
  rejections,
} from "./support.ts";

function refused(text: string): LoadError {
  const result = loadManifest(text);
  if (!isLoadError(result)) throw new Error("the manifest was accepted");
  return result;
}

const problems = (text: string) => refused(text).problems.map(({ code, path }) => ({ code, path }));

/** How a manifest is written in the complete form, with its styling, in canonical YAML. */
const COMPLETE = { minimal: false } as const;

type Node = Record<string, unknown>;
const node = (value: unknown, ...keys: (string | number)[]): Node =>
  keys.reduce<unknown>((current, key) => (current as Node)[key], value) as Node;

describe("fixture manifests round-trip byte for byte", () => {
  it.each(allFixtures.map((fixture) => [fixture.name, fixture.text]))("%s", (_, text) => {
    expect(saveManifest(loadText(text), COMPLETE)).toBe(text);
  });

  it.each(allFixtures.map((fixture) => [fixture.name, fixture.text, fixture.twin]))(
    "the minimal twin of %s",
    (_, text, twin) => {
      const manifest = loadText(twin);
      expect(saveManifest(manifest, COMPLETE)).toBe(text);
      expect(saveManifest(manifest)).toBe(twin);
    },
  );
});

describe("shared rejections", () => {
  it.each(rejections.map((item) => [item.name, item]))("%s", (_, item) => {
    if (item.nonFinite === undefined) {
      expect(refused(item.text).problems.map((problem) => problem.path)).toEqual([item.path]);
      return;
    }
    // JSON carries no infinity and no NaN: the case names the one to put at its path.
    const value = loads(item.text);
    let owner: unknown = value;
    const [last, ...above] = [...item.path].reverse();
    for (const segment of above.reverse()) {
      owner = typeof owner === "object" && owner !== null ? Reflect.get(owner, segment) : undefined;
    }
    if (typeof owner !== "object" || owner === null || last === undefined) {
      throw new Error(`${item.name}: nothing at its path`);
    }
    Reflect.set(owner, last, NON_FINITE[item.nonFinite]);
    const result = normalizeManifest(value);
    if (!isLoadError(result)) throw new Error(`${item.name} was accepted`);
    expect(result.problems.map((problem) => problem.path)).toEqual([item.path]);
  });
});

describe("the version marker", () => {
  it("refuses another version at the marker and a value without one at the top", () => {
    const value = manifestValue("bare.yaml");
    expect(problems(fileText({ ...value, timetoshare: "0.6.0" }))).toEqual([
      { code: "schema_violation", path: ["timetoshare"] },
    ]);
    const { timetoshare: _, ...unmarked } = value;
    expect(problems(fileText(unmarked))).toEqual([{ code: "schema_violation", path: [] }]);
  });
});

describe("the minimal form in, either form out", () => {
  it("supplies every default of bare.yaml and adds no absent key", () => {
    const root = {
      id: "bare",
      name: "Bare",
      unit: "quarters",
      number_type: "fraction",
      length: [8, 1],
      locked: false,
      is_segment_line: false,
      meta: {},
      children: [],
      conversion_maps: [],
      regions: [],
      flow_control: [],
    };
    const {
      meta: _,
      graphical: __,
      ...twin
    } = loads(fixture("bare.yaml").twin) as Record<string, unknown>;
    expect(loadText(dumps(twin))).toEqual({
      timetoshare: SCHEMA_VERSION,
      name: null,
      meta: {},
      groups: [],
      measure_maps: [],
      resources: [],
      timelines: [root],
    });
  });
});

describe("unknown keys", () => {
  it("are kept through loading, commands and saving, and listed", () => {
    const value = manifestValue("bare.yaml");
    const [root] = value.timelines as Node[];
    const text = fileText({
      ...value,
      "x-top": 1,
      timelines: [
        {
          ...root,
          "x-root": { a: [1, 2] },
          regions: [{ id: "region_1", start: [2, 1], end: [4, 1], "x-region": "kept" }],
        },
      ],
    });
    const manifest = loadText(text);
    const kept = (held: unknown) => [
      node(held, "x-top"),
      node(held, "timelines", 0, "x-root"),
      node(held, "timelines", 0, "regions", 0, "x-region"),
    ];
    expect(kept(manifest)).toEqual([1, { a: [1, 2] }, "kept"]);
    let view = changed(createView(), {
      type: "add",
      into: {},
      block: { id: A, manifest, x: 0, y: 0 },
    });
    view = changed(view, {
      type: "set",
      changes: [{ target: at("bare"), values: { name: "B" } }],
    });
    view = changed(view, {
      type: "add",
      into: at("bare"),
      flow_control: { id: "fine", type: "flow_marker", manifestation: "fine", coordinate: [1, 1] },
    });
    const edited = block(view).manifest;
    expect(kept(edited)).toEqual([1, { a: [1, 2] }, "kept"]);
    expect(kept(loads(saveManifest(edited)))).toEqual([1, { a: [1, 2] }, "kept"]);
    expect(unknownKeys(edited)).toEqual([
      { path: [], key: "x-top" },
      { path: ["timelines", 0], key: "x-root" },
      { path: ["timelines", 0, "regions", 0], key: "x-region" },
    ]);
  });
});

describe("graphical styles", () => {
  it("warns once and completes every missing named style", () => {
    const value = manifestValue("bare.yaml");
    const graphical = {
      styles: { kept: { fill: "#ABCDEF" } },
      rules: [
        { select: {}, set: "z" },
        { select: {}, set: "a" },
        { select: {}, set: "z" },
        { select: {}, set: "kept" },
      ],
    };
    const text = fileText({ ...value, graphical });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const manifest = loadText(text);
    expect(warn).toHaveBeenCalledExactlyOnceWith("Missing graphical styles: 'a', 'z'");
    expect(manifest.graphical?.styles).toEqual({ kept: { fill: "#ABCDEF" }, a: {}, z: {} });
    expect(graphical.styles).toEqual({ kept: { fill: "#ABCDEF" } });
    warn.mockRestore();
  });

  it("reads a declaration's integral float as the double it equals", () => {
    const { text } = fixture("styled__score.yaml");
    const spelled = /^( *(?:stroke-width|opacity|font-size|rx|max-width): )(\d+)$/gm;
    const floats = text.replace(spelled, "$1$2.0");
    expect(floats.match(/: \d+\.0$/gm)).toEqual([
      ": 4.0",
      ": 2.0",
      ": 10.0",
      ": 12.0",
      ": 120.0",
      ": 4.0",
    ]);
    const manifest = loadText(floats);
    expect(manifest).toEqual(load("styled__score.yaml"));
    expect(saveManifest(manifest, COMPLETE)).toBe(text);
    // Every key stays where the text wrote it: a number made a double keeps its place.
    const { graphical } = manifest;
    expect(Object.keys(graphical ?? {})).toEqual([
      "matchstamps",
      "order",
      "rules",
      "styles",
      "timestamps",
    ]);
    const jump = graphical?.rules?.find((rule) => rule.select.element === "jump_from");
    expect(Object.keys(jump?.set ?? {})).toEqual(["fill", "stroke", "stroke-width"]);
    expect(Object.keys(graphical?.styles?.accent ?? {})).toEqual(
      Object.keys(node(manifestValue("styled__score.yaml"), "graphical", "styles", "accent")),
    );
  });

  it("reads a wedge's rotation as a double, an integral float equal to it", () => {
    const { text } = fixture("timestamp_wedge_rotation.yaml");
    const rotations = (manifest: Manifest) =>
      (manifest.graphical?.rules ?? []).map((rule) =>
        typeof rule.set === "string" ? undefined : rule.set.rotation,
      );
    const read = load("timestamp_wedge_rotation.yaml");
    expect(rotations(read)).toEqual([90, -135, -45, 0, 45, 135, 180, -45, 45]);
    const floats = text.replace(/^( *rotation: )(-?\d+)$/gm, "$1$2.0");
    expect(floats.match(/rotation: -?\d+\.0$/gm)).toHaveLength(9);
    const manifest = loadText(floats);
    expect(manifest).toEqual(read);
    expect(saveManifest(manifest, COMPLETE)).toBe(text);
  });

  it("reads an integer beyond 2^53 only where a double holds it exactly", () => {
    const value = manifestValue("bare.yaml");
    const exact = 2n ** 53n;
    const rules = [{ select: {}, set: { "stroke-width": exact } }];
    const held = loadText(fileText({ ...value, graphical: { rules } }));
    expect(held.graphical?.rules).toEqual([{ select: {}, set: { "stroke-width": 2 ** 53 } }]);
    const styles = { wide: { opacity: 0.5, "stroke-width": exact + 1n } };
    expect(refused(fileText({ ...value, graphical: { styles } })).problems).toEqual([
      {
        code: "invalid_value",
        message: "9007199254740993 has no exact double",
        path: ["graphical", "styles", "wide", "stroke-width"],
      },
    ]);
  });
});

describe("lossless numbers", () => {
  /** A fixture's text with its first root's length replaced by `length`. */
  const withLength = (name: string, length: unknown) => {
    const value = manifestValue(name);
    const [root, ...rest] = value.timelines as Record<string, unknown>[];
    return fileText({ ...value, timelines: [{ ...root, length }, ...rest] });
  };

  it("keeps an int above 2^53", () => {
    const text = withLength("discrete_logical.yaml", 9007199254740993n);
    const manifest = loadText(text);
    expect(manifest.timelines[0]?.length).toBe(9007199254740993n);
    expect(saveManifest(manifest, COMPLETE)).toBe(text);
    expect(saveManifest(manifest)).toContain("length: 9007199254740993\n");
  });

  it("keeps a Fraction component above 2^53", () => {
    const text = withLength("continuous_logical.yaml", [9007199254740993n, 1]);
    const manifest = loadText(text);
    expect(manifest.timelines[0]?.length).toEqual([9007199254740993n, 1]);
    expect(saveManifest(manifest, COMPLETE)).toBe(text);
  });
});

describe("canonical order", () => {
  it("refuses a value it cannot order with the schema's problem", () => {
    const value = manifestValue("bare.yaml");
    const [root] = value.timelines as Node[];
    const regions = [
      { id: "region_1", start: [0, 1], end: [1, 1] },
      { id: "region_2", start: "later", end: [1, 1] },
    ];
    const unordered = { ...value, timelines: [{ ...root, regions }] };
    expect(completeOrdered(unordered)).toEqual({
      code: "schema_violation",
      message: "must be number",
      path: ["timelines", 0, "regions", 1, "start"],
    });
  });

  it("orders flow-control elements at one coordinate by id in code-point order", () => {
    const value = manifestValue("bare.yaml");
    const [root] = value.timelines as Node[];
    const flow_control = ["\u{1F3B5}", "～"].map((id) => ({
      id,
      type: "jump_to",
      manifestation: "segno",
      coordinate: [1, 1],
    }));
    const text = fileText({ ...value, timelines: [{ ...root, flow_control }] });
    const saved = loads(saveManifest(loadText(text)));
    const ordered = node(saved, "timelines", 0).flow_control as Node[];
    expect(ordered.map((element) => element.id)).toEqual(["#～", "#\u{1F3B5}"]);
  });
});

describe("invariants", () => {
  const base = () => manifestValue("with_region.yaml");
  const rootPath = ["timelines", 0];
  const childPath = [...rootPath, "children", 0];

  it("lists three violations in traversal order", () => {
    const value = base();
    const root = node(value, ...rootPath);
    const [region] = root.regions as Node[];
    Object.assign(node(value, ...childPath), {
      regions: [{ ...region, id: "region_2", start: [1, 1], end: [0, 1] }],
    });
    Object.assign(node(value, ...rootPath, "children", 1), { offset: [-1, 1] });
    Object.assign(root, { regions: [{ ...region, end: [0, 1] }] });
    const text = fileText(value);
    // At -1, clt_3 comes before clt_2 in canonical order.
    expect(problems(text)).toEqual([
      { code: "negative_child_offset", path: [...rootPath, "children", 0, "offset"] },
      { code: "region_end_before_start", path: [...rootPath, "children", 1, "regions", 0, "end"] },
      { code: "region_end_before_start", path: [...rootPath, "regions", 0, "end"] },
    ]);
    const loaded = load("with_region.yaml");
    const [timeline] = loaded.timelines;
    const [first] = timeline?.regions ?? [];
    if (timeline === undefined || first === undefined) throw new Error("the fixture has a region");
    const backwards = { ...first, end: [0, 1] as const };
    const invalid: Manifest = { ...loaded, timelines: [{ ...timeline, regions: [backwards] }] };
    expect(() => saveManifest(invalid)).toThrow(InvalidManifestError);
  });

  const cases: [string, (manifest: Node) => void, (string | number)[]][] = [
    [
      "region_end_before_start",
      (manifest) => Object.assign(node(manifest, ...rootPath, "regions", 0), { end: [1, 1] }),
      [...rootPath, "regions", 0, "end"],
    ],
  ];

  /** Every unit with every number type, as TimeToShare's unit table lists them. */
  const axes = (Object.keys(UNITS) as TimeUnit[]).flatMap((unit) =>
    (["int", "float", "fraction"] as const).map((numberType) => [unit, numberType] as const),
  );

  it("admits exactly the number types TimeToShare's unit table admits", () => {
    // The root alone, of unknown length, so no value on the axis is read; its timestamps lie
    // on its former axis and go with it.
    const read = axes.map(([unit, numberType]) => {
      const value = base();
      Object.assign(node(value, ...rootPath), {
        unit,
        number_type: numberType,
        length: null,
        children: [],
        regions: [],
      });
      delete value.graphical;
      const result = loadManifest(fileText(value));
      return isLoadError(result) ? result.problems.map(({ code, path }) => ({ code, path })) : [];
    });
    expect(read).toEqual(
      axes.map(([unit, numberType]) =>
        UNITS[unit].numberTypes.includes(numberType)
          ? []
          : [{ code: "schema_violation", path: [...rootPath, "number_type"] }],
      ),
    );
    expect(axes.filter(([unit, type]) => UNITS[unit].numberTypes.includes(type)).length).toBe(
      4 + 3 + 2 * 13,
    );
  });

  it("accepts a child of another number type", () => {
    const value = base();
    Object.assign(node(value, ...childPath), { number_type: "float", length: new JsonFloat(4) });
    const text = fileText(value);
    expect(text.includes("length: 4.0\n")).toBe(true);
    expect(saveManifest(loadText(text), COMPLETE)).toBe(text);
  });

  it.each(cases)("%s", (code, change, expectedPath) => {
    const value = base();
    change(value);
    expect(problems(fileText(value))).toEqual([{ code, path: expectedPath }]);
  });

  it.each([
    [
      "a child of another unit",
      { unit: "whole_notes" },
      [...childPath, "unit"],
      "child 'clt_2' has unit 'whole_notes', its parent 'clt_1' has 'quarters'",
    ],
    [
      // Placed at 9, the child comes after its sibling at 2 in canonical order.
      "a child ending past its parent",
      { offset: [9, 1] },
      [...rootPath, "children", 1, "length"],
      "child 'clt_2' ends at [13, 1], beyond the length [12, 1] of its parent 'clt_1'",
    ],
    [
      "a map of another source unit",
      {
        conversion_maps: [
          { type: "LinearMap", id: "seconds", source_unit: "seconds", target_unit: null },
        ],
      },
      [...rootPath, "conversion_maps", 0, "source_unit"],
      "LinearMap 'seconds' has source unit 'seconds', its timeline 'clt_1' has 'quarters'",
      rootPath,
    ],
  ])("leaves %s to the schema", (_, change, path, message, at = childPath) => {
    const value = base();
    Object.assign(node(value, ...at), change);
    expect(refused(fileText(value)).problems).toEqual([
      { code: "schema_violation", message, path },
    ]);
  });

  it("refuses a negative child offset itself, which the schema accepts", () => {
    const value = base();
    Object.assign(node(value, ...childPath), { offset: [-1, 3] });
    expect(refused(fileText(value)).problems).toEqual([
      {
        code: "negative_child_offset",
        message: "A negative child offset is not supported yet: child 'clt_2' has offset [-1, 3].",
        path: [...childPath, "offset"],
      },
    ]);
  });

  it.each([
    ["an int", "ticks", 10, 2, -1, "-1"],
    ["a float", "seconds", new JsonFloat(10), new JsonFloat(2), new JsonFloat(-1), "-1.0"],
  ])(
    "spells a negative child offset on %s axis as the file writes it",
    (_, unit, length, part, offset, spelled) => {
      const child = { id: "part", unit, length: part, offset };
      const value = {
        timetoshare: SCHEMA_VERSION,
        timelines: [{ id: "take", unit, length, children: [child] }],
      };
      expect(refused(fileText(value)).problems).toEqual([
        {
          code: "negative_child_offset",
          message: `A negative child offset is not supported yet: child 'part' has offset ${spelled}.`,
          path: ["timelines", 0, "children", 0, "offset"],
        },
      ]);
    },
  );

  it("refuses malformed text", () => {
    expect(problems('{"timetoshare": ')).toEqual([{ code: "invalid_json", path: [] }]);
    expect(problems("timelines: [")).toEqual([{ code: "invalid_yaml", path: [] }]);
    expect(problems('timetoshare: "0.2.0"\ntimetoshare: "0.2.0"\ntimelines: []\n')).toEqual([
      { code: "invalid_yaml", path: [] },
    ]);
  });

  it("checks commands with the same invariants", () => {
    const view = changed(createView(), {
      type: "add",
      into: {},
      block: { id: A, manifest: load("with_region.yaml"), x: 0, y: 0 },
    });
    const result = apply(view, {
      type: "set",
      changes: [{ target: at("region_1"), values: { end: [0, 1] } }],
    });
    expect(isCommandError(result) ? [result.code, result.path] : result).toEqual([
      "region_end_before_start",
      [A, "manifest", ...rootPath, "regions", 0, "end"],
    ]);
  });
});

describe("segments read unlocked", () => {
  /** `segment_line.yaml` with the `locked` of some timelines stated, read. */
  function read(stated: Record<string, boolean>): Manifest {
    const state = (timeline: Node): Node => ({
      ...timeline,
      ...(Object.hasOwn(stated, timeline.id as string)
        ? { locked: stated[timeline.id as string] }
        : {}),
      children: (timeline.children as Node[]).map(state),
    });
    const value = manifestValue("segment_line.yaml");
    return loadText(fileText({ ...value, timelines: (value.timelines as Node[]).map(state) }));
  }
  /** Every timeline's `locked`, by id. */
  function locks(manifest: Manifest): Record<string, unknown> {
    const found: Record<string, unknown> = {};
    const walk = (timeline: TimelineManifest) => {
      found[timeline.id] = timeline.locked;
      for (const child of timeline.children) walk(child);
    };
    for (const root of manifest.timelines) walk(root);
    return found;
  }
  const SEGMENTS = ["a1", "b1", "b2", "c1"];

  it("unlocks every segment whatever its file states and keeps every other lock", () => {
    const manifest = read({ b1: true, b2: false });
    expect(locks(manifest)).toEqual({
      form: false,
      a: true,
      a1: false,
      b: true,
      b1: false,
      b2: false,
      c: true,
      c1: false,
    });
    expect(manifest).toEqual(read(Object.fromEntries(SEGMENTS.map((id) => [id, false]))));
  });

  it("keeps a stated unlock on a segment line that is a segment", () => {
    expect(locks(read({ b: false })).b).toBe(false);
  });

  it("writes the segments unlocked", () => {
    const manifest = read({ a1: true, b1: true, b2: true, c1: true });
    const saved = locks(loadText(saveManifest(manifest)));
    expect(SEGMENTS.map((id) => saved[id])).toEqual([false, false, false, false]);
    const complete = withBareIds(loads(saveManifest(manifest, COMPLETE)));
    const minimal = withBareIds(loads(saveManifest(manifest)));
    const stated = (value: unknown) => {
      const found: Record<string, unknown> = {};
      const walk = (timeline: Node) => {
        found[timeline.id as string] = Object.hasOwn(timeline, "locked")
          ? timeline.locked
          : "absent";
        for (const child of (timeline.children as Node[] | undefined) ?? []) walk(child);
      };
      for (const root of (value as Node).timelines as Node[]) walk(root);
      return SEGMENTS.map((id) => found[id]);
    };
    expect(stated(complete)).toEqual([false, false, false, false]);
    expect(stated(minimal)).toEqual(["absent", "absent", "absent", "absent"]);
  });
});

describe("an entry given to a command", () => {
  const manifest = load("map.yaml");
  /** The timeline `id` of `manifest`, located. */
  const located = (id: string): Located => {
    const at = locateTimeline(manifest, id);
    if (at === undefined) throw new Error(`map.yaml has ${id}`);
    return at;
  };
  const melody = located("melody");
  const tempo = {
    id: "tempo",
    scalar: [1, 2],
    source_unit: "quarters",
    target_unit: "seconds",
    type: "LinearMap",
  };

  it("reads an accepted map in its complete form", () => {
    expect(readEntry("map", tempo, melody, 0, manifest)).toEqual({
      ...tempo,
      name: null,
      offset: 0,
    });
    expect(readEntry("map", { ...tempo, id: "second" }, located("phrase"), 1, manifest)).toEqual({
      ...tempo,
      id: "second",
      name: null,
      offset: 0,
    });
  });

  it("refuses a region at its path from the timeline that will list it", () => {
    const region = { id: "verse\tchorus", start: [0, 1], end: [2, 1] };
    expect(refusal(readEntry("region", region, melody, 0, manifest))).toEqual({
      code: "schema_violation",
      path: ["regions", 0, "id"],
    });
  });

  it("reads a measure view beside the measure maps of its manifest", () => {
    const bars = {
      id: "bars",
      name: null,
      meta: {},
      rows: [{ count: 1, qstamp: [0, 1] as const }],
    };
    const view = {
      id: "x_record",
      type: "MeasureRecordMap",
      source_unit: "quarters",
      target_unit: null,
      measure_map: "bars",
    };
    const index = melody.timeline.conversion_maps.length;
    const beside = { ...manifest, measure_maps: [bars] };
    expect(readEntry("map", view, melody, index, beside)).toEqual({
      ...view,
      name: null,
    });
    expect(refusal(readEntry("map", view, melody, index, manifest))).toEqual({
      code: "schema_violation",
      path: ["conversion_maps", index, "measure_map"],
    });
  });
});
