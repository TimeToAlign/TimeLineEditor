/** One layout for the box, item scales and card sizes; every number is derived in tests/README.md. */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  draw,
  manifestLayer,
  type Placement,
} from "../src/index.ts";
import { BLOCK, boxesOf, drawFixture, edit, element, itemsOf, metrics } from "./support.ts";

const at = (changes: Partial<Placement>): Placement => ({ ...DEFAULT_PLACEMENT, ...changes });
const ungrouped = (places: Placement["places"]) =>
  drawFixture("bundles/bundle_ungrouped", [], at({ places }));
const member = (places: Placement["places"]) =>
  drawFixture("groups/group_child_member", [], at({ places }));

/** The members' cards a drawing records, each with its holding frame as `group`. */
const memberCards = (drawing: Drawing) =>
  boxesOf(drawing, "card")
    .filter((box) => box.holder !== null)
    .map(({ key, holder, address, card, range }) => ({
      key,
      group: holder,
      address,
      ...card,
      range,
    }));

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

describe("one horizontal layout for the box", () => {
  it("takes the widest name and the right margin from the second item for both", () => {
    const manifest = edit("bundles/bundle_ungrouped", {
      type: "remove",
      targets: [`${BLOCK}/score`],
    });
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    expect(itemsOf(drawing).map((item) => item.key)).toEqual(["pages", "recording"]);
    expect(line(drawing, "pages")).toMatchObject({ xs: 79.70361328125 });
    expect(line(drawing, "recording")).toMatchObject({ xs: 79.70361328125 });
    expect(rect(drawing, "pages/card")).toMatchObject({ width: 507.896728515625 });
    expect(rect(drawing, "recording/card")).toMatchObject({ width: 507.896728515625 });
    expect([element(drawing, "pages/name"), element(drawing, "recording/name")]).toMatchObject([
      { x: 16 },
      { x: 16 },
    ]);
    expect([drawing.width, drawing.height]).toEqual([525.896728515625, 159.734375]);
  });

  it("draws two items of one length equally wide wherever they lie", () => {
    const drawing = ungrouped({ recording: { x: 100 } });
    expect(rect(drawing, "recording/card")).toEqual({
      x: 100,
      y: 100.2578125,
      width: 507.896728515625,
      height: 49.4765625,
    });
    expect(rect(drawing, "pages/card")).toEqual({
      x: 8,
      y: 28.8046875,
      width: 507.896728515625,
      height: 63.453125,
    });
    expect(line(drawing, "recording")).toMatchObject({
      xs: 171.70361328125,
      xe: 571.70361328125,
    });
    expect(drawing.width).toBe(617.896728515625);
  });

  it("keeps the shared name column for an item of its own length", () => {
    const drawing = ungrouped({ recording: { length: 200 } });
    expect(line(drawing, "recording")).toMatchObject({
      xs: 79.70361328125,
      xe: 279.70361328125,
    });
    expect(element(drawing, "recording/name")).toMatchObject({ x: 16 });
    expect(rect(drawing, "recording/card")).toMatchObject({ width: 307.896728515625 });
    expect(rect(drawing, "pages/card")).toMatchObject({ width: 507.896728515625 });
    expect(line(drawing, "pages")).toMatchObject({ xs: 79.70361328125, xe: 479.70361328125 });
  });
});

describe("the manifest's title", () => {
  it("lies at the box's top left, pushed up by an item placed into its slot", () => {
    const drawing = ungrouped({ pages: { y: 20 } });
    expect(drawing.origin).toEqual({ x: 0, y: 8.8046875 });
    expect(element(drawing, "name")).toMatchObject({ x: 8, baseline: 18.21044921875 });
    expect(rect(drawing, "pages/card")).toMatchObject({ y: 28.8046875 });
    expect(itemsOf(drawing).map((box) => box.item?.place.y)).toEqual([20, 91.453125, 148.9296875]);
    expect(drawing.height).toBe(252.1640625);
  });
});

