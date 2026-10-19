import { describe, expect, it } from "vitest";
import { DEFAULT_PLACEMENT, type Drawing, type Placement } from "../src/index.ts";
import { drawFixture, element, itemsOf } from "./support.ts";

const at = (changes: Partial<Placement>): Placement => ({ ...DEFAULT_PLACEMENT, ...changes });
const box = { kind: "box", key: null, address: null, holder: null, x: 0, y: 0, displayed: true };

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

describe("default places reproduce the stacked box", () => {
  it("bare: one card at (8, 8), the place origin at (+0, +0)", () => {
    const drawing = drawFixture("bare");
    expect(Object.is(drawing.origin.x, 0)).toBe(true);
    expect(Object.is(drawing.origin.y, 0)).toBe(true);
    const size = { width: 458.5771484375, height: 49.37890625 };
    expect(drawing.boxes.filter((record) => record.kind !== "band")).toEqual([
      { ...box, width: 476.5771484375, height: 67.37890625, range: { start: 0, end: 8 } },
      {
        kind: "card",
        key: "bare",
        address: "bare/card",
        holder: null,
        x: 8,
        y: 8,
        ...size,
        range: { start: 1, end: 8 },
        displayed: true,
        item: { place: { x: 8, y: 8, length: 400, scale: 1, spacing: 1, ...size }, stated: {} },
        card: { size, spacing: 1, stated: {} },
      },
    ]);
  });

  it("group_child_member: one frame at (8, 8)", () => {
    const drawing = drawFixture("groups/group_child_member");
    expect(drawing.origin).toEqual({ x: 0, y: 0 });
    const size = { width: 542.4140625, height: 174.13671875 };
    expect(itemsOf(drawing)).toEqual([
      {
        kind: "frame",
        key: "group_1",
        address: "group_1",
        holder: null,
        x: 8,
        y: 8,
        ...size,
        range: { start: 1, end: 23 },
        displayed: true,
        item: { place: { x: 8, y: 8, length: 400, scale: 1, spacing: 1, ...size }, stated: {} },
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
    const [card] = itemsOf(natural);
    expect(itemsOf(drawing)).toEqual([{ ...card, item: { ...card?.item, stated } }]);
  });
});

describe("the default top", () => {
  const tops = (drawing: Drawing) => itemsOf(drawing).map((item) => [item.key, item.item?.place.y]);

  it("lies F below the bottom edge of the items before it, no shadow counted", () => {
    expect(tops(drawFixture("bundles/bundle_ungrouped"))).toEqual([
      ["pages", 28.8046875],
      ["recording", 100.2578125],
      ["score", 157.734375],
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
      ["score", 194.28125],
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
      itemsOf(drawing).map(({ key, kind, address, item }) => [key, kind, address, item?.stated]),
    ).toEqual([
      ["group_1", "frame", "group_1", {}],
      ["group_2", "frame", "group_2", places.group_2],
      ["annotations", "card", "annotations/card", places.annotations],
    ]);
  });

  it("reports each place from the place origin, with the drawn size", () => {
    expect(itemsOf(drawing).map((box) => box.item?.place)).toEqual([
      {
        x: 8,
        y: 28.8046875,
        length: 400,
        scale: 1,
        spacing: 1,
        width: 562.484619140625,
        height: 169.234375,
      },
      { x: 40, y: 200, length: 400, scale: 1, spacing: 1, width: 700, height: 177.734375 },
      {
        x: -30,
        y: 385.734375,
        length: 300,
        scale: 1,
        spacing: 1,
        width: 462.484619140625,
        height: 71.85546875,
      },
    ]);
  });

  it("grows the box to the left and moves the place origin", () => {
    expect([drawing.width, drawing.height]).toEqual([786, 467.58984375]);
    expect(drawing.origin).toEqual({ x: 38, y: 0 });
  });

  it("draws everything shifted by the place origin", () => {
    expect(element(drawing, "name")).toMatchObject({ x: 8, baseline: 18.21044921875 });
    expect(rect(drawing, "group_1")).toEqual({
      x: 46,
      y: 28.8046875,
      width: 562.484619140625,
      height: 169.234375,
    });
    expect(rect(drawing, "group_2")).toEqual({ x: 78, y: 200, width: 700, height: 177.734375 });
    expect(rect(drawing, "page/card")).toEqual({
      x: 86,
      y: 224.8046875,
      width: 684,
      height: 49.4765625,
    });
    expect(rect(drawing, "annotations/card")).toEqual({
      x: 8,
      y: 385.734375,
      width: 462.484619140625,
      height: 71.85546875,
    });
  });

  it("starts every item's lines at the box's one start, each at its own graphical length", () => {
    expect(line(drawing, "score")).toEqual({
      xs: 164.29150390625,
      xe: 564.29150390625,
      y: 73.109375,
    });
    expect(line(drawing, "page")).toEqual({
      xs: 196.29150390625,
      xe: 596.29150390625,
      y: 239.3046875,
    });
    expect(line(drawing, "annotations")).toEqual({
      xs: 126.29150390625,
      xe: 426.29150390625,
      y: 400.13671875,
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
    expect([drawing.width, drawing.height]).toEqual([593.896728515625, 338.5390625]);
    expect(drawing.origin).toEqual({ x: 68, y: 178.8046875 });
  });

  it("stacks the other items by default, whatever lies above them", () => {
    expect(itemsOf(drawing).map((box) => box.item?.place)).toEqual([
      {
        x: 8,
        y: 28.8046875,
        length: 400,
        scale: 1,
        spacing: 1,
        width: 507.896728515625,
        height: 63.453125,
      },
      {
        x: 8,
        y: 100.2578125,
        length: 400,
        scale: 1,
        spacing: 1,
        width: 507.896728515625,
        height: 49.4765625,
      },
      { x: -60, y: -150, length: 400, scale: 1, spacing: 1, width: 507.896728515625, height: 120 },
    ]);
  });

  it("draws the card as high as requested, its drawing keeping its top", () => {
    expect(rect(drawing, "score/card")).toEqual({
      x: 8,
      y: 28.8046875,
      width: 507.896728515625,
      height: 120,
    });
    expect(line(drawing, "score")).toMatchObject({ xs: 79.70361328125, y: 43.3046875 });
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
      height: 49.4765625,
    });
    expect(line(drawing, "recording")).toMatchObject({ xs: 147.70361328125, y: 293.5625 });
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
      y: 73.109375,
    });
    expect(line(drawing, "performance")).toEqual({
      xs: 126.29150390625,
      xe: 426.29150390625,
      y: 155.0625,
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
      height: 78.953125,
    });
    expect(rect(drawing, "performance/card")).toMatchObject({ y: 140.5625 });
  });

  it("puts the next item's default top F below the requested bottom", () => {
    expect(rect(drawing, "group_2")).toEqual({
      x: 8,
      y: 236.8046875,
      width: 562.484619140625,
      height: 177.734375,
    });
    expect(rect(drawing, "page/card")).toMatchObject({ y: 261.609375 });
  });

  it("widens the card to the requested width, its inset in a box of frames included", () => {
    expect(rect(drawing, "annotations/card")).toEqual({
      x: 8,
      y: 422.5390625,
      width: 600,
      height: 71.85546875,
    });
    expect(line(drawing, "annotations")).toEqual({
      xs: 126.29150390625,
      xe: 526.29150390625,
      y: 436.94140625,
    });
  });

  it("sizes the box and reports the places", () => {
    expect([drawing.width, drawing.height, drawing.origin]).toEqual([
      618,
      504.39453125,
      { x: 0, y: 0 },
    ]);
    expect(itemsOf(drawing).map((box) => box.item?.place)).toEqual([
      {
        x: 8,
        y: 28.8046875,
        length: 300,
        scale: 1,
        spacing: 1,
        width: 462.484619140625,
        height: 200,
      },
      {
        x: 8,
        y: 236.8046875,
        length: 400,
        scale: 1,
        spacing: 1,
        width: 562.484619140625,
        height: 177.734375,
      },
      { x: 8, y: 422.5390625, length: 400, scale: 1, spacing: 1, width: 600, height: 71.85546875 },
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
    expect(line(drawing, "recording")).toMatchObject({ y: 293.89250000000004 });
    expect(itemsOf(drawing).map((box) => box.item?.place)).toEqual([
      {
        x: 8,
        y: 28.8046875,
        length: 400,
        scale: 1,
        spacing: 1,
        width: 507.896728515625,
        height: 63.453125,
      },
      {
        x: 8,
        y: 100.2578125,
        length: 400,
        scale: 1,
        spacing: 1,
        width: 507.896728515625,
        height: 49.4765625,
      },
      {
        x: -60.33,
        y: -150.33,
        length: 400,
        scale: 1,
        spacing: 1,
        width: 507.896728515625,
        height: 120,
      },
    ]);
  });

  it("measures the box in place coordinates, less its left and top", () => {
    expect([drawing.width, drawing.height]).toEqual([594.226728515625, 338.86906250000004]);
  });

  it("sums a default top in place coordinates", () => {
    const mixed = drawFixture(
      "bundles/bundle_mixed",
      [],
      at({ places: { group_1: { y: 10.11 }, annotations: { x: 560, y: -40.1 } } }),
    );
    expect(mixed.origin.y).toBe(68.9046875);
    expect(itemsOf(mixed)[1]?.item?.place.y).toBe(187.344375);
    expect(rect(mixed, "group_2")).toMatchObject({ y: 256.24906250000004 });
  });
});
