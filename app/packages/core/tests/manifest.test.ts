import { dumps, JsonFloat, parseJson, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { describe, expect, it, vi } from "vitest";
import type { LoadError, Manifest } from "../src/index.ts";
import {
  apply,
  createView,
  InvalidManifestError,
  isCommandError,
  isLoadError,
  loadManifest,
  saveManifest,
  unknownKeys,
} from "../src/index.ts";
import {
  A,
  allFixtures,
  block,
  changed,
  fixture,
  load,
  loadText,
  manifestValue,
  rejections,
} from "./support.ts";

function refused(text: string): LoadError {
  const result = loadManifest(text);
  if (!isLoadError(result)) throw new Error("the manifest was accepted");
  return result;
}

const problems = (text: string) => refused(text).problems.map(({ code, path }) => ({ code, path }));

type Node = Record<string, unknown>;
const node = (value: unknown, ...keys: (string | number)[]): Node =>
  keys.reduce<unknown>((current, key) => (current as Node)[key], value) as Node;

describe("fixture manifests round-trip byte for byte", () => {
  it.each(allFixtures.map((fixture) => [fixture.name, fixture.text]))("%s", (_, text) => {
    expect(saveManifest(loadText(text))).toBe(text);
  });

  it.each(allFixtures.map((fixture) => [fixture.name, fixture.text, fixture.twin]))(
    "the minimal twin of %s",
    (_, text, twin) => {
      const manifest = loadText(twin);
      expect(saveManifest(manifest)).toBe(text);
      expect(saveManifest(manifest, { minimal: true })).toBe(twin);
    },
  );
});

describe("shared rejections", () => {
  it.each(rejections.map((item) => [item.name, item.text, item.path]))("%s", (_, text, path) => {
    expect(refused(text).problems.map((item) => item.path)).toEqual([path]);
  });
});

describe("the version marker", () => {
  it("refuses another version at the marker and a value without one at the top", () => {
    const value = manifestValue("bare.json");
    expect(problems(dumps({ ...value, timeskeleton: "0.6.0" }))).toEqual([
      { code: "schema_violation", path: ["timeskeleton"] },
    ]);
    const { timeskeleton: _, ...unmarked } = value;
    expect(problems(dumps(unmarked))).toEqual([{ code: "schema_violation", path: [] }]);
  });
});

describe("the minimal form in, either form out", () => {
  it("supplies every default of bare.json and adds no absent key", () => {
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
      flow_control: { breaks: [], jumps: [], markers: [] },
      measure_map: null,
      metric_hierarchy: null,
    };
    const { meta: _, ...twin } = parseJson(fixture("bare.json").twin) as Record<string, unknown>;
    expect(loadText(dumps(twin as never))).toEqual({
      timeskeleton: SCHEMA_VERSION,
      name: null,
      meta: {},
      groups: [],
      timelines: [root],
    });
  });
});

