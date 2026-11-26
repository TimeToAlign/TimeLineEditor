import { readFileSync } from "node:fs";
import { JsonFloat, parseJson } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import { isLoadError } from "../src/errors.ts";
import { normalizeManifest } from "../src/manifest/io.ts";
import type { ConversionMap, TimelineManifest } from "../src/manifest/types.ts";
import { compileMap } from "../src/maps/compile.ts";
import type { Expressed } from "../src/maps/express.ts";
import { express } from "../src/maps/express.ts";
import type { MapInput, MeasureKnot, MeasureKnots } from "../src/maps/values.ts";
import { Rational } from "../src/number/rational.ts";

const TABLE = new URL("./parity/maps.json", import.meta.url);

function isObject(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function member(value: unknown, key: string): unknown {
  if (!isObject(value) || !(key in value)) throw new Error(`no member ${key}`);
  return value[key];
}

function list(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("not a list");
  return value;
}

function integer(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  throw new Error(`not an integer: ${String(value)}`);
}

function double(value: unknown): number {
  if (value instanceof JsonFloat) return value.value;
  if (typeof value === "number") return value;
  throw new Error(`not a float: ${String(value)}`);
}

/** A recorded result in one comparable form: ints and pairs as bigints, floats as doubles. */
function expectedOf(recorded: unknown): unknown {
  if (recorded === null) return null;
  const type = member(recorded, "type");
  const value = member(recorded, "value");
  switch (type) {
    case "int":
      return { type, value: integer(value) };
    case "float":
      return { type, value: double(value) };
    case "fraction":
      return { type, value: list(value).map(integer) };
    case "string":
      return { type, value };
    case "record":
      return { type, value: { ID: member(value, "ID"), count: integer(member(value, "count")) } };
    case "outputs": {
      if (!isObject(value)) throw new Error("outputs are an object");
      return {
        type,
        value: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expectedOf(v)])),
      };
    }
    default:
      throw new Error(`unknown kind ${String(type)}`);
  }
}

/** An expressed result in the form `expectedOf` gives. */
function recordedOf(result: Expressed | undefined): unknown {
  if (result === undefined) return null;
  if (typeof result === "string") return { type: "string", value: result };
  if ("record" in result) {
    return { type: "record", value: { ID: result.record.ID, count: BigInt(result.record.count) } };
  }
  if ("outputs" in result) {
    return {
      type: "outputs",
      value: Object.fromEntries(Object.entries(result.outputs).map(([k, v]) => [k, recordedOf(v)])),
    };
  }
  const { numberType, value } = result;
  if (value instanceof Rational) {
    return { type: numberType, value: [value.numerator, value.denominator] };
  }
  return { type: numberType, value };
}

function inputOf(recorded: unknown): MapInput {
  const type = member(recorded, "type");
  const value = member(recorded, "value");
  if (type === "int") return integer(value);
  if (type === "float") return double(value);
  const [numerator, denominator] = list(value).map(integer);
  if (numerator === undefined || denominator === undefined) throw new Error("not a pair");
  return Rational.fromParts(numerator, denominator);
}

/** A row's volta as the server answers it: null, one pass or a list of passes. */
function voltaOf(value: unknown): number | readonly number[] | null {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((pass) => Number(integer(pass)));
  return Number(integer(value));
}

function knotsOf(value: unknown): readonly MeasureKnots[] {
  const pair = (item: unknown): readonly [number, number] | null => {
    if (item === null) return null;
    const [n, d] = list(item).map((part) => Number(integer(part)));
    if (n === undefined || d === undefined) throw new Error("not a pair");
    return [n, d];
  };
  return list(value).map((entry) => ({
    id: String(member(entry, "id")),
    rows: list(member(entry, "rows")).map((row) => {
      const number = member(row, "number");
      const offset = pair(member(row, "offset_within_measure"));
      if (offset === null) throw new Error("a row states its offset");
      return {
        ID: String(member(row, "ID")),
        name: String(member(row, "name")),
        count: Number(integer(member(row, "count"))),
        number: number === null ? null : Number(integer(number)),
        qstamp: pair(member(row, "qstamp")),
        nominal_length: pair(member(row, "nominal_length")),
        actual_length: pair(member(row, "actual_length")),
        volta: voltaOf(member(row, "volta")),
        offset_within_measure: offset,
      };
    }),
  }));
}

const table = parseJson(readFileSync(TABLE, "utf-8"));
const manifest = normalizeManifest(member(table, "manifest"));
if (isLoadError(manifest)) {
  throw new Error(`the parity manifest is refused: ${JSON.stringify(manifest)}`);
}
const knots = knotsOf(member(table, "knots"));

