import { apply, createView, isCommandError, type Manifest } from "@timetoalign/tilie-core";
import type { ElementType, Graphical } from "@timetoalign/timetoshare";
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
  BLOCK,
  boxesOf,
  drawFixture,
  element,
  itemsOf,
  loadFile,
  metrics,
  quarters,
} from "./support.ts";

const hide = (address: string): Graphical => ({
  statements: [{ select: { ids: [address] }, set: { display: "none" } }],
});

/** The rectangle of a frame or card, or the block's size. */
function rect(drawing: Drawing, address: string): object {
  const found = element(drawing, address);
  if (found.type !== "group" && found.type !== "card") throw new Error(`${address} is no rect`);
  return { x: found.x, y: found.y, width: found.width, height: found.height };
}

function title(drawing: Drawing, address: string): object {
  const found = element(drawing, address);
  if (found.type !== "name") throw new Error(`${address} is no title`);
  return { x: found.x, baseline: found.baseline, anchor: found.anchor, text: found.text };
}

/** The start and ordinate of a member's line. */
function line(drawing: Drawing, address: string): object {
  const found = element(drawing, address);
  if (found.type !== "timeline") throw new Error(`${address} is no member line`);
  return { xs: found.xs, y: found.y };
}

const size = (drawing: Drawing) => [drawing.width, drawing.height];
const order = (drawing: Drawing) => drawing.elements.map((item) => item.address);

describe("a manifest of one root: an anonymous box with one ungrouped root", () => {
  const drawing = drawFixture("bare");

  it("lies in its card, from P to R + K, shadow included in the box", () => {
    expect(size(drawing)).toEqual([476.5771484375, 67.37890625]);
    expect(rect(drawing, "bare/card")).toEqual({
      x: 8,
      y: 8,
      width: 458.5771484375,
      height: 49.37890625,
    });
    expect(line(drawing, "bare")).toEqual({ xs: 49.5771484375, y: 22.40234375 });
    expect(element(drawing, "bare/name")).toMatchObject({ x: 16 });
  });

  it("draws the block, the card, then the member drawing, and no title", () => {
    expect(order(drawing)).toEqual([
      null,
      "bare/card",
      "bare",
      "bare/start",
      "bare/end",
      "bare/name",
      "bare/start/label",
      "bare/end/label",
    ]);
  });
});

