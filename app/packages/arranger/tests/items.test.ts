import type { Address, ElementAddress, PlaceKey, View } from "@timetoalign/tilie-core";
import {
  addressKey,
  cardAddress,
  contains,
  idAddress,
  inBlock,
  isCommandError,
  placeAt,
  placeKeyText,
  preview,
  sameAddress,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import type { ItemBox } from "../src/boxes.ts";
import { boxOf, itemHolding, itemOf, keyedBox } from "../src/boxes.ts";
import type { Level } from "../src/containers.ts";
import { drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import type { PlaceChanges, PlaceValues } from "../src/items.ts";
import {
  itemHandlesFor,
  itemMoveCommand,
  itemResizeCommand,
  itemResizeValues,
  itemsMovedWith,
  placeChanges,
  placeEdit,
  Stretch,
} from "../src/items.ts";
import { GRID_FREE } from "../src/numbers.ts";
import { project } from "../src/project.ts";
import type { Handle, ResizeMode } from "../src/resize.ts";
import { NOTHING_SELECTED, selectionOf } from "../src/selection.ts";
import {
  A,
  blockIn,
  changed,
  metrics,
  mixedPlain,
  placed,
  recordingInGroup1,
  storeOf,
  viewOf,
} from "./support.ts";

const view = mixedPlain();
/** The address of the element with ID `id` in block A: a place's target. */
const at = (id: string): Address => inBlock(A, idAddress(id));
/** The address of every card of `id` in block A. */
const cardAt = (id: string): Address => inBlock(A, cardAddress(id));
/** The place keys of `bundle_mixed`'s items and of its held cards. */
const FRAME_1: PlaceKey = { item: "group_1" };
const FRAME_2: PlaceKey = { item: "group_2" };
const ANNOTATIONS: PlaceKey = { item: "annotations" };
const PERFORMANCE: PlaceKey = { item: "group_1", member: "performance" };
const SCORE: PlaceKey = { item: "group_1", member: "score" };
const DRAWN = {
  group_1: { x: 8, y: 28.8046875 },
  group_2: { x: 8, y: 206.0390625 },
  annotations: { x: 8, y: 391.7734375 },
};

function placeOf(of: View, key: PlaceKey): ItemBox["item"]["place"] {
  return itemOf(drawingOf(blockIn(of, A), of.settings, metrics), key).item.place;
}

/** A frame or card of block A in `of`, by its place key: the box a resize acts on. */
function resizedBox(of: View, key: PlaceKey): DrawnBox {
  const found = keyedBox(drawingOf(blockIn(of, A), of.settings, metrics), key);
  if (found === undefined) throw new Error(`no box ${placeKeyText(key)}`);
  return found;
}

describe("itemMoveCommand", () => {
  it("moves the item and states the drawn position of every other item", () => {
    const command = itemMoveCommand(view, A, FRAME_2, 40, 200, metrics);
    expect(command).toEqual({
      type: "set",
      changes: [
        { target: at("group_2"), values: { place: { x: 40, y: 200 } } },
        { target: at("group_1"), values: { place: DRAWN.group_1 } },
        { target: at("annotations"), values: { place: DRAWN.annotations } },
      ],
    });
    const after = changed(view, command);
    expect(placeOf(after, FRAME_2)).toMatchObject({ x: 40, y: 200 });
    expect(placeOf(after, FRAME_1)).toMatchObject(DRAWN.group_1);
    expect(placeOf(after, ANNOTATIONS)).toMatchObject(DRAWN.annotations);
  });

  it("states only the member another item leaves unstated", () => {
    const moved = placed(view, A, "group_1", { x: 12 });
    expect(itemMoveCommand(moved, A, FRAME_2, 40, 200, metrics)?.changes[1]).toEqual({
      target: at("group_1"),
      values: { place: { y: 28.8046875 } },
    });
  });

  it("quantizes, gives null where the item is drawn, and refuses a key that is no item", () => {
    expect(itemMoveCommand(view, A, FRAME_2, 40.0001, 200, metrics)).toEqual(
      itemMoveCommand(view, A, FRAME_2, 40, 200, metrics),
    );
    expect(itemMoveCommand(view, A, FRAME_2, 8, 206.0390625, metrics)).toBeNull();
    expect(() => itemMoveCommand(view, A, { item: "score" }, 0, 0, metrics)).toThrow(RangeError);
  });

  it("moves the items together by the pressed item's travel, each keeping its offset", () => {
    const command = itemMoveCommand(view, A, FRAME_2, 40, 200, metrics, [ANNOTATIONS]);
    expect(command).toEqual({
      type: "set",
      changes: [
        { target: at("group_2"), values: { place: { x: 40, y: 200 } } },
        { target: at("annotations"), values: { place: { x: 40, y: 385.734375 } } },
        { target: at("group_1"), values: { place: DRAWN.group_1 } },
      ],
    });
    const after = changed(view, command);
    expect(placeOf(after, FRAME_2)).toMatchObject({ x: 40, y: 200 });
    expect(placeOf(after, ANNOTATIONS)).toMatchObject({ x: 40, y: 385.734375 });
    expect(placeOf(after, FRAME_1)).toMatchObject(DRAWN.group_1);
  });

  it("moves every item when every other one goes with the pressed one", () => {
    const command = itemMoveCommand(view, A, FRAME_2, 40, 200, metrics, [FRAME_1, ANNOTATIONS]);
    expect(command).toEqual({
      type: "set",
      changes: [
        { target: at("group_2"), values: { place: { x: 40, y: 200 } } },
        { target: at("group_1"), values: { place: { x: 40, y: 22.765625 } } },
        { target: at("annotations"), values: { place: { x: 40, y: 385.734375 } } },
      ],
    });
    const after = changed(view, command);
    expect(placeOf(after, FRAME_2)).toMatchObject({ x: 40, y: 200 });
    expect(placeOf(after, FRAME_1)).toMatchObject({ x: 40, y: 22.765625 });
    expect(placeOf(after, ANNOTATIONS)).toMatchObject({ x: 40, y: 385.734375 });
  });

  it("gives null when no item travels, and refuses a key of together that is no item", () => {
    expect(itemMoveCommand(view, A, FRAME_2, 8, 206.0390625, metrics, [ANNOTATIONS])).toBeNull();
    expect(() => itemMoveCommand(view, A, FRAME_2, 40, 200, metrics, [{ item: "score" }])).toThrow(
      RangeError,
    );
  });
});

/** The selected element addresses `addresses` of a block, by their keys, as a node holds them. */
function selectedOf(addresses: readonly ElementAddress[]): ReadonlyMap<string, ElementAddress> {
  return new Map(addresses.map((address) => [addressKey(address), address]));
}

const TITLE: ElementAddress = { part: ["name"] };

describe("itemsMovedWith", () => {
  const { manifest } = blockIn(view, A);
  const drawing = drawingOf(blockIn(view, A), view.settings, metrics);
  const movedWith = (selected: readonly ElementAddress[], key: PlaceKey) =>
    itemsMovedWith(manifest, drawing, selectedOf(selected), key);

  it("names the other items in the selection when the pressed one is among them", () => {
    const frameAndCard = [idAddress("group_2"), cardAddress("annotations")];
    expect(movedWith(frameAndCard, FRAME_2)).toEqual([ANNOTATIONS]);
    expect(movedWith(frameAndCard, ANNOTATIONS)).toEqual([FRAME_2]);
    expect(movedWith(frameAndCard, FRAME_1)).toBeNull();
    expect(
      movedWith(
        [idAddress("group_1"), idAddress("group_2"), cardAddress("annotations")],
        ANNOTATIONS,
      ),
    ).toEqual([FRAME_1, FRAME_2]);
  });

  it("counts an item containing a selected element as in the selection", () => {
    const elements: ElementAddress[] = [idAddress("score"), { id: "annotations", part: ["name"] }];
    expect(movedWith(elements, FRAME_1)).toEqual([ANNOTATIONS]);
    expect(movedWith(elements, ANNOTATIONS)).toEqual([FRAME_1]);
    expect(movedWith(elements, FRAME_2)).toBeNull();
  });

  it("names none for the one item in the selection, null for an item outside it", () => {
    const oneItem = [idAddress("group_2"), idAddress("page"), cardAddress("excerpt")];
    expect(movedWith(oneItem, FRAME_2)).toEqual([]);
    expect(movedWith(oneItem, FRAME_1)).toBeNull();
    expect(movedWith(oneItem, ANNOTATIONS)).toBeNull();
    expect(movedWith([TITLE, idAddress("group_2")], FRAME_2)).toEqual([]);
    expect(movedWith([TITLE, idAddress("group_2")], FRAME_1)).toBeNull();
    for (const key of [FRAME_1, FRAME_2, ANNOTATIONS]) {
      expect(movedWith([], key)).toBeNull();
    }
  });

  it("decides by address, not by where things are drawn", () => {
    // The ancestor line `recording` is drawn inside `group_2`'s frame; no item contains it.
    expect(movedWith([idAddress("recording")], FRAME_2)).toBeNull();
    // `annotations`' card drawn over `group_1`'s frame.
    const over = changed(view, itemMoveCommand(view, A, ANNOTATIONS, 8, 60, metrics));
    const width = 562.484619140625;
    expect(placeOf(over, ANNOTATIONS)).toMatchObject({ x: 8, y: 60, width, height: 71.85546875 });
    expect(placeOf(over, FRAME_1)).toMatchObject({
      x: 8,
      y: 28.8046875,
      width,
      height: 169.234375,
    });
    const block = blockIn(over, A);
    const overDrawing = drawingOf(block, over.settings, metrics);
    const selected = selectedOf([{ id: "annotations", part: ["name"] }, idAddress("group_2")]);
    expect(itemsMovedWith(block.manifest, overDrawing, selected, FRAME_2)).toEqual([ANNOTATIONS]);
    expect(itemsMovedWith(block.manifest, overDrawing, selected, ANNOTATIONS)).toEqual([FRAME_2]);
    expect(itemsMovedWith(block.manifest, overDrawing, selected, FRAME_1)).toBeNull();
  });

  it("puts a selected card in the selection only through the frame drawing it", () => {
    // `recording` a member of `group_1`, its child `excerpt` a member of `group_2`.
    const twice = recordingInGroup1(view);
    const block = blockIn(twice, A);
    const twiceDrawing = drawingOf(block, twice.settings, metrics);
    expect(
      twiceDrawing.boxes
        .filter((card) => sameAddress(card.address, cardAddress("excerpt")))
        .map((card) => itemHolding(twiceDrawing, card).key),
    ).toEqual([FRAME_2]);
    for (const group of ["group_1", "group_2"]) {
      expect(contains(block.manifest, group, cardAddress("excerpt"))).toBe(true);
    }
    const movedIn = (selected: ElementAddress, key: PlaceKey) =>
      itemsMovedWith(block.manifest, twiceDrawing, selectedOf([selected]), key);
    expect(movedIn(cardAddress("excerpt"), FRAME_1)).toBeNull();
    expect(movedIn(cardAddress("excerpt"), FRAME_2)).toEqual([]);
    expect(movedIn(idAddress("excerpt"), FRAME_1)).toEqual([FRAME_2]);
    expect(movedIn(idAddress("excerpt"), FRAME_2)).toEqual([FRAME_1]);
  });

  it("puts a selected card of a member of two groups in the selection through both frames", () => {
    const shared = viewOf({ id: A, fixture: "bundles/bundle_shared_member", x: 40, y: 80 });
    const block = blockIn(shared, A);
    const sharedDrawing = drawingOf(block, shared.settings, metrics);
    const selected = selectedOf([cardAddress("t")]);
    expect(itemsMovedWith(block.manifest, sharedDrawing, selected, { item: "g1" })).toEqual([
      { item: "g2" },
    ]);
    expect(itemsMovedWith(block.manifest, sharedDrawing, selected, { item: "g2" })).toEqual([
      { item: "g1" },
    ]);
  });
});

describe("a move's preview", () => {
  it("is the command applied: drawn exactly as the release stores it", () => {
    const command = itemMoveCommand(view, A, FRAME_2, 40, 200, metrics);
    if (command === null) throw new Error("no command");
    const previewed = preview(view, command);
    if (isCommandError(previewed)) throw new Error(previewed.message);
    const after = changed(view, command);
    expect(drawingOf(blockIn(previewed, A), previewed.settings, metrics)).toEqual(
      drawingOf(blockIn(after, A), after.settings, metrics),
    );
  });
});

describe("the boxes a resize acts on", () => {
  const drawing = drawingOf(blockIn(view, A), view.settings, metrics);
  const holding = (address: ElementAddress) => {
    const box = boxOf(drawing, address);
    if (box === undefined) throw new Error(`no box ${addressKey(address)}`);
    return itemHolding(drawing, box).key;
  };

  it("are the frames and cards, each held by its own item or, held by a frame, by the frame", () => {
    expect(holding(idAddress("group_1"))).toEqual(FRAME_1);
    expect(holding(cardAddress("annotations"))).toEqual(ANNOTATIONS);
    expect(holding(cardAddress("performance"))).toEqual(FRAME_1);
    expect(holding(cardAddress("excerpt"))).toEqual(FRAME_2);
    expect(boxOf(drawing, idAddress("score"))).toBeUndefined();
    expect(boxOf(drawing, { id: "group_1", part: ["name"] })).toBeUndefined();
  });
});

describe("itemHandlesFor", () => {
  const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
  const EIGHT = [
    "top-left",
    "top",
    "top-right",
    "right",
    "bottom-right",
    "bottom",
    "bottom-left",
    "left",
  ];

  it("offers a frame or card a block's handles, no left one to stretch in the group editor", () => {
    for (const key of [FRAME_1, ANNOTATIONS]) {
      const box = resizedBox(view, key);
      for (const level of ["arranger", "bundle", "group", "timeline"] as const) {
        expect(itemHandlesFor("scale", box, level)).toEqual(CORNERS);
        expect(itemHandlesFor("box", box, level)).toEqual(EIGHT);
        expect(itemHandlesFor("stretch", box, level)).toEqual(
          level === "group" ? ["top", "top-right", "right", "bottom-right", "bottom"] : EIGHT,
        );
      }
    }
  });

  it("never moves a held card's top left corner", () => {
    const held = resizedBox(view, PERFORMANCE);
    for (const level of ["arranger", "bundle", "group", "timeline"] as const) {
      expect(itemHandlesFor("scale", held, level)).toEqual(["bottom-right"]);
      expect(itemHandlesFor("box", held, level)).toEqual(["right", "bottom-right", "bottom"]);
      expect(itemHandlesFor("stretch", held, level)).toEqual(["right", "bottom-right", "bottom"]);
    }
  });
});

/** Place changes written as an object by `placeKeyText`, so that their order plays no part. */
type Places = { readonly [key: string]: PlaceValues };

/** The expected place changes `entries`, each under its place key's text. */
function byPlace(...entries: readonly (readonly [PlaceKey, PlaceValues])[]): Places {
  return Object.fromEntries(entries.map(([key, values]) => [placeKeyText(key), values]));
}

/** `changes` as `byPlace` writes them, each entry checked to sit under its own key's text. */
function placesOf(changes: PlaceChanges): Places {
  for (const [text, { key }] of changes) expect(text).toBe(placeKeyText(key));
  return Object.fromEntries([...changes].map(([text, { values }]) => [text, values]));
}

function changes(
  of: View,
  level: Level,
  resized: PlaceKey,
  mode: ResizeMode,
  handle: Handle,
  dx: number,
  dy: number,
): PlaceChanges {
  const box = resizedBox(of, resized);
  return itemResizeValues(of, A, box, level, mode, handle, { dx, dy }, metrics);
}

/** The places a resize sets, as an object whose keys keep the map's order. */
function values(
  of: View,
  level: Level,
  resized: PlaceKey,
  mode: ResizeMode,
  handle: Handle,
  dx: number,
  dy: number,
): Places {
  return placesOf(changes(of, level, resized, mode, handle, dx, dy));
}

/** The places a resize sets, in order. */
function keys(
  of: View,
  level: Level,
  resized: PlaceKey,
  mode: ResizeMode,
  handle: Handle,
  dx: number,
  dy: number,
): PlaceKey[] {
  return [...changes(of, level, resized, mode, handle, dx, dy).values()].map(({ key }) => key);
}

/** The command of a resize at `level`, made on `of`. */
function resizeOf(
  of: View,
  level: Level,
  resized: PlaceKey,
  mode: ResizeMode,
  handle: Handle,
  dx: number,
  dy: number,
) {
  return itemResizeCommand(
    of,
    A,
    changes(of, level, resized, mode, handle, dx, dy),
    level,
    metrics,
  );
}

/** `of` with block A at scale 2. */
function doubled(of: View): View {
  return changed(of, { type: "set", changes: [{ target: { block: A }, values: { scale: 2 } }] });
}

/** The place changes of one place's values. */
function one(key: PlaceKey, place: PlaceValues): PlaceChanges {
  return placeChanges([[key, place]]);
}

describe("itemResizeValues, scale", () => {
  it.each([
    [view, "bottom-right", 40, 20, { scale: 1.2783203125 }],
    [view, "top-left", -40, -20, { scale: 1.2783203125, x: -148.55078125, y: 371.7744140625 }],
    [view, "bottom-right", -1000, -1000, { scale: 0.125 }],
    [doubled(view), "bottom-right", 80, 40, { scale: 1.2783203125 }],
    [
      placed(view, A, "annotations", { scale: 2 }),
      "bottom-right",
      -562.484619140625,
      -71.85546875,
      { scale: null },
    ],
  ] as const)("annotations, case %#", (of, handle, dx, dy, expected) => {
    expect(values(of, "arranger", ANNOTATIONS, "scale", handle, dx, dy)).toStrictEqual(
      byPlace([ANNOTATIONS, expected]),
    );
  });

  it("scales a member's group from the frame's top left to the card's bottom right corner", () => {
    expect(values(view, "arranger", PERFORMANCE, "scale", "bottom-right", 40, 20)).toStrictEqual(
      byPlace([FRAME_1, { scale: 1.1240234375 }]),
    );
  });

  it("scales only from the corners a box offers", () => {
    expect(() => values(view, "arranger", ANNOTATIONS, "scale", "right", 10, 0)).toThrow(
      RangeError,
    );
    expect(() => values(view, "arranger", PERFORMANCE, "scale", "top-left", 10, 0)).toThrow(
      RangeError,
    );
  });
});

describe("itemResizeValues, box", () => {
  const wide = placed(view, A, "group_2", { width: 580 });

  it.each([
    ["right", 20, 0, { width: 600 }],
    ["right", -20, 0, { width: null }],
    ["left", -21, 0, { width: 601, x: -13 }],
    ["left", 100, 0, { width: null, x: 25.515625 }],
    ["bottom", 0, 10.5, { height: 188.234375 }],
    ["top", 0, -16, { height: 193.734375, y: 190.0390625 }],
  ] as const)("group_2 %s by (%d, %d)", (handle, dx, dy, expected) => {
    expect(values(wide, "bundle", FRAME_2, "box", handle, dx, dy)).toStrictEqual(
      byPlace([FRAME_2, expected]),
    );
  });

  it("converts the pointer's travel by the block's scale", () => {
    expect(values(doubled(wide), "bundle", FRAME_2, "box", "right", 20, 0)).toStrictEqual(
      byPlace([FRAME_2, { width: 590 }]),
    );
  });

  it("keeps the opposite edge on the canvas when the box grows left", () => {
    const after = changed(wide, resizeOf(wide, "bundle", FRAME_2, "box", "left", -21, 0));
    const [node] = project(after, NOTHING_SELECTED, [], metrics, null);
    expect(node?.data.drawing.origin).toEqual({ x: 21, y: 0 });
    expect(node?.position.x).toBe(19);
    const place = placeOf(after, FRAME_2);
    expect((node?.position.x ?? 0) + 21 + place.x + place.width).toBe(628);
    expect(placeOf(after, FRAME_1)).toMatchObject(DRAWN.group_1);
    expect(placeOf(after, ANNOTATIONS)).toMatchObject(DRAWN.annotations);
  });

  it("sizes a member's own card, in item coordinates under its group's scale", () => {
    const scaled = placed(view, A, "group_1", { scale: 1.25 });
    expect(values(scaled, "arranger", PERFORMANCE, "box", "bottom-right", 50, 30)).toStrictEqual(
      byPlace([PERFORMANCE, { width: 586.48486328125, height: 73.4765625 }]),
    );
    expect(values(scaled, "arranger", PERFORMANCE, "box", "right", -50, 0)).toStrictEqual(
      byPlace([PERFORMANCE, { width: null }]),
    );
    expect(() => values(scaled, "arranger", PERFORMANCE, "box", "left", -10, 0)).toThrow(
      RangeError,
    );
  });
});

/** Twice the content of every item of `bundle_mixed` at length 400, `2 W(400)`. */
const TWICE_ITEM = 1124.96923828125;
/** Twice the content of every member's card of `bundle_mixed` at length 400, `2 Wc(400)`. */
const TWICE_CARD = 1092.96923828125;
/** Twice the height of `annotations`'s card at its default spacing, `2 Ha(4)`. */
const TWICE_ANNOTATIONS = 143.7109375;
/** Twice the height of `performance`'s card, `2 Hp`. */
const TWICE_PERFORMANCE = 98.953125;
/** Twice the height of `score`'s card at its default spacing, `2 Hs(4)`. */
const TWICE_SCORE = 157.90625;
/** Twice `group_1`'s frame height at the default spacings, `2 H(8)`. */
const TWICE_FRAME = 338.46875;

describe("itemResizeValues, stretch", () => {
  const wide = placed(view, A, "annotations", { width: TWICE_ITEM });
  const tall = placed(view, A, "annotations", { height: TWICE_ANNOTATIONS });

  it.each([
    [view, "right", 20, 0, { length: 420 }],
    [view, "left", -21, 0, { length: 421, x: -13 }],
    [view, "right", -500, 0, { length: 8 }],
    [view, "bottom", 0, 20, { spacing: 24 }],
    [view, "top", 0, -20, { spacing: 24, y: 371.7734375 }],
    [view, "bottom-right", 20, 20, { length: 420, spacing: 24 }],
    [view, "bottom", 0, -2, { spacing: 2 }],
    [view, "bottom", 0, -40, { spacing: 0 }],
    [wide, "right", 40, 0, { length: 420, width: 1164.96923828125 }],
    [wide, "left", -42, 0, { length: 421, width: 1166.96923828125, x: -34 }],
    [tall, "bottom", 0, 40, { spacing: 24, height: 183.7109375 }],
  ] as const)("annotations, case %#", (of, handle, dx, dy, expected) => {
    expect(values(of, "bundle", ANNOTATIONS, "stretch", handle, dx, dy)).toStrictEqual(
      byPlace([ANNOTATIONS, expected]),
    );
  });

  it("widens the gap between a frame's cards, every card keeping its size", () => {
    expect(values(view, "bundle", FRAME_1, "stretch", "bottom", 0, 44)).toStrictEqual(
      byPlace([FRAME_1, { spacing: 52 }]),
    );
    expect(values(view, "bundle", FRAME_1, "stretch", "top", 0, -44)).toStrictEqual(
      byPlace([FRAME_1, { spacing: 52, y: -15.1953125 }]),
    );
    const tallCard = placed(view, A, "performance", { height: TWICE_PERFORMANCE });
    expect(values(tallCard, "bundle", FRAME_1, "stretch", "bottom", 0, 60)).toStrictEqual(
      byPlace([FRAME_1, { spacing: 68 }]),
    );
    expect(keys(tallCard, "bundle", FRAME_1, "stretch", "bottom", 0, 60)).toEqual([FRAME_1]);
  });

  const framed = placed(view, A, "group_1", { width: TWICE_ITEM });
  const wideCard = placed(view, A, "performance", { width: TWICE_CARD });
  const tallScore = placed(view, A, "score", { height: TWICE_SCORE });
  const tallFrame = placed(view, A, "group_1", { height: TWICE_FRAME });

  it.each([
    [view, SCORE, "right", 20, 0, byPlace([FRAME_1, { length: 420 }])],
    [view, SCORE, "bottom", 0, 16, byPlace([SCORE, { spacing: 12 }])],
    [
      view,
      SCORE,
      "bottom-right",
      20,
      16,
      byPlace([FRAME_1, { length: 420 }], [SCORE, { spacing: 12 }]),
    ],
    [tallScore, SCORE, "bottom", 0, 32, byPlace([SCORE, { spacing: 12, height: 189.90625 }])],
    [
      tallFrame,
      SCORE,
      "bottom",
      0,
      16,
      byPlace([SCORE, { spacing: 12 }], [FRAME_1, { height: 370.46875 }]),
    ],
    [framed, SCORE, "right", 30, 0, byPlace([FRAME_1, { length: 415, width: 1154.96923828125 }])],
    [
      wideCard,
      SCORE,
      "right",
      30,
      0,
      byPlace([FRAME_1, { length: 430 }], [PERFORMANCE, { width: 1152.96923828125 }]),
    ],
    [
      wideCard,
      PERFORMANCE,
      "right",
      60,
      0,
      byPlace([FRAME_1, { length: 430 }], [PERFORMANCE, { width: 1152.96923828125 }]),
    ],
  ] as const)(
    "stretches a member's group along time and its own card vertically, case %#",
    (of, resized, handle, dx, dy, expected) => {
      for (const level of ["arranger", "bundle", "timeline"] as const) {
        expect(values(of, level, resized, "stretch", handle, dx, dy)).toStrictEqual(expected);
        const command = resizeOf(of, level, resized, "stretch", handle, dx, dy);
        const store = storeOf(of);
        const timeline = inBlock(A, idAddress(resized.member ?? resized.item));
        const editor = { arranger: null, bundle: { block: A }, timeline }[level];
        if (editor !== null) expect(store.open(editor)).toBeNull();
        expect(store.dispatch(command)).toBeNull();
      }
    },
  );

  it("states no spacing for a card without gaps, which draws alike at every spacing", () => {
    expect(values(view, "arranger", PERFORMANCE, "stretch", "bottom", 0, 16)).toStrictEqual({});
    expect(resizeOf(view, "arranger", PERFORMANCE, "stretch", "bottom", 0, 16)).toBeNull();
    expect(values(view, "arranger", PERFORMANCE, "stretch", "bottom-right", 20, 16)).toStrictEqual(
      byPlace([FRAME_1, { length: 420 }]),
    );
  });

  it("stretches the margin of a member's card whose contents are one row, the frame's request following", () => {
    const performance = { id: "performance" };
    const bare = changed(view, {
      type: "set",
      changes: [
        {
          target: WORKSPACE,
          values: {
            graphical: {
              statements: [
                {
                  select: {
                    addresses: [
                      { ...performance, facet: "markers" },
                      { ...performance, facet: "conversion_maps" },
                    ],
                  },
                  set: { display: "none" },
                },
              ],
            },
          },
        },
      ],
    });
    expect(resizedBox(bare, PERFORMANCE)).toMatchObject({
      height: 28.8046875,
      contentCount: 1,
      card: { margin: 0, spacing: 4 },
    });
    for (const level of ["arranger", "bundle", "timeline"] as const) {
      expect(values(bare, level, PERFORMANCE, "stretch", "bottom", 0, 16)).toStrictEqual(
        byPlace([PERFORMANCE, { margin: 8 }]),
      );
    }
    expect(values(bare, "arranger", PERFORMANCE, "stretch", "bottom", 0, -40)).toStrictEqual({});
    expect(resizeOf(bare, "arranger", PERFORMANCE, "stretch", "bottom", 0, -40)).toBeNull();
    const tall = placed(bare, A, "group_1", { height: 297.125 });
    expect(values(tall, "arranger", PERFORMANCE, "stretch", "bottom", 0, 16)).toStrictEqual(
      byPlace([PERFORMANCE, { margin: 8 }], [FRAME_1, { height: 329.125 }]),
    );
    const after = changed(
      bare,
      resizeOf(bare, "arranger", PERFORMANCE, "stretch", "bottom", 0, 16),
    );
    expect(blockIn(after, A).places.group_1?.cards?.performance).toEqual({ margin: 8 });
  });

  it("refuses a member card's left handle", () => {
    expect(() => values(view, "timeline", SCORE, "stretch", "left", -20, 0)).toThrow(RangeError);
  });

  it("writes a member's stretch as its changes in order, then the other items' positions", () => {
    expect(resizeOf(wideCard, "arranger", SCORE, "stretch", "right", 30, 0)?.changes).toEqual([
      { target: at("group_1"), values: { place: { length: 430 } } },
      { target: at("group_1"), values: { cards: { performance: { width: 1152.96923828125 } } } },
      { target: at("group_2"), values: { place: DRAWN.group_2 } },
      { target: at("annotations"), values: { place: DRAWN.annotations } },
    ]);
  });

  it("applies a member's stretch in its timeline editor, its group's length alone", () => {
    const store = storeOf(view);
    expect(store.open(at("score"))).toBeNull();
    expect(store.dispatch(resizeOf(view, "timeline", SCORE, "stretch", "right", 20, 0))).toBeNull();
    expect(blockIn(store.view, A).places).toStrictEqual({ group_1: { length: 420 } });
  });
});

describe("the shortening lock", () => {
  const SHARED_EXPOSITION: PlaceKey = { item: "group_1", member: "exposition" };
  const SHARED_TAKE: PlaceKey = { item: "group_1", member: "take_1" };
  const shared = viewOf({ id: A, fixture: "bundles/bundle_shared_parent", x: 40, y: 80 });
  /** `of` after the resize, its command applied on the arranger. */
  const after = (
    of: View,
    resized: PlaceKey,
    mode: ResizeMode,
    dx: number,
  ): { view: View; values: Places } => ({
    view: changed(of, resizeOf(of, "arranger", resized, mode, "right", dx, 0)),
    values: values(of, "arranger", resized, mode, "right", dx, 0),
  });
  /** The drawn width of the member's card under `key`, in item coordinates. */
  const cardWidth = (of: View, key: PlaceKey) =>
    keyedBox(drawingOf(blockIn(of, A), of.settings, metrics), key)?.card?.size.width;

  it("keeps a member card's margin in proportion and shortens the group again", () => {
    const boxed = after(shared, SHARED_EXPOSITION, "box", 551.39013671875);
    expect(boxed.values).toStrictEqual(byPlace([SHARED_EXPOSITION, { width: 1102.7802734375 }]));
    expect(placeOf(boxed.view, FRAME_1).width).toBe(1118.7802734375);
    expect(cardWidth(boxed.view, SHARED_TAKE)).toBe(551.39013671875);

    const longer = after(boxed.view, SHARED_EXPOSITION, "stretch", 100);
    expect(longer.values).toStrictEqual(
      byPlace([FRAME_1, { length: 450 }], [SHARED_EXPOSITION, { width: 1202.7802734375 }]),
    );
    expect(cardWidth(longer.view, SHARED_TAKE)).toBe(601.39013671875);
    expect(cardWidth(longer.view, SHARED_EXPOSITION)).toBe(1202.7802734375);
    expect(placeOf(longer.view, FRAME_1).width).toBe(1218.7802734375);

    const shorter = after(longer.view, FRAME_1, "stretch", -200);
    expect(shorter.values).toStrictEqual(
      byPlace([FRAME_1, { length: 350 }], [SHARED_EXPOSITION, { width: 1002.7802734375 }]),
    );

    const shortest = after(shorter.view, SHARED_EXPOSITION, "stretch", -50);
    expect(shortest.values).toStrictEqual(
      byPlace([FRAME_1, { length: 325 }], [SHARED_EXPOSITION, { width: 952.7802734375 }]),
    );
  });

  it("measures a card's own content, not the width its frame lends it", () => {
    const framed = placed(shared, A, "group_1", { width: 1134.7802734375 });
    const both = placed(framed, A, "exposition", { width: 1654.17041015625 });
    expect(after(both, SHARED_EXPOSITION, "stretch", 90).values).toStrictEqual(
      byPlace(
        [FRAME_1, { length: 430, width: null }],
        [SHARED_EXPOSITION, { width: 1744.17041015625 }],
      ),
    );
  });
});

describe("itemResizeValues, the group editor's stretch", () => {
  const framed = placed(view, A, "group_1", { width: 600 });
  const wideCard = placed(view, A, "performance", { width: TWICE_CARD });
  const PINNED = 562.48486328125;

  it.each([
    [view, 20, { length: 420, width: null }],
    [view, -100, { length: 300, width: PINNED }],
    [framed, 30, { length: 430, width: 600 }],
    [framed, 200, { length: 600, width: null }],
  ] as const)("group_1, case %#", (of, dx, expected) => {
    expect(values(of, "group", FRAME_1, "stretch", "right", dx, 0)).toStrictEqual(
      byPlace([FRAME_1, expected]),
    );
    expect(values(of, "group", SCORE, "stretch", "right", dx, 0)).toStrictEqual(
      byPlace([FRAME_1, expected]),
    );
  });

  it("lets the frame adapt vertically", () => {
    expect(values(view, "group", FRAME_1, "stretch", "bottom", 0, 44)).toStrictEqual(
      byPlace([FRAME_1, { spacing: 52 }]),
    );
    expect(values(view, "group", FRAME_1, "stretch", "bottom-right", 20, 44)).toStrictEqual(
      byPlace([FRAME_1, { length: 420, width: null, spacing: 52 }]),
    );
  });

  it.each([
    [
      20,
      byPlace([FRAME_1, { length: 410, width: null }], [PERFORMANCE, { width: 1112.96923828125 }]),
    ],
    [
      -100,
      byPlace(
        [FRAME_1, { length: 350, width: 1108.96923828125 }],
        [PERFORMANCE, { width: 992.96923828125 }],
      ),
    ],
  ] as const)("keeps a card's stated width in proportion, case %#", (dx, expected) => {
    expect(values(wideCard, "group", FRAME_1, "stretch", "right", dx, 0)).toStrictEqual(expected);
    expect(values(wideCard, "group", SCORE, "stretch", "right", dx, 0)).toStrictEqual(expected);
  });

  it("grows the frame with the content, its right edge the last lattice step before the pointer", () => {
    for (const [of, dx] of [
      [view, 20],
      [framed, 200],
      [wideCard, 20],
    ] as const) {
      const stretch = new Stretch(of, A, resizedBox(of, FRAME_1), "group", "length", metrics);
      const target = stretch.content(stretch.start) + dx;
      const stretched = values(of, "group", FRAME_1, "stretch", "right", dx, 0);
      const length = stretched[placeKeyText(FRAME_1)]?.length;
      if (typeof length !== "number") throw new Error("no length is stated");
      expect(stretch.content(length)).toBeLessThanOrEqual(target);
      expect(stretch.content(length + GRID_FREE)).toBeGreaterThan(target);
      const resized = changes(of, "group", FRAME_1, "stretch", "right", dx, 0);
      const next = changed(of, itemResizeCommand(of, A, resized, "group", metrics));
      expect(
        itemOf(drawingOf(blockIn(next, A), next.settings, metrics), FRAME_1).item.place.width,
      ).toBe(stretch.content(length));
    }
  });

  it("stretches the recapitulation of bundle_shared_parent larger and smaller, by its frame and its members", () => {
    const shared = viewOf({ id: A, fixture: "bundles/bundle_shared_parent", x: 40, y: 80 });
    const members: PlaceKey[] = [
      FRAME_2,
      { item: "group_2", member: "recapitulation" },
      { item: "group_2", member: "take_2" },
    ];
    for (const resized of members) {
      expect(values(shared, "group", resized, "stretch", "right", 50, 0)).toStrictEqual(
        byPlace([FRAME_2, { length: 450, width: null }]),
      );
      expect(values(shared, "group", resized, "stretch", "right", -50, 0)).toStrictEqual(
        byPlace([FRAME_2, { length: 350, width: 567.39013671875 }]),
      );
    }
  });

  it("leaves the frame's left edge alone", () => {
    expect(() => values(view, "group", FRAME_1, "stretch", "left", -10, 0)).toThrow(RangeError);
  });
});

describe("Stretch, its changes", () => {
  const PINNED = 562.48486328125;
  const framed = placed(view, A, "group_1", { width: 600 });
  const wideCard = placed(view, A, "performance", { width: TWICE_CARD });
  const wideAnnotations = placed(view, A, "annotations", { width: TWICE_ITEM });
  const tallScore = placed(view, A, "score", { height: TWICE_SCORE });
  const tallFrame = placed(view, A, "group_1", { height: TWICE_FRAME });
  const stretchedTo = (
    of: View,
    level: Level,
    resized: PlaceKey,
    factor: "length" | "spacing",
    value: number,
  ): Places =>
    placesOf(new Stretch(of, A, resizedBox(of, resized), level, factor, metrics).changes(value));

  it.each([
    [view, "arranger", 300, byPlace([FRAME_1, { length: 300 }])],
    [
      wideCard,
      "arranger",
      430,
      byPlace([FRAME_1, { length: 430 }], [PERFORMANCE, { width: 1152.96923828125 }]),
    ],
    [view, "group", 500, byPlace([FRAME_1, { length: 500, width: null }])],
    [view, "group", 300, byPlace([FRAME_1, { length: 300, width: PINNED }])],
    [framed, "group", 430, byPlace([FRAME_1, { length: 430, width: 600 }])],
    [framed, "group", 500, byPlace([FRAME_1, { length: 500, width: null }])],
    [
      wideCard,
      "group",
      350,
      byPlace(
        [FRAME_1, { length: 350, width: 1108.96923828125 }],
        [PERFORMANCE, { width: 992.96923828125 }],
      ),
    ],
    [
      wideCard,
      "group",
      500,
      byPlace([FRAME_1, { length: 500, width: null }], [PERFORMANCE, { width: 1292.96923828125 }]),
    ],
  ] as const)(
    "a group's length from its frame or a member's card, case %#",
    (of, level, length, expected) => {
      expect(stretchedTo(of, level, FRAME_1, "length", length)).toStrictEqual(expected);
      expect(stretchedTo(of, level, SCORE, "length", length)).toStrictEqual(expected);
    },
  );

  it("an ungrouped card's length", () => {
    expect(stretchedTo(wideAnnotations, "bundle", ANNOTATIONS, "length", 420)).toStrictEqual(
      byPlace([ANNOTATIONS, { length: 420, width: 1164.96923828125 }]),
    );
  });

  it("a frame's spacing and a member card's, the heights in scope following", () => {
    expect(stretchedTo(tallScore, "bundle", FRAME_1, "spacing", 16)).toStrictEqual(
      byPlace([FRAME_1, { spacing: 16 }]),
    );
    expect(stretchedTo(tallFrame, "bundle", FRAME_1, "spacing", 16)).toStrictEqual(
      byPlace([FRAME_1, { spacing: 16, height: 354.46875 }]),
    );
    expect(stretchedTo(tallScore, "bundle", SCORE, "spacing", 12)).toStrictEqual(
      byPlace([SCORE, { spacing: 12, height: 189.90625 }]),
    );
    const card = new Stretch(
      tallFrame,
      A,
      resizedBox(tallFrame, SCORE),
      "arranger",
      "spacing",
      metrics,
    ).changes(12);
    expect([...card.values()]).toStrictEqual([
      { key: SCORE, values: { spacing: 12 } },
      { key: FRAME_1, values: { height: 370.46875 } },
    ]);
  });

  it("starts from the spacing drawn: stated, else the container's default", () => {
    const start = (of: View, resized: PlaceKey) =>
      new Stretch(of, A, resizedBox(of, resized), "arranger", "spacing", metrics).start;
    expect([start(view, FRAME_1), start(view, SCORE), start(view, ANNOTATIONS)]).toEqual([8, 4, 4]);
    const stated = placed(placed(view, A, "group_1", { spacing: 0 }), A, "score", { spacing: 2 });
    expect([start(stated, FRAME_1), start(stated, SCORE)]).toEqual([0, 2]);
  });
});

describe("itemResizeCommand", () => {
  it("states the other items' positions on the arranger and in the bundle editor only", () => {
    const grown = { width: 601, x: -13 };
    const others = [
      { target: at("group_1"), values: { place: DRAWN.group_1 } },
      { target: at("annotations"), values: { place: DRAWN.annotations } },
    ];
    for (const level of ["bundle", "arranger"] as const) {
      expect(itemResizeCommand(view, A, one(FRAME_2, grown), level, metrics)?.changes).toEqual([
        { target: at("group_2"), values: { place: grown } },
        ...others,
      ]);
    }
    const members = { length: 400, width: 562.48486328125 };
    expect(itemResizeCommand(view, A, one(FRAME_1, members), "group", metrics)?.changes).toEqual([
      { target: at("group_1"), values: { place: members } },
    ]);
    const card = { length: 420 };
    expect(
      itemResizeCommand(view, A, one(ANNOTATIONS, card), "timeline", metrics)?.changes,
    ).toEqual([{ target: at("annotations"), values: { place: card } }]);
  });

  it("sizes a member's card through its group, stating every other item's position but its frame's", () => {
    const size = { width: 586.48486328125, height: 73.4765625 };
    const command = itemResizeCommand(view, A, one(PERFORMANCE, size), "arranger", metrics);
    expect(command?.changes).toEqual([
      { target: at("group_1"), values: { cards: { performance: size } } },
      { target: at("group_2"), values: { place: DRAWN.group_2 } },
      { target: at("annotations"), values: { place: DRAWN.annotations } },
    ]);
    const places = blockIn(changed(view, command), A).places;
    expect(placeAt(places, PERFORMANCE)).toStrictEqual(size);
    expect(placeAt(places, FRAME_1)).toBeUndefined();
    expect(places.group_1).toStrictEqual({ cards: { performance: size } });
  });

  it("gives null when every value is stated already", () => {
    expect(itemResizeCommand(view, A, one(FRAME_2, { width: null }), "bundle", metrics)).toBe(null);
    expect(
      itemResizeCommand(view, A, one(ANNOTATIONS, { scale: null }), "arranger", metrics),
    ).toBeNull();
  });
});

describe("placeEdit", () => {
  const edit = (
    selected: readonly Address[],
    property: Parameters<typeof placeEdit>[2],
    value: Parameters<typeof placeEdit>[3],
    editing: Editing | null = null,
    of: View = view,
  ) => placeEdit(of, selectionOf(selected), property, value, editing, metrics);
  const BUNDLE_EDITOR: Editing = { target: { block: A }, kind: "bundle" };
  const GROUP_EDITOR: Editing = { target: at("group_1"), kind: "group" };
  const BLOCK: Address = { block: A };
  /** A command's changes; a refusal or `null` as it is. */
  const changesOf = (result: ReturnType<typeof placeEdit>) =>
    result !== null && "changes" in result ? result.changes : result;
  const others = [
    { target: at("group_2"), values: { place: DRAWN.group_2 } },
    { target: at("annotations"), values: { place: DRAWN.annotations } },
  ];

  it("sets a block's own member, null when it stores that value", () => {
    expect(edit([BLOCK], "scale", 2)).toEqual({
      type: "set",
      changes: [{ target: BLOCK, values: { scale: 2 } }],
    });
    expect(edit([BLOCK], "scale", 1)).toBeNull();
    expect(edit([BLOCK], "width", null)).toBeNull();
  });

  it("sets an item's place, stating the other items' positions where items lie freely", () => {
    expect(changesOf(edit([at("group_2")], "width", 601, BUNDLE_EDITOR))).toEqual([
      { target: at("group_2"), values: { place: { width: 601 } } },
      { target: at("group_1"), values: { place: DRAWN.group_1 } },
      { target: at("annotations"), values: { place: DRAWN.annotations } },
    ]);
    expect(edit([at("group_2")], "width", null, BUNDLE_EDITOR)).toBeNull();
  });

  it("sets a held card's size through its group, named by its card or by its line", () => {
    const width = 586.48486328125;
    const expected = [
      { target: at("group_1"), values: { cards: { performance: { width } } } },
      ...others,
    ];
    expect(changesOf(edit([cardAt("performance")], "width", width))).toEqual(expected);
    expect(changesOf(edit([at("performance")], "width", width))).toEqual(expected);
    const name = inBlock(A, { id: "performance", part: ["name"] });
    expect(changesOf(edit([name], "width", width))).toEqual(expected);
  });

  it("sets a held card's scale and length on its group, once for two cards of the group", () => {
    expect(edit([cardAt("score"), cardAt("performance")], "scale", 2, GROUP_EDITOR)).toEqual({
      type: "set",
      changes: [{ target: at("group_1"), values: { place: { scale: 2 } } }],
    });
  });

  it("writes a length or spacing as a Stretch to it writes", () => {
    expect(changesOf(edit([at("group_1")], "length", 300))).toEqual([
      { target: at("group_1"), values: { place: { length: 300 } } },
      ...others,
    ]);
    expect(changesOf(edit([cardAt("score")], "length", 500, GROUP_EDITOR))).toEqual([
      { target: at("group_1"), values: { place: { length: 500, width: null } } },
    ]);
  });

  it("steps from each element's shown value", () => {
    expect(
      changesOf(edit([at("group_1")], "spacing", (current) => (current ?? 0) + 1, BUNDLE_EDITOR)),
    ).toEqual([{ target: at("group_1"), values: { place: { spacing: 9 } } }, ...others]);
  });

  it("sets the card of a member of two groups in the frame of its editor, and none without", () => {
    const shared = viewOf({ id: A, fixture: "bundles/bundle_shared_member" });
    const t: Address = cardAt("t");
    const second: Editing = { target: at("g2"), kind: "group" };
    expect(edit([t], "width", 600, second, shared)).toEqual({
      type: "set",
      changes: [{ target: at("g2"), values: { cards: { t: { width: 600 } } } }],
    });
    expect(edit([t], "width", 600, null, shared)).toEqual(
      expect.objectContaining({ code: "wrong_target_kind", path: [addressKey(t), "width"] }),
    );
  });

  it("refuses a selection with no geometry, mixed kinds, a held card's position, a bad value", () => {
    // A refusal's path starts with the address's key (`addressKey`).
    const refusal = (code: string, address: Address | null, property: string) =>
      expect.objectContaining({
        code,
        path: address === null ? [property] : [addressKey(address), property],
      });
    const title = inBlock(A, { part: ["name"] });
    expect(edit([], "width", 1)).toEqual(refusal("unknown_target", null, "width"));
    expect(edit([title], "width", 1)).toEqual(refusal("wrong_target_kind", title, "width"));
    expect(edit([BLOCK, at("group_1")], "width", 1)).toEqual(
      refusal("wrong_target_kind", BLOCK, "width"),
    );
    expect(edit([cardAt("performance")], "x", 1)).toEqual(
      refusal("unknown_property", cardAt("performance"), "x"),
    );
    expect(edit([at("group_1")], "scale", null)).toEqual(
      refusal("invalid_value", at("group_1"), "scale"),
    );
    expect(edit([BLOCK], "length", Number.NaN)).toEqual(refusal("invalid_value", BLOCK, "length"));
    const two = changed(view, {
      type: "add",
      into: WORKSPACE,
      block: { id: "0000000005", manifest: blockIn(view, A).manifest, x: 0, y: 0 },
    });
    const other = inBlock("0000000005", idAddress("group_1"));
    expect(edit([at("group_1"), other], "width", 600, null, two)).toEqual(
      refusal("wrong_target_kind", at("group_1"), "width"),
    );
  });
});
