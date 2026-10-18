import type { View } from "@timetoalign/tilie-core";
import { createStore } from "@timetoalign/tilie-core";
import type { DrawnItem } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import type { Handle, Level, PlaceValues, ResizedItem, ResizeMode } from "../src/index.ts";
import {
  drawingOf,
  itemHandlesFor,
  itemMoveCommand,
  itemResizeCommand,
  itemResizeValues,
  placesAfter,
  placesWith,
  project,
  resizedItemOf,
  stretchChanges,
} from "../src/index.ts";
import { A, blockIn, changed, metrics, mixedPlain, placed, viewOf } from "./support.ts";

const view = mixedPlain();
const at = (key: string) => `${A}/${key}`;
const DRAWN = {
  group_1: { x: 8, y: 28.8046875 },
  group_2: { x: 8, y: 176.3671875 },
  annotations: { x: 8, y: 358.50390625 },
};

function items(of: View): readonly DrawnItem[] {
  return drawingOf(blockIn(of, A), of.settings, metrics).items;
}

function placeOf(of: View, key: string): DrawnItem["place"] {
  const found = items(of).find((item) => item.key === key);
  if (found === undefined) throw new Error(`no item ${key}`);
  return found.place;
}

describe("itemMoveCommand", () => {
  it("moves the item and states the drawn position of every other item", () => {
    const command = itemMoveCommand(view, A, "group_2", 40, 200, metrics);
    expect(command).toEqual({
      type: "set",
      changes: [
        { target: at("group_2"), values: { place: { x: 40, y: 200 } } },
        { target: at("group_1"), values: { place: DRAWN.group_1 } },
        { target: at("annotations"), values: { place: DRAWN.annotations } },
      ],
    });
    const after = changed(view, command);
    expect(placeOf(after, "group_2")).toMatchObject({ x: 40, y: 200 });
    expect(placeOf(after, "group_1")).toMatchObject(DRAWN.group_1);
    expect(placeOf(after, "annotations")).toMatchObject(DRAWN.annotations);
  });

  it("states only the member another item leaves unstated", () => {
    const moved = placed(view, A, "group_1", { x: 12 });
    expect(itemMoveCommand(moved, A, "group_2", 40, 200, metrics)?.changes[1]).toEqual({
      target: at("group_1"),
      values: { place: { y: 28.8046875 } },
    });
  });

  it("quantizes, gives null where the item is drawn, and refuses a key that is no item", () => {
    expect(itemMoveCommand(view, A, "group_2", 40.0001, 200, metrics)).toEqual(
      itemMoveCommand(view, A, "group_2", 40, 200, metrics),
    );
    expect(itemMoveCommand(view, A, "group_2", 8, 176.3671875, metrics)).toBeNull();
    expect(() => itemMoveCommand(view, A, "score", 0, 0, metrics)).toThrow(RangeError);
  });
});

describe("placesWith and placesAfter", () => {
  it("merges values into a place as core does", () => {
    const places = { group_1: { x: 12, length: 300 } };
    expect(placesWith(places, "group_1", { length: null })).toStrictEqual({ group_1: { x: 12 } });
    expect(placesWith(places, "group_1", { x: null, length: null })).toStrictEqual({});
    expect(placesWith({}, "group_2", { y: 5 })).toStrictEqual({ group_2: { y: 5 } });
  });

  it("previews a command exactly as applying it draws", () => {
    const command = itemMoveCommand(view, A, "group_2", 40, 200, metrics);
    if (command === null) throw new Error("no command");
    const block = blockIn(view, A);
    const preview = drawingOf(block, view.settings, metrics, {
      places: placesAfter(block, command),
    });
    const after = changed(view, command);
    expect(preview).toEqual(drawingOf(blockIn(after, A), after.settings, metrics));
  });
});

