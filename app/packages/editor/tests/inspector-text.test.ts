/// <reference types="node" />
/** The inspector's logic; the expected values are derived in `README.md` ("The inspector"). */

import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Json, Manifest, Store } from "@timetoalign/tilie-core";
import { createStore, createView, isLoadError, loadManifest } from "@timetoalign/tilie-core";
import {
  dumps,
  isJsonFloat,
  JsonFloat,
  parseJson,
  SCHEMA_VERSION,
  schemas,
} from "@timetoalign/timeskeleton";
import { beforeAll, describe, expect, it } from "vitest";
import {
  applyText,
  follow,
  manifestOf,
  manifestText,
  problemPointer,
  propertyCommand,
  STEPS,
  selectedBlock,
  shownValue,
  stepValue,
} from "../src/inspector/edit.ts";
import type { Format } from "../src/inspector/formats.ts";
import { FORMATS, loadCodec, readText, writeText } from "../src/inspector/formats.ts";
import { nullableRequired } from "../src/inspector/nulls.ts";

const A = "0000000000";
const B = "0000000001";

const fixturesDirectory = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json")),
  "fixtures",
  SCHEMA_VERSION,
);
const fixtureNames = readdirSync(fixturesDirectory)
  .filter((name) => name.endsWith(".json"))
  .sort();

function fixtureText(name: string): string {
  return readFileSync(path.join(fixturesDirectory, `${name}.json`), "utf8");
}

function fixture(name: string): Manifest {
  const manifest = loadManifest(fixtureText(name));
  if (isLoadError(manifest)) throw new Error(`${name} refused`);
  return manifest;
}

/** A store holding the named fixtures in blocks `A`, `B`, … */
function storeOf(...names: string[]): Store {
  const store = createStore({ view: createView(), journal: [] });
  names.forEach((name, index) => {
    const id = String(index).padStart(10, "0");
    const error = store.dispatch({
      type: "add",
      into: "workspace",
      block: { id, manifest: fixture(name), x: 0, y: index * 200 },
    });
    if (error !== null) throw new Error(error.message);
  });
  return store;
}

function manifestIn(store: Store, id: string): Json {
  return manifestOf(store.view.blocks[id] as never);
}

function written(format: Format, value: Json, showStyling = true): string {
  const text = manifestText(value, format, showStyling);
  if (!text.ok) throw new Error(JSON.stringify(text.problems));
  return text.value.text;
}

function readBack(format: Format, text: string): Json {
  const read = readText(format, text);
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  return read.value.value;
}

function setOrFail(store: Store, target: string, values: Record<string, unknown>): void {
  const error = store.dispatch({ type: "set", changes: [{ target, values }] });
  if (error !== null) throw new Error(`${error.code}: ${error.message}`);
}

/** A member of a JSON value by path. */
function at(value: Json, ...keys: (string | number)[]): Json {
  return keys.reduce<Json>((item, key) => (item as Record<string, Json>)[key] as Json, value);
}

beforeAll(async () => {
  await Promise.all(FORMATS.map(loadCodec));
});

describe("format round trips", () => {
  it("covers the 23 fixtures", () => {
    expect(fixtureNames).toHaveLength(23);
  });

  for (const name of fixtureNames) {
    for (const format of FORMATS) {
      it(`${name} through ${format}`, () => {
        const text = readFileSync(path.join(fixturesDirectory, name), "utf8");
        const value = parseJson(text) as Json;
        expect(dumps(readBack(format, written(format, value)))).toBe(text);
      });
    }
  }
});

