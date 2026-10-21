import {
  apply,
  BUNDLE_ADDRESS,
  bandAddress,
  createView,
  type ElementAddress,
  type Facet,
  isCommandError,
  type Manifest,
  type PlaceKey,
  sameAddress,
  TITLE_ADDRESS,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import type { Address, ElementType, Graphical } from "@timetoalign/timetoshare";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYER,
  DEFAULT_PLACEMENT,
  type Drawing,
  type DrawnElement,
  draw,
  manifestLayer,
} from "../src/index.ts";
import {
  at,
  BLOCK,
  boxesOf,
  drawFixture,
  element,
  itemsOf,
  loadFile,
  metrics,
  quarters,
  target,
} from "./support.ts";

const hide = (address: Address): Graphical => ({
  statements: [{ select: { addresses: [address] }, set: { display: "none" } }],
});

/** The rectangle of a frame or card, or the block's size. */
function rect(drawing: Drawing, address: ElementAddress): object {
  const found = element(drawing, address);
  if (found.type !== "frame" && found.type !== "card") throw new Error(`${found.type} is no rect`);
  return { x: found.x, y: found.y, width: found.width, height: found.height };
}

function title(drawing: Drawing, address: ElementAddress): object {
  const found = element(drawing, address);
  if (found.type !== "name") throw new Error(`${found.type} is no title`);
  return { x: found.x, baseline: found.baseline, anchor: found.anchor, text: found.text };
}

/** The start and ordinate of the line of the member `id`. */
function line(drawing: Drawing, id: string): object {
  const found = element(drawing, at(id));
  if (found.type !== "timeline") throw new Error(`${id} is no member line`);
  return { xs: found.xs, y: found.y };
}

const size = (drawing: Drawing) => [drawing.width, drawing.height];
const order = (drawing: Drawing) => drawing.elements.map((item) => item.address);

describe("a manifest of one root: an anonymous block with one ungrouped root", () => {
  const drawing = drawFixture("bare");

  it("lies in its card, from P to R + K, shadow included in the block", () => {
    expect(size(drawing)).toEqual([476.5771484375, 67.37890625]);
    expect(rect(drawing, at("bare", "card"))).toEqual({
      x: 8,
      y: 8,
      width: 458.5771484375,
      height: 49.37890625,
    });
    expect(line(drawing, "bare")).toEqual({ xs: 49.5771484375, y: 22.40234375 });
    expect(element(drawing, at("bare", "name"))).toMatchObject({ x: 16 });
  });

  it("draws the block, the card, then the member drawing, and no title", () => {
    expect(order(drawing)).toEqual([
      BUNDLE_ADDRESS,
      at("bare", "card"),
      at("bare"),
      at("bare", "start"),
      at("bare", "end"),
      at("bare", "name"),
      at("bare", "start", "label"),
      at("bare", "end", "label"),
    ]);
  });
});