describe("the scale of an item", () => {
  it("scales a card and everything in it about its top left corner", () => {
    const drawing = drawFixture("bare", [], at({ places: { bare: { scale: 2 } } }));
    const card = element(drawing, "bare/card");
    expect(card).toMatchObject({
      x: 8,
      y: 8,
      width: 917.154296875,
      height: 98.7578125,
      shadowOffset: 4,
    });
    expect([card.style["stroke-width"], card.style.rx]).toEqual([1.5, 10]);
    const name = element(drawing, "bare/name");
    expect(name).toMatchObject({ x: 24, baseline: 44.4208984375 });
    expect(name.style["font-size"]).toBe(22);
    expect(element(drawing, "bare/start")).toMatchObject({
      type: "wedge",
      x: 91.154296875,
      yt: 39.8046875,
      yb: 65.8046875,
      base: 12,
    });
    const root = element(drawing, "bare");
    expect(root).toMatchObject({ xs: 91.154296875, xe: 891.154296875 });
    expect(root.style["stroke-width"]).toBe(6);
    expect([drawing.width, drawing.height]).toEqual([937.154296875, 118.7578125]);
    expect(itemsOf(drawing).map((box) => box.item?.place)).toEqual([
      { x: 8, y: 8, length: 400, scale: 2, spacing: 4, width: 458.5771484375, height: 49.37890625 },
    ]);
  });

  it("sets the next default top from the scaled item's drawn bottom", () => {
    const drawing = ungrouped({ recording: { scale: 1.5 } });
    expect(rect(drawing, "recording/card")).toEqual({
      x: 8,
      y: 100.2578125,
      width: 761.8450927734375,
      height: 74.21484375,
    });
    expect(itemsOf(drawing)[2]?.item?.place.y).toBe(182.47265625);
    expect(element(ungrouped({}), "recording").style["stroke-dasharray"]).toBe("3 3");
    expect(element(drawing, "recording").style["stroke-dasharray"]).toBe("4.5 4.5");
    expect(element(drawing, "recording/name").style["font-size"]).toBe(16.5);
    expect(drawing.width).toBe(780.8450927734375);
    expect(itemsOf(drawing)[1]?.item?.place).toEqual({
      x: 8,
      y: 100.2578125,
      length: 400,
      scale: 1.5,
      spacing: 4,
      width: 507.896728515625,
      height: 49.4765625,
    });
  });
});

describe("a member's card size", () => {
  const drawing = member({ recording: { width: 650, height: 120 } });

  it("widens and heightens the card, its drawing keeping its top left", () => {
    expect(rect(drawing, "recording/card")).toEqual({
      x: 16,
      y: 124.7578125,
      width: 650,
      height: 120,
    });
    expect(line(drawing, "recording")).toMatchObject({ y: 139.16015625 });
    expect(rect(drawing, "second-half/card")).toEqual({
      x: 16,
      y: 32.8046875,
      width: 526.4140625,
      height: 83.953125,
    });
  });

  it("grows the frame with it", () => {
    expect(rect(drawing, "group_1")).toEqual({ x: 8, y: 8, width: 666, height: 244.7578125 });
    expect([drawing.width, drawing.height]).toEqual([682, 260.7578125]);
    expect(itemsOf(drawing).map((box) => box.item?.place)).toEqual([
      { x: 8, y: 8, length: 400, scale: 1, spacing: 8, width: 666, height: 244.7578125 },
    ]);
  });

  it("is reported for each member card in drawing order", () => {
    expect(memberCards(drawing)).toEqual([
      {
        key: "second-half",
        group: "group_1",
        address: "second-half/card",
        size: { width: 526.4140625, height: 83.953125 },
        spacing: 4,
        stated: {},
        range: { start: 3, end: 16 },
      },
      {
        key: "recording",
        group: "group_1",
        address: "recording/card",
        size: { width: 650, height: 120 },
        spacing: 4,
        stated: { width: 650, height: 120 },
        range: { start: 16, end: 23 },
      },
    ]);
  });

  it("uses a member's width, height and spacing alone", () => {
    const widened = member({ recording: { width: 650 } });
    const stray = member({ recording: { x: 50, y: 50, length: 100, scale: 3, width: 650 } });
    expect(stray.elements).toEqual(widened.elements);
    expect(memberCards(stray)[1]?.stated).toEqual({ width: 650 });
  });

  it("changes nothing when it asks for no more than the card", () => {
    expect(member({ recording: { width: 100, height: 10 } }).elements).toEqual(member({}).elements);
  });

  it("is in item coordinates, before the group's scale", () => {
    const scaled = member({ group_1: { scale: 2 }, recording: { width: 650 } });
    expect(rect(scaled, "recording/card")).toEqual({
      x: 24,
      y: 241.515625,
      width: 1300,
      height: 98.7578125,
    });
    expect(rect(scaled, "group_1")).toMatchObject({ width: 1332 });
    expect(memberCards(scaled)[1]?.size).toEqual({ width: 650, height: 49.37890625 });
  });
});

