import { dumps, JsonFloat, migrate, parse, SCHEMA_VERSION } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import type { Document, LoadError, TimelineManifest } from "../src/index.ts";
import {
  apply,
  InvalidDocumentError,
  isCommandError,
  isLoadError,
  loadDocument,
  saveDocument,
} from "../src/index.ts";
import type { JsonObject } from "../src/json.ts";
import { goldenFixtures, load, migrationPairs, rejections } from "./support.ts";

function loaded(text: string): Document {
  const document = loadDocument(text);
  if (isLoadError(document)) throw new Error(JSON.stringify(document.problems));
  return document;
}

function refused(text: string): LoadError {
  const result = loadDocument(text);
  if (!isLoadError(result)) throw new Error("the document was accepted");
  return result;
}

/** The first root timeline of a document. */
function firstRoot(document: Document): TimelineManifest {
  return Object.values(document.manifest.timelines)[0] as TimelineManifest;
}

describe("golden fixtures round-trip byte for byte", () => {
  it.each(goldenFixtures.map((fixture) => [fixture.name, fixture.text]))("%s", (_, text) => {
    expect(saveDocument(loaded(text))).toBe(text);
  });
});

describe("shared rejections are refused at the path they pin", () => {
  it.each(rejections.map((item) => [item.name, item]))("%s", (_, item) => {
    const { problems } = refused(item.text);
    expect(problems.map((entry) => entry.path)).toEqual([item.path]);
  });
});

describe("migrations", () => {
  const latest = migrationPairs.filter((pair) => pair.target === SCHEMA_VERSION);

  it("ships a pair that ends at the installed schema version", () => {
    expect(latest.length).toBe(1);
  });

  it.each(latest.map((pair) => [pair.name, pair]))("%s: before saves as after", (_, pair) => {
    expect(saveDocument(loaded(pair.before))).toBe(pair.after);
  });

  it.each(migrationPairs.map((pair) => [pair.name, pair]))(
    "%s: before saves as the migration chain writes it",
    (_, pair) => {
      expect(saveDocument(loaded(pair.before))).toBe(dumps(migrate(parse(pair.before))));
    },
  );
});

