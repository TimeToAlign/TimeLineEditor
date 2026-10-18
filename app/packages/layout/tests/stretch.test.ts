import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type DrawnElement,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import { bandOrder, drawFixture, edit, element, metrics, set } from "./support.ts";

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
      xs: 49.91552734375,
      xe: 249.91552734375,
      y: 51,
    });
  });

  it("spaces the root's row and every child row one pitch apart", () => {
    const rows: [number, [number, number, number]][] = [
      [0.5, [44.01171875, 31.20703125, 18.40234375]],
      [1, [51, 37, 23]],
      [2, [94, 66, 38]],
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
      [0.5, 18.40234375, 59.37890625],
      [1, 22.40234375, 67.37890625],
      [2, 30.40234375, 83.37890625],
    ];
    for (const [spacing, yRoot, height] of rows) {
      const drawing = drawFixture("bare", [], { ...DEFAULT_PLACEMENT, spacing });
      expect(element(drawing, "bare"), `${spacing}`).toMatchObject({ y: yRoot });
      expect([drawing.width, drawing.height], `${spacing}`).toEqual([476.5771484375, height]);
      expect(drawing.height - 67.37890625).toBe(2 * 8 * (spacing - 1));
    }
  });

  it("ends a break line at the stretched padding below", () => {
    const drawing = drawFixture("flow_control", [], { ...DEFAULT_PLACEMENT, spacing: 2 });
    expect(drawing.height).toBe(130.33203125);
    expect(element(drawing, "flow:quarters")).toMatchObject({ y: 30.40234375 });
    expect(drawing.elements.find((item) => item.type === "break")).toMatchObject({
      y1: 75.85546875,
      y2: 24,
    });
  });

  it("ends a break of a flow control band above the line at the stretched padding", () => {
    const order = bandOrder(
      "flow:quarters",
      ["flow_control", "children", "conversion_maps"],
      ["markers", "regions"],
    );
    const manifest = edit("flow_control", set("flow:quarters", { order }));
    const drawing = draw(
      manifest,
      { ...DEFAULT_PLACEMENT, spacing: 2 },
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    expect(drawing.height).toBe(125.4296875);
    expect(element(drawing, "flow:quarters")).toMatchObject({ y: 72.453125 });
    expect(drawing.elements.find((item) => item.type === "break")).toMatchObject({
      y1: 52.4765625,
      y2: 99.4296875,
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
