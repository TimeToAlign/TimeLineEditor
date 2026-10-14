import {
  dumps,
  JsonFloat,
  migrate,
  parse,
  parseJson,
  SCHEMA_VERSION,
  SUPPORTED_VERSIONS,
} from "@timetoalign/timeskeleton";
import { describe, expect, it, vi } from "vitest";
import type { LoadError, Manifest, TimelineFile } from "../src/index.ts";
import {
  checkManifest,
  InvalidManifestError,
  isLoadError,
  loadManifest,
  readManifestValue,
  saveManifest,
} from "../src/index.ts";
import type { JsonObject } from "../src/json.ts";
import {
  bundleFixtures,
  groupFixtures,
  load,
  manifestFixtures,
  migrationPairs,
  olderFixtures,
  rejections,
} from "./support.ts";

function loaded(text: string): Manifest {
  const manifest = loadManifest(text);
  if (isLoadError(manifest)) throw new Error(dumps(manifest.problems));
  return manifest;
}

function refused(text: string): LoadError {
  const result = loadManifest(text);
  if (!isLoadError(result)) throw new Error("the manifest was accepted");
  return result;
}

describe("fixture manifests round-trip byte for byte", () => {
  it("has exactly 29 timeline, 9 group and 9 bundle files", () => {
    expect([manifestFixtures.length, groupFixtures.length, bundleFixtures.length]).toEqual([
      29, 9, 9,
    ]);
  });

  it.each(
    [...manifestFixtures, ...groupFixtures, ...bundleFixtures].map((fixture) => [
      fixture.name,
      fixture.text,
    ]),
  )("%s", (_, text) => {
    expect(saveManifest(loaded(text))).toBe(text);
  });
});

describe("shared rejections", () => {
  it.each(rejections.map((item) => [item.name, item]))("%s", (_, item) => {
    expect(refused(item.text).problems.map((entry) => entry.path)).toEqual([item.path]);
  });
});

describe("schema version", () => {
  it("refuses a manifest declaring any version but the installed one", () => {
    const fixture = manifestFixtures.find((item) => item.name === "bare.json");
    const text = (fixture?.text ?? "").replace(
      `"schema_version": "${SCHEMA_VERSION}"`,
      '"schema_version": "0.0.0"',
    );
    expect(refused(text).problems.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "schema_violation", path: ["meta", "schema_version"] },
    ]);
  });

  const earlier = SUPPORTED_VERSIONS.filter((version) => version !== SCHEMA_VERSION);

  it("knows two earlier versions", () => {
    expect(earlier).toEqual(["0.5.0", "0.6.0"]);
  });

  describe.each(earlier)("reads a manifest declaring %s", (version) => {
    const fixtures = olderFixtures(version);

    it("has 23 timeline fixtures", () => {
      expect(fixtures.length).toBe(23);
    });

    it.each(fixtures.map((fixture) => [fixture.name, fixture.text]))(
      "%s, migrated by timeskeleton to the latest version",
      (_, text) => {
        expect(text.includes(`"schema_version": "${version}"`)).toBe(true);
        const manifest = loaded(text);
        expect(manifest.meta.schema_version).toBe(SCHEMA_VERSION);
        expect(saveManifest(manifest)).toBe(dumps(migrate(parseJson(text))));
      },
    );

    it("leaves the value it reads unchanged", () => {
      const fixture = fixtures.find((item) => item.name === "bare.json")?.text ?? "";
      const value = parseJson(fixture) as unknown as Manifest;
      const manifest = readManifestValue(value);
      expect(isLoadError(manifest) ? manifest.problems : manifest.meta.schema_version).toBe(
        SCHEMA_VERSION,
      );
      expect(value.meta.schema_version).toBe(version);
    });
  });

  it("migrates 0.6.0-to-0.7.0/before.json to its after.json byte for byte", () => {
    const pair = migrationPairs.find((item) => item.name === "0.6.0-to-0.7.0");
    expect(saveManifest(loaded(pair?.before ?? ""))).toBe(pair?.after);
  });

  it("reads 0.5.0-to-0.6.0/before.json and after.json as equal manifests", () => {
    const pair = migrationPairs.find((item) => item.name === "0.5.0-to-0.6.0");
    expect(saveManifest(loaded(pair?.before ?? ""))).toBe(saveManifest(loaded(pair?.after ?? "")));
  });
});

