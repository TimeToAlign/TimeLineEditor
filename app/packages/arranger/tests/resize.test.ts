import type { Block, View } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { drawingOf } from "../src/drawing.ts";
import { project } from "../src/project.ts";
import type { Handle, ResizeMode } from "../src/resize.ts";
import {
  blockStretchPlaces,
  handlesFor,
  kept,
  resize,
  resizeCommand,
  solve,
} from "../src/resize.ts";
import {
  A,
  blockIn,
  CHILD_MEMBER,
  changed,
  metrics,
  mixedPlain,
  placed as placedItem,
  viewOf,
  withGrid,
} from "./support.ts";

type Row = readonly [string, Handle, number, number, Partial<Block>];

function check(view: View, mode: ResizeMode, handle: Handle, dx: number, dy: number) {
  const block = blockIn(view, A);
  const { values } = resize(block, view.settings, metrics, mode, handle, { dx, dy });
  const command = resizeCommand(block, values);
  // A resize that changes no stored value is no command: the block carries its values already.
  const after = command === null ? block : blockIn(changed(view, command), A);
  for (const [member, value] of Object.entries(values)) {
    expect(after[member as keyof Block]).toBe(value);
  }
  return values;
}

const bare = viewOf({ id: A, fixture: "bare", x: 40, y: 80 });
const nested = viewOf({ id: A, fixture: "nested", x: 40, y: 80 });
/** Three items at their default `y`, two gaps of the box's spacing between them. */
const ungrouped = viewOf({ id: A, fixture: "bundles/bundle_ungrouped", x: 40, y: 80 });
/** The view with block A's placement changed. */
function placed(view: View, values: Partial<Block>): View {
  return changed(view, { type: "set", changes: [{ target: A, values }] });
}

/** corpus_audio_audio with every name hidden, so its wide end label sets the box's left margin. */
const audio = changed(viewOf({ id: A, fixture: "corpus_audio_audio", x: 40, y: 80 }), {
  type: "set",
  changes: [
    {
      target: "workspace",
      values: {
        graphical: { statements: [{ select: { element: "name" }, set: { display: "none" } }] },
      },
    },
  ],
});

const views: { readonly [name: string]: View } = {
  bare,
  "bare, grid off": withGrid(bare, 8, false),
  "bare, scale 2": viewOf({ id: A, fixture: "bare", x: 40, y: 80, scale: 2 }),
  nested,
  ungrouped,
  "ungrouped, score at y 200": placedItem(ungrouped, A, "score", { y: 200 }),
  "ungrouped, height 504.33": placed(ungrouped, { height: 504.328125 }),
  "ungrouped, both requests": placed(ungrouped, { width: 1051.79345703125, height: 504.328125 }),
  "audio, no names": audio,
  "audio, no names, length 8": placed(audio, { length: 8 }),
  "audio, no names, at the knee": placed(audio, { length: 40.08251953125 }),
  "bare, width 953.15": placed(bare, { width: 953.154296875 }),
  "bare, length 500, width 496.58": placed(bare, { length: 500, width: 496.5771484375 }),
  "child member, width 600": placed(viewOf({ id: A, fixture: CHILD_MEMBER, x: 40, y: 80 }), {
    width: 600,
  }),
};

describe("handlesFor", () => {
  it("offers the corners to scale and all eight otherwise", () => {
    expect(handlesFor("scale")).toEqual(["top-left", "top-right", "bottom-right", "bottom-left"]);
    const all = [
      "top-left",
      "top",
      "top-right",
      "right",
      "bottom-right",
      "bottom",
      "bottom-left",
      "left",
    ];
    expect(handlesFor("box")).toEqual(all);
    expect(handlesFor("stretch")).toEqual(all);
  });
});

describe("resize: box", () => {
  it.each<Row>([
    ["bare", "right", 20, 0, { width: 496.5771484375 }],
    ["bare", "right", -20, 0, { width: null }],
    ["bare", "left", -21, 0, { width: 497.5771484375, x: 19 }],
    ["bare", "left", 100, 0, { width: null, x: 40 }],
    ["bare", "bottom", 0, 10.5, { height: 77.87890625 }],
    ["bare", "top", 0, -16, { height: 83.37890625, y: 64 }],
    ["bare", "bottom-right", 20, 10.5, { width: 496.5771484375, height: 77.87890625 }],
    ["bare, grid off", "left", -21, 0, { width: 497.5771484375, x: 19 }],
  ])("%s %s by (%d, %d)", (name, handle, dx, dy, expected) => {
    expect(check(views[name] as View, "box", handle, dx, dy)).toStrictEqual(expected);
  });
});