describe("manifests of one group: an anonymous block holding its frame", () => {
  it("group_child_member", () => {
    const drawing = drawFixture("groups/group_child_member");
    expect(size(drawing)).toEqual([558.4140625, 190.13671875]);
    expect(rect(drawing, at("group_1"))).toEqual({
      x: 8,
      y: 8,
      width: 542.4140625,
      height: 174.13671875,
    });
    expect(title(drawing, at("group_1", "name"))).toEqual({
      x: 16,
      baseline: 26.21044921875,
      anchor: "start",
      text: "Second half",
    });
    expect(rect(drawing, at("second-half", "card"))).toEqual({
      x: 16,
      y: 32.8046875,
      width: 526.4140625,
      height: 83.953125,
    });
    expect(rect(drawing, at("recording", "card"))).toEqual({
      x: 16,
      y: 124.7578125,
      width: 526.4140625,
      height: 49.37890625,
    });
    expect(line(drawing, "second-half")).toEqual({ xs: 120.61962890625, y: 81.78125 });
    expect(line(drawing, "recording")).toEqual({ xs: 120.61962890625, y: 139.16015625 });
    expect(order(drawing)).toEqual([
      BUNDLE_ADDRESS,
      at("group_1"),
      at("group_1", "name"),
      at("second-half", "card"),
      at("piece"),
      at("second-half"),
      at("second-half", "start"),
      at("second-half", "end"),
      at("second-half", "start"),
      at("second-half", "end"),
      at("piece", "name"),
      at("second-half", "name"),
      at("second-half", "start", "label"),
      at("second-half", "end", "label"),
      at("second-half", "start", "label"),
      at("second-half", "end", "label"),
      at("recording", "card"),
      at("recording"),
      at("recording", "start"),
      at("recording", "end"),
      at("recording", "name"),
      at("recording", "start", "label"),
      at("recording", "end", "label"),
    ]);
  });

  it("group_parents_mixed", () => {
    const drawing = drawFixture("groups/group_parents_mixed");
    expect(size(drawing)).toEqual([568.08642578125, 377.640625]);
    expect(rect(drawing, at("group_1"))).toEqual({
      x: 8,
      y: 8,
      width: 552.08642578125,
      height: 361.640625,
    });
    expect(title(drawing, at("group_1", "name"))).toMatchObject({ x: 16, text: "Exposition" });
    const cards = ["exposition", "take", "system", "audio"].map((id) =>
      rect(drawing, at(id, "card")),
    );
    expect(cards).toEqual([
      { x: 16, y: 32.8046875, width: 536.08642578125, height: 83.953125 },
      { x: 16, y: 124.7578125, width: 536.08642578125, height: 87.453125 },
      { x: 16, y: 220.2109375, width: 536.08642578125, height: 83.953125 },
      { x: 16, y: 312.1640625, width: 536.08642578125, height: 49.4765625 },
    ]);
    expect(["exposition", "take", "system", "audio"].map((id) => line(drawing, id))).toEqual([
      { xs: 113.0302734375, y: 81.78125 },
      { xs: 113.0302734375, y: 177.234375 },
      { xs: 113.0302734375, y: 269.1875 },
      { xs: 113.0302734375, y: 326.6640625 },
    ]);
  });

  it("group_grandchild", () => {
    const drawing = drawFixture("groups/group_grandchild");
    expect(size(drawing)).toEqual([559.70361328125, 224.11328125]);
    expect(rect(drawing, at("group_1"))).toEqual({
      x: 8,
      y: 8,
      width: 543.70361328125,
      height: 208.11328125,
    });
    expect(title(drawing, at("group_1", "name"))).toMatchObject({
      baseline: 26.21044921875,
      text: "Theme",
    });
    expect(rect(drawing, at("theme", "card"))).toEqual({
      x: 16,
      y: 32.8046875,
      width: 527.70361328125,
      height: 117.9296875,
    });
    expect(rect(drawing, at("recording", "card"))).toEqual({
      x: 16,
      y: 158.734375,
      width: 527.70361328125,
      height: 49.37890625,
    });
    expect(line(drawing, "theme")).toEqual({ xs: 111.70361328125, y: 115.7578125 });
    expect(line(drawing, "recording")).toEqual({ xs: 111.70361328125, y: 173.13671875 });
  });
});

