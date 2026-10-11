import { describe, expect, it } from "vitest";
import { DEFAULT_PLACEMENT, type DrawnElement, type Placement } from "../src/index.ts";
import { drawFixture } from "./support.ts";

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
    expect(short.elements.find((item) => item.address === "tl:24")).toMatchObject({
      xs: 41.072265625,
      xe: 241.072265625,
      y: 43,
    });
  });

  it("spaces the root's row and every child row one pitch apart", () => {
    const rows: [number, [number, number, number]][] = [
      [0.5, [40.01171875, 27.20703125, 14.40234375]],
      [1, [43, 29, 15]],
      [2, [78, 50, 22]],
    ];
    for (const [spacing, expected] of rows) {
      const drawing = drawFixture("nested", [], { ...DEFAULT_PLACEMENT, spacing });
      const y = (address: string) => {
        const line = drawing.elements.find((item) => item.address === address);
        return line?.type === "timeline" || line?.type === "child" ? line.y : Number.NaN;
      };
      const [root, first, second] = [y("tl:24"), y("tl:23"), y("tl:22")];
      expect([root, first, second], `${spacing}`).toEqual(expected);
      expect(root - first).toBe(first - second);
    }
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