function mapsOf(timeline: TimelineManifest): readonly ConversionMap[] {
  return [...timeline.conversion_maps, ...timeline.children.flatMap(mapsOf)];
}
const maps = new Map(manifest.timelines.flatMap(mapsOf).map((map) => [map.id, map]));

describe("parity with timetoalign", () => {
  const cases = list(member(table, "cases"));
  it("covers every map of the manifest", () => {
    const named = cases.map((item) => String(member(item, "map")));
    expect(named.sort()).toEqual([...maps.keys()].sort());
  });
  for (const item of cases) {
    const id = String(member(item, "map"));
    it(`answers ${id} as timetoalign does`, () => {
      const map = maps.get(id);
      if (map === undefined) throw new Error(`no map ${id}`);
      const evaluator = compileMap(map, { knots });
      for (const point of list(member(item, "points"))) {
        const x = inputOf(member(point, "x"));
        const result = evaluator.evaluate(x);
        const expressed = result === undefined ? undefined : express(result, evaluator.targetUnit);
        expect(recordedOf(expressed), `${id} at ${String(x)}`).toEqual(
          expectedOf(member(point, "result")),
        );
      }
    });
  }
});

/** A LinearMap in the complete form. */
function linear(
  id: string,
  scalar: readonly [number, number] | number,
  offset: readonly [number, number] | number,
  target: "seconds" | "samples" | "quarters" | "ticks" = "seconds",
): ConversionMap {
  return {
    type: "LinearMap",
    id,
    name: null,
    source_unit: "quarters",
    target_unit: target,
    scalar,
    offset,
  };
}

function view(type: "MeasureNumberMap", id: string): ConversionMap {
  return { type, id, name: null, source_unit: "quarters", target_unit: null, measure_map: "bars" };
}

const pieces: ConversionMap = {
  type: "PiecewiseMap",
  id: "pieces",
  name: null,
  source_unit: "quarters",
  target_unit: "seconds",
  breaks: [0, 4, 16],
  maps: [linear("first", [1, 2], 0), linear("second", [3, 5], [-2, 5])],
};

function at(map: ConversionMap, x: MapInput): Expressed | undefined {
  const evaluator = compileMap(map, {});
  const result = evaluator.evaluate(x);
  return result === undefined ? undefined : express(result, evaluator.targetUnit);
}

const q = (n: number, d = 1) => Rational.fromParts(BigInt(n), BigInt(d));

describe("hand values", () => {
  it("evaluates the PiecewiseMap exactly and expresses it on seconds", () => {
    const evaluator = compileMap(pieces, {});
    expect(evaluator.evaluate(6n)).toEqual(q(16, 5));
    expect(at(pieces, 6n)).toEqual({ unit: "seconds", numberType: "float", value: 3.2 });
    expect(at(pieces, q(31, 8))).toEqual({ unit: "seconds", numberType: "float", value: 1.9375 });
    expect(evaluator.evaluate(16n)).toBeUndefined();
  });

  it("rounds an exact result half to even onto samples", () => {
    const samples = linear("samples", [165375, 8], 507150, "samples");
    expect(compileMap(samples, {}).evaluate(q(1, 3))).toEqual(q(4112325, 8));
    expect(at(samples, q(1, 3))).toEqual({ unit: "samples", numberType: "int", value: 514041n });
    const half = linear("half", [1, 2], 0, "samples");
    expect(at(half, 5n)).toEqual({ unit: "samples", numberType: "int", value: 2n });
    expect(at(half, 7n)).toEqual({ unit: "samples", numberType: "int", value: 4n });
    expect(at(half, -5n)).toEqual({ unit: "samples", numberType: "int", value: -2n });
    expect(at(half, 5)).toEqual({ unit: "samples", numberType: "int", value: 2n });
  });
});