describe("exact numbers", () => {
  const store = storeOf("discrete_logical", "continuous_physical");
  const big = 9007199254740993n;

  it("keeps an integer beyond 2^53 in every format", () => {
    setOrFail(store, `${A}/dlt_1`, {
      length: { unit: "ticks", number_type: "int", value: big },
    });
    const manifest = manifestIn(store, A);
    for (const format of FORMATS) {
      const read = readBack(format, written(format, manifest));
      expect(dumps(read)).toBe(dumps(manifest));
      expect(at(read, "timeline", "length", "value")).toBe(big);
    }
    expect(written("yaml", manifest)).toContain("    value: 9007199254740993\n");
  });

  it("keeps a 17-digit float and an integral float beyond 2^53 in every format", () => {
    setOrFail(store, `${B}/cpt_1`, {
      length: { unit: "seconds", number_type: "float", value: 12.500000000000002 },
    });
    let manifest = manifestIn(store, B);
    for (const format of FORMATS) {
      const read = readBack(format, written(format, manifest));
      expect(dumps(read)).toBe(dumps(manifest));
      expect(at(read, "timeline", "length", "value")).toBe(12.500000000000002);
    }
    setOrFail(store, `${B}/cpt_1`, {
      length: { unit: "seconds", number_type: "float", value: new JsonFloat(1e16) },
    });
    manifest = manifestIn(store, B);
    for (const format of FORMATS) {
      const read = readBack(format, written(format, manifest));
      expect(dumps(read)).toBe(dumps(manifest));
      const value = at(read, "timeline", "length", "value");
      expect(isJsonFloat(value)).toBe(true);
      expect((value as JsonFloat).value).toBe(1e16);
    }
    expect(written("yaml", manifest)).toContain("    value: 10000000000000000.0\n");
  });
});

describe("the TOML null rule", () => {
  it("omits exactly the required members that may be null", () => {
    const root = schemas[SCHEMA_VERSION as keyof typeof schemas] as unknown as Record<
      string,
      unknown
    >;
    const definitions = root.$defs as Record<string, Record<string, unknown>>;
    const listed = Object.fromEntries(
      Object.entries(definitions)
        .map(([name, node]) => [name, nullableRequired(root, node)] as const)
        .filter(([, members]) => members.length > 0),
    );
    const maps = [
      "BeatInMeasureMap",
      "ChainMap",
      "CombinationMap",
      "ConstantMap",
      "FloorMap",
      "InterpolationMap",
      "IntervalToConstantMap",
      "LinearMap",
      "MetricMap",
      "MetricalPositionMap",
      "PiecewiseMap",
      "QuartersToFloatingMeasures",
      "QuartersToMeasureNumber",
      "QuartersToTicks",
      "RotationMap",
      "SamplesToSeconds",
      "ScalarMap",
      "SecondsToSamples",
      "ShiftMap",
      "TableMap",
      "TicksToQuarters",
    ];
    expect(maps).toHaveLength(21);
    expect(listed).toEqual({
      TimelineManifest: ["measure_map", "metric_hierarchy", "name"],
      ...Object.fromEntries(maps.map((name) => [name, ["name", "source_unit", "target_unit"]])),
      Region: ["name"],
      Break: ["label", "name"],
      Jump: ["label", "target"],
      Marker: ["name"],
    });
  });

  it("writes bare without its nulls and reads them back", () => {
    const manifest = manifestIn(storeOf("bare"), A);
    const text = written("toml", manifest);
    expect(text).toBe(
      [
        "[meta]",
        'generator = "timetoalign 1.2.0 (9a728128)"',
        'schema_version = "0.6.0"',
        "",
        "[timeline]",
        'class = "ContinuousLogicalTimeline"',
        "conversion_maps = []",
        'id = "bare"',
        "locked = false",
        'name = "Bare"',
        'number_type = "fraction"',
        "regions = []",
        'unit = "quarters"',
        "",
        "[timeline.children]",
        "",
        "[timeline.flow_control]",
        "breaks = []",
        "jumps = []",
        "markers = []",
        "",
        "[timeline.length]",
        'number_type = "fraction"',
        'unit = "quarters"',
        "value = [ 8, 1 ]",
        "",
        "[timeline.meta]",
        "",
      ].join("\n"),
    );
    const read = readBack("toml", text);
    expect(at(read, "timeline", "measure_map")).toBe(null);
    expect(at(read, "timeline", "metric_hierarchy")).toBe(null);
  });

  it("refuses a null the schema does not require", () => {
    const value = parseJson(fixtureText("corpus_score_ms3")) as Record<string, Json>;
    const rows = at(value, "timeline", "measure_map") as Record<string, Json>[];
    rows[0] = { ...rows[0], nominal_length: null };
    expect(writeText("toml", value)).toEqual({
      ok: false,
      problems: [
        {
          code: "not_representable",
          message: "TOML has no null, and the schema does not require this member",
          path: ["timeline", "measure_map", 0, "nominal_length"],
        },
      ],
    });
    for (const format of ["json", "yaml"] as const) {
      const read = readBack(format, written(format, value));
      expect(dumps(read)).toBe(dumps(value));
      expect(at(read, "timeline", "measure_map", 0, "nominal_length")).toBe(null);
    }
  });

  it("leaves a missing member that may not be null to the schema check", () => {
    const store = storeOf("bare");
    const text = written("toml", manifestIn(store, A)).replace('id = "bare"\n', "");
    expect(applyText(store, A, "toml", text, true)).toEqual({
      ok: false,
      problems: [
        {
          code: "schema_violation",
          message: "must have required property 'id'",
          path: ["timeline"],
        },
      ],
    });
    expect(store.journal).toHaveLength(1);
  });
});