describe("resize: scale", () => {
  it.each<Row>([
    ["bare", "bottom-right", 238.28857421875, 0, { scale: 1.5 }],
    ["bare", "top-left", -238.28857421875, 0, { scale: 1.5, x: -198.28857421875, y: 46.310546875 }],
    ["bare", "bottom-right", -440, -60, { scale: 0.125 }],
  ])("%s %s by (%d, %d)", (name, handle, dx, dy, expected) => {
    expect(check(views[name] as View, "scale", handle, dx, dy)).toStrictEqual(expected);
  });

  it("refuses an edge handle", () => {
    const block = blockIn(bare, A);
    expect(() => resize(block, bare.settings, metrics, "scale", "right", { dx: 1, dy: 0 })).toThrow(
      RangeError,
    );
  });
});

describe("resize: stretch", () => {
  it.each<Row>([
    ["bare", "right", 20, 0, { length: 420 }],
    ["bare, scale 2", "right", 20, 0, { length: 410 }],
    ["bare", "left", -21, 0, { length: 421, x: 19 }],
    ["bare", "right", -500, 0, { length: 8 }],
    ["bare", "bottom", 0, 30, { spacing: 8 }],
    ["nested", "top", 0, -51, { spacing: 8, y: 80 }],
    ["nested", "bottom-right", 400, 51, { length: 800, spacing: 8 }],
    ["ungrouped", "bottom", 0, 32, { spacing: 24 }],
    ["ungrouped", "bottom", 0, 5, { spacing: 10.5 }],
    ["ungrouped", "top", 0, -32, { spacing: 24, y: 48 }],
    ["ungrouped", "bottom", 0, -16, { spacing: 0 }],
    ["ungrouped", "bottom", 0, -40, { spacing: 0 }],
    ["ungrouped", "bottom-right", 40, 32, { length: 440, spacing: 24 }],
    ["ungrouped, score at y 200", "bottom", 0, 50, { spacing: 192.6953125 }],
    ["audio, no names", "right", -500, 0, { length: 40.08251953125 }],
    ["audio, no names, length 8", "right", 50, 0, { length: 90.08251953125 }],
    ["audio, no names, at the knee", "right", 100, 0, { length: 140.08251953125 }],
    ["bare, width 953.15", "right", 40, 0, { length: 420, width: 993.154296875 }],
    ["bare, width 953.15", "left", -42, 0, { length: 421, width: 995.154296875, x: -2 }],
    ["ungrouped, height 504.33", "bottom", 0, 32, { spacing: 16, height: 536.328125 }],
    ["ungrouped, height 504.33", "top", 0, -32, { spacing: 16, height: 536.328125, y: 48 }],
    [
      "ungrouped, both requests",
      "bottom-right",
      40,
      32,
      { length: 420, spacing: 16, width: 1091.79345703125, height: 536.328125 },
    ],
    ["bare, length 500, width 496.58", "right", 20, 0, { length: 520, width: null }],
    ["child member, width 600", "right", 50, 0, { length: 446.53466796875, width: 650 }],
  ])("%s %s by (%d, %d)", (name, handle, dx, dy, expected) => {
    expect(check(views[name] as View, "stretch", handle, dx, dy)).toStrictEqual(expected);
  });
});

describe("kept", () => {
  it.each([
    [700, 553, 691.25, 875],
    [700, 553, 600, 759.49365234375],
    [700, 553, 553, 700],
    [553, 553, 600, null],
    [500, 553, 600, null],
    [null, 553, 600, null],
  ] as const)("keeps %s over %d in proportion at %d", (request, content, stretched, expected) => {
    expect(kept(request, content, stretched)).toBe(expected);
  });
});

describe("the shortening lock, through the block", () => {
  it("keeps a box request in proportion and shrinks the box again", () => {
    const shared = viewOf({ id: A, fixture: "bundles/bundle_shared_parent", x: 40, y: 80 });
    expect(check(shared, "box", "right", 585.39013671875, 0)).toStrictEqual({
      width: 1170.7802734375,
    });
    const boxed = placed(shared, { width: 1170.7802734375 });
    expect(check(boxed, "stretch", "right", 100, 0)).toStrictEqual({
      length: 450,
      width: 1270.7802734375,
    });
    const longer = placed(boxed, { length: 450, width: 1270.7802734375 });
    expect(check(longer, "stretch", "right", -200, 0)).toStrictEqual({
      length: 350,
      width: 1070.7802734375,
    });
  });
});