describe("resizedItemOf", () => {
  const drawing = drawingOf(blockIn(view, A), view.settings, metrics);

  it("names the box at an address: a frame, an ungrouped card, a member's card", () => {
    expect(resizedItemOf(drawing, "group_1")).toStrictEqual(FRAME_1);
    expect(resizedItemOf(drawing, "annotations/card")).toStrictEqual(ANNOTATIONS);
    expect(resizedItemOf(drawing, "performance/card")).toStrictEqual(PERFORMANCE);
    expect(resizedItemOf(drawing, "excerpt/card")).toStrictEqual({
      kind: "member",
      key: "excerpt",
      item: "group_2",
    });
    expect(resizedItemOf(drawing, "score")).toBeUndefined();
    expect(resizedItemOf(drawing, "group_1/name")).toBeUndefined();
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
    for (const kind of ["frame", "card"] as const) {
      for (const level of ["arranger", "bundle", "group", "timeline"] as const) {
        expect(itemHandlesFor("scale", kind, level)).toEqual(CORNERS);
        expect(itemHandlesFor("box", kind, level)).toEqual(EIGHT);
        expect(itemHandlesFor("stretch", kind, level)).toEqual(
          level === "group" ? ["top", "top-right", "right", "bottom-right", "bottom"] : EIGHT,
        );
      }
    }
  });

  it("never moves a member card's top left corner", () => {
    for (const level of ["arranger", "bundle", "group", "timeline"] as const) {
      expect(itemHandlesFor("scale", "member", level)).toEqual(["bottom-right"]);
      expect(itemHandlesFor("box", "member", level)).toEqual(["right", "bottom-right", "bottom"]);
      expect(itemHandlesFor("stretch", "member", level)).toEqual([
        "right",
        "bottom-right",
        "bottom",
      ]);
    }
  });
});

const FRAME_1: ResizedItem = { kind: "frame", key: "group_1", item: "group_1" };
const FRAME_2: ResizedItem = { kind: "frame", key: "group_2", item: "group_2" };
const ANNOTATIONS: ResizedItem = { kind: "card", key: "annotations", item: "annotations" };
const PERFORMANCE: ResizedItem = { kind: "member", key: "performance", item: "group_1" };
const SCORE: ResizedItem = { kind: "member", key: "score", item: "group_1" };

type Places = { readonly [key: string]: PlaceValues };

function changes(
  of: View,
  level: Level,
  resized: ResizedItem,
  mode: ResizeMode,
  handle: Handle,
  dx: number,
  dy: number,
): ReadonlyMap<string, PlaceValues> {
  return itemResizeValues(blockIn(of, A), of.settings, metrics, level, resized, mode, handle, {
    dx,
    dy,
  });
}

/** The places a resize sets, as an object whose keys keep the map's order. */
function values(
  of: View,
  level: Level,
  resized: ResizedItem,
  mode: ResizeMode,
  handle: Handle,
  dx: number,
  dy: number,
): Places {
  return Object.fromEntries(changes(of, level, resized, mode, handle, dx, dy));
}

/** The keys a resize sets, in order. */
function keys(
  of: View,
  level: Level,
  resized: ResizedItem,
  mode: ResizeMode,
  handle: Handle,
  dx: number,
  dy: number,
): string[] {
  return [...changes(of, level, resized, mode, handle, dx, dy).keys()];
}

/** The command of a resize at `level`, made on `of`. */
function resizeOf(
  of: View,
  level: Level,
  resized: ResizedItem,
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
  return changed(of, { type: "set", changes: [{ target: A, values: { scale: 2 } }] });
}

/** A map of one key's values. */
function one(key: string, place: PlaceValues): ReadonlyMap<string, PlaceValues> {
  return new Map([[key, place]]);
}