describe("express", () => {
  it("writes a float onto a fraction unit as its exact value, an exact value onto a float unit as the nearest double", () => {
    expect(express(0.1, "quarters")).toEqual({
      unit: "quarters",
      numberType: "fraction",
      value: Rational.fromParts(3602879701896397n, 36028797018963968n),
    });
    expect(express(q(1, 3), "seconds")).toEqual({
      unit: "seconds",
      numberType: "float",
      value: 0.3333333333333333,
    });
  });

  it("refuses an infinite float onto an int or fraction unit", () => {
    expect(express(Number.POSITIVE_INFINITY, "samples")).toBeUndefined();
    expect(express(Number.NEGATIVE_INFINITY, "quarters")).toBeUndefined();
  });

  it("keeps the kind of a result without a target unit, and passes strings and records", () => {
    expect(express(3n, null)).toEqual({ unit: null, numberType: "int", value: 3n });
    expect(express(q(3), null)).toEqual({ unit: null, numberType: "fraction", value: q(3) });
    expect(express(0.5, null)).toEqual({ unit: null, numberType: "float", value: 0.5 });
    expect(express("intro", "seconds")).toBe("intro");
    const record = {
      record: {
        ID: "1",
        name: "1",
        count: 1,
        number: 1,
        qstamp: [0, 1] as const,
        nominal_length: null,
        actual_length: null,
        volta: null,
        offset_within_measure: [0, 1] as const,
      },
    };
    expect(express(record, "seconds")).toBe(record);
    expect(express({ outputs: { n: 2n, beat: q(5, 2) } }, null)).toEqual({
      outputs: {
        n: { unit: null, numberType: "int", value: 2n },
        beat: { unit: null, numberType: "fraction", value: q(5, 2) },
      },
    });
  });
});

describe("compiled once per map object", () => {
  it("memoizes by the map object and the rows list, never by value", () => {
    const map = linear("once", [1, 2], 0);
    expect(compileMap(map, {})).toBe(compileMap(map, {}));
    expect(compileMap(map, { knots })).toBe(compileMap(map, { knots }));
    expect(compileMap({ ...map }, {})).not.toBe(compileMap(map, {}));
    expect(compileMap(map, { knots: [...knots] })).not.toBe(compileMap(map, { knots }));
  });
});

describe("without the expanded rows", () => {
  it("marks a measure view and a map holding one as missing them", () => {
    const number = view("MeasureNumberMap", "number");
    for (const context of [{}, { knots: [] }, { knots: [{ id: "other", rows: [] }] }]) {
      const evaluator = compileMap(number, context);
      expect(evaluator.missingKnots).toBe(true);
      expect(evaluator.evaluate(q(2))).toBeUndefined();
    }
    const chain: ConversionMap = {
      type: "ChainMap",
      id: "chain",
      name: null,
      source_unit: "quarters",
      target_unit: null,
      maps: [linear("shift", 1, 1, "quarters"), view("MeasureNumberMap", "number_2")],
    };
    expect(compileMap(chain, {}).missingKnots).toBe(true);
    expect(compileMap(chain, {}).evaluate(q(2))).toBeUndefined();
    expect(compileMap(linear("plain", 1, 0), {}).missingKnots).toBe(false);
    expect(compileMap(number, { knots }).missingKnots).toBe(false);
    expect(compileMap(number, { knots }).evaluate(q(2))).toBe(2n);
    expect(compileMap(chain, { knots }).evaluate(q(3))).toBe(3n);
  });
});

describe("outputs one by one", () => {
  it("lists an evaluator per output with its own target unit, in key order", () => {
    const combination = maps.get("q_combination");
    if (combination === undefined) throw new Error("no q_combination");
    const { outputs } = compileMap(combination, {});
    expect([...(outputs ?? new Map()).keys()]).toEqual(["seconds", "file", "count"]);
    expect([...(outputs ?? new Map()).values()].map((output) => output.targetUnit)).toEqual([
      "seconds",
      null,
      null,
    ]);
    expect(compileMap(pieces, {}).outputs).toBeNull();
  });
});