describe("manifests of one group: an anonymous box holding its frame", () => {
  it("group_child_member", () => {
    const drawing = drawFixture("groups/group_child_member");
    expect(size(drawing)).toEqual([558.4140625, 190.13671875]);
    expect(rect(drawing, "group_1")).toEqual({
      x: 8,
      y: 8,
      width: 542.4140625,
      height: 174.13671875,
    });
    expect(title(drawing, "group_1/name")).toEqual({
      x: 16,
      baseline: 26.21044921875,
      anchor: "start",
      text: "Second half",
    });
    expect(rect(drawing, "group_1/second-half/card")).toEqual({
      x: 16,
      y: 32.8046875,
      width: 526.4140625,
      height: 83.953125,
    });
    expect(rect(drawing, "group_1/recording/card")).toEqual({
      x: 16,
      y: 124.7578125,
      width: 526.4140625,
      height: 49.37890625,
    });
    expect(line(drawing, "second-half")).toEqual({ xs: 120.61962890625, y: 81.78125 });
    expect(line(drawing, "recording")).toEqual({ xs: 120.61962890625, y: 139.16015625 });
    expect(order(drawing)).toEqual([
      null,
      "group_1",
      "group_1/name",
      "group_1/second-half/card",
      "piece",
      "second-half",
      "second-half/start",
      "second-half/end",
      "second-half/start",
      "second-half/end",
      "piece/name",
      "second-half/name",
      "second-half/start/label",
      "second-half/end/label",
      "second-half/start/label",
      "second-half/end/label",
      "group_1/recording/card",
      "recording",
      "recording/start",
      "recording/end",
      "recording/name",
      "recording/start/label",
      "recording/end/label",
    ]);
  });

  it("group_parents_mixed", () => {
    const drawing = drawFixture("groups/group_parents_mixed");
    expect(size(drawing)).toEqual([568.08642578125, 377.640625]);
    expect(rect(drawing, "group_1")).toEqual({
      x: 8,
      y: 8,
      width: 552.08642578125,
      height: 361.640625,
    });
    expect(title(drawing, "group_1/name")).toMatchObject({ x: 16, text: "Exposition" });
    const cards = ["exposition", "take", "system", "audio"].map((id) =>
      rect(drawing, `group_1/${id}/card`),
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
    expect(rect(drawing, "group_1")).toEqual({
      x: 8,
      y: 8,
      width: 543.70361328125,
      height: 208.11328125,
    });
    expect(title(drawing, "group_1/name")).toMatchObject({
      baseline: 26.21044921875,
      text: "Theme",
    });
    expect(rect(drawing, "group_1/theme/card")).toEqual({
      x: 16,
      y: 32.8046875,
      width: 527.70361328125,
      height: 117.9296875,
    });
    expect(rect(drawing, "group_1/recording/card")).toEqual({
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
    expect(title(drawing, "name")).toEqual({
      x: 8,
      baseline: 18.21044921875,
      anchor: "start",
      text: "Mixed",
    });
    expect(rect(drawing, "group_1")).toEqual({
      x: 8,
      y: 28.8046875,
      width: 562.484619140625,
      height: 169.234375,
    });
    expect(rect(drawing, "group_2")).toEqual({
      x: 8,
      y: 206.0390625,
      width: 562.484619140625,
      height: 177.734375,
    });
    expect([title(drawing, "group_1/name"), title(drawing, "group_2/name")]).toEqual([
      { x: 16, baseline: 47.01513671875, anchor: "start", text: "Performance" },
      { x: 16, baseline: 224.24951171875, anchor: "start", text: "Facsimile" },
    ]);
    expect(
      [
        "group_1/score",
        "group_1/performance",
        "group_2/page",
        "group_2/excerpt",
        "annotations",
      ].map((key) => rect(drawing, `${key}/card`)),
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
      .filter((item) => ["block", "group", "card"].includes(item.type) || isTitle(item))
      .map((item) => item.address);
    expect(boxes).toEqual([
      null,
      "name",
      "group_1",
      "group_1/name",
      "group_1/score/card",
      "group_1/performance/card",
      "group_2",
      "group_2/name",
      "group_2/page/card",
      "group_2/excerpt/card",
      "annotations/card",
    ]);
    // Each card comes right before its member drawing, which opens with its maps, regions and
    // jumps, and the drawing before the next card; an ancestor line lies just before its member's.
    const addresses = order(drawing);
    const opening = {
      "group_1/score": ["score/cmap_1", "score/cmap_2", "score/jump_from_1", "score"],
      "group_1/performance": ["performance/cmap_1", "performance"],
      "group_2/page": ["page/cmap_1", "page"],
      "group_2/excerpt": ["recording/cmap_2", "recording", "excerpt"],
      annotations: ["annotations/region_1", "annotations/region_2", "annotations"],
    };
    for (const [key, first] of Object.entries(opening)) {
      const at = addresses.indexOf(`${key}/card`) + 1;
      expect(addresses.slice(at, at + first.length), key).toEqual(first);
    }
    expect(addresses.indexOf("performance/name")).toBeLessThan(addresses.indexOf("group_2"));
  });

  it("records the box, then each frame and card in drawing order, each with its holder", () => {
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
      ["box", null, null, null, { start: 0, end: 58 }],
      ["frame", "group_1", "group_1", null, { start: 2, end: 23 }],
      ["card", "group_1/score", "group_1/score/card", "group_1", { start: 4, end: 15 }],
      [
        "card",
        "group_1/performance",
        "group_1/performance/card",
        "group_1",
        { start: 15, end: 23 },
      ],
      ["frame", "group_2", "group_2", null, { start: 23, end: 47 }],
      ["card", "group_2/page", "group_2/page/card", "group_2", { start: 25, end: 33 }],
      ["card", "group_2/excerpt", "group_2/excerpt/card", "group_2", { start: 33, end: 47 }],
      ["card", "annotations", "annotations/card", null, { start: 47, end: 58 }],
    ]);
    expect(drawing.elements.length).toBe(58);
    expect(itemsOf(drawing).map((box) => box.key)).toEqual(["group_1", "group_2", "annotations"]);
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
        Object.values(rect(drawing, box.address as string)),
      );
    }
  });

  it("holds each band in the card whose member drawing draws its line", () => {
    const held = (timeline: string, card: string, kinds: readonly string[]) =>
      kinds.map((kind) => [`${timeline}/${kind}_1`, card]);
    expect(boxesOf(drawing, "band").map((box) => [box.address, box.holder])).toEqual([
      ...held("score", "group_1/score/card", ["conversion_maps", "markers", "flow_control"]),
      ...held("performance", "group_1/performance/card", ["conversion_maps", "markers"]),
      ...held("page", "group_2/page/card", ["conversion_maps", "markers"]),
      ...held("excerpt", "group_2/excerpt/card", ["conversion_maps", "markers"]),
      ...held("annotations", "annotations/card", ["markers", "regions"]),
    ]);
    for (const box of boxesOf(drawing, "band")) {
      expect(box.range.start).toBe(box.range.end);
    }
  });
});

