/// <reference types="node" />
/** The manifest as text and back; the expected values are derived in `README.md` ("The manifest as text"). */

import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Block, CommandEntry, Json, Manifest, Store } from "@timetoalign/tilie-core";
import { isLoadError, loadManifest } from "@timetoalign/tilie-core";
import {
  compactJson,
  dumps,
  isJsonFloat,
  isJsonObject,
  JsonFloat,
  minimal,
  parseJson,
  SCHEMA_VERSION,
} from "@timetoalign/timeskeleton";
import { beforeAll, describe, expect, it } from "vitest";
import type { Format } from "../src/inspector/formats.svelte.ts";
import { FORMATS, loadCodec, readText, writeText } from "../src/inspector/formats.svelte.ts";
import { ManifestText } from "../src/inspector/manifestText.svelte.ts";
import type { TextOptions } from "../src/inspector/manifestText.ts";
import { applyText, follow, manifestOf, manifestText } from "../src/inspector/manifestText.ts";
import { DOCUMENT, omissibleNulls } from "../src/inspector/nulls.ts";
import { problemPointer } from "../src/inspector/problems.ts";
import { fixtureText, storeOf } from "./support.ts";

const A = "0000000000";
const B = "0000000001";

const fixturesDirectory = path.join(
  path.dirname(createRequire(import.meta.url).resolve("@timetoalign/timeskeleton/package.json")),
  "fixtures",
  SCHEMA_VERSION,
);
/** The manifest fixtures of one directory, `""`, `groups` or `bundles`, without their minimal twins. */
function fixturesOf(kind: "" | "groups" | "bundles"): string[] {
  return readdirSync(path.join(fixturesDirectory, kind))
    .filter((name) => name.endsWith(".json") && !name.endsWith(".minimal.json"))
    .sort()
    .map((name) => path.join(kind, name).replace(/\.json$/, ""));
}

const fixtureNames = [...fixturesOf(""), ...fixturesOf("groups"), ...fixturesOf("bundles")];

function blockIn(store: Store, id: string): Block {
  const block = store.view.blocks[id];
  if (block === undefined) throw new Error(`no block ${id}`);
  return block;
}

function manifestIn(store: Store, id: string): Json {
  return manifestOf(blockIn(store, id));
}

/** One `quarters` timeline beside a measure map whose row states `nominal_length: null`, which TOML cannot hold. */
function nominalNull(): Manifest {
  const manifest = loadManifest(
    dumps({
      timeskeleton: SCHEMA_VERSION,
      timelines: [{ id: "score", unit: "quarters", length: [4, 1] }],
      measure_maps: [
        {
          id: "bars",
          rows: [{ count: 1, qstamp: 0, number: 1, actual_length: 4, nominal_length: null }],
        },
      ],
    }),
  );
  if (isLoadError(manifest)) throw new Error("the nominal-null manifest is refused");
  return manifest;
}

/** The mode of a fixture file: the complete form with the styling. */
const FILE_FORM: TextOptions = { includeStyling: true, minimal: false };

/** The four modes a text is written in. */
const MODES = {
  "complete without styling": { includeStyling: false, minimal: false },
  "complete with styling": { includeStyling: true, minimal: false },
  "minimal without styling": { includeStyling: false, minimal: true },
  "minimal with styling": { includeStyling: true, minimal: true },
} as const satisfies Record<string, TextOptions>;
type Mode = keyof typeof MODES;
const MODE_NAMES = Object.keys(MODES) as Mode[];

/** A store holding `bare` in block `A`, styled by one `style` command: two journal entries. */
function styledBare(): Store {
  const store = storeOf("bare");
  const error = store.dispatch({
    type: "style",
    select: { element: "timeline" },
    set: { stroke: "#800000" },
    blocks: [A],
  });
  if (error !== null) throw new Error(error.message);
  return store;
}