describe("itemResizeValues, scale", () => {
  it.each([
    [view, "bottom-right", 40, 20, { scale: 1.4052734375 }],
    [view, "top-left", -40, -20, { scale: 1.4052734375, x: -219.9599609375, y: 338.4921875 }],
    [view, "bottom-right", -1000, -1000, { scale: 0.125 }],
    [doubled(view), "bottom-right", 80, 40, { scale: 1.4052734375 }],
    [
      placed(view, A, "annotations", { scale: 2 }),
      "bottom-right",
      -562.484619140625,
      -49.37890625,
      { scale: null },
    ],
  ] as const)("annotations, case %#", (of, handle, dx, dy, expected) => {
    expect(values(of, "arranger", ANNOTATIONS, "scale", handle, dx, dy)).toStrictEqual({
      annotations: expected,
    });
  });

  it("scales a member's group from the frame's top left to the card's bottom right corner", () => {
    expect(values(view, "arranger", PERFORMANCE, "scale", "bottom-right", 40, 20)).toStrictEqual({
      group_1: { scale: 1.15185546875 },
    });
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
    ["bottom", 0, 10.5, { height: 184.63671875 }],
    ["top", 0, -16, { height: 190.13671875, y: 160.3671875 }],
  ] as const)("group_2 %s by (%d, %d)", (handle, dx, dy, expected) => {
    expect(values(wide, "bundle", FRAME_2, "box", handle, dx, dy)).toStrictEqual({
      group_2: expected,
    });
  });

  it("converts the pointer's travel by the block's scale", () => {
    expect(values(doubled(wide), "bundle", FRAME_2, "box", "right", 20, 0)).toStrictEqual({
      group_2: { width: 590 },
    });
  });

  it("keeps the opposite edge on the canvas when the box grows left", () => {
    const after = changed(wide, resizeOf(wide, "bundle", FRAME_2, "box", "left", -21, 0));
    const [node] = project(after, new Set(), [], metrics, null);
    expect(node?.data.drawing.origin).toEqual({ x: 21, y: 0 });
    expect(node?.position.x).toBe(19);
    const place = placeOf(after, "group_2");
    expect((node?.position.x ?? 0) + 21 + place.x + place.width).toBe(628);
    expect(placeOf(after, "group_1")).toMatchObject(DRAWN.group_1);
    expect(placeOf(after, "annotations")).toMatchObject(DRAWN.annotations);
  });

  it("sizes a member's own card, in item coordinates under its group's scale", () => {
    const scaled = placed(view, A, "group_1", { scale: 1.25 });
    expect(values(scaled, "arranger", PERFORMANCE, "box", "bottom-right", 50, 30)).toStrictEqual({
      performance: { width: 586.48486328125, height: 73.37890625 },
    });
    expect(values(scaled, "arranger", PERFORMANCE, "box", "right", -50, 0)).toStrictEqual({
      performance: { width: null },
    });
    expect(() => values(scaled, "arranger", PERFORMANCE, "box", "left", -10, 0)).toThrow(
      RangeError,
    );
  });
});

/** Twice the content of every item of `bundle_mixed` at length 400, `2 W(400)`. */
const TWICE_ITEM = 1124.96923828125;
/** Twice the content of every member's card of `bundle_mixed` at length 400, `2 Wc(400)`. */
const TWICE_CARD = 1092.96923828125;
/** Twice the height of every root card of `bundle_mixed` at spacing 1, `2 Hm(1)`. */
const TWICE_HEIGHT = 98.7578125;
/** Twice `group_1`'s frame height, `2 H(1)`. */
const TWICE_FRAME = 279.125;

