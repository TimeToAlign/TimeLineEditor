import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isProblem } from "../src/manifest/invariants.ts";
import { elementIn, parseAddressSyntax, qualify } from "../src/workspace/address.ts";
import { BLOCK_ID } from "../src/workspace/blocks.ts";
import { mintBlockId, nextId, TIMELINE_PREFIX } from "../src/workspace/ids.ts";
import { indexBetween, indicesBetween, isIndex } from "../src/workspace/order.ts";
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

  it("takes the smallest suffix no element of a one-root block carries, of any kind", () => {
    const bare = load("bare.json");
    const childOf = (id: string) => ({
      type: "add",
      into: `${A}/bare`,
      child: { ...bare.timelines[0], id, offset: [0, 1], locked: true },
    });
    let view = viewOf([A, "bare.json"]);
    expect(nextId(view, A, "clt")).toBe("clt_1");
    view = changed(changed(view, childOf("clt_1")), childOf("clt_3"));
    expect(nextId(view, A, "clt")).toBe("clt_2");
    const tempo = load("map.json").timelines[0]?.conversion_maps[0];
    view = changed(view, { type: "add", into: `${A}/bare`, map: { ...tempo, id: "map_1" } });
    expect(nextId(view, A, "map")).toBe("map_2");
    expect(nextId(view, B, "clt")).toBe("clt_1");
  });
});

describe("addresses", () => {
  it.each([
    ["workspace", null, []],
    ["0000000000", A, []],
    ["0000000000/clt_1", A, ["clt_1"]],
    ["0000000000/clt_1/start", A, ["clt_1", "start"]],
  ] as const)("splits %s and qualifies its element back", (text, block, segments) => {
    const parsed = parseAddressSyntax(text);
    expect(parsed).toEqual({ block, segments });
    if (isProblem(parsed) || parsed.block === null) return;
    const element = elementIn(parsed);
    expect(element === null ? parsed.block : qualify(parsed.block, element)).toBe(text);
  });

  it.each(["short", "0000000000/"])("refuses %s", (text) => {
    expect(refusal(parseAddressSyntax(text))).toEqual({ code: "invalid_address", path: [text] });
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