describe("a titled manifest with two frames and an ungrouped root", () => {
  const drawing = drawFixture("bundles/bundle_mixed");

  it("opens with its title, then the frames and the ungrouped card F apart", () => {
    expect(size(drawing)).toEqual([580.484619140625, 473.62890625]);
    expect(drawing.origin).toEqual({ x: 0, y: 0 });
    expect(title(drawing, TITLE_ADDRESS)).toEqual({
      x: 8,
      baseline: 18.21044921875,
      anchor: "start",
      text: "Mixed",
    });
    expect(rect(drawing, at("group_1"))).toEqual({
      x: 8,
      y: 28.8046875,
      width: 562.484619140625,
      height: 169.234375,
    });
    expect(rect(drawing, at("group_2"))).toEqual({
      x: 8,
      y: 206.0390625,
      width: 562.484619140625,
      height: 177.734375,
    });
    expect([title(drawing, at("group_1", "name")), title(drawing, at("group_2", "name"))]).toEqual([
      { x: 16, baseline: 47.01513671875, anchor: "start", text: "Performance" },
      { x: 16, baseline: 224.24951171875, anchor: "start", text: "Facsimile" },
    ]);
    expect(
      ["score", "performance", "page", "excerpt", "annotations"].map((id) =>
        rect(drawing, at(id, "card")),
      ),
    ).toEqual([
      { x: 16, y: 53.609375, width: 546.484619140625, height: 78.953125 },
      { x: 16, y: 140.5625, width: 546.484619140625, height: 49.4765625 },
      { x: 16, y: 230.84375, width: 546.484619140625, height: 49.4765625 },
      { x: 16, y: 288.3203125, width: 546.484619140625, height: 87.453125 },
      { x: 8, y: 391.7734375, width: 562.484619140625, height: 71.85546875 },
    ]);
    expect(
      ["score", "performance", "page", "excerpt", "annotations"].map((id) => line(drawing, id)),
    ).toEqual([
      { xs: 126.29150390625, y: 73.109375 },
      { xs: 126.29150390625, y: 155.0625 },
      { xs: 126.29150390625, y: 245.34375 },
      { xs: 126.29150390625, y: 340.796875 },
      { xs: 126.29150390625, y: 406.17578125 },
    ]);
  });

  it("orders title, frames with their titles and cards, then the ungrouped cards", () => {
    const boxes = drawing.elements
      .filter((item) => ["block", "frame", "card"].includes(item.type) || isTitle(item))
      .map((item) => item.address);
    expect(boxes).toEqual([
      BUNDLE_ADDRESS,
      TITLE_ADDRESS,
      at("group_1"),
      at("group_1", "name"),
      at("score", "card"),
      at("performance", "card"),
      at("group_2"),
      at("group_2", "name"),
      at("page", "card"),
      at("excerpt", "card"),
      at("annotations", "card"),
    ]);
    // Each card comes right before its member drawing, which opens with its maps, regions and
    // jumps, and the drawing before the next card; an ancestor line lies just before its member's.
    const addresses = order(drawing);
    const indexOf = (address: ElementAddress) =>
      addresses.findIndex((item) => sameAddress(item, address));
    const opening: [string, ElementAddress[]][] = [
      ["score", [at("cmap_1"), at("cmap_2"), at("jump_from_1"), at("score")]],
      ["performance", [at("cmap_3"), at("performance")]],
      ["page", [at("cmap_4"), at("page")]],
      ["excerpt", [at("cmap_6"), at("recording"), at("excerpt")]],
      ["annotations", [at("region_1"), at("region_2"), at("annotations")]],
    ];
    for (const [member, first] of opening) {
      const next = indexOf(at(member, "card")) + 1;
      expect(addresses.slice(next, next + first.length), member).toEqual(first);
    }
    // The last member's name lies in the first frame's range, 2 up to 23; the second frame opens at 23.
    expect([indexOf(at("performance", "name")), indexOf(at("group_2"))]).toEqual([20, 23]);
  });

  it("records the block, then each frame and card in drawing order, each with its holder", () => {
    const containers = drawing.boxes.filter((box) => box.kind !== "band");
    expect(
      containers.map(({ kind, key, address, holder, range }) => [
        kind,
        key,
        address,
        holder,
        range,
      ]),
    ).toEqual([
      ["block", null, BUNDLE_ADDRESS, null, { start: 0, end: 58 }],
      ["frame", { item: "group_1" }, at("group_1"), null, { start: 2, end: 23 }],
      [
        "card",
        { item: "group_1", member: "score" },
        at("score", "card"),
        { item: "group_1" },
        { start: 4, end: 15 },
      ],
      [
        "card",
        { item: "group_1", member: "performance" },
        at("performance", "card"),
        { item: "group_1" },
        { start: 15, end: 23 },
      ],
      ["frame", { item: "group_2" }, at("group_2"), null, { start: 23, end: 47 }],
      [
        "card",
        { item: "group_2", member: "page" },
        at("page", "card"),
        { item: "group_2" },
        { start: 25, end: 33 },
      ],
      [
        "card",
        { item: "group_2", member: "excerpt" },
        at("excerpt", "card"),
        { item: "group_2" },
        { start: 33, end: 47 },
      ],
      ["card", { item: "annotations" }, at("annotations", "card"), null, { start: 47, end: 58 }],
    ]);
    expect(drawing.elements.length).toBe(58);
    expect(itemsOf(drawing).map((box) => box.key)).toEqual([
      { item: "group_1" },
      { item: "group_2" },
      { item: "annotations" },
    ]);
  });

  it("gives every member's card its size, spacing and request, and its rectangle", () => {
    const sized = (height: number) => ({
      size: { width: 546.484619140625, height },
      spacing: 4,
      stated: {},
    });
    const members = boxesOf(drawing, "card").filter((box) => box.holder !== null);
    expect(members.map((box) => box.card)).toEqual([
      sized(78.953125),
      sized(49.4765625),
      sized(49.4765625),
      sized(87.453125),
    ]);
    for (const box of members) {
      expect([box.x, box.y, box.width, box.height]).toEqual(
        Object.values(rect(drawing, box.address)),
      );
    }
  });

  it("holds each band in the card whose member drawing draws its line", () => {
    const held = (timeline: string, card: PlaceKey, facets: readonly Facet[]) =>
      facets.map((facet) => [bandAddress(timeline, facet), card]);
    const member = (item: string, member: string): PlaceKey => ({ item, member });
    expect(boxesOf(drawing, "band").map((box) => [box.address, box.holder])).toEqual([
      ...held("score", member("group_1", "score"), ["conversion_maps", "markers", "flow_control"]),
      ...held("performance", member("group_1", "performance"), ["conversion_maps", "markers"]),
      ...held("page", member("group_2", "page"), ["conversion_maps", "markers"]),
      ...held("excerpt", member("group_2", "excerpt"), ["conversion_maps", "markers"]),
      ...held("annotations", { item: "annotations" }, ["markers", "regions"]),
    ]);
    for (const box of boxesOf(drawing, "band")) {
      expect(box.range.start).toBe(box.range.end);
    }
  });
});