describe("itemResizeValues, stretch", () => {
  const wide = placed(view, A, "annotations", { width: TWICE_ITEM });
  const tall = placed(view, A, "annotations", { height: TWICE_HEIGHT });

  it.each([
    [view, "right", 20, 0, { length: 420 }],
    [view, "left", -21, 0, { length: 421, x: -13 }],
    [view, "right", -500, 0, { length: 8 }],
    [view, "bottom", 0, 16, { spacing: 2 }],
    [view, "top", 0, -16, { spacing: 2, y: 342.50390625 }],
    [view, "bottom-right", 20, 16, { length: 420, spacing: 2 }],
    [view, "bottom", 0, -8, { spacing: 0.5 }],
    [view, "bottom", 0, -40, { spacing: 0.25 }],
    [wide, "right", 40, 0, { length: 420, width: 1164.96923828125 }],
    [wide, "left", -42, 0, { length: 421, width: 1166.96923828125, x: -34 }],
    [tall, "bottom", 0, 32, { spacing: 2, height: 130.7578125 }],
  ] as const)("annotations, case %#", (of, handle, dx, dy, expected) => {
    expect(values(of, "bundle", ANNOTATIONS, "stretch", handle, dx, dy)).toStrictEqual({
      annotations: expected,
    });
  });

  it("stretches a frame's members' cards vertically with it", () => {
    expect(values(view, "bundle", FRAME_1, "stretch", "bottom", 0, 32)).toStrictEqual({
      group_1: { spacing: 2 },
    });
    expect(values(view, "bundle", FRAME_1, "stretch", "top", 0, -32)).toStrictEqual({
      group_1: { spacing: 2, y: -3.1953125 },
    });
    const tallCard = placed(view, A, "performance", { height: TWICE_HEIGHT });
    expect(values(tallCard, "bundle", FRAME_1, "stretch", "bottom", 0, 48)).toStrictEqual({
      group_1: { spacing: 2 },
      performance: { height: 130.7578125 },
    });
    expect(keys(tallCard, "bundle", FRAME_1, "stretch", "bottom", 0, 48)).toEqual([
      "group_1",
      "performance",
    ]);
  });

  const framed = placed(view, A, "group_1", { width: TWICE_ITEM });
  const wideCard = placed(view, A, "performance", { width: TWICE_CARD });
  const tallCard = placed(view, A, "performance", { height: TWICE_HEIGHT });
  const tallFrame = placed(view, A, "group_1", { height: TWICE_FRAME });

  it.each([
    [view, SCORE, "right", 20, 0, { group_1: { length: 420 } }],
    [view, PERFORMANCE, "bottom", 0, 16, { performance: { spacing: 2 } }],
    [
      view,
      PERFORMANCE,
      "bottom-right",
      20,
      16,
      { group_1: { length: 420 }, performance: { spacing: 2 } },
    ],
    [tallCard, PERFORMANCE, "bottom", 0, 32, { performance: { spacing: 2, height: 130.7578125 } }],
    [
      tallFrame,
      PERFORMANCE,
      "bottom",
      0,
      16,
      { performance: { spacing: 2 }, group_1: { height: 311.125 } },
    ],
    [framed, SCORE, "right", 30, 0, { group_1: { length: 415, width: 1154.96923828125 } }],
    [
      wideCard,
      SCORE,
      "right",
      30,
      0,
      { group_1: { length: 430 }, performance: { width: 1152.96923828125 } },
    ],
    [
      wideCard,
      PERFORMANCE,
      "right",
      60,
      0,
      { group_1: { length: 430 }, performance: { width: 1152.96923828125 } },
    ],
  ] as const)(
    "stretches a member's group along time and its own card vertically, case %#",
    (of, resized, handle, dx, dy, expected) => {
      for (const level of ["arranger", "bundle", "timeline"] as const) {
        expect(values(of, level, resized, "stretch", handle, dx, dy)).toStrictEqual(expected);
        const command = resizeOf(of, level, resized, "stretch", handle, dx, dy);
        const store = createStore({ view: of, journal: [], sessions: {} });
        const editor = { arranger: null, bundle: A, timeline: `${A}/${resized.key}` }[level];
        if (editor !== null) expect(store.open(editor)).toBeNull();
        expect(store.dispatch(command)).toBeNull();
      }
    },
  );

  it("refuses a member card's left handle", () => {
    expect(() => values(view, "timeline", SCORE, "stretch", "left", -20, 0)).toThrow(RangeError);
  });

  it("writes a member's stretch as its changes in order, then the other items' positions", () => {
    expect(resizeOf(wideCard, "arranger", SCORE, "stretch", "right", 30, 0)?.changes).toEqual([
      { target: at("group_1"), values: { place: { length: 430 } } },
      { target: at("performance"), values: { place: { width: 1152.96923828125 } } },
      { target: at("group_2"), values: { place: DRAWN.group_2 } },
      { target: at("annotations"), values: { place: DRAWN.annotations } },
    ]);
  });

  it("applies a member's stretch in its timeline editor, its group's length alone", () => {
    const store = createStore({ view, journal: [], sessions: {} });
    expect(store.open(`${A}/score`)).toBeNull();
    expect(store.dispatch(resizeOf(view, "timeline", SCORE, "stretch", "right", 20, 0))).toBeNull();
    expect(blockIn(store.view, A).places).toStrictEqual({ group_1: { length: 420 } });
  });
});

