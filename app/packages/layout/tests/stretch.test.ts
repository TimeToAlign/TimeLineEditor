import { describe, expect, it } from "vitest";
import { DEFAULT_PLACEMENT, type DrawnElement, type Placement } from "../src/index.ts";
import { drawFixture, element } from "./support.ts";

const NAMES = ["nested", "map", "flow_control", "with_region"] as const;

/** What a stretch must keep: type, address, style, text, and the marker's size. */
function sizes(item: DrawnElement): unknown {
  const kept: Record<string, unknown> = {
    type: item.type,
    address: item.address,
    style: item.style,
  };
  if (item.type === "name" || item.type === "label") kept.text = item.text;
  if (item.type === "wedge") kept.height = Math.abs(item.yb - item.yt);
  return kept;
}

describe("stretch", () => {
  for (const name of NAMES) {
    it(`keeps sizes of ${name} at every length and spacing`, () => {
      const natural = drawFixture(name).elements.map(sizes);
      for (const length of [200, 400, 800]) {
        for (const spacing of [0.5, 1, 2]) {
          const placement: Placement = { ...DEFAULT_PLACEMENT, length, spacing };
          expect(
            drawFixture(name, [], placement).elements.map(sizes),
            `${length} ${spacing}`,
          ).toEqual(natural);
        }
      }
      for (const item of drawFixture(name).elements) {
        if (item.type === "wedge") expect(Math.abs(item.yb - item.yt)).toBe(13);
      }
    });
  }

  it("moves along time by length", () => {
    const short = drawFixture("nested", [], { ...DEFAULT_PLACEMENT, length: 200 });
    expect(short.elements.find((item) => item.address === "clt_1")).toMatchObject({
      xs: 41.91552734375,
      xe: 241.91552734375,
      y: 43,
    });
  });

  it("spaces the root's row and every child row one pitch apart", () => {
    const rows: [number, [number, number, number]][] = [
      [0.5, [36.01171875, 23.20703125, 10.40234375]],
      [1, [43, 29, 15]],
      [2, [86, 58, 30]],
    ];
    for (const [spacing, expected] of rows) {
      const drawing = drawFixture("nested", [], { ...DEFAULT_PLACEMENT, spacing });
      const y = (address: string) => {
        const line = drawing.elements.find((item) => item.address === address);
        return line?.type === "timeline" || line?.type === "child" ? line.y : Number.NaN;
      };
      const [root, first, second] = [y("clt_1"), y("clt_3"), y("clt_2")];
      expect([root, first, second], `${spacing}`).toEqual(expected);
      expect(root - first).toBe(first - second);
    }
  });
});

describe("vertical padding", () => {
  it("grows a root alone by the padding above and below it", () => {
    const rows: [number, number, number][] = [
      [0.5, 10.40234375, 41.37890625],
      [1, 14.40234375, 49.37890625],
      [2, 22.40234375, 65.37890625],
    ];
    for (const [spacing, yRoot, height] of rows) {
      const drawing = drawFixture("bare", [], { ...DEFAULT_PLACEMENT, spacing });
      expect(element(drawing, "bare"), `${spacing}`).toMatchObject({ y: yRoot });
      expect([drawing.width, drawing.height], `${spacing}`).toEqual([458.5771484375, height]);
      expect(drawing.height - 49.37890625).toBe(2 * 8 * (spacing - 1));
    }
  });

  it("ends a break line at the stretched padding below", () => {
    const drawing = drawFixture("flow_control", [], { ...DEFAULT_PLACEMENT, spacing: 2 });
    expect(drawing.height).toBe(112.33203125);
    expect(element(drawing, "flow:quarters")).toMatchObject({ y: 22.40234375 });
    expect(drawing.elements.find((item) => item.type === "break")).toMatchObject({
      y1: 67.85546875,
      y2: 16,
    });
  });

  it("ends a break line moved above at the stretched padding", () => {
    const drawing = drawFixture(
      "flow_control",
      [{ statements: [{ select: { element: "break" }, set: { side: "above" } }] }],
      { ...DEFAULT_PLACEMENT, spacing: 2 },
    );
    expect(drawing.height).toBe(105.9296875);
    expect(element(drawing, "flow:quarters")).toMatchObject({ y: 26.4765625 });
    expect(drawing.elements.find((item) => item.type === "break")).toMatchObject({
      y1: 16,
      y2: 89.9296875,
    });
  });
});

describe("box", () => {
  for (const name of NAMES) {
    it(`moves no element of ${name} and grows only the block`, () => {
      const natural = drawFixture(name);
      const boxed = drawFixture(name, [], {
        ...DEFAULT_PLACEMENT,
        width: natural.width + 120,
        height: natural.height + 60,
      });
      expect(boxed.elements.slice(1)).toEqual(natural.elements.slice(1));
      expect([boxed.width, boxed.height]).toEqual([natural.width + 120, natural.height + 60]);
      expect(boxed.elements[0]).toMatchObject({
        width: natural.width + 120,
        height: natural.height + 60,
      });
      const small = drawFixture(name, [], { ...DEFAULT_PLACEMENT, width: 1, height: 1 });
      expect(small).toEqual(natural);
    });
  }
});