/** The manifest's title and its groups' titles, of the bundles drawn here. */
const TITLES = [TITLE_ADDRESS, at("group_1", "name"), at("group_2", "name")];
const isTitle = (item: DrawnElement): boolean =>
  item.type === "name" && TITLES.some((address) => sameAddress(item.address, address));

describe("hidden titles", () => {
  it("a frame without its title slot", () => {
    const drawing = drawFixture("groups/group_child_member", [hide(at("group_1", "name"))]);
    expect(drawing.elements.some((item) => sameAddress(item.address, at("group_1", "name")))).toBe(
      false,
    );
    expect(rect(drawing, at("second-half", "card"))).toMatchObject({ y: 16 });
    expect(rect(drawing, at("recording", "card"))).toMatchObject({ y: 107.953125 });
    expect(rect(drawing, at("group_1"))).toMatchObject({ y: 8, height: 157.33203125 });
    expect(drawing.height).toBe(173.33203125);
  });

  it("a manifest without its title", () => {
    const drawing = drawFixture("bundles/bundle_mixed", [hide({ part: ["name"] })]);
    expect(drawing.elements.some((item) => sameAddress(item.address, TITLE_ADDRESS))).toBe(false);
    expect(rect(drawing, at("group_1"))).toMatchObject({ y: 8 });
    expect(rect(drawing, at("annotations", "card"))).toMatchObject({ y: 370.96875 });
    expect(drawing.height).toBe(452.82421875);
  });
});

