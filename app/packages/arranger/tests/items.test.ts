import type { View } from "@timetoalign/tilie-core";
import type { DrawnItem } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import type { Handle, ItemResizeMode, PlaceValues } from "../src/index.ts";
import {
  drawingOf,
  itemHandlesFor,
  itemMoveCommand,
  itemResizeCommand,
  itemResizeValues,
  placesAfter,
  placesWith,
  project,
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

describe("itemHandlesFor", () => {
  it("offers every handle to box and the edges to stretch", () => {
    expect(itemHandlesFor("box", "group")).toHaveLength(8);
    expect(itemHandlesFor("stretch", "bundle")).toEqual(["right", "left"]);
    expect(itemHandlesFor("stretch", "timeline")).toEqual(["right", "left"]);
    expect(itemHandlesFor("stretch", "group")).toEqual(["right"]);
  });
});

function values(
  of: View,
  editor: "bundle" | "group" | "timeline",
  key: string,
  mode: ItemResizeMode,
  handle: Handle,
  dx: number,
  dy: number,
): PlaceValues {
  return itemResizeValues(blockIn(of, A), of.settings, metrics, editor, key, mode, handle, {
    dx,
    dy,
  });
}

describe("itemResizeValues, box", () => {
  const wide = placed(view, A, "group_2", { width: 540 });
  const doubled = changed(wide, { type: "set", changes: [{ target: A, values: { scale: 2 } }] });

  it.each([
    ["right", 20, 0, { width: 560 }],
    ["right", -20, 0, { width: null }],
    ["left", -21, 0, { width: 561, x: -13 }],
    ["left", 100, 0, { width: null, x: 10.2314453125 }],
    ["bottom", 0, 10.5, { height: 184.63671875 }],
    ["top", 0, -16, { height: 190.13671875, y: 160.3671875 }],
  ] as const)("group_2 %s by (%d, %d)", (handle, dx, dy, expected) => {
    expect(values(wide, "bundle", "group_2", "box", handle, dx, dy)).toStrictEqual(expected);
  });

  it("converts the pointer's travel by the block's scale", () => {
    expect(values(doubled, "bundle", "group_2", "box", "right", 20, 0)).toStrictEqual({
      width: 550,
    });
  });

  it("keeps the opposite edge on the canvas when the box grows left", () => {
    const grown = values(wide, "bundle", "group_2", "box", "left", -21, 0);
    const command = itemResizeCommand(wide, A, "group_2", grown, "bundle", metrics);
    const after = changed(wide, command);
    const [node] = project(after, new Set(), [], metrics, null);
    expect(node?.data.drawing.origin).toEqual({ x: 21, y: 0 });
    expect(node?.position.x).toBe(19);
    const place = placeOf(after, "group_2");
    expect((node?.position.x ?? 0) + 21 + place.x + place.width).toBe(588);
    expect(placeOf(after, "group_1")).toMatchObject(DRAWN.group_1);
    expect(placeOf(after, "annotations")).toMatchObject(DRAWN.annotations);
  });
});

describe("itemResizeValues, stretch", () => {
  const wide = placed(view, A, "annotations", { width: 520 });

  it.each([
    [view, "right", 20, { length: 420 }],
    [view, "left", -21, { length: 421, x: -13 }],
    [view, "right", -500, { length: 8 }],
    [wide, "right", 20, { length: 420, width: 540 }],
  ] as const)("annotations, case %#", (of, handle, dx, expected) => {
    expect(values(of, "bundle", "annotations", "stretch", handle, dx, 0)).toStrictEqual(expected);
  });

  it("stretches only from the left or right edge", () => {
    expect(() => values(view, "bundle", "annotations", "stretch", "top", 0, 10)).toThrow(
      RangeError,
    );
  });
});

describe("itemResizeValues, the group editor's stretch", () => {
  const framed = placed(view, A, "group_1", { width: 600 });

  it.each([
    [view, 20, { length: 400, width: 524.0859375 }],
    [view, -100, { length: 300, width: 524.0859375 }],
    [framed, 50, { length: 450, width: 600 }],
    [framed, 200, { length: 475.9140625, width: 600 }],
  ] as const)("group_1, case %#", (of, dx, expected) => {
    expect(values(of, "group", "group_1", "stretch", "right", dx, 0)).toStrictEqual(expected);
  });

  it("leaves the frame's left edge alone", () => {
    expect(() => values(view, "group", "group_1", "stretch", "left", -10, 0)).toThrow(RangeError);
  });
});

describe("itemResizeCommand", () => {
  it("states the other items' positions in the bundle editor only", () => {
    const grown = { width: 561, x: -13 };
    expect(itemResizeCommand(view, A, "group_2", grown, "bundle", metrics)?.changes).toEqual([
      { target: at("group_2"), values: { place: grown } },
      { target: at("group_1"), values: { place: DRAWN.group_1 } },
      { target: at("annotations"), values: { place: DRAWN.annotations } },
    ]);
    const members = { length: 400, width: 524.0859375 };
    expect(itemResizeCommand(view, A, "group_1", members, "group", metrics)?.changes).toEqual([
      { target: at("group_1"), values: { place: members } },
    ]);
    const card = { length: 420 };
    expect(itemResizeCommand(view, A, "annotations", card, "timeline", metrics)?.changes).toEqual([
      { target: at("annotations"), values: { place: card } },
    ]);
  });

  it("gives null when every value is stated already", () => {
    expect(itemResizeCommand(view, A, "group_2", { width: null }, "bundle", metrics)).toBeNull();
  });
});