describe("the shortening lock", () => {
  const SHARED_EXPOSITION: ResizedItem = { kind: "member", key: "exposition", item: "group_1" };
  const SHARED_FRAME: ResizedItem = { kind: "frame", key: "group_1", item: "group_1" };
  const shared = viewOf({ id: A, fixture: "bundles/bundle_shared_parent", x: 40, y: 80 });
  /** `of` after the resize, its command applied on the arranger. */
  const after = (
    of: View,
    resized: ResizedItem,
    mode: ResizeMode,
    dx: number,
  ): { view: View; values: Places } => ({
    view: changed(of, resizeOf(of, "arranger", resized, mode, "right", dx, 0)),
    values: values(of, "arranger", resized, mode, "right", dx, 0),
  });
  /** The drawn width of member `key`'s card, in item coordinates. */
  const cardWidth = (of: View, key: string) =>
    drawingOf(blockIn(of, A), of.settings, metrics).cards.find((card) => card.key === key)?.size
      .width;

  it("keeps a member card's margin in proportion and shortens the group again", () => {
    const boxed = after(shared, SHARED_EXPOSITION, "box", 551.39013671875);
    expect(boxed.values).toStrictEqual({ exposition: { width: 1102.7802734375 } });
    expect(placeOf(boxed.view, "group_1").width).toBe(1118.7802734375);
    expect(cardWidth(boxed.view, "take_1")).toBe(551.39013671875);

    const longer = after(boxed.view, SHARED_EXPOSITION, "stretch", 100);
    expect(longer.values).toStrictEqual({
      group_1: { length: 450 },
      exposition: { width: 1202.7802734375 },
    });
    expect(cardWidth(longer.view, "take_1")).toBe(601.39013671875);
    expect(cardWidth(longer.view, "exposition")).toBe(1202.7802734375);
    expect(placeOf(longer.view, "group_1").width).toBe(1218.7802734375);

    const shorter = after(longer.view, SHARED_FRAME, "stretch", -200);
    expect(shorter.values).toStrictEqual({
      group_1: { length: 350 },
      exposition: { width: 1002.7802734375 },
    });

    const shortest = after(shorter.view, SHARED_EXPOSITION, "stretch", -50);
    expect(shortest.values).toStrictEqual({
      group_1: { length: 325 },
      exposition: { width: 952.7802734375 },
    });
  });

  it("measures a card's own content, not the width its frame lends it", () => {
    const framed = placed(shared, A, "group_1", { width: 1134.7802734375 });
    const both = placed(framed, A, "exposition", { width: 1654.17041015625 });
    expect(after(both, SHARED_EXPOSITION, "stretch", 90).values).toStrictEqual({
      group_1: { length: 430, width: null },
      exposition: { width: 1744.17041015625 },
    });
  });
});

describe("itemResizeValues, the group editor's stretch", () => {
  const framed = placed(view, A, "group_1", { width: 600 });
  const wideCard = placed(view, A, "performance", { width: TWICE_CARD });
  const PINNED = 562.48486328125;

  it.each([
    [view, 20, { length: 400, width: PINNED }],
    [view, -100, { length: 300, width: PINNED }],
    [framed, 30, { length: 430, width: 600 }],
    [framed, 200, { length: 437.51513671875, width: 600 }],
  ] as const)("group_1, case %#", (of, dx, expected) => {
    expect(values(of, "group", FRAME_1, "stretch", "right", dx, 0)).toStrictEqual({
      group_1: expected,
    });
    expect(values(of, "group", SCORE, "stretch", "right", dx, 0)).toStrictEqual({
      group_1: expected,
    });
  });

  it("lets the frame adapt vertically", () => {
    expect(values(view, "group", FRAME_1, "stretch", "bottom", 0, 32)).toStrictEqual({
      group_1: { spacing: 2 },
    });
    expect(values(view, "group", FRAME_1, "stretch", "bottom-right", 20, 32)).toStrictEqual({
      group_1: { length: 400, width: PINNED, spacing: 2 },
    });
  });

  it.each([
    [20, { group_1: { length: 400, width: 1108.96923828125 } }],
    [
      -100,
      {
        group_1: { length: 350, width: 1108.96923828125 },
        performance: { width: 992.96923828125 },
      },
    ],
  ] as const)("keeps a card's stated width in proportion, case %#", (dx, expected) => {
    expect(values(wideCard, "group", FRAME_1, "stretch", "right", dx, 0)).toStrictEqual(expected);
    expect(values(wideCard, "group", SCORE, "stretch", "right", dx, 0)).toStrictEqual(expected);
  });

  it("leaves the frame's left edge alone", () => {
    expect(() => values(view, "group", FRAME_1, "stretch", "left", -10, 0)).toThrow(RangeError);
  });
});