describe("unknown keys", () => {
  it("are kept through loading, commands and saving, and listed", () => {
    const value = manifestValue("bare.json");
    const [root] = value.timelines as Node[];
    const text = dumps({
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
    const kept = (held: Manifest) => [
      node(held, "x-top"),
      node(held, "timelines", 0, "x-root"),
      node(held, "timelines", 0, "regions", 0, "x-region"),
    ];
    expect(kept(manifest)).toEqual([1, { a: [1, 2] }, "kept"]);
    let view = changed(createView(), {
      type: "add",
      into: "workspace",
      block: { id: A, manifest, x: 0, y: 0 },
    });
    view = changed(view, {
      type: "set",
      changes: [{ target: `${A}/bare`, values: { name: "B" } }],
    });
    view = changed(view, {
      type: "add",
      into: `${A}/bare`,
      marker: { id: "marker_1", coordinate: [1, 1] },
    });
    const edited = block(view).manifest;
    expect(kept(edited)).toEqual([1, { a: [1, 2] }, "kept"]);
    expect(kept(parseJson(saveManifest(edited)) as unknown as Manifest)).toEqual([
      1,
      { a: [1, 2] },
      "kept",
    ]);
    expect(unknownKeys(edited)).toEqual([
      { path: [], key: "x-top" },
      { path: ["timelines", 0], key: "x-root" },
      { path: ["timelines", 0, "regions", 0], key: "x-region" },
    ]);
  });
});

describe("graphical styles", () => {
  it("warns once and completes every missing named style", () => {
    const value = manifestValue("bare.json");
    const graphical = {
      styles: { kept: { fill: "#ABCDEF" } },
      statements: [
        { select: {}, set: "z" },
        { select: {}, set: "a" },
        { select: {}, set: "z" },
        { select: {}, set: "kept" },
      ],
    };
    const text = dumps({ ...value, graphical });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const manifest = loadText(text);
    expect(warn).toHaveBeenCalledExactlyOnceWith("Missing graphical styles: 'a', 'z'");
    expect(manifest.graphical?.styles).toEqual({ kept: { fill: "#ABCDEF" }, a: {}, z: {} });
    expect(graphical.styles).toEqual({ kept: { fill: "#ABCDEF" } });
    warn.mockRestore();
  });
});

describe("lossless numbers", () => {
  /** A fixture's text with its first root's length replaced by `length`. */
  const withLength = (name: string, length: unknown) => {
    const value = manifestValue(name);
    const [root, ...rest] = value.timelines as Record<string, unknown>[];
    return dumps({ ...value, timelines: [{ ...root, length }, ...rest] } as never);
  };

  it("keeps an int above 2^53", () => {
    const text = withLength("discrete_logical.json", 9007199254740993n);
    const manifest = loadText(text);
    expect(manifest.timelines[0]?.length).toBe(9007199254740993n);
    expect(saveManifest(manifest)).toBe(text);
    expect(saveManifest(manifest)).toContain('"length": 9007199254740993,');
  });

  it("keeps a Fraction component above 2^53", () => {
    const text = withLength("continuous_logical.json", [9007199254740993n, 1]);
    const manifest = loadText(text);
    expect(manifest.timelines[0]?.length).toEqual([9007199254740993n, 1]);
    expect(saveManifest(manifest)).toBe(text);
  });
});

describe("canonical order", () => {
  it("orders markers at one coordinate by id in code-point order", () => {
    const value = manifestValue("bare.json");
    const [root] = value.timelines as Node[];
    const markers = ["\u{1F3B5}", "～"].map((id) => ({ id, coordinate: [1, 1] }));
    const text = dumps({ ...value, timelines: [{ ...root, flow_control: { markers } }] });
    const saved = parseJson(saveManifest(loadText(text))) as unknown as Manifest;
    expect(saved.timelines[0]?.flow_control.markers.map((marker) => marker.id)).toEqual([
      "～",
      "\u{1F3B5}",
    ]);
  });
});

describe("invariants", () => {
  const base = () => manifestValue("with_region.json");
  const rootPath = ["timelines", 0];
  const childPath = [...rootPath, "children", 0];

  it("lists three violations in traversal order", () => {
    const value = base();
    const root = node(value, ...rootPath);
    const [region] = root.regions as Node[];
    Object.assign(node(value, ...childPath), { metric_hierarchy: {} });
    Object.assign(root, {
      conversion_maps: [
        {
          type: "LinearMap",
          id: "seconds",
          source_unit: "seconds",
          target_unit: null,
          scalar: 2,
          offset: 0,
        },
      ],
      regions: [{ ...region, end: [0, 1] }],
    });
    const text = dumps(value);
    expect(problems(text)).toEqual([
      { code: "metric_hierarchy_without_measure_map", path: [...childPath, "metric_hierarchy"] },
      {
        code: "map_source_unit_mismatch",
        path: [...rootPath, "conversion_maps", 0, "source_unit"],
      },
      { code: "region_end_before_start", path: [...rootPath, "regions", 0, "end"] },
    ]);
    expect(() => saveManifest(value as unknown as Manifest)).toThrow(InvalidManifestError);
  });

  const cases: [string, (manifest: Node) => void, (string | number)[]][] = [
    [
      "region_end_before_start",
      (manifest) => Object.assign(node(manifest, ...rootPath, "regions", 0), { end: [1, 1] }),
      [...rootPath, "regions", 0, "end"],
    ],
    [
      "metric_hierarchy_without_measure_map",
      (manifest) => Object.assign(node(manifest, ...rootPath), { metric_hierarchy: {} }),
      [...rootPath, "metric_hierarchy"],
    ],
    [
      "number_type_not_allowed",
      (manifest) =>
        Object.assign(node(manifest, ...rootPath), {
          unit: "ticks",
          number_type: "fraction",
          length: [1, 1],
          children: [],
          regions: [],
        }),
      [...rootPath, "number_type"],
    ],
  ];

  it("accepts a child of another number type", () => {
    const value = base();
    Object.assign(node(value, ...childPath), { number_type: "float", length: new JsonFloat(4) });
    const text = dumps(value);
    expect(text.includes('"length": 4.0')).toBe(true);
    expect(saveManifest(loadText(text))).toBe(text);
  });

  it.each(cases)("%s", (code, change, expectedPath) => {
    const value = base();
    change(value);
    expect(problems(dumps(value))).toEqual([{ code, path: expectedPath }]);
  });

  it.each([
    [
      "a child of another unit",
      { unit: "whole_note" },
      [...childPath, "unit"],
      "child 'clt_2' has unit 'whole_note', its parent 'clt_1' has 'quarters'",
    ],
    [
      "a negative child offset",
      { offset: [-1, 3] },
      [...childPath, "offset"],
      "offset [-1, 3] of 'clt_2' is negative",
    ],
    [
      // Placed at 9, the child comes after its sibling at 2 in canonical order.
      "a child ending past its parent",
      { offset: [9, 1] },
      [...rootPath, "children", 1, "length"],
      "child 'clt_2' ends at [13, 1], beyond the length [12, 1] of its parent 'clt_1'",
    ],
  ])("leaves %s to the schema", (_, change, path, message) => {
    const value = base();
    Object.assign(node(value, ...childPath), change);
    expect(refused(dumps(value)).problems).toEqual([{ code: "schema_violation", message, path }]);
  });

  it("refuses malformed text", () => {
    expect(problems('{"timeskeleton": ')).toEqual([{ code: "invalid_json", path: [] }]);
  });

  it("checks commands with the same invariants", () => {
    const view = changed(createView(), {
      type: "add",
      into: "workspace",
      block: { id: A, manifest: load("with_region.json"), x: 0, y: 0 },
    });
    const result = apply(view, {
      type: "set",
      changes: [{ target: `${A}/clt_1/region_1`, values: { end: [0, 1] } }],
    });
    expect(isCommandError(result) ? [result.code, result.path] : result).toEqual([
      "region_end_before_start",
      [A, "manifest", ...rootPath, "regions", 0, "end"],
    ]);
  });
});
