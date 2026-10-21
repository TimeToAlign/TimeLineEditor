import { sameAddress } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type DrawnElement,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import { at, bandOrder, drawFixture, edit, element, metrics, set } from "./support.ts";

/** Each stretched fixture and the id of its one root, whose card's spacing a stretch sets. */
const ROOTS = {
  nested: "clt_1",
  map: "melody",
  flow_control: "flow:quarters",
  with_region: "clt_1",
} as const;
const NAMES = Object.keys(ROOTS) as (keyof typeof ROOTS)[];

/** The default placement at `length`, the card of `root` at the card spacing `spacing`. */
const spaced = (root: string, spacing: number, length = 400): Placement => ({
  ...DEFAULT_PLACEMENT,
  length,
  places: { [root]: { spacing } },
});

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
        for (const spacing of [0, 4, 8]) {
          const placement = spaced(ROOTS[name], spacing, length);
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
    expect(short.elements.find((item) => sameAddress(item.address, at("clt_1")))).toMatchObject({
      xs: 49.91552734375,
      xe: 249.91552734375,
      y: 51,
    });
  });

  it("spaces the root's row and every child row one band start and half a pitch apart", () => {
    const rows: [number, [number, number, number]][] = [
      [0, [48.01171875, 35.20703125, 22.40234375]],
      [4, [51, 37, 23]],
      [8, [62, 43.5, 25]],
    ];
    for (const [spacing, expected] of rows) {
      const drawing = drawFixture("nested", [], spaced("clt_1", spacing));
      const y = (id: string) => {
        const line = drawing.elements.find((item) => sameAddress(item.address, at(id)));
        return line?.type === "timeline" || line?.type === "child" ? line.y : Number.NaN;
      };
      const [root, first, second] = [y("clt_1"), y("clt_3"), y("clt_2")];
      expect([root, first, second], `${spacing}`).toEqual(expected);
      expect(root - first).toBe(first - second);
    }
  });
});

describe("the padding", () => {
  it("leaves a root without gaps as it is at every card spacing", () => {
    const natural = drawFixture("bare");
    for (const spacing of [0, 8]) {
      const drawing = drawFixture("bare", [], spaced("bare", spacing));
      expect(drawing.elements, `${spacing}`).toEqual(natural.elements);
      expect([drawing.width, drawing.height], `${spacing}`).toEqual([476.5771484375, 67.37890625]);
    }
  });

  it("ends a flow marker's line at the padding below", () => {
    const drawing = drawFixture("flow_control", [], spaced("flow:quarters", 8));
    expect(drawing.height).toBe(134.80859375);
    expect(element(drawing, at("flow:quarters"))).toMatchObject({ y: 22.40234375 });
    expect(drawing.elements.find((item) => item.type === "flow_marker")).toMatchObject({
      y1: 67.85546875,
      y2: 16,
    });
  });

  it("ends a flow marker of a flow control band above the line at the padding", () => {
    const order = bandOrder(
      ["flow_control", "children", "conversion_maps"],
      ["markers", "regions"],
    );
    const manifest = edit("flow_control", set("flow:quarters", { order }));
    const drawing = draw(
      manifest,
      spaced("flow:quarters", 8),
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    expect(drawing.height).toBe(129.90625);
    expect(element(drawing, at("flow:quarters"))).toMatchObject({ y: 84.9296875 });
    expect(drawing.elements.find((item) => item.type === "flow_marker")).toMatchObject({
      y1: 64.953125,
      y2: 111.90625,
    });
  });
});

describe("the block's size", () => {
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
