import type { BandOrder, Manifest } from "@timetoalign/tilie-core";
import { validate } from "@timetoalign/timeskeleton";
import { describe, expect, it } from "vitest";
import {
  bandOrderOf,
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import { drawFixture, element, loadFile, metrics } from "./support.ts";

const D: BandOrder = ["children", "regions", "flow"];
const F: BandOrder = ["flow", "regions", "children"];
const T: BandOrder = ["regions", "children", "flow"];

const at = (changes: Partial<Placement>): Placement => ({ ...DEFAULT_PLACEMENT, ...changes });

/** The rectangle of a frame or card. */
function rect(drawing: Drawing, address: string): object {
  const found = element(drawing, address);
  if (found.type !== "group" && found.type !== "card") throw new Error(`${address} is no rect`);
  return { x: found.x, y: found.y, width: found.width, height: found.height };
}

/** The start and end of a member's line, and its ordinate. */
function line(drawing: Drawing, address: string): object {
  const found = element(drawing, address);
  if (found.type !== "timeline") throw new Error(`${address} is no member line`);
  return { xs: found.xs, xe: found.xe, y: found.y };
}

describe("the band order cascade", () => {
  it.each([
    [D, {}, "score", null, D],
    [F, {}, "score", "group_1", F],
    [D, { group_1: F }, "score", "group_1", F],
    [D, { group_1: F }, "score", null, D],
    [D, { group_1: F, score: T }, "score", "group_1", T],
    [F, { score: T }, "score", null, T],
    [D, {}, "toString", "constructor", D],
  ] as const)(
    "order %j, bands %j: %s in %s takes %j",
    (order, bands, timeline, group, expected) => {
      expect(bandOrderOf(at({ order, bands }), timeline, group)).toEqual(expected);
    },
  );

  const styled = loadFile("styled__score");
  const drawn = (manifest: Manifest, placement: Placement) =>
    draw(manifest, placement, [DEFAULT_LAYER, manifestLayer(manifest)], metrics).elements;
  const natural = drawn(styled, DEFAULT_PLACEMENT);
  const flowFirst = drawn(styled, at({ order: F }));

  it("matters for styled__score, whose regions and flow share a side", () => {
    expect(flowFirst).not.toEqual(natural);
    expect(drawn(styled, at({ bands: { score: T } }))).toEqual(natural);
  });

  it("uses a timeline's own band order, over the block's", () => {
    expect(drawn(styled, at({ bands: { score: F } }))).toEqual(flowFirst);
    expect(drawn(styled, at({ order: F, bands: { score: D } }))).toEqual(natural);
  });

  it("uses the band order of the group whose frame holds the root, below its own", () => {
    const grouped: Manifest = {
      ...styled,
      groups: [{ id: "group_1", name: null, meta: {}, members: ["score"] }],
    };
    validate(grouped);
    expect(drawn(grouped, at({ bands: { group_1: F } }))).toEqual(drawn(grouped, at({ order: F })));
    expect(drawn(grouped, at({ bands: { group_1: F, score: D } }))).toEqual(
      drawn(grouped, DEFAULT_PLACEMENT),
    );
  });

  it("ignores a key naming nothing drawn, or a timeline not drawn as a root in a card", () => {
    expect(drawn(styled, at({ bands: { nothing: F } }))).toEqual(natural);
    expect(drawn(styled, at({ bands: { b: F } }))).toEqual(natural);
  });

  it("adds no gap for an absent band", () => {
    const timeline = drawn(styled, at({ bands: { score: ["flow", "children", "regions"] } }));
    expect(timeline).not.toEqual(natural);
    expect(timeline).toEqual(flowFirst);
  });

  it("takes no band order from an ancestor timeline", () => {
    const [score] = styled.timelines;
    if (score === undefined) throw new Error("styled__score has no root");
    const nested = {
      ...styled,
      timelines: [
        {
          ...score,
          id: "piece",
          name: "Piece",
          length: [16, 1],
          regions: [],
          conversion_maps: [],
          flow_control: { breaks: [], jumps: [], markers: [] },
          children: [{ ...score, offset: [0, 1], locked: true }],
        },
      ],
      groups: [{ id: "group_1", name: null, meta: {}, members: ["score"] }],
    } as Manifest;
    validate(nested);
    const natural = drawn(nested, DEFAULT_PLACEMENT);
    expect(natural.some((item) => item.type === "ancestor")).toBe(true);
    expect(drawn(nested, at({ bands: { piece: F } }))).toEqual(natural);
    expect(drawn(nested, at({ bands: { score: F } }))).not.toEqual(natural);
    expect(drawn(nested, at({ bands: { score: F } }))).toEqual(drawn(nested, at({ order: F })));
  });
});

describe("default places reproduce the stacked box", () => {
  it("bare: one card at (8, 8), the place origin at (+0, +0)", () => {
    const drawing = drawFixture("bare");
    expect(Object.is(drawing.origin.x, 0)).toBe(true);
    expect(Object.is(drawing.origin.y, 0)).toBe(true);
    expect(drawing.items).toEqual([
      {
        key: "bare",
        kind: "card",
        address: "bare/card",
        place: { x: 8, y: 8, length: 400, scale: 1, width: 458.5771484375, height: 49.37890625 },
        stated: {},
      },
    ]);
  });

  it("group_child_member: one frame at (8, 8)", () => {
    const drawing = drawFixture("groups/group_child_member");
    expect(drawing.origin).toEqual({ x: 0, y: 0 });
    expect(drawing.items).toEqual([
      {
        key: "group_1",
        kind: "group",
        address: "group_1",
        place: { x: 8, y: 8, length: 400, scale: 1, width: 542.4140625, height: 174.13671875 },
        stated: {},
      },
    ]);
  });

  it("stating the defaults draws the same", () => {
    const natural = drawFixture("bare");
    const stated = { x: 8, y: 8, length: 400 };
    const drawing = drawFixture("bare", [], at({ places: { bare: stated } }));
    expect([drawing.width, drawing.height, drawing.origin]).toEqual([
      natural.width,
      natural.height,
      natural.origin,
    ]);
    expect(drawing.elements).toEqual(natural.elements);
    expect(drawing.items).toEqual([{ ...natural.items[0], stated }]);
  });
});

describe("the default top", () => {
  const tops = (drawing: Drawing) => drawing.items.map((item) => [item.key, item.place.y]);

  it("lies F below the bottom edge of the items before it, no shadow counted", () => {
    expect(tops(drawFixture("bundles/bundle_ungrouped"))).toEqual([
      ["pages", 28.8046875],
      ["recording", 100.2578125],
      ["score", 157.63671875],
    ]);
  });

  it("follows an item's requested height", () => {
    const drawing = drawFixture(
      "bundles/bundle_ungrouped",
      [],
      at({ places: { pages: { height: 100 } } }),
    );
    expect(tops(drawing)).toEqual([
      ["pages", 28.8046875],
      ["recording", 136.8046875],
      ["score", 194.18359375],
    ]);
  });
});

describe("an item left of the padding, a width request and a length of its own", () => {
  const places = {
    group_2: { x: 40, y: 200, width: 700 },
    annotations: { x: -30, length: 300 },
  };
  const drawing = drawFixture("bundles/bundle_mixed", [], at({ places }));

  it("lists the items in drawing order with their places as stated", () => {
    expect(
      drawing.items.map(({ key, kind, address, stated }) => [key, kind, address, stated]),
    ).toEqual([
      ["group_1", "group", "group_1", {}],
      ["group_2", "group", "group_2", places.group_2],
      ["annotations", "card", "annotations/card", places.annotations],
    ]);
  });

  it("reports each place from the place origin, with the drawn size", () => {
    expect(drawing.items.map((item) => item.place)).toEqual([
      { x: 8, y: 28.8046875, length: 400, scale: 1, width: 562.484619140625, height: 139.5625 },
      { x: 40, y: 200, length: 400, scale: 1, width: 700, height: 174.13671875 },
      {
        x: -30,
        y: 382.13671875,
        length: 300,
        scale: 1,
        width: 462.484619140625,
        height: 49.37890625,
      },
    ]);
  });

  it("grows the box to the left and moves the place origin", () => {
    expect([drawing.width, drawing.height]).toEqual([786, 441.515625]);
    expect(drawing.origin).toEqual({ x: 38, y: 0 });
  });

  it("draws everything shifted by the place origin", () => {
    expect(element(drawing, "name")).toMatchObject({ x: 8, baseline: 18.21044921875 });
    expect(rect(drawing, "group_1")).toEqual({
      x: 46,
      y: 28.8046875,
      width: 562.484619140625,
      height: 139.5625,
    });
    expect(rect(drawing, "group_2")).toEqual({ x: 78, y: 200, width: 700, height: 174.13671875 });
    expect(rect(drawing, "page/card")).toEqual({
      x: 86,
      y: 224.8046875,
      width: 684,
      height: 49.37890625,
    });
    expect(rect(drawing, "annotations/card")).toEqual({
      x: 8,
      y: 382.13671875,
      width: 462.484619140625,
      height: 49.37890625,
    });
  });

  it("starts every item's lines at the box's one start, each at its own graphical length", () => {
    expect(line(drawing, "score")).toEqual({
      xs: 164.29150390625,
      xe: 564.29150390625,
      y: 68.01171875,
    });
    expect(line(drawing, "page")).toEqual({
      xs: 196.29150390625,
      xe: 596.29150390625,
      y: 239.20703125,
    });
    expect(line(drawing, "annotations")).toEqual({
      xs: 126.29150390625,
      xe: 426.29150390625,
      y: 396.5390625,
    });
  });
});

describe("an item left of and above the padding and a height request", () => {
  const drawing = drawFixture(
    "bundles/bundle_ungrouped",
    [],
    at({ places: { score: { x: -60, y: -150, height: 120 } } }),
  );

  it("grows the box left and up and moves the place origin", () => {
    expect([drawing.width, drawing.height]).toEqual([593.896728515625, 338.44140625]);
    expect(drawing.origin).toEqual({ x: 68, y: 178.8046875 });
  });

  it("stacks the other items by default, whatever lies above them", () => {
    expect(drawing.items.map((item) => item.place)).toEqual([
      { x: 8, y: 28.8046875, length: 400, scale: 1, width: 507.896728515625, height: 63.453125 },
      {
        x: 8,
        y: 100.2578125,
        length: 400,
        scale: 1,
        width: 507.896728515625,
        height: 49.37890625,
      },
      { x: -60, y: -150, length: 400, scale: 1, width: 507.896728515625, height: 120 },
    ]);
  });

  it("draws the card as high as requested, its drawing keeping its top", () => {
    expect(rect(drawing, "score/card")).toEqual({
      x: 8,
      y: 28.8046875,
      width: 507.896728515625,
      height: 120,
    });
    expect(line(drawing, "score")).toMatchObject({ xs: 79.70361328125, y: 43.20703125 });
  });

  it("draws every position from the place origin plus the origin", () => {
    expect(rect(drawing, "pages/card")).toEqual({
      x: 76,
      y: 207.609375,
      width: 507.896728515625,
      height: 63.453125,
    });
    expect(line(drawing, "pages")).toMatchObject({ xs: 147.70361328125 });
    expect(rect(drawing, "recording/card")).toEqual({
      x: 76,
      y: 279.0625,
      width: 507.896728515625,
      height: 49.37890625,
    });
    expect(line(drawing, "recording")).toMatchObject({ xs: 147.70361328125, y: 293.46484375 });
  });

  it("keeps the manifest's title at the box's top left, F above the highest item", () => {
    expect(element(drawing, "name")).toMatchObject({ x: 8, baseline: 18.21044921875 });
  });
});

describe("a frame's own length and height request, a card's width request", () => {
  const drawing = drawFixture(
    "bundles/bundle_mixed",
    [],
    at({ places: { group_1: { length: 300, height: 200 }, annotations: { width: 600 } } }),
  );

  it("draws the frame's lines at its own length, its frame as high as requested", () => {
    expect(line(drawing, "score")).toEqual({
      xs: 126.29150390625,
      xe: 426.29150390625,
      y: 68.01171875,
    });
    expect(line(drawing, "performance")).toEqual({
      xs: 126.29150390625,
      xe: 426.29150390625,
      y: 125.390625,
    });
    expect(rect(drawing, "group_1")).toEqual({
      x: 8,
      y: 28.8046875,
      width: 462.484619140625,
      height: 200,
    });
    expect(rect(drawing, "score/card")).toEqual({
      x: 16,
      y: 53.609375,
      width: 446.484619140625,
      height: 49.37890625,
    });
    expect(rect(drawing, "performance/card")).toMatchObject({ y: 110.98828125 });
  });

  it("puts the next item's default top F below the requested bottom", () => {
    expect(rect(drawing, "group_2")).toEqual({
      x: 8,
      y: 236.8046875,
      width: 562.484619140625,
      height: 174.13671875,
    });
    expect(rect(drawing, "page/card")).toMatchObject({ y: 261.609375 });
  });

  it("widens the card to the requested width, its inset in a box of frames included", () => {
    expect(rect(drawing, "annotations/card")).toEqual({
      x: 8,
      y: 418.94140625,
      width: 600,
      height: 49.37890625,
    });
    expect(line(drawing, "annotations")).toEqual({
      xs: 126.29150390625,
      xe: 526.29150390625,
      y: 433.34375,
    });
  });

  it("sizes the box and reports the places", () => {
    expect([drawing.width, drawing.height, drawing.origin]).toEqual([
      618,
      478.3203125,
      { x: 0, y: 0 },
    ]);
    expect(drawing.items.map((item) => item.place)).toEqual([
      { x: 8, y: 28.8046875, length: 300, scale: 1, width: 462.484619140625, height: 200 },
      {
        x: 8,
        y: 236.8046875,
        length: 400,
        scale: 1,
        width: 562.484619140625,
        height: 174.13671875,
      },
      { x: 8, y: 418.94140625, length: 400, scale: 1, width: 600, height: 49.37890625 },
    ]);
  });
});

describe("a fractional place origin: the shift is added last", () => {
  const drawing = drawFixture(
    "bundles/bundle_ungrouped",
    [],
    at({ places: { score: { x: -60.33, y: -150.33, height: 120 } } }),
  );

  it("takes the origin as 0 minus the content's left and top", () => {
    expect(drawing.origin).toEqual({ x: 68.33, y: 179.1346875 });
  });

  it("keeps the sizes summed in place coordinates", () => {
    expect(rect(drawing, "pages/card")).toEqual({
      x: 76.33,
      y: 207.939375,
      width: 507.896728515625,
      height: 63.453125,
    });
    expect(rect(drawing, "recording/card")).toMatchObject({ width: 507.896728515625 });
    expect(line(drawing, "recording")).toMatchObject({ y: 293.79484375000004 });
    expect(drawing.items.map((item) => item.place)).toEqual([
      { x: 8, y: 28.8046875, length: 400, scale: 1, width: 507.896728515625, height: 63.453125 },
      {
        x: 8,
        y: 100.2578125,
        length: 400,
        scale: 1,
        width: 507.896728515625,
        height: 49.37890625,
      },
      { x: -60.33, y: -150.33, length: 400, scale: 1, width: 507.896728515625, height: 120 },
    ]);
  });

  it("measures the box in place coordinates, less its left and top", () => {
    expect([drawing.width, drawing.height]).toEqual([594.226728515625, 338.77140625000004]);
  });

  it("sums a default top in place coordinates", () => {
    const mixed = drawFixture(
      "bundles/bundle_mixed",
      [],
      at({ places: { group_1: { y: 10.01 }, annotations: { x: 560, y: -40.1 } } }),
    );
    expect(mixed.origin.y).toBe(68.9046875);
    expect(mixed.items[1]?.place.y).toBe(157.5725);
    expect(rect(mixed, "group_2")).toMatchObject({ y: 226.47718749999999 });
  });
});
