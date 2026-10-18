import type { View } from "@timetoalign/tilie-core";
import { createStore } from "@timetoalign/tilie-core";
import type { DrawnItem } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import type { Handle, Level, PlaceValues, ResizedItem, ResizeMode } from "../src/index.ts";
import {
  cappedLength,
  drawingOf,
  itemHandlesFor,
  itemMoveCommand,
  itemResizeCommand,
  itemResizeValues,
  placeKeyOf,
  placesAfter,
  placesWith,
  project,
  resizedItemOf,
} from "../src/index.ts";
import { A, blockIn, changed, metrics, mixedPlain, placed } from "./support.ts";

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

describe("resizedItemOf and placeKeyOf", () => {
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

  it("sets the group's place for a member card's scale and stretch, the card's for its box", () => {
    const keys = (resized: ResizedItem) =>
      (["scale", "box", "stretch"] as const).map((mode) => placeKeyOf(resized, mode));
    expect(keys(PERFORMANCE)).toEqual(["group_1", "performance", "group_1"]);
    expect(keys(FRAME_1)).toEqual(["group_1", "group_1", "group_1"]);
    expect(keys(ANNOTATIONS)).toEqual(["annotations", "annotations", "annotations"]);
  });
});

describe("itemHandlesFor", () => {
  const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];

  it("offers a frame or card a block's handles, its right edge alone to stretch in the group editor", () => {
    for (const kind of ["frame", "card"] as const) {
      for (const level of ["arranger", "bundle", "group", "timeline"] as const) {
        expect(itemHandlesFor("scale", kind, level)).toEqual(CORNERS);
        expect(itemHandlesFor("box", kind, level)).toHaveLength(8);
        expect(itemHandlesFor("stretch", kind, level)).toEqual(
          level === "group" ? ["right"] : ["right", "left"],
        );
      }
    }
  });

  it("never moves a member card's top left corner", () => {
    for (const level of ["arranger", "bundle", "group", "timeline"] as const) {
      expect(itemHandlesFor("scale", "member", level)).toEqual(["bottom-right"]);
      expect(itemHandlesFor("box", "member", level)).toEqual(["right", "bottom-right", "bottom"]);
      expect(itemHandlesFor("stretch", "member", level)).toEqual(["right"]);
    }
  });
});

const FRAME_1: ResizedItem = { kind: "frame", key: "group_1", item: "group_1" };
const FRAME_2: ResizedItem = { kind: "frame", key: "group_2", item: "group_2" };
const ANNOTATIONS: ResizedItem = { kind: "card", key: "annotations", item: "annotations" };
const PERFORMANCE: ResizedItem = { kind: "member", key: "performance", item: "group_1" };
const SCORE: ResizedItem = { kind: "member", key: "score", item: "group_1" };

function values(
  of: View,
  level: Level,
  resized: ResizedItem,
  mode: ResizeMode,
  handle: Handle,
  dx: number,
  dy: number,
): PlaceValues {
  return itemResizeValues(blockIn(of, A), of.settings, metrics, level, resized, mode, handle, {
    dx,
    dy,
  });
}

/** `of` with block A at scale 2. */
function doubled(of: View): View {
  return changed(of, { type: "set", changes: [{ target: A, values: { scale: 2 } }] });
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
    expect(values(of, "arranger", ANNOTATIONS, "scale", handle, dx, dy)).toStrictEqual(expected);
  });

  it("scales a member's group from the frame's top left to the card's bottom right corner", () => {
    expect(values(view, "arranger", PERFORMANCE, "scale", "bottom-right", 40, 20)).toStrictEqual({
      scale: 1.15185546875,
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
    expect(values(wide, "bundle", FRAME_2, "box", handle, dx, dy)).toStrictEqual(expected);
  });

  it("converts the pointer's travel by the block's scale", () => {
    expect(values(doubled(wide), "bundle", FRAME_2, "box", "right", 20, 0)).toStrictEqual({
      width: 590,
    });
  });

  it("keeps the opposite edge on the canvas when the box grows left", () => {
    const grown = values(wide, "bundle", FRAME_2, "box", "left", -21, 0);
    const command = itemResizeCommand(wide, A, "group_2", grown, "bundle", metrics);
    const after = changed(wide, command);
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
      width: 586.48486328125,
      height: 73.37890625,
    });
    expect(values(scaled, "arranger", PERFORMANCE, "box", "right", -50, 0)).toStrictEqual({
      width: null,
    });
    expect(() => values(scaled, "arranger", PERFORMANCE, "box", "left", -10, 0)).toThrow(
      RangeError,
    );
  });
});