describe("compound floating measures", () => {
  type Pair = readonly [number, number];
  /** One expanded row; `number` null for a row without one. */
  const row = (
    count: number,
    number: number | null,
    qstamp: Pair,
    nominal: Pair,
    actual: Pair,
    offset: Pair = [0, 1],
    volta: number | null = null,
  ): MeasureKnot => ({
    ID: String(count),
    name: String(number ?? count),
    count,
    number,
    qstamp,
    nominal_length: nominal,
    actual_length: actual,
    volta,
    offset_within_measure: offset,
  });
  const floating: ConversionMap = {
    type: "FloatingMeasureMap",
    id: "floating",
    name: null,
    source_unit: "quarters",
    target_unit: "floating_measures",
    measure_map: "rows",
  };
  const reader = (rows: readonly MeasureKnot[]) => {
    const evaluator = compileMap(floating, { knots: [{ id: "rows", rows }] });
    return (x: MapInput) => evaluator.evaluate(x);
  };
  const three: Pair = [3, 1];
  const four: Pair = [4, 1];

  it("reads a split bar after an anacrusis as one bar (Op. 106/II)", () => {
    const rows = [row(1, 0, [0, 1], three, [1, 1], [2, 1])];
    for (let count = 2; count <= 46; count += 1) {
      rows.push(row(count, count - 1, [1 + 3 * (count - 2), 1], three, three));
    }
    rows.push(row(47, 46, [136, 1], three, [2, 1]));
    rows.push(row(48, 46, [138, 1], three, [1, 1], [2, 1]));
    rows.push(row(49, 47, [139, 1], three, three));
    const read = reader(rows);
    expect([0n, 136n, 137n, 138n, 139n, 142n].map(read)).toEqual([
      0.666, 46, 46.333, 46.666, 47, 48,
    ]);
  });

  it("reads three rows of one number as one measure of ten quarters (Op. 106/IV)", () => {
    const read = reader([
      row(1, 1, [0, 1], four, [23, 4]),
      row(2, 1, [23, 4], four, [3, 1]),
      row(3, 2, [35, 4], four, [17, 8]),
      row(4, 2, [87, 8], four, [15, 8], [17, 8]),
      row(5, 2, [51, 4], four, [6, 1]),
      row(6, 3, [75, 4], four, four),
    ]);
    expect([0n, q(23, 4), q(35, 4), q(87, 8), q(51, 4), q(75, 4)].map(read)).toEqual([
      1, 1.657, 2, 2.212, 2.4, 3,
    ]);
  });

  it("counts the endings under different volta brackets through as two measures", () => {
    const rows: MeasureKnot[] = [];
    for (let count = 1; count <= 14; count += 1) {
      rows.push(row(count, count, [4 * (count - 1), 1], four, four));
    }
    rows.push(row(15, 15, [56, 1], four, four, [0, 1], 1));
    rows.push(row(16, 15, [60, 1], four, four, [0, 1], 2));
    expect([56n, 60n, 64n].map(reader(rows))).toEqual([15, 16, 17]);
  });

  it("reads a Couperin musete bar split at a repeat sign as one bar", () => {
    const sixEight: Pair = [3, 1];
    const half: Pair = [3, 2];
    const read = reader([
      row(31, 28, [165, 2], sixEight, half),
      row(32, 28, [84, 1], sixEight, half, half),
      row(33, 29, [171, 2], sixEight, sixEight),
    ]);
    expect([q(165, 2), 84n, 85n, q(171, 2)].map(read)).toEqual([1, 1.5, 1.833, 2]);
  });

  it("reads a bar before a fine and the pickup after it as one bar (sq8913219)", () => {
    const threeFour: Pair = [3, 1];
    const read = reader([
      row(582, 577, [3125, 2], threeFour, threeFour),
      row(583, 578, [3131, 2], threeFour, threeFour),
      row(584, 578, [3137, 2], four, [1, 1], [3, 1]),
      row(585, 579, [3139, 2], four, four),
    ]);
    expect([q(3125, 2), q(3131, 2), q(3137, 2), q(3139, 2), q(3147, 2)].map(read)).toEqual([
      1, 2, 2.75, 3, 4,
    ]);
  });

  const twoRows = (
    first: number | null,
    second: number | null,
    secondNominal: Pair = [2, 1],
    voltas: readonly [number | null, number | null] = [null, null],
    secondOffset: Pair = [1, 2],
  ) =>
    reader([
      row(1, first, [0, 1], [2, 1], [1, 2], [0, 1], voltas[0]),
      row(2, second, [1, 2], secondNominal, [3, 2], secondOffset, voltas[1]),
    ]);

  it("joins adjacent rows of one number whatever their nominal lengths and offsets", () => {
    expect([0n, 1n, 2n].map(twoRows(5, 5))).toEqual([1, 1.5, 2]);
    expect([0n, 1n, 2n].map(twoRows(5, 5, [3, 1]))).toEqual([1, 1.5, 2]);
    expect([0n, q(1, 2), 2n].map(twoRows(5, 5, [2, 1], [null, null], [0, 1]))).toEqual([
      1, 1.25, 2,
    ]);
  });

  it("reads nothing where knots of rows that cannot join coincide", () => {
    for (const read of [twoRows(5, 6), twoRows(null, null), twoRows(5, 5, [2, 1], [1, 2])]) {
      expect([0n, 1n, 2n].map(read)).toEqual([undefined, undefined, undefined]);
    }
    const skeleton = reader([
      row(9, 9, [29, 1], four, [3, 1]),
      row(10, 10, [32, 1], four, [1, 1], [3, 1]),
      row(11, 11, [33, 1], four, four),
    ]);
    expect([29n, 32n, 33n].map(skeleton)).toEqual([undefined, undefined, undefined]);
  });
});