describe("the block size", () => {
  const natural = drawFixture("bare");
  const rest = (drawing: Drawing) => drawing.elements.slice(1);

  it("takes a larger request, keeping the content in place", () => {
    const drawing = drawFixture("bare", [], { ...DEFAULT_PLACEMENT, width: 600, height: 100 });
    expect(size(drawing)).toEqual([600, 100]);
    expect(element(drawing, BUNDLE_ADDRESS)).toMatchObject({ width: 600, height: 100 });
    expect(rest(drawing)).toEqual(rest(natural));
  });

  it("never becomes smaller than the content", () => {
    const drawing = drawFixture("bare", [], { ...DEFAULT_PLACEMENT, width: 300, height: 20 });
    expect(size(drawing)).toEqual([476.5771484375, 67.37890625]);
  });

  it("keeps the content's height when only the width is requested", () => {
    const drawing = drawFixture("bare", [], { ...DEFAULT_PLACEMENT, width: 600 });
    expect(size(drawing)).toEqual([600, 67.37890625]);
  });

  it("keeps its padding P whatever the block's and the card's spacing", () => {
    const placement = { ...DEFAULT_PLACEMENT, spacing: 24, places: { bare: { spacing: 0 } } };
    const drawing = drawFixture("bare", [], placement);
    expect(rect(drawing, at("bare", "card"))).toEqual({
      x: 8,
      y: 8,
      width: 458.5771484375,
      height: 49.37890625,
    });
    expect(line(drawing, "bare")).toEqual({ xs: 49.5771484375, y: 22.40234375 });
    expect(size(drawing)).toEqual([476.5771484375, 67.37890625]);
  });
});

describe("addresses by ID", () => {
  it("address a map by its own ID alone", () => {
    const drawing = drawFixture("bundles/corpus_mpm");
    expect(element(drawing, at("tmap_1")).type).toBe("map");
  });

  it("address a member's region by its own ID, its label by that ID and the part label", () => {
    let view = apply(createView(), {
      type: "add",
      into: WORKSPACE,
      block: { id: BLOCK, manifest: loadFile("groups/group_child_member"), x: 0, y: 0 },
    });
    if (!isCommandError(view)) {
      view = apply(view, {
        type: "add",
        into: target("second-half"),
        region: { id: "region_1", name: "Theme", start: quarters(2), end: quarters(6), meta: {} },
      });
    }
    if (isCommandError(view)) throw new Error(`${view.code}: ${view.message}`);
    const manifest = (view.blocks[BLOCK] as { readonly manifest: Manifest }).manifest;
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [DEFAULT_LAYER, manifestLayer(manifest)],
      metrics,
    );
    expect(element(drawing, at("region_1")).type).toBe("region");
    expect(element(drawing, at("region_1", "label")).type).toBe("label");
    expect(
      drawing.elements
        .filter((item) => item.address.id === "region_1")
        .map((item) => [item.type, item.address]),
    ).toEqual([
      ["region", at("region_1")],
      ["label", at("region_1", "label")],
    ]);
  });
});

describe("cards in the tree", () => {
  const manifest = loadFile("groups/group_child_member");

  it("belong to their timeline, with its domain", () => {
    const drawing = drawFixture("groups/group_child_member", [
      {
        statements: [{ select: { element: "card", domain: "physical" }, set: { fill: "#ABCDEF" } }],
      },
    ]);
    expect(element(drawing, at("recording", "card")).style.fill).toBe("#ABCDEF");
    expect(element(drawing, at("second-half", "card")).style.fill).toBe("#FFFFFF");
  });

  it("hold nothing", () => {
    const drawing = draw(
      manifest,
      DEFAULT_PLACEMENT,
      [{ statements: [{ select: { inside: "card" }, set: { stroke: "#123456" } }] }],
      metrics,
    );
    expect(drawing.elements.filter((item) => item.style.stroke === "#123456")).toEqual([]);
  });
});