describe("graphical styles", () => {
  it("warns once and completes every missing named style", () => {
    const fixture = manifestFixtures.find((item) => item.name === "bare.json")?.text ?? "";
    const value = parse(fixture) as unknown as Manifest;
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
    const manifest = loaded(text);
    expect(warn).toHaveBeenCalledExactlyOnceWith("Missing graphical styles: 'a', 'z'");
    expect(manifest.graphical?.styles).toEqual({ kept: { fill: "#ABCDEF" }, a: {}, z: {} });
    expect(graphical.styles).toEqual({ kept: { fill: "#ABCDEF" } });
    warn.mockRestore();
  });
});

describe("lossless numbers", () => {
  it("keeps an int above 2^53", () => {
    const fixture = manifestFixtures.find((item) => item.name === "discrete_logical.json");
    const text = (fixture?.text ?? "").replace('"value": 480', '"value": 9007199254740993');
    const manifest = loaded(text) as TimelineFile;
    expect(manifest.timeline.length.value).toBe(9007199254740993n);
    expect(saveManifest(manifest)).toBe(text);
  });

  it("keeps a Fraction component above 2^53", () => {
    const fixture = manifestFixtures.find((item) => item.name === "continuous_logical.json");
    const pattern = /"value": \[\n(\s+)12,\n(\s+)1\n/;
    const text = (fixture?.text ?? "").replace(pattern, '"value": [\n$19007199254740993,\n$22\n');
    const manifest = loaded(text) as TimelineFile;
    expect(manifest.timeline.length.value).toEqual([9007199254740993n, 2]);
    expect(saveManifest(manifest)).toBe(text);
  });
});

describe("canonical order", () => {
  it("orders markers at one coordinate by id in code-point order", () => {
    const coordinate = { unit: "quarters", number_type: "fraction", value: [1, 1] } as const;
    const bare = load("bare.json");
    const manifest = {
      ...bare,
      timeline: {
        ...bare.timeline,
        flow_control: {
          ...bare.timeline.flow_control,
          markers: ["\u{1F3B5}", "～"].map((id) => ({ id, name: null, coordinate })),
        },
      },
    };
    const saved = parse(saveManifest(manifest)) as unknown as TimelineFile;
    expect(saved.timeline.flow_control.markers.map((marker) => marker.id)).toEqual([
      "\uFF5E",
      "\u{1F3B5}",
    ]);
  });
});

describe("invariants", () => {
  type Node = Record<string, unknown>;
  const node = (value: unknown, ...keys: (string | number)[]): Node =>
    keys.reduce<unknown>((current, key) => (current as Node)[key], value) as Node;
  const source = manifestFixtures.find((item) => item.name === "with_region.json")?.text ?? "";
  const base = parse(source) as unknown as JsonObject;
  const rootPath = ["timeline"];
  const [first = ""] = Object.keys(node(base, ...rootPath, "children"));
  const childPath = [...rootPath, "children", first];
  const float = (value: number) => ({
    unit: "quarters",
    number_type: "float",
    value: new JsonFloat(value),
  });
  const quarters = (numerator: number) => ({
    unit: "quarters",
    number_type: "fraction",
    value: [numerator, 1],
  });

  it("lists three violations in traversal order", () => {
    const value = parse(source) as unknown as Node;
    const root = node(value, "timeline");
    const child = node(value, ...childPath);
    const [region] = root.regions as JsonObject[];
    Object.assign(node(child, "timeline"), { locked: false });
    Object.assign(root, {
      conversion_maps: [
        {
          type: "LinearMap",
          id: "seconds",
          name: null,
          source_unit: "seconds",
          target_unit: null,
          scalar: 2,
          offset: 0,
        },
      ],
      regions: [{ ...region, end: quarters(0) }],
    });
    const text = dumps(value);
    expect(refused(text).problems.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "child_not_locked", path: [...childPath, "timeline", "locked"] },
      {
        code: "map_source_unit_mismatch",
        path: [...rootPath, "conversion_maps", 0, "source_unit"],
      },
      { code: "region_end_before_start", path: [...rootPath, "regions", 0, "end"] },
    ]);
    expect(() => saveManifest(parse(text) as unknown as Manifest)).toThrow(InvalidManifestError);
  });

  const cases: [string, (manifest: Node) => void, (string | number)[]][] = [
    [
      "unit_not_allowed",
      (manifest) =>
        Object.assign(node(manifest, ...rootPath), { class: "DiscreteLogicalTimeline" }),
      [...rootPath, "unit"],
    ],
    [
      "child_unit_mismatch",
      (manifest) => {
        const child = node(manifest, ...childPath, "timeline");
        Object.assign(child, {
          unit: "whole_note",
          length: { ...node(child, "length"), unit: "whole_note" },
        });
      },
      [...childPath, "timeline", "unit"],
    ],
    [
      "invalid_coordinate",
      (manifest) => Object.assign(node(manifest, ...rootPath, "length"), { value: [2n ** 63n, 1] }),
      [...rootPath, "length", "value"],
    ],
    [
      "off_axis",
      (manifest) => Object.assign(node(manifest, ...rootPath, "regions", 0), { start: float(2) }),
      [...rootPath, "regions", 0, "start"],
    ],
    [
      "negative_offset",
      (manifest) =>
        Object.assign(node(manifest, ...childPath), {
          offset: { ...quarters(-1), value: [-1, 3] },
        }),
      [...childPath, "offset"],
    ],
    [
      "child_exceeds_parent",
      (manifest) => Object.assign(node(manifest, ...childPath), { offset: quarters(9) }),
      [...childPath, "offset"],
    ],
    [
      "region_end_before_start",
      (manifest) => Object.assign(node(manifest, ...rootPath, "regions", 0), { end: quarters(1) }),
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
          class: "DiscreteLogicalTimeline",
          unit: "ticks",
          number_type: "fraction",
          length: { unit: "ticks", number_type: "fraction", value: [1, 1] },
          children: {},
          regions: [],
        }),
      [...rootPath, "number_type"],
    ],
  ];

  it("accepts a child of another number type", () => {
    const manifest = parse(dumps(base)) as unknown as Node;
    Object.assign(node(manifest, ...childPath, "timeline"), {
      number_type: "float",
      length: float(4),
    });
    const text = dumps(manifest);
    expect(text.includes('"value": 4.0')).toBe(true);
    expect(saveManifest(loaded(text))).toBe(text);
  });

  it.each(cases)("%s", (code, change, expectedPath) => {
    const manifest = parse(dumps(base)) as unknown as Node;
    change(manifest);
    expect(
      refused(dumps(manifest)).problems.map(({ code: found, path }) => ({ code: found, path })),
    ).toEqual([{ code, path: expectedPath }]);
  });

  it("refuses a child whose id differs from its key in children, in check and load", () => {
    const nested = manifestFixtures.find((item) => item.name === "nested.json")?.text ?? "";
    const value = parse(nested) as unknown as Node;
    expect(Object.keys(node(value, "timeline", "children"))).toEqual(["clt_3"]);
    Object.assign(node(value, "timeline", "children", "clt_3", "timeline"), { id: "clt_9" });
    const expected = [
      { code: "key_mismatch", path: ["timeline", "children", "clt_3", "timeline", "id"] },
    ];
    const text = dumps(value);
    expect(refused(text).problems.map(({ code, path }) => ({ code, path }))).toEqual(expected);
    expect(
      checkManifest(value as unknown as Manifest).map(({ code, path }) => ({ code, path })),
    ).toEqual(expected);
  });

  it("refuses malformed text", () => {
    expect(refused('{"meta": ').problems.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "invalid_json", path: [] },
    ]);
  });
});