function written(format: Format, value: Json, options: TextOptions = FILE_FORM): string {
  const text = manifestText(value, format, options);
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
  it("covers the 43, 11 and 9 fixtures of the top, groups/ and bundles/", () => {
    expect([
      fixturesOf("").length,
      fixturesOf("groups").length,
      fixturesOf("bundles").length,
    ]).toEqual([43, 11, 9]);
  });

  for (const name of fixtureNames) {
    for (const format of FORMATS) {
      it(`${name} through ${format}`, () => {
        const text = fixtureText(name);
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
    setOrFail(store, `${A}/dlt_1`, { length: big });
    const manifest = manifestIn(store, A);
    for (const format of FORMATS) {
      const read = readBack(format, written(format, manifest));
      expect(dumps(read)).toBe(dumps(manifest));
      expect(at(read, "timelines", 0, "length")).toBe(big);
    }
    expect(written("yaml", manifest)).toContain("    length: 9007199254740993\n");
  });

  it("keeps a 17-digit float and an integral float beyond 2^53 in every format", () => {
    setOrFail(store, `${B}/cpt_1`, { length: 12.500000000000002 });
    let manifest = manifestIn(store, B);
    for (const format of FORMATS) {
      const read = readBack(format, written(format, manifest));
      expect(dumps(read)).toBe(dumps(manifest));
      expect(at(read, "timelines", 0, "length")).toBe(12.500000000000002);
    }
    setOrFail(store, `${B}/cpt_1`, { length: new JsonFloat(1e16) });
    manifest = manifestIn(store, B);
    for (const format of FORMATS) {
      const read = readBack(format, written(format, manifest));
      expect(dumps(read)).toBe(dumps(manifest));
      const value = at(read, "timelines", 0, "length");
      expect(isJsonFloat(value)).toBe(true);
      expect((value as JsonFloat).value).toBe(1e16);
    }
    expect(written("yaml", manifest)).toContain("    length: 10000000000000000.0\n");
  });
});

describe("the TOML null rule", () => {
  it("omits exactly the members that may be null and are required or default to null", () => {
    const definitions = DOCUMENT.$defs as Record<string, Record<string, unknown>>;
    const listed = Object.fromEntries(
      Object.entries(definitions)
        .map(([name, node]) => [name, omissibleNulls(node)] as const)
        .filter(([, members]) => members.length > 0),
    );
    expect(listed).toEqual({
      TimeSkeleton: ["name"],
      Timeline: ["length", "name"],
      MeasureMap: ["name"],
      Region: ["name"],
      FlowControlElement: ["label", "name"],
      MapBase: ["name", "source_unit", "target_unit"],
      Group: ["name"],
    });
  });

  /**
   * A manifest of two roots, one of unknown length and one with a conversion map converting to
   * no time axis, a group and a measure map, every null written out.
   */
  function nullable(): Json {
    const manifest = loadManifest(
      dumps({
        timeskeleton: SCHEMA_VERSION,
        timelines: [
          {
            id: "score",
            unit: "quarters",
            length: [12, 1],
            conversion_maps: [
              { id: "beats", type: "LinearMap", source_unit: "quarters", target_unit: null },
            ],
          },
          { id: "page", unit: "pixels", length: null },
        ],
        groups: [{ id: "group_1", members: ["page", "score"] }],
        measure_maps: [{ id: "bars", rows: [{ count: 1, qstamp: [0, 1] }] }],
      }),
    );
    if (isLoadError(manifest)) throw new Error("the manifest is refused");
    return manifest as unknown as Json;
  }

  it("omits and restores the null members of the manifest and every element of it", () => {
    const value = nullable();
    const text = written("toml", value);
    expect(text).toBe(
      [
        'timeskeleton = "0.7.0"',
        "",
        "[[groups]]",
        'id = "group_1"',
        'members = [ "page", "score" ]',
        "",
        "[groups.meta]",
        "",
        "[[measure_maps]]",
        'id = "bars"',
        "rows = [ { count = 1, qstamp = [ 0, 1 ] } ]",
        "",
        "[measure_maps.meta]",
        "",
        "[[timelines]]",
        'id = "page"',
        'unit = "pixels"',
        "locked = false",
        "is_segment_line = false",
        "children = []",
        "conversion_maps = []",
        "regions = []",
        "flow_control = []",
        'number_type = "int"',
        "",
        "[timelines.meta]",
        "",
        "[[timelines]]",
        'conversion_maps = [ { id = "beats", source_unit = "quarters", type = "LinearMap", scalar = 1, offset = 0 } ]',
        'id = "score"',
        "length = [ 12, 1 ]",
        'unit = "quarters"',
        "locked = false",
        "is_segment_line = false",
        "children = []",
        "regions = []",
        "flow_control = []",
        'number_type = "fraction"',
        "",
        "[timelines.meta]",
        "",
        "[meta]",
        "",
      ].join("\n"),
    );
    for (const format of FORMATS) {
      const read = readBack(format, written(format, value));
      expect(dumps(read)).toBe(dumps(value));
      expect([
        at(read, "name"),
        at(read, "groups", 0, "name"),
        at(read, "timelines", 0, "length"),
        at(read, "timelines", 0, "name"),
        at(read, "timelines", 1, "conversion_maps", 0, "name"),
        at(read, "timelines", 1, "conversion_maps", 0, "target_unit"),
        at(read, "measure_maps", 0, "name"),
      ]).toEqual([null, null, null, null, null, null, null]);
    }
  });

  it("refuses a null the schema neither requires nor defaults to null", () => {
    const value = parseJson(
      dumps({
        timeskeleton: SCHEMA_VERSION,
        timelines: [{ id: "score", unit: "quarters", length: [4, 1] }],
        measure_maps: [
          {
            id: "bars",
            rows: [{ count: 1, qstamp: 0, number: 1, actual_length: 4, nominal_length: null }],
          },
        ],
      }),
    ) as Json;
    expect(writeText("toml", value)).toEqual({
      ok: false,
      problems: [
        {
          code: "not_representable",
          message:
            "TOML has no null, and the schema neither requires this member nor defaults it to null",
          path: ["measure_maps", 0, "rows", 0, "nominal_length"],
        },
      ],
    });
    for (const format of ["json", "yaml"] as const) {
      const read = readBack(format, written(format, value));
      expect(dumps(read)).toBe(dumps(value));
      expect(at(read, "measure_maps", 0, "rows", 0, "nominal_length")).toBe(null);
    }
  });

  it("leaves a missing member that may not be null to the schema check", () => {
    const store = storeOf("bare");
    const text = written("toml", manifestIn(store, A)).replace('id = "bare"\n', "");
    const applied = applyText(store, A, "toml", text, FILE_FORM);
    expect(applied.ok ? applied : applied.problems.map(({ code, path }) => [code, path])).toEqual([
      ["schema_violation", ["timelines", 0]],
    ]);
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
    const applied = applyText(store, A, "json", text, FILE_FORM);
    expect(applied.ok).toBe(true);
    expect(store.journal).toHaveLength(2);
    expect((store.journal[1] as CommandEntry | undefined)?.command).toEqual({
      type: "set",
      changes: [{ target: A, values: { manifest: parsed } }],
    });
    expect(dumps(manifestIn(store, A))).toBe(dumps(parsed));
    expect(applyText(store, A, "json", text, FILE_FORM).ok).toBe(true);
    expect(store.journal).toHaveLength(2);
  });

  it("is the inspector's to skip: the store refuses a set that changes nothing", () => {
    const store = styledBare();
    const before = dumps(manifestIn(store, A));
    const refusal = store.dispatch({
      type: "set",
      changes: [{ target: A, values: { manifest: manifestIn(store, A) } }],
    });
    expect(refusal).toEqual({
      code: "invalid_value",
      message: "the command changes nothing",
      path: [A, "manifest"],
    });
    expect(store.journal).toHaveLength(2);
    expect(dumps(manifestIn(store, A))).toBe(before);
  });

  it("returns a refusal with its path into the text", () => {
    const store = storeOf("bare");
    const json = written("json", manifestIn(store, A));
    const locked = applyText(
      store,
      A,
      "json",
      json.replace('"locked": false', '"locked": "yes"'),
      FILE_FORM,
    );
    expect(locked).toEqual({
      ok: false,
      problems: [
        {
          code: "schema_violation",
          message: "must be boolean",
          path: ["timelines", 0, "locked"],
        },
      ],
    });
    if (locked.ok) throw new Error("accepted");
    expect(problemPointer(locked.problems[0] as never)).toBe("/timelines/0/locked");
    const unit = applyText(
      store,
      A,
      "json",
      json.replace('"unit": "quarters"', '"unit": "parsecs"'),
      FILE_FORM,
    );
    if (unit.ok) throw new Error("accepted");
    expect(unit.problems.map((item) => [item.message, problemPointer(item)])).toEqual([
      ["must be equal to constant", "/timelines/0/unit"],
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
      const result = applyText(store, A, format, text, FILE_FORM);
      if (result.ok) throw new Error("accepted");
      const [problem] = result.problems;
      return [problem?.code, problem?.line, problem?.column];
    });
    expect(positions).toEqual([
      ["syntax_error", 19, 17],
      ["syntax_error", 14, 5],
      ["syntax_error", 16, 1],
    ]);
    expect(store.journal).toHaveLength(1);
  });
});

describe("comments", () => {
  for (const [format, nameLine, edited] of [
    ["yaml", "    name: Bare\n", "    # shown on the canvas\n    name: Hello # was Bare\n"],
    ["toml", 'name = "Bare"\n', '# shown on the canvas\nname = "Hello" # was Bare\n'],
  ] as const) {
    for (const mode of MODE_NAMES) {
      it(`survive Apply and an external change in ${format.toUpperCase()}, ${mode}`, () => {
        const options = MODES[mode];
        const store = styledBare();
        const original = written(format, manifestIn(store, A), options);
        expect(original).toContain(nameLine);
        const text = original.replace(nameLine, edited);
        const applied = applyText(store, A, format, text, options);
        if (!applied.ok) throw new Error(JSON.stringify(applied.problems));
        expect(applied.value.text).toBe(text);
        expect(at(manifestIn(store, A), "timelines", 0, "name")).toBe("Hello");
        setOrFail(store, `${A}/bare`, { name: "Bye" });
        const followed = follow(applied.value.source, manifestIn(store, A), options);
        if (!followed.ok) throw new Error(JSON.stringify(followed.problems));
        expect(followed.value.text).toBe(text.replace("Hello", "Bye"));
      });
    }
  }
});

describe("the four text modes", () => {
  /** The `graphical` member of the styled `bare`'s JSON text, complete and minimal. */
  const STYLED = {
    complete: [
      '  "graphical": {',
      '    "order": {},',
      '    "statements": [',
      "      {",
      '        "select": {',
      '          "element": "timeline"',
      "        },",
      '        "set": {',
      '          "stroke": "#800000"',
      "        }",
      "      }",
      "    ],",
      '    "styles": {}',
      "  },",
      "",
    ].join("\n"),
    minimal: [
      '  "graphical": {',
      '    "statements": [',
      "      {",
      '        "select": {',
      '          "element": "timeline"',
      "        },",
      '        "set": {',
      '          "stroke": "#800000"',
      "        }",
      "      }",
      "    ]",
      "  },",
      "",
    ].join("\n"),
  };
  const bare = fixtureText("bare");
  const bareMinimal = fixtureText("bare.minimal");
  /** The JSON text each mode shows; `graphical` sorts first. */
  const SHOWN: Record<Mode, string> = {
    "complete without styling": bare,
    "complete with styling": `{\n${STYLED.complete}${bare.slice(2)}`,
    "minimal without styling": bareMinimal,
    "minimal with styling": `{\n${STYLED.minimal}${bareMinimal.slice(2)}`,
  };
  /** The timeline's name changed from `Bare` to `Renamed`, in each format. */
  const RENAMED: Record<Format, readonly [string, string]> = {
    json: ['"name": "Bare"', '"name": "Renamed"'],
    yaml: ["name: Bare", "name: Renamed"],
    toml: ['name = "Bare"', 'name = "Renamed"'],
  };

  /** The value with the keys of every object in reverse order. */
  function reversedKeys(value: Json): Json {
    if (Array.isArray(value)) return value.map(reversedKeys);
    if (!isJsonObject(value)) return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, Json>)
        .reverse()
        .map(([key, item]) => [key, reversedKeys(item)]),
    );
  }

  for (const mode of MODE_NAMES) {
    const options = MODES[mode];
    const shown = parseJson(SHOWN[mode]) as Json;

    it(`shows the pinned text, ${mode}`, () => {
      // The texts with the styling are spliced in after the opening "{\n" of the files.
      expect([bare.slice(0, 2), bareMinimal.slice(0, 2)]).toEqual(["{\n", "{\n"]);
      expect(bareMinimal).not.toBe(bare);
      const store = styledBare();
      const manifest = manifestIn(store, A);
      expect(written("json", manifest, options)).toBe(SHOWN[mode]);
      expect(dumps(readBack("yaml", written("yaml", manifest, options)))).toBe(SHOWN[mode]);
      const toml = readBack("toml", written("toml", manifest, options));
      if (options.minimal) {
        const restored = { ...(shown as Record<string, Json>), name: null };
        expect(dumps(toml)).toBe(dumps(restored));
        expect(dumps(minimal(toml))).toBe(SHOWN[mode]);
      } else {
        expect(dumps(toml)).toBe(SHOWN[mode]);
      }
      for (const format of FORMATS) {
        const text = written(format, manifest, options);
        if (options.includeStyling) expect(text).toMatch(/graphical/);
        else expect(text).not.toMatch(/graphical/);
      }
    });

    for (const format of FORMATS) {
      it(`applies one edit in ${format.toUpperCase()}, ${mode}`, () => {
        const store = styledBare();
        const text = written(format, manifestIn(store, A), options);
        const [from, to] = RENAMED[format];
        const edited = text.replace(from, to);
        expect(edited).not.toBe(text);
        const applied = applyText(store, A, format, edited, options);
        if (!applied.ok) throw new Error(JSON.stringify(applied.problems));
        expect(store.journal).toHaveLength(3);
        const expected = parseJson(
          SHOWN["complete with styling"].replace('"name": "Bare"', '"name": "Renamed"'),
        );
        expect(dumps(manifestIn(store, A))).toBe(dumps(expected));
        expect(applied.value.text).toBe(written(format, manifestIn(store, A), options));
      });

      it(`dispatches nothing for the shown ${format.toUpperCase()} text, ${mode}`, () => {
        const store = styledBare();
        const text = written(format, manifestIn(store, A), options);
        const applied = applyText(store, A, format, text, options);
        if (!applied.ok) throw new Error(JSON.stringify(applied.problems));
        expect(applied.value.text).toBe(text);
        expect(store.journal).toHaveLength(2);
      });
    }

    it(`dispatches nothing for another layout or key order of the JSON text, ${mode}`, () => {
      const store = styledBare();
      const text = written("json", manifestIn(store, A), options);
      const flat = text.replace(/\n */g, "");
      const reversed = compactJson(reversedKeys(shown) as never);
      const variants = [flat, reversed];
      if (options.minimal) {
        variants.push(text.replace('"id": "bare",', '"id": "bare",\n      "locked": false,'));
      }
      expect(new Set([text, ...variants]).size).toBe(variants.length + 1);
      for (const variant of variants) {
        const applied = applyText(store, A, "json", variant, options);
        if (!applied.ok) throw new Error(JSON.stringify(applied.problems));
        expect(applied.value.text).toBe(text);
      }
      expect(store.journal).toHaveLength(2);
    });

    if (options.includeStyling) {
      it(`replaces the styling as well, ${mode}`, () => {
        const store = styledBare();
        const text = written("json", manifestIn(store, A), options);
        const edited = text.replace('"#800000"', '"#008000"');
        expect(edited).not.toBe(text);
        const applied = applyText(store, A, "json", edited, options);
        if (!applied.ok) throw new Error(JSON.stringify(applied.problems));
        expect(store.journal).toHaveLength(3);
        expect(dumps(at(manifestIn(store, A), "graphical"))).toBe(
          dumps({
            order: {},
            statements: [{ select: { element: "timeline" }, set: { stroke: "#008000" } }],
            styles: {},
          }),
        );
      });
    } else {
      it(`refuses a graphical typed into the text, ${mode}`, () => {
        const store = styledBare();
        const text = written("yaml", manifestIn(store, A), options);
        expect(applyText(store, A, "yaml", `${text}graphical: {}\n`, options)).toEqual({
          ok: false,
          problems: [
            {
              code: "hidden_member",
              message: "the styling is excluded; check Include styling to edit graphical",
              path: ["graphical"],
            },
          ],
        });
        expect(store.journal).toHaveLength(2);
      });
    }
  }
});