describe("hidden cards and frames keep their place", () => {
  const hideAll = (kind: ElementType): Graphical => ({
    statements: [{ select: { element: kind }, set: { display: "none" } }],
  });
  const without = (drawing: Drawing, types: readonly string[]) =>
    drawing.elements.filter((item) => !types.includes(item.type));
  const drawn = (drawing: Drawing, type: string) =>
    drawing.elements.filter((item) => item.type === type);

  it("bare: the card's edges count, its shadow does not", () => {
    const natural = drawFixture("bare");
    const drawing = drawFixture("bare", [hideAll("card")]);
    expect(drawn(drawing, "card")).toEqual([]);
    expect(size(drawing)).toEqual([474.5771484375, 65.37890625]);
    expect(element(drawing, BUNDLE_ADDRESS)).toMatchObject({
      width: 474.5771484375,
      height: 65.37890625,
    });
    expect(without(drawing, ["block"])).toEqual(without(natural, ["block", "card"]));
    expect(itemsOf(drawing)[0]?.range).toEqual({ start: 1, end: 7 });
  });

  it("group_child_member: the frame still sets the block", () => {
    const natural = drawFixture("groups/group_child_member");
    const drawing = drawFixture("groups/group_child_member", [hideAll("card")]);
    expect(drawn(drawing, "card")).toEqual([]);
    expect(size(drawing)).toEqual([558.4140625, 190.13671875]);
    expect(without(drawing, [])).toEqual(without(natural, ["card"]));
    expect(boxesOf(drawing, "card").map((card) => card.range)).toEqual([
      { start: 3, end: 15 },
      { start: 15, end: 21 },
    ]);
    expect(itemsOf(drawing)[0]?.range).toEqual({ start: 1, end: 21 });
  });

  it("group_child_member: a hidden frame keeps xn and the block", () => {
    const natural = drawFixture("groups/group_child_member");
    const drawing = drawFixture("groups/group_child_member", [hideAll("frame")]);
    expect(drawn(drawing, "frame")).toEqual([]);
    expect(element(drawing, at("piece", "name"))).toMatchObject({ x: 24 });
    expect(rect(drawing, at("second-half", "card"))).toMatchObject({ x: 16 });
    expect(size(drawing)).toEqual([558.4140625, 190.13671875]);
    expect(without(drawing, [])).toEqual(without(natural, ["frame"]));
    expect(boxesOf(drawing, "card").map((card) => card.range)).toEqual([
      { start: 2, end: 15 },
      { start: 15, end: 22 },
    ]);
    expect(itemsOf(drawing)[0]?.range).toEqual({ start: 1, end: 22 });
  });

  it("records whether each container's own rectangle is drawn", () => {
    const displayed = (drawing: Drawing) =>
      drawing.boxes.map((record) => [record.kind, record.address, record.displayed]);
    const natural = displayed(drawFixture("groups/group_child_member"));
    const flip = (hidden: string) =>
      natural.map(([kind, address, shown]) => [kind, address, kind === hidden ? false : shown]);
    expect(natural.filter(([kind]) => kind !== "band")).toEqual([
      ["block", BUNDLE_ADDRESS, true],
      ["frame", at("group_1"), true],
      ["card", at("second-half", "card"), true],
      ["card", at("recording", "card"), true],
    ]);
    expect(natural.filter(([kind]) => kind === "band").every(([, , shown]) => !shown)).toBe(true);
    for (const [kind, type] of [
      ["frame", "frame"],
      ["card", "card"],
    ] as const) {
      expect(displayed(drawFixture("groups/group_child_member", [hideAll(type)]))).toEqual(
        flip(kind),
      );
    }
  });
});