describe("spacings, each its own container's", () => {
  describe("the box's spacing 24", () => {
    it("lies between the items at their default y", () => {
      const drawing = ungrouped({});
      const spaced = drawFixture("bundles/bundle_ungrouped", [], at({ spacing: 24 }));
      expect(itemsOf(spaced).map((box) => box.item?.place.y)).toEqual([
        28.8046875, 116.2578125, 189.734375,
      ]);
      expect(itemsOf(spaced).map((box) => box.item?.place.spacing)).toEqual([4, 4, 4]);
      expect(boxesOf(spaced, "card").map((box) => box.card)).toEqual(
        boxesOf(drawing, "card").map((box) => box.card),
      );
      expect([spaced.width, spaced.height]).toEqual([525.896728515625, 284.1640625]);
    });

    it("keeps a stated y and lies below the largest bottom edge before an item", () => {
      const drawing = drawFixture(
        "bundles/bundle_ungrouped",
        [],
        at({ spacing: 24, places: { recording: { y: 40 } } }),
      );
      expect(itemsOf(drawing).map((box) => box.item?.place.y)).toEqual([
        28.8046875, 40, 116.2578125,
      ]);
    });
  });

  describe("a box-held card's spacing 8", () => {
    const drawing = ungrouped({ score: { spacing: 8 } });

    it("widens the gaps between its own bands and its first jump's depth", () => {
      expect(rect(drawing, "score/card")).toEqual({
        x: 8,
        y: 157.734375,
        width: 507.896728515625,
        height: 92.4296875,
      });
      expect(line(drawing, "score")).toMatchObject({ y: 172.234375 });
      expect(drawing.elements.find((item) => item.type === "break")).toMatchObject({
        y1: 217.6875,
        y2: 165.734375,
      });
      expect([drawing.width, drawing.height]).toEqual([525.896728515625, 260.1640625]);
    });

    it("leaves the other cards and the items' default tops as they are", () => {
      expect(rect(drawing, "pages/card")).toEqual(rect(ungrouped({}), "pages/card"));
      expect(rect(drawing, "recording/card")).toEqual(rect(ungrouped({}), "recording/card"));
    });

    it("reports the item's spacing", () => {
      expect(itemsOf(drawing).map((box) => [box.item?.place.spacing, box.card?.spacing])).toEqual([
        [4, 4],
        [4, 4],
        [8, 8],
      ]);
      expect(itemsOf(drawing)[2]).toMatchObject({
        key: "score",
        item: { stated: { spacing: 8 } },
        card: { size: { width: 507.896728515625, height: 92.4296875 }, stated: {} },
      });
    });
  });

  describe("a frame's spacing 16", () => {
    const drawing = member({ group_1: { spacing: 16 } });

    it("lies between its cards and changes no card", () => {
      expect(rect(drawing, "second-half/card")).toEqual({
        x: 16,
        y: 32.8046875,
        width: 526.4140625,
        height: 83.953125,
      });
      expect(rect(drawing, "recording/card")).toEqual({
        x: 16,
        y: 132.7578125,
        width: 526.4140625,
        height: 49.37890625,
      });
      expect(rect(drawing, "group_1")).toEqual({
        x: 8,
        y: 8,
        width: 542.4140625,
        height: 182.13671875,
      });
      expect([drawing.width, drawing.height]).toEqual([558.4140625, 198.13671875]);
    });

    it("reports the frame's spacing, the cards' their own", () => {
      expect(itemsOf(drawing)[0]?.item).toMatchObject({
        place: { spacing: 16, height: 182.13671875 },
        stated: { spacing: 16 },
      });
      expect(memberCards(drawing).map((card) => card.spacing)).toEqual([4, 4]);
    });
  });

  describe("a member's card spacing 8", () => {
    const drawing = member({ "second-half": { spacing: 8 } });

    it("widens its ancestor band's start and row pitch alone", () => {
      expect(rect(drawing, "second-half/card")).toEqual({
        x: 16,
        y: 32.8046875,
        width: 526.4140625,
        height: 88.453125,
      });
      expect(line(drawing, "second-half")).toMatchObject({ y: 86.28125 });
      expect(element(drawing, "piece")).toMatchObject({ type: "ancestor", y: 67.78125 });
      expect(rect(drawing, "recording/card")).toEqual({
        x: 16,
        y: 129.2578125,
        width: 526.4140625,
        height: 49.37890625,
      });
      expect(rect(drawing, "group_1")).toMatchObject({ height: 178.63671875 });
    });

    it("reports each card's own spacing and the frame's", () => {
      expect(
        memberCards(drawing).map(({ key, spacing, stated }) => [key, spacing, stated]),
      ).toEqual([
        ["second-half", 8, { spacing: 8 }],
        ["recording", 4, {}],
      ]);
      expect(itemsOf(drawing)[0]?.item?.place.spacing).toBe(8);
    });
  });

  it("multiplies no spacing into another", () => {
    const drawing = drawFixture(
      "groups/group_child_member",
      [],
      at({ spacing: 24, places: { group_1: { spacing: 16 }, "second-half": { spacing: 8 } } }),
    );
    expect(memberCards(drawing).map((card) => [card.size?.height, card.spacing])).toEqual([
      [88.453125, 8],
      [49.37890625, 4],
    ]);
    expect(rect(drawing, "recording/card")).toMatchObject({ y: 137.2578125 });
    expect(rect(drawing, "group_1")).toMatchObject({ y: 8, height: 186.63671875 });
  });
});
