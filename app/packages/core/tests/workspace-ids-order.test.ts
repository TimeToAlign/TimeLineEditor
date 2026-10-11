import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BLOCK_ID,
  formatAddress,
  indexBetween,
  indicesBetween,
  isIndex,
  isProblem,
  mintBlockId,
  nextId,
  parseAddress,
  TIMELINE_PREFIX,
} from "../src/index.ts";
import { A, B, changed, load, refusal, viewOf } from "./support.ts";

describe("block ids", () => {
  it("uses one byte per attempt and rejects the top four values", () => {
    const values = [252, 253, 254, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let calls = 0;
    expect(
      mintBlockId((bytes) => {
        bytes[0] = values[calls] as number;
        calls += 1;
      }),
    ).toBe("0123456789");
    expect(calls).toBe(14);
    expect(BLOCK_ID.test("0123456789")).toBe(true);
    expect(BLOCK_ID.test("012345678A")).toBe(false);
  });
});

describe("element ids", () => {
  it("pins all timeline prefixes", () => {
    expect(TIMELINE_PREFIX).toEqual({
      ContinuousLogicalTimeline: "clt",
      DiscreteLogicalTimeline: "dlt",
      ContinuousPhysicalTimeline: "cpt",
      DiscretePhysicalTimeline: "dpt",
      ContinuousGraphicalTimeline: "cgt",
      DiscreteGraphicalTimeline: "dgt",
    });
  });

  it("takes the smallest suffix no element of the block carries, of any kind", () => {
    const bare = load("bare.json");
    const childOf = (id: string) => ({
      type: "add",
      into: `${A}/bare`,
      child: {
        offset: { unit: "quarters", number_type: "fraction", value: [0, 1] },
        timeline: { ...bare.timeline, id, locked: true },
      },
    });
    let view = viewOf([A, "bare.json"]);
    expect(nextId(view, A, "clt")).toBe("clt_1");
    view = changed(changed(view, childOf("clt_1")), childOf("clt_3"));
    expect(nextId(view, A, "clt")).toBe("clt_2");
    const tempo = load("map.json").timeline.conversion_maps[0];
    view = changed(view, { type: "add", into: `${A}/bare`, map: { ...tempo, id: "map_1" } });
    expect(nextId(view, A, "map")).toBe("map_2");
    expect(nextId(view, B, "clt")).toBe("clt_1");
  });
});

describe("addresses", () => {
  it.each([
    ["workspace", { block: null, element: null }],
    ["0000000000", { block: A, element: null }],
    ["0000000000/clt_1", { block: A, element: "clt_1" }],
    ["0000000000/clt_1/start", { block: A, element: "clt_1/start" }],
  ] as const)("parses and formats %s", (text, expected) => {
    const parsed = parseAddress(text);
    expect(parsed).toEqual(expected);
    if (!isProblem(parsed)) expect(formatAddress(parsed)).toBe(text);
  });

  it.each(["short", "0000000000/"])("refuses %s", (text) => {
    expect(refusal(parseAddress(text))).toEqual({ code: "invalid_address", path: [text] });
  });
});

describe("fractional order", () => {
  it("pins the published vectors", () => {
    expect(indexBetween(null, null)).toBe("a0");
    expect(indexBetween("a0", null)).toBe("a1");
    expect(indexBetween(null, "a0")).toBe("Zz");
    expect(indexBetween("a0", "a1")).toBe("a0V");
  });

  it("refuses invalid keys and unordered bounds", () => {
    expect(isIndex("a0")).toBe(true);
    expect(isIndex("a00")).toBe(false);
    expect(isIndex("")).toBe(false);
    expect(() => indexBetween("a1", "a0")).toThrow(RangeError);
    expect(() => indicesBetween(null, null, -1)).toThrow(RangeError);
  });

  it("always creates valid strictly increasing batches", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30 }), (count) => {
        const keys = indicesBetween(null, null, count);
        expect(keys.length).toBe(count);
        keys.forEach((key) => {
          expect(isIndex(key)).toBe(true);
        });
        for (let index = 1; index < keys.length; index += 1) {
          expect((keys[index - 1] as string) < (keys[index] as string)).toBe(true);
        }
      }),
    );
  });

  it("always creates a key strictly between generated bounds", () => {
    const keys = indicesBetween(null, null, 40);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 38 }),
        fc.integer({ min: 1, max: 39 }),
        (left, right) => {
          fc.pre(left < right);
          const a = keys[left] as string;
          const b = keys[right] as string;
          const middle = indexBetween(a, b);
          expect(a < middle && middle < b).toBe(true);
          expect(isIndex(middle)).toBe(true);
        },
      ),
    );
  });
});
