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
import { BLOCK, drawFixture, edit, element, metrics } from "./support.ts";

const at = (changes: Partial<Placement>): Placement => ({ ...DEFAULT_PLACEMENT, ...changes });
const ungrouped = (places: Placement["places"]) =>
  drawFixture("bundles/bundle_ungrouped", [], at({ places }));
const member = (places: Placement["places"]) =>
  drawFixture("groups/group_child_member", [], at({ places }));

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
    expect(drawing.items.map((item) => item.key)).toEqual(["pages", "recording"]);
    expect(line(drawing, "pages")).toMatchObject({ xs: 79.70361328125 });
    expect(line(drawing, "recording")).toMatchObject({ xs: 79.70361328125 });
    expect(rect(drawing, "pages/card")).toMatchObject({ width: 507.896728515625 });
    expect(rect(drawing, "recording/card")).toMatchObject({ width: 507.896728515625 });
    expect([element(drawing, "pages/name"), element(drawing, "recording/name")]).toMatchObject([
      { x: 16 },
      { x: 16 },
    ]);
    expect([drawing.width, drawing.height]).toEqual([525.896728515625, 159.63671875]);
  });

  it("draws two items of one length equally wide wherever they lie", () => {
    const drawing = ungrouped({ recording: { x: 100 } });
    expect(rect(drawing, "recording/card")).toEqual({
      x: 100,
      y: 100.2578125,
      width: 507.896728515625,
      height: 49.37890625,
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
    expect(drawing.items.map((item) => item.place.y)).toEqual([20, 91.453125, 148.83203125]);
    expect(drawing.height).toBe(217.015625);
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
    expect(drawing.items.map((item) => item.place)).toEqual([
      { x: 8, y: 8, length: 400, scale: 2, spacing: 1, width: 458.5771484375, height: 49.37890625 },
    ]);
  });

  it("sets the next default top from the scaled item's drawn bottom", () => {
    const drawing = ungrouped({ recording: { scale: 1.5 } });
    expect(rect(drawing, "recording/card")).toEqual({
      x: 8,
      y: 100.2578125,
      width: 761.8450927734375,
      height: 74.068359375,
    });
    expect(drawing.items[2]?.place.y).toBe(182.326171875);
    expect(element(ungrouped({}), "recording").style["stroke-dasharray"]).toBe("3 3");
    expect(element(drawing, "recording").style["stroke-dasharray"]).toBe("4.5 4.5");
    expect(element(drawing, "recording/name").style["font-size"]).toBe(16.5);
    expect(drawing.width).toBe(780.8450927734375);
    expect(drawing.items[1]?.place).toEqual({
      x: 8,
      y: 100.2578125,
      length: 400,
      scale: 1.5,
      spacing: 1,
      width: 507.896728515625,
      height: 49.37890625,
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
    expect(drawing.items.map((item) => item.place)).toEqual([
      { x: 8, y: 8, length: 400, scale: 1, spacing: 1, width: 666, height: 244.7578125 },
    ]);
  });

  it("is reported for each member card in drawing order", () => {
    expect(drawing.cards).toEqual([
      {
        key: "second-half",
        group: "group_1",
        address: "second-half/card",
        size: { width: 526.4140625, height: 83.953125 },
        spacing: 1,
        stated: {},
      },
      {
        key: "recording",
        group: "group_1",
        address: "recording/card",
        size: { width: 650, height: 120 },
        spacing: 1,
        stated: { width: 650, height: 120 },
      },
    ]);
  });

  it("uses a member's width, height and spacing alone", () => {
    const widened = member({ recording: { width: 650 } });
    const stray = member({ recording: { x: 50, y: 50, length: 100, scale: 3, width: 650 } });
    expect(stray.elements).toEqual(widened.elements);
    expect(stray.cards[1]?.stated).toEqual({ width: 650 });
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
    expect(scaled.cards[1]?.size).toEqual({ width: 650, height: 49.37890625 });
  });
});

describe("an item's vertical stretch", () => {
  describe("an ungrouped card at spacing 2", () => {
    const drawing = ungrouped({ recording: { spacing: 2 } });

    it("pads the card's member drawing by 8 v above and below", () => {
      expect(rect(drawing, "recording/card")).toEqual({
        x: 8,
        y: 100.2578125,
        width: 507.896728515625,
        height: 65.37890625,
      });
      expect(line(drawing, "recording")).toEqual({
        xs: 79.70361328125,
        xe: 479.70361328125,
        y: 122.66015625,
      });
    });

    it("keeps the root band's distances from the line", () => {
      expect(element(drawing, "recording/start")).toMatchObject({
        type: "wedge",
        yt: 124.16015625,
        yb: 137.16015625,
      });
      expect(element(drawing, "recording/start/label")).toMatchObject({
        baseline: 147.51416015625,
      });
    });

    it("stretches that item alone and moves the next default top", () => {
      expect(rect(drawing, "pages/card")).toEqual({
        x: 8,
        y: 28.8046875,
        width: 507.896728515625,
        height: 63.453125,
      });
      expect(rect(drawing, "score/card")).toMatchObject({ y: 173.63671875 });
      expect([drawing.width, drawing.height]).toEqual([525.896728515625, 233.015625]);
    });

    it("reports the item's spacing", () => {
      expect(drawing.items[1]).toMatchObject({
        key: "recording",
        place: {
          x: 8,
          y: 100.2578125,
          length: 400,
          scale: 1,
          spacing: 2,
          width: 507.896728515625,
          height: 65.37890625,
        },
        stated: { spacing: 2 },
      });
      expect(drawing.cards).toEqual([]);
    });
  });

  describe("a member's card at spacing 1.5 under a frame at spacing 2", () => {
    const drawing = member({ group_1: { spacing: 2 }, recording: { spacing: 1.5 } });

    it("stretches the sibling by the frame's 2", () => {
      expect(rect(drawing, "second-half/card")).toEqual({
        x: 16,
        y: 32.8046875,
        width: 526.4140625,
        height: 113.953125,
      });
      expect(line(drawing, "second-half")).toMatchObject({ y: 103.78125 });
      expect(element(drawing, "piece")).toMatchObject({ type: "ancestor", y: 75.78125 });
    });

    it("stretches the member by the product 3", () => {
      expect(rect(drawing, "recording/card")).toEqual({
        x: 16,
        y: 154.7578125,
        width: 526.4140625,
        height: 81.37890625,
      });
      expect(line(drawing, "recording")).toMatchObject({ y: 185.16015625 });
    });

    it("leaves the frame's own padding and gaps unstretched", () => {
      expect(rect(drawing, "group_1")).toEqual({
        x: 8,
        y: 8,
        width: 542.4140625,
        height: 236.13671875,
      });
      expect([drawing.width, drawing.height]).toEqual([558.4140625, 252.13671875]);
    });

    it("reports each card's own spacing and the frame's", () => {
      expect(drawing.cards).toEqual([
        {
          key: "second-half",
          group: "group_1",
          address: "second-half/card",
          size: { width: 526.4140625, height: 113.953125 },
          spacing: 1,
          stated: {},
        },
        {
          key: "recording",
          group: "group_1",
          address: "recording/card",
          size: { width: 526.4140625, height: 81.37890625 },
          spacing: 1.5,
          stated: { spacing: 1.5 },
        },
      ]);
      expect(drawing.items.map((item) => [item.place, item.stated])).toEqual([
        [
          {
            x: 8,
            y: 8,
            length: 400,
            scale: 1,
            spacing: 2,
            width: 542.4140625,
            height: 236.13671875,
          },
          { spacing: 2 },
        ],
      ]);
    });
  });

  it("multiplies the placement's spacing in", () => {
    const drawing = drawFixture(
      "groups/group_child_member",
      [],
      at({ spacing: 1.5, places: { group_1: { spacing: 2 } } }),
    );
    expect(drawing.cards.map((card) => [card.size.height, card.spacing])).toEqual([
      [143.953125, 1],
      [81.37890625, 1],
    ]);
    expect(drawing.items[0]?.place.spacing).toBe(2);
  });
});