describe("resizeCommand", () => {
  it("sets the values on the block", () => {
    expect(resizeCommand(blockIn(bare, A), { width: 500 })).toEqual({
      type: "set",
      changes: [{ target: A, values: { width: 500 } }],
    });
  });

  it("is null when every value is the block's own", () => {
    const block = blockIn(bare, A);
    expect([
      resizeCommand(block, { width: null }),
      resizeCommand(block, { width: null, x: 40 }),
      resizeCommand(block, { length: 400, places: block.places }),
    ]).toEqual([null, null, null]);
  });
});

describe("resizing a block whose place origin lies inside its box", () => {
  it("keeps the node's opposite edge, storing the place origin", () => {
    const wide = placedItem(mixedPlain(), A, "group_2", { width: 600 });
    const view = placedItem(wide, A, "annotations", { x: -30 });
    const [before] = project(view, new Set(), [], metrics, null);
    expect(before?.data.drawing.origin).toEqual({ x: 38, y: 0 });
    expect([before?.position.x, before?.width]).toEqual([2, 654]);
    const block = blockIn(view, A);
    const { values } = resize(block, view.settings, metrics, "box", "left", { dx: -21, dy: 0 });
    expect(values).toStrictEqual({ width: 675, x: 19 });
    const after = changed(view, resizeCommand(block, values));
    const [node] = project(after, new Set(), [], metrics, null);
    expect(node?.position.x).toBe(-19);
    expect((node?.position.x ?? 0) + (node?.width ?? 0)).toBe(656);
  });
});

describe("blockStretchPlaces", () => {
  const places = {
    group_2: { x: 40, y: 200, width: 700 },
    annotations: { x: -30, length: 300 },
  };
  const block = { length: 400, places };

  it("scales the horizontal members by the lengths and keeps every other", () => {
    expect(blockStretchPlaces(block, 500)).toStrictEqual({
      group_2: { x: 50, y: 200, width: 875 },
      annotations: { x: -37.5, length: 375 },
    });
    expect(
      blockStretchPlaces(
        { ...block, places: { annotations: { x: 1, y: 1, height: 90, spacing: 2 } } },
        401,
      ),
    ).toStrictEqual({ annotations: { x: 1.00244140625, y: 1, height: 90, spacing: 2 } });
  });

  it("returns the block's own places when nothing changes", () => {
    expect(blockStretchPlaces(block, 400)).toBe(places);
    const none = {};
    expect(blockStretchPlaces({ ...block, places: none }, 800)).toBe(none);
  });
});

describe("stretching a block with placed items", () => {
  const view = placedItem(mixedPlain(), A, "group_2", { x: 40, y: 200, width: 700 });
  const block = blockIn(view, A);

  it("stretches the places with the content and keeps the margin's edge under the pointer", () => {
    expect(drawingOf(block, view.settings, metrics).width).toBe(748);
    const { values } = resize(block, view.settings, metrics, "stretch", "right", { dx: 74, dy: 0 });
    expect(values).toStrictEqual({
      length: 440,
      places: { group_2: { x: 44, y: 200, width: 770 } },
    });
    const command = resizeCommand(block, values);
    expect(command).toEqual({
      type: "set",
      changes: [
        { target: A, values: { length: 440 } },
        { target: `${A}/group_2`, values: { place: { x: 44, y: 200, width: 770 } } },
      ],
    });
    const after = changed(view, command);
    const drawing = drawingOf(blockIn(after, A), after.settings, metrics);
    expect(blockIn(after, A).x + drawing.width).toBe(862);
    expect(drawing.boxes.find((item) => item.key === "group_2")?.item?.place).toMatchObject({
      x: 44,
      width: 770,
    });
  });
});

describe("solve", () => {
  /** The extent `max(10, 2x)`, recording every value it is evaluated at. */
  function counted() {
    const seen: number[] = [];
    const f = (x: number) => {
      seen.push(x);
      return { extent: Math.max(10, 2 * x) };
    };
    return { seen, f, extent: (result: { extent: number }) => result.extent };
  }

  it("finds the largest lattice value whose extent fits, with its result, each value once", () => {
    const { seen, f, extent } = counted();
    expect(solve(f, extent, 8, 30, 1)).toEqual({ value: 15, result: { extent: 30 } });
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("stops a shrink at the knee of a flat piece, never at the floor", () => {
    const { seen, f, extent } = counted();
    expect(solve(f, extent, 8, 4, 1)).toEqual({ value: 5, result: { extent: 10 } });
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("leaves the start where the extent never grows past the target", () => {
    expect(
      solve(
        () => 5,
        (extent) => extent,
        7.3,
        100,
        1,
      ),
    ).toEqual({ value: 7.3, result: 5 });
  });
});