describe("applying a text", () => {
  it("dispatches exactly one set replacing the manifest", () => {
    const store = storeOf("bare");
    const text = written("json", manifestIn(store, A)).replace(
      '"name": "Bare"',
      '"name": "Renamed"',
    );
    const parsed = parseJson(text) as Json;
    const applied = applyText(store, A, "json", text, true);
    expect(applied.ok).toBe(true);
    expect(store.journal).toHaveLength(2);
    expect(store.journal[1]?.command).toEqual({
      type: "set",
      changes: [{ target: A, values: { manifest: parsed } }],
    });
    expect(dumps(manifestIn(store, A))).toBe(dumps(parsed));
    expect(applyText(store, A, "json", text, true).ok).toBe(true);
    expect(store.journal).toHaveLength(2);
  });

  it("returns a refusal with its path into the text", () => {
    const store = storeOf("bare");
    const json = written("json", manifestIn(store, A));
    const locked = applyText(
      store,
      A,
      "json",
      json.replace('"locked": false', '"locked": "yes"'),
      true,
    );
    expect(locked).toEqual({
      ok: false,
      problems: [
        { code: "schema_violation", message: "must be boolean", path: ["timeline", "locked"] },
      ],
    });
    if (locked.ok) throw new Error("accepted");
    expect(problemPointer(locked.problems[0] as never)).toBe("/timeline/locked");
    const unit = applyText(
      store,
      A,
      "json",
      json.replace('"unit": "quarters"\n  }', '"unit": "parsecs"\n  }'),
      true,
    );
    if (unit.ok) throw new Error("accepted");
    expect(unit.problems.map((item) => [item.message, problemPointer(item)])).toEqual([
      ["must be equal to one of the allowed values", "/timeline/unit"],
    ]);
    const positions = (
      [
        ["json", json.replace('"locked": false,', '"locked": ,')],
        [
          "yaml",
          written("yaml", manifestIn(store, A)).replace("  locked: false", "  locked: [false"),
        ],
        ["toml", written("toml", manifestIn(store, A)).replace("locked = false", "locked = ")],
      ] as const
    ).map(([format, text]) => {
      const result = applyText(store, A, format, text, true);
      if (result.ok) throw new Error("accepted");
      const [problem] = result.problems;
      return [problem?.code, problem?.line, problem?.column];
    });
    expect(positions).toEqual([
      ["syntax_error", 24, 15],
      ["syntax_error", 18, 3],
      ["syntax_error", 10, 1],
    ]);
    expect(store.journal).toHaveLength(1);
  });
});

describe("comments", () => {
  for (const [format, nameLine, edited] of [
    ["yaml", "  name: Bare\n", "  # shown on the canvas\n  name: Hello # was Bare\n"],
    ["toml", 'name = "Bare"\n', '# shown on the canvas\nname = "Hello" # was Bare\n'],
  ] as const) {
    it(`survive Apply and an external change in ${format.toUpperCase()}`, () => {
      const store = storeOf("bare");
      const original = written(format, manifestIn(store, A));
      expect(original).toContain(nameLine);
      const text = original.replace(nameLine, edited);
      const applied = applyText(store, A, format, text, true);
      if (!applied.ok) throw new Error(JSON.stringify(applied.problems));
      expect(applied.value.text).toBe(text);
      expect(at(manifestIn(store, A), "timeline", "name")).toBe("Hello");
      setOrFail(store, `${A}/bare`, { name: "Bye" });
      const followed = follow(applied.value.source, manifestIn(store, A), true);
      if (!followed.ok) throw new Error(JSON.stringify(followed.problems));
      expect(followed.value.text).toBe(text.replace("Hello", "Bye"));
    });
  }
});