const isTitle = (item: DrawnElement): boolean =>
  item.type === "name" && /^(group_\d+\/name|name)$/.test(item.address as string);

describe("hidden titles", () => {
  it("a frame without its title slot", () => {
    const drawing = drawFixture("groups/group_child_member", [hide("group_1/name")]);
    expect(drawing.elements.some((item) => item.address === "group_1/name")).toBe(false);
    expect(rect(drawing, "group_1/second-half/card")).toMatchObject({ y: 16 });
    expect(rect(drawing, "group_1/recording/card")).toMatchObject({ y: 107.953125 });
    expect(rect(drawing, "group_1")).toMatchObject({ y: 8, height: 157.33203125 });
    expect(drawing.height).toBe(173.33203125);
  });

  it("a manifest without its title", () => {
    const drawing = drawFixture("bundles/bundle_mixed", [hide("name")]);
    expect(drawing.elements.some((item) => item.address === "name")).toBe(false);
    expect(rect(drawing, "group_1")).toMatchObject({ y: 8 });
    expect(rect(drawing, "annotations/card")).toMatchObject({ y: 370.96875 });
    expect(drawing.height).toBe(452.82421875);
  });
});

describe("the box size", () => {
  const natural = drawFixture("bare");
  const rest = (drawing: Drawing) => drawing.elements.slice(1);

  it("takes a larger request, keeping the content in place", () => {
    const drawing = drawFixture("bare", [], { ...DEFAULT_PLACEMENT, width: 600, height: 100 });
    expect(size(drawing)).toEqual([600, 100]);
    expect(element(drawing, null)).toMatchObject({ width: 600, height: 100 });
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

  it("keeps its padding P whatever the box's and the card's spacing", () => {
    const placement = { ...DEFAULT_PLACEMENT, spacing: 24, places: { bare: { spacing: 0 } } };
    const drawing = drawFixture("bare", [], placement);
    expect(rect(drawing, "bare/card")).toEqual({
      x: 8,
      y: 8,
      width: 458.5771484375,
      height: 49.37890625,
    });
    expect(line(drawing, "bare")).toEqual({ xs: 49.5771484375, y: 22.40234375 });
    expect(size(drawing)).toEqual([476.5771484375, 67.37890625]);
  });
});

describe("root-qualified addresses", () => {
  it("prefix a map with its root's id", () => {
    const drawing = drawFixture("bundles/corpus_mpm");
    expect(element(drawing, "score:clt_1/tmap_1").type).toBe("map");
  });

  it("prefix a member's region with the id of the root whose tree holds it", () => {
    let view = apply(createView(), {
      type: "add",
      into: "workspace",
      block: { id: BLOCK, manifest: loadFile("groups/group_child_member"), x: 0, y: 0 },
    });
    if (!isCommandError(view)) {
      view = apply(view, {
        type: "add",
        into: `${BLOCK}/second-half`,
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
    expect(element(drawing, "piece/region_1").type).toBe("region");
    expect(element(drawing, "piece/region_1/label").type).toBe("label");
    expect(drawing.elements.some((item) => item.address === "region_1")).toBe(false);
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
    expect(element(drawing, "group_1/recording/card").style.fill).toBe("#ABCDEF");
    expect(element(drawing, "group_1/second-half/card").style.fill).toBe("#FFFFFF");
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
    expect(element(drawing, null)).toMatchObject({ width: 474.5771484375, height: 65.37890625 });
    expect(without(drawing, ["block"])).toEqual(without(natural, ["block", "card"]));
    expect(itemsOf(drawing)[0]?.range).toEqual({ start: 1, end: 7 });
  });

  it("group_child_member: the frame still sets the box", () => {
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

  it("group_child_member: a hidden frame keeps xn and the box", () => {
    const natural = drawFixture("groups/group_child_member");
    const drawing = drawFixture("groups/group_child_member", [hideAll("group")]);
    expect(drawn(drawing, "group")).toEqual([]);
    expect(element(drawing, "piece/name")).toMatchObject({ x: 24 });
    expect(rect(drawing, "group_1/second-half/card")).toMatchObject({ x: 16 });
    expect(size(drawing)).toEqual([558.4140625, 190.13671875]);
    expect(without(drawing, [])).toEqual(without(natural, ["group"]));
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
      ["box", null, true],
      ["frame", "group_1", true],
      ["card", "group_1/second-half/card", true],
      ["card", "group_1/recording/card", true],
    ]);
    expect(natural.filter(([kind]) => kind === "band").every(([, , shown]) => !shown)).toBe(true);
    for (const [kind, type] of [
      ["frame", "group"],
      ["card", "card"],
    ] as const) {
      expect(displayed(drawFixture("groups/group_child_member", [hideAll(type)]))).toEqual(
        flip(kind),
      );
    }
  });
});