describe("itemResizeValues, stretch", () => {
  const wide = placed(view, A, "annotations", { width: 580 });

  it.each([
    [view, "right", 20, { length: 420 }],
    [view, "left", -21, { length: 421, x: -13 }],
    [view, "right", -500, { length: 8 }],
    [wide, "right", 20, { length: 420, width: 600 }],
  ] as const)("annotations, case %#", (of, handle, dx, expected) => {
    expect(values(of, "bundle", ANNOTATIONS, "stretch", handle, dx, 0)).toStrictEqual(expected);
  });

  it("stretches only from the left or right edge", () => {
    expect(() => values(view, "bundle", ANNOTATIONS, "stretch", "top", 0, 10)).toThrow(RangeError);
  });

  it("stretches a member's group from its card's right edge, in its timeline editor too", () => {
    expect(values(view, "timeline", SCORE, "stretch", "right", 20, 0)).toStrictEqual({
      length: 420,
    });
    expect(() => values(view, "timeline", SCORE, "stretch", "left", -20, 0)).toThrow(RangeError);
    const command = itemResizeCommand(view, A, "group_1", { length: 420 }, "timeline", metrics);
    const store = createStore({ view, journal: [], sessions: {} });
    expect(store.open(`${A}/score`)).toBeNull();
    expect(store.dispatch(command)).toBeNull();
    expect(blockIn(store.view, A).places).toStrictEqual({ group_1: { length: 420 } });
  });

  it("writes only a member's group length at every level outside the group editor", () => {
    const framed = placed(view, A, "group_1", { width: 600 });
    const opened = { arranger: null, bundle: A, timeline: `${A}/score` } as const;
    for (const level of ["arranger", "bundle", "timeline"] as const) {
      const stretch = values(framed, level, SCORE, "stretch", "right", 30, 0);
      expect(stretch).toStrictEqual({ length: 430 });
      const command = itemResizeCommand(framed, A, "group_1", stretch, level, metrics);
      const store = createStore({ view: framed, journal: [], sessions: {} });
      const editor = opened[level];
      if (editor !== null) expect(store.open(editor)).toBeNull();
      expect(store.dispatch(command)).toBeNull();
      const kept =
        level === "timeline" ? {} : { group_2: DRAWN.group_2, annotations: DRAWN.annotations };
      expect(blockIn(store.view, A).places).toStrictEqual({
        group_1: { width: 600, length: 430 },
        ...kept,
      });
    }
  });
});

describe("itemResizeValues, the group editor's stretch", () => {
  const framed = placed(view, A, "group_1", { width: 600 });
  const PINNED = 562.48486328125;

  it.each([
    [view, 20, { length: 400, width: PINNED }],
    [view, -100, { length: 300, width: PINNED }],
    [framed, 30, { length: 430, width: 600 }],
    [framed, 200, { length: 437.51513671875, width: 600 }],
  ] as const)("group_1, case %#", (of, dx, expected) => {
    expect(values(of, "group", FRAME_1, "stretch", "right", dx, 0)).toStrictEqual(expected);
    expect(values(of, "group", SCORE, "stretch", "right", dx, 0)).toStrictEqual(expected);
  });

  it("leaves the frame's left edge alone", () => {
    expect(() => values(view, "group", FRAME_1, "stretch", "left", -10, 0)).toThrow(RangeError);
  });

  it.each([
    [view, 500, { length: 400, width: PINNED }],
    [view, 300, { length: 300, width: PINNED }],
    [framed, 430, { length: 430, width: 600 }],
    [framed, 500, { length: 437.51513671875, width: 600 }],
  ] as const)("caps a length through cappedLength, case %#", (of, length, expected) => {
    expect(cappedLength(blockIn(of, A), of.settings, metrics, "group_1", length)).toStrictEqual(
      expected,
    );
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
      expect(itemResizeCommand(view, A, "group_2", grown, level, metrics)?.changes).toEqual([
        { target: at("group_2"), values: { place: grown } },
        ...others,
      ]);
    }
    const members = { length: 400, width: 562.48486328125 };
    expect(itemResizeCommand(view, A, "group_1", members, "group", metrics)?.changes).toEqual([
      { target: at("group_1"), values: { place: members } },
    ]);
    const card = { length: 420 };
    expect(itemResizeCommand(view, A, "annotations", card, "timeline", metrics)?.changes).toEqual([
      { target: at("annotations"), values: { place: card } },
    ]);
  });

  it("sizes a member's card on its own key, stating every other item's position but its frame's", () => {
    const size = { width: 586.48486328125, height: 73.37890625 };
    const command = itemResizeCommand(view, A, "performance", size, "arranger", metrics);
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
    expect(itemResizeCommand(view, A, "group_2", { width: null }, "bundle", metrics)).toBeNull();
    expect(itemResizeCommand(view, A, "annotations", { scale: null }, "arranger", metrics)).toBe(
      null,
    );
  });
});