describe("the styling toggle", () => {
  it("hides graphical and keeps it on Apply", () => {
    const store = storeOf("styled__score");
    const graphical = dumps(at(manifestIn(store, A), "graphical"));
    for (const format of FORMATS) {
      expect(written(format, manifestIn(store, A), false)).not.toMatch(/graphical/);
      expect(written(format, manifestIn(store, A), true)).toMatch(/graphical/);
    }
    const hidden = written("yaml", manifestIn(store, A), false);
    const name = at(manifestIn(store, A), "timeline", "name") as string;
    const applied = applyText(
      store,
      A,
      "yaml",
      hidden.replace(`  name: ${name}\n`, "  name: Restyled\n"),
      false,
    );
    expect(applied.ok).toBe(true);
    expect(store.journal).toHaveLength(2);
    expect(at(manifestIn(store, A), "timeline", "name")).toBe("Restyled");
    expect(dumps(at(manifestIn(store, A), "graphical"))).toBe(graphical);
    const typed = applyText(store, A, "yaml", `${hidden}graphical: {}\n`, false);
    expect(typed).toEqual({
      ok: false,
      problems: [
        {
          code: "hidden_member",
          message: "the styling is hidden; check Show styling to edit graphical",
          path: ["graphical"],
        },
      ],
    });
    expect(store.journal).toHaveLength(2);
  });
});

describe("the selection", () => {
  it("names one block or none", () => {
    const store = storeOf("bare", "nested");
    const { view } = store;
    expect(selectedBlock(view, [])).toBe(null);
    expect(selectedBlock(view, [A])?.id).toBe(A);
    expect(selectedBlock(view, [`${A}/bare`])?.id).toBe(A);
    expect(selectedBlock(view, [A, `${A}/bare`])?.id).toBe(A);
    expect(selectedBlock(view, [A, `${B}/clt_1`])).toBe(null);
  });
});

describe("the properties form", () => {
  it("builds one set per field and lets the store decide", () => {
    expect(propertyCommand(A, "x", "12.5")).toEqual({
      ok: true,
      value: { type: "set", changes: [{ target: A, values: { x: 12.5 } }] },
    });
    expect(propertyCommand(A, "width", "")).toEqual({
      ok: true,
      value: { type: "set", changes: [{ target: A, values: { width: null } }] },
    });
    for (const input of ["", "abc"]) {
      const result = propertyCommand(A, "x", input);
      expect(result.ok ? null : result.problems.map((item) => [item.code, item.path])).toEqual([
        ["invalid_value", [A, "x"]],
      ]);
    }
    const store = storeOf("bare");
    const scale = propertyCommand(A, "scale", "0");
    if (!scale.ok) throw new Error("refused");
    expect(store.dispatch(scale.value)?.code).toBe("non_positive_number");
    expect(store.journal).toHaveLength(1);
  });

  it("steps exactly, by 1 or by 0.1", () => {
    expect(STEPS).toEqual({ x: 1, y: 1, scale: 0.1, length: 1, spacing: 0.1, width: 1, height: 1 });
    const cases: [number | null, 1 | -1, number, number][] = [
      [10.123, 1, 1, 11.123],
      [1, -1, 0.1, 0.9],
      [0.9, -1, 0.1, 0.8],
      [0.7, 1, 0.1, 0.8],
      [1e-7, 1, 0.1, 0.1000001],
      [-0.05, 1, 0.1, 0.05],
      [null, 1, 1, 1],
    ];
    expect(cases.map(([value, direction, step]) => stepValue(value, direction, step))).toEqual(
      cases.map(([, , , result]) => result),
    );
  });

  it("shows a value with at most two decimals", () => {
    const cases: [number | null, string][] = [
      [12.5, "12.5"],
      [12.3449, "12.34"],
      [7, "7"],
      [10.123, "10.12"],
      [2.999, "3"],
      [478.5771484375, "478.58"],
      [1.49951171875, "1.5"],
      [0.125, "0.13"],
      [1.005, "1"],
      [-0.001, "0"],
      [null, ""],
    ];
    expect(cases.map(([value]) => shownValue(value))).toEqual(cases.map(([, shown]) => shown));
  });
});