describe("stretchChanges", () => {
  const PINNED = 562.48486328125;
  const framed = placed(view, A, "group_1", { width: 600 });
  const wideCard = placed(view, A, "performance", { width: TWICE_CARD });
  const wideAnnotations = placed(view, A, "annotations", { width: TWICE_ITEM });
  const tallCard = placed(view, A, "performance", { height: TWICE_HEIGHT });
  const tallFrame = placed(view, A, "group_1", { height: TWICE_FRAME });
  const stretchedTo = (
    of: View,
    level: Level,
    resized: ResizedItem,
    factor: "length" | "spacing",
    value: number,
  ): Places =>
    Object.fromEntries(
      stretchChanges(blockIn(of, A), of.settings, metrics, level, resized, factor, value),
    );

  it.each([
    [view, "arranger", 300, { group_1: { length: 300 } }],
    [
      wideCard,
      "arranger",
      430,
      { group_1: { length: 430 }, performance: { width: 1152.96923828125 } },
    ],
    [view, "group", 500, { group_1: { length: 400, width: PINNED } }],
    [view, "group", 300, { group_1: { length: 300, width: PINNED } }],
    [framed, "group", 430, { group_1: { length: 430, width: 600 } }],
    [framed, "group", 500, { group_1: { length: 437.51513671875, width: 600 } }],
    [
      wideCard,
      "group",
      350,
      {
        group_1: { length: 350, width: 1108.96923828125 },
        performance: { width: 992.96923828125 },
      },
    ],
    [wideCard, "group", 500, { group_1: { length: 400, width: 1108.96923828125 } }],
  ] as const)(
    "a group's length from its frame or a member's card, case %#",
    (of, level, length, expected) => {
      expect(stretchedTo(of, level, FRAME_1, "length", length)).toStrictEqual(expected);
      expect(stretchedTo(of, level, SCORE, "length", length)).toStrictEqual(expected);
    },
  );

  it("an ungrouped card's length", () => {
    expect(stretchedTo(wideAnnotations, "bundle", ANNOTATIONS, "length", 420)).toStrictEqual({
      annotations: { length: 420, width: 1164.96923828125 },
    });
  });

  it("a frame's spacing and a member card's, the heights in scope following", () => {
    expect(stretchedTo(tallCard, "bundle", FRAME_1, "spacing", 2)).toStrictEqual({
      group_1: { spacing: 2 },
      performance: { height: 130.7578125 },
    });
    const card = stretchChanges(
      blockIn(tallFrame, A),
      tallFrame.settings,
      metrics,
      "arranger",
      PERFORMANCE,
      "spacing",
      2,
    );
    expect([...card]).toStrictEqual([
      ["performance", { spacing: 2 }],
      ["group_1", { height: 311.125 }],
    ]);
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
      expect(itemResizeCommand(view, A, one("group_2", grown), level, metrics)?.changes).toEqual([
        { target: at("group_2"), values: { place: grown } },
        ...others,
      ]);
    }
    const members = { length: 400, width: 562.48486328125 };
    expect(itemResizeCommand(view, A, one("group_1", members), "group", metrics)?.changes).toEqual([
      { target: at("group_1"), values: { place: members } },
    ]);
    const card = { length: 420 };
    expect(
      itemResizeCommand(view, A, one("annotations", card), "timeline", metrics)?.changes,
    ).toEqual([{ target: at("annotations"), values: { place: card } }]);
  });

  it("sizes a member's card on its own key, stating every other item's position but its frame's", () => {
    const size = { width: 586.48486328125, height: 73.37890625 };
    const command = itemResizeCommand(view, A, one("performance", size), "arranger", metrics);
    expect(command?.changes).toEqual([
      { target: at("performance"), values: { place: size } },
      { target: at("group_2"), values: { place: DRAWN.group_2 } },
      { target: at("annotations"), values: { place: DRAWN.annotations } },
    ]);
    const places = blockIn(changed(view, command), A).places;
    expect(places.performance).toStrictEqual(size);
    expect(places.group_1).toBeUndefined();
  });

  it("gives null when every value is stated already", () => {
    expect(itemResizeCommand(view, A, one("group_2", { width: null }), "bundle", metrics)).toBe(
      null,
    );
    expect(
      itemResizeCommand(view, A, one("annotations", { scale: null }), "arranger", metrics),
    ).toBeNull();
  });
});