describe("integers above 2^53 survive load and save", () => {
  it("in an int coordinate", () => {
    const fixture = goldenFixtures.find((item) => item.name === "discrete_logical.json");
    const text = (fixture?.text ?? "").replace('"value": 480', '"value": 9007199254740993');
    expect(text).toContain("9007199254740993");
    const document = loaded(text);
    expect(firstRoot(document).length.value).toBe(9007199254740993n);
    expect(saveDocument(document)).toBe(text);
  });

  it("in a Fraction pair", () => {
    const fixture = goldenFixtures.find((item) => item.name === "continuous_logical.json");
    const pattern = /"value": \[\n(\s+)12,\n(\s+)1\n/;
    const text = (fixture?.text ?? "").replace(pattern, '"value": [\n$19007199254740993,\n$22\n');
    expect(text).toContain("9007199254740993");
    const document = loaded(text);
    expect(firstRoot(document).length.value).toEqual([9007199254740993n, 2]);
    expect(saveDocument(document)).toBe(text);
  });
});

describe("canonical order", () => {
  it("orders names by code point, not by UTF-16 code unit", () => {
    const names = ["\u{1F3B5}", "～"];
    expect([...names].sort()).toEqual(["\u{1F3B5}", "～"]);
    let document: Document | ReturnType<typeof apply> = load("empty.json");
    const commands = [
      {
        type: "createTimeline",
        id: "a",
        class: "ContinuousLogicalTimeline",
        unit: "quarters",
        number_type: "fraction",
        length: { unit: "quarters", number_type: "fraction", value: [4, 1] },
      },
      ...names.map((name) => ({
        type: "setMarker",
        timeline: "a",
        name,
        coordinate: { unit: "quarters", number_type: "fraction", value: [1, 1] },
      })),
    ];
    for (const command of commands) {
      document = apply(document as Document, command as never);
      expect(isCommandError(document)).toBe(false);
    }
    const text = saveDocument(document as Document);
    const saved = parse(text) as unknown as Document;
    const markers = saved.manifest.timelines.a?.flow_control.markers ?? {};
    expect(Object.keys(markers)).toEqual(["\uFF5E", "\u{1F3B5}"]);
  });
});

describe("invariants", () => {
  it("refuses a schema-valid document with every violation listed", () => {
    const fixture = goldenFixtures.find((item) => item.name === "with_region.json");
    const document = parse(fixture?.text ?? "") as JsonObject;
    const [id, root] = Object.entries(
      (document.manifest as JsonObject).timelines as JsonObject,
    )[0] as [string, JsonObject];
    const [childId, child] = Object.entries(root.children as JsonObject)[0] as [string, JsonObject];
    const [region] = root.regions as JsonObject[];
    const broken = {
      ...root,
      children: {
        ...(root.children as JsonObject),
        [childId]: { ...child, timeline: { ...(child.timeline as JsonObject), locked: false } },
      },
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
      regions: [region, region],
    };
    const text = dumps({ ...document, manifest: { timelines: { [id]: broken } } });
    const base = ["manifest", "timelines", id];
    expect(refused(text).problems.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "child_not_locked", path: [...base, "children", childId, "timeline", "locked"] },
      { code: "map_source_unit_mismatch", path: [...base, "conversion_maps", 0, "source_unit"] },
      { code: "duplicate_region", path: [...base, "regions", 1, "name"] },
    ]);
    expect(() => saveDocument(parse(text) as unknown as Document)).toThrow(InvalidDocumentError);
  });

  describe("each invariant is refused on load at its path", () => {
    type Node = Record<string, unknown>;
    /** The object at `keys` below `value`, for changing a copy in place. */
    const node = (value: unknown, ...keys: (string | number)[]): Node =>
      keys.reduce<unknown>((current, key) => (current as Node)[key], value) as Node;
    const source = goldenFixtures.find((item) => item.name === "with_region.json")?.text ?? "";
    const base = parse(source) as JsonObject;
    const rootId = Object.keys(node(base, "manifest", "timelines"))[0] as string;
    const rootPath = ["manifest", "timelines", rootId];
    const [first = "", second = ""] = Object.keys(node(base, ...rootPath, "children"));
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
    const shift = { type: "ShiftMap", id: "s", name: null, source_unit: null, target_unit: null };
    const cases: [string, (document: Node) => void, (string | number)[]][] = [
      [
        "unit_not_allowed",
        (document) =>
          Object.assign(node(document, ...rootPath), { class: "DiscreteLogicalTimeline" }),
        [...rootPath, "unit"],
      ],
      [
        "child_unit_mismatch",
        (document) => {
          const child = node(document, ...childPath, "timeline");
          const length = { ...node(child, "length"), unit: "whole_note" };
          Object.assign(child, { unit: "whole_note", length });
        },
        [...childPath, "timeline", "unit"],
      ],
      [
        "invalid_coordinate",
        (document) =>
          Object.assign(node(document, ...rootPath, "length"), { value: [2n ** 63n, 1] }),
        [...rootPath, "length", "value"],
      ],
      [
        "off_axis",
        (document) => Object.assign(node(document, ...rootPath, "regions", 0), { start: float(2) }),
        [...rootPath, "regions", 0, "start"],
      ],
      [
        "negative_offset",
        (document) =>
          Object.assign(node(document, ...childPath), {
            offset: { ...quarters(-1), value: [-1, 3] },
          }),
        [...childPath, "offset"],
      ],
      [
        "child_exceeds_parent",
        (document) => Object.assign(node(document, ...childPath), { offset: quarters(9) }),
        [...childPath, "offset"],
      ],
      [
        "region_end_before_start",
        (document) =>
          Object.assign(node(document, ...rootPath, "regions", 0), { end: quarters(1) }),
        [...rootPath, "regions", 0, "end"],
      ],
      [
        "duplicate_map",
        (document) =>
          Object.assign(node(document, ...rootPath), {
            conversion_maps: [
              { ...shift, offset: 1 },
              { ...shift, offset: 2 },
            ],
          }),
        [...rootPath, "conversion_maps", 1, "id"],
      ],
      [
        "metric_hierarchy_without_measure_map",
        (document) => Object.assign(node(document, ...rootPath), { metric_hierarchy: {} }),
        [...rootPath, "metric_hierarchy"],
      ],
      [
        "duplicate_timeline",
        (document) => {
          const nested = {
            offset: quarters(0),
            timeline: node(document, ...rootPath, "children", second, "timeline"),
          };
          Object.assign(node(document, ...childPath, "timeline"), {
            children: { [second]: nested },
          });
        },
        [...rootPath, "children", second, "timeline", "id"],
      ],
      [
        "key_mismatch",
        (document) => Object.assign(node(document, ...childPath, "timeline"), { id: "elsewhere" }),
        [...childPath, "timeline", "id"],
      ],
      [
        "number_type_not_allowed",
        (document) => {
          const ticks = {
            ...node(document, ...rootPath),
            id: "ticks",
            class: "DiscreteLogicalTimeline",
            unit: "ticks",
            length: { unit: "ticks", number_type: "fraction", value: [1, 1] },
            children: {},
            regions: [],
          };
          Object.assign(node(document, "manifest", "timelines"), { ticks });
        },
        ["manifest", "timelines", "ticks", "number_type"],
      ],
    ];

    it("accepts a child of another number type and writes it as loaded", () => {
      const document = parse(dumps(base)) as Node;
      Object.assign(node(document, ...childPath, "timeline"), {
        number_type: "float",
        length: float(4),
      });
      const text = dumps(document);
      expect(text).toContain('"value": 4.0');
      expect(saveDocument(loaded(text))).toBe(text);
    });

    it.each(cases)("%s", (code, change, path) => {
      const document = parse(dumps(base)) as Node;
      change(document);
      const { problems } = refused(dumps(document));
      expect(problems.map((item) => ({ code: item.code, path: item.path }))).toEqual([
        { code, path },
      ]);
    });

    it("migration_failed", () => {
      const pair = migrationPairs.find((item) => item.target === "0.2.0");
      const text = (pair?.before ?? "").replace('"class": "RegularMeasure"', '"class": "Bar"');
      const id = Object.keys(
        ((parse(text) as JsonObject).manifest as JsonObject).timelines as JsonObject,
      )[0];
      const problems = refused(text).problems.map(({ code, path }) => ({ code, path }));
      expect(problems).toEqual([
        {
          code: "migration_failed",
          path: ["manifest", "timelines", id, "measure_map", "measures", 1, "class"],
        },
      ]);
    });
  });

  it("refuses malformed text", () => {
    expect(refused('{"meta": ').problems.map(({ code, path }) => ({ code, path }))).toEqual([
      { code: "invalid_json", path: [] },
    ]);
  });
});