describe("the text state", () => {
  /** A text state following block `A` of a store holding `bare` and `styled__score`. */
  function following(): { store: Store; text: ManifestText } {
    const store = storeOf("bare", "styled__score");
    const text = new ManifestText();
    text.follow(blockIn(store, A));
    return { store, text };
  }

  const COMPLETE: TextOptions = { includeStyling: false, minimal: false };

  it("shows the selected block's manifest while the text is clean", () => {
    const { store, text } = following();
    expect([text.text, text.dirty, text.stale]).toEqual([
      written("json", manifestIn(store, A), COMPLETE),
      false,
      false,
    ]);
    text.follow(blockIn(store, B));
    expect(text.text).toBe(written("json", manifestIn(store, B), COMPLETE));
    text.follow(null);
    expect([text.text, text.dirty, text.problems]).toEqual(["", false, []]);
  });

  it("keeps an edited text, notes a change, and applies it to the block it was written for", () => {
    const { store, text } = following();
    const shown = text.text;
    text.text = shown.replace('"name": "Bare"', '"name": "Hello"');
    setOrFail(store, `${A}/bare`, { name: "Bye" });
    text.follow(blockIn(store, A));
    text.follow(blockIn(store, B));
    expect([text.text.includes('"name": "Hello"'), text.dirty, text.stale]).toEqual([
      true,
      true,
      true,
    ]);
    text.apply(store);
    expect(store.journal).toHaveLength(4);
    expect(at(manifestIn(store, A), "timelines", 0, "name")).toBe("Hello");
    expect([text.text, text.dirty, text.stale]).toEqual([
      written("json", manifestIn(store, A), COMPLETE),
      false,
      false,
    ]);
  });

  it("follows at once when the text is typed back to the shown text", () => {
    const { store, text } = following();
    const shown = text.text;
    text.text = `${shown} `;
    setOrFail(store, `${A}/bare`, { name: "Bye" });
    text.follow(blockIn(store, A));
    expect(text.stale).toBe(true);
    text.text = shown;
    text.follow(blockIn(store, A));
    expect([text.text, text.stale]).toEqual([
      written("json", manifestIn(store, A), COMPLETE),
      false,
    ]);
  });

  it("drops a refused Apply's problems with the refused text and keeps a problem of writing", () => {
    const { store, text } = following();
    const shown = text.text;
    text.text = shown.slice(0, -2);
    text.apply(store);
    expect([text.problems.map((problem) => problem.code), text.dirty]).toEqual([
      ["syntax_error"],
      true,
    ]);
    text.text = shown;
    text.follow(blockIn(store, A));
    expect([text.problems, text.dirty, store.journal.length]).toEqual([[], false, 2]);

    const nulls = storeOf(nominalNull());
    const toml = new ManifestText();
    toml.format = "toml";
    toml.follow(blockIn(nulls, A));
    const problems = () => toml.problems.map((problem) => [problem.code, problemPointer(problem)]);
    expect([toml.text, problems()]).toEqual([
      "",
      [["not_representable", "/measure_maps/0/rows/0/nominal_length"]],
    ]);
    toml.text = "x";
    toml.text = "";
    toml.follow(blockIn(nulls, A));
    expect(problems()).toEqual([["not_representable", "/measure_maps/0/rows/0/nominal_length"]]);
  });

  it("reverts to the selected block's manifest, or to nothing", () => {
    const { store, text } = following();
    text.text = "{}";
    setOrFail(store, `${A}/bare`, { name: "Bye" });
    text.revert(blockIn(store, A));
    expect([text.text, text.dirty, text.stale]).toEqual([
      written("json", manifestIn(store, A), COMPLETE),
      false,
      false,
    ]);
    text.text = "{}";
    text.revert(null);
    expect([text.text, text.dirty]).toEqual(["", false]);
  });

  it("writes the text again when the format or an option changes", () => {
    const { store, text } = following();
    text.format = "yaml";
    text.minimal = true;
    text.follow(blockIn(store, A));
    expect(text.text).toBe(written("yaml", manifestIn(store, A), { ...COMPLETE, minimal: true }));
  });
});
