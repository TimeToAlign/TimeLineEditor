/**
 * The one box reader: what a press at a point hits in a block's drawing,
 * what it selects, what the pointer highlights, what each descriptor draws,
 * and which boxes hold part of the selection.
 */

import type { View } from "@timetoalign/tilie-core";
import type { Drawing, DrawnElement, LineElement, TextElement } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { affectedBy } from "../src/affected.ts";
import type { Hit } from "../src/boxes.ts";
import {
  boxAt,
  boxOf,
  hitForAddress,
  hitOf,
  holdingOf,
  hoverOf,
  roleOf,
  selectionOf,
} from "../src/boxes.ts";
import { removeCommand } from "../src/commands.ts";
import { descriptorsOf, drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { bandTimelineOf } from "../src/editing.ts";
import { itemMoveCommand } from "../src/items.ts";
import { insideOf } from "../src/project.ts";
import { click, existing } from "../src/selection.ts";
import {
  A,
  B,
  bandsOf,
  blockIn,
  CHILD_MEMBER,
  changed,
  MAP_DRAWN,
  MIXED,
  metrics,
  mixedPlain,
  recordingInGroup1,
  STYLED_DRAWN,
  sourceOf,
  viewOf,
} from "./support.ts";

function drawingIn(view: View): Drawing {
  return drawingOf(blockIn(view, A), view.settings, metrics);
}

/** The view with one workspace statement added. */
function styled(view: View, statement: object): View {
  return changed(view, {
    type: "set",
    changes: [{ target: "workspace", values: { graphical: { statements: [statement] } } }],
  });
}

const HIDDEN_CARDS = { select: { element: "card" }, set: { display: "none" } };
const HIDDEN_FRAMES = { select: { element: "group" }, set: { display: "none" } };

/** Every descriptor that draws a container or a boundary, as its index, address and role. */
function roles(drawing: Drawing): [number, string | null, string][] {
  return descriptorsOf(drawing).flatMap((descriptor, index) => {
    const role = roleOf(descriptor);
    return role === "element" ? [] : [[index, descriptor.source.address, role]];
  });
}

/** A hit as its kind, address, boundary flag and the address of the box on top. */
const summary = ({ kind, address, boundary, within }: Hit) => ({
  kind,
  address,
  boundary,
  within: within?.address ?? null,
});

describe("boxes in a manifest of one root", () => {
  const view = viewOf({ id: A, fixture: "segment_line" });
  const drawing = drawingIn(view);
  const hit = (address: string | null, type?: DrawnElement["type"]) =>
    summary(hitOf(A, drawing, sourceOf(drawing, address, type)));
  const plain = (kind: Hit["kind"], address: string, boundary = false) => ({
    kind,
    address,
    boundary,
    within: null,
  });

  it("classifies a hit by the drawing's containers and element types", () => {
    expect(hit("form/card")).toEqual(plain("card", `${A}/form/card`));
    expect(hit("form", "timeline")).toEqual(plain("element", `${A}/form`));
    expect(hit("b/start", "boundary")).toEqual(plain("element", `${A}/b/start`, true));
    expect(hit("b2/start", "boundary")).toEqual(plain("element", `${A}/b2/start`, true));
    // A line end's wedge carries a boundary's `S/start` form, but it is no boundary line.
    expect(hit("form/start", "wedge")).toEqual(plain("element", `${A}/form/start`));
    expect(hit(null)).toEqual(plain("box", A));
    expect(summary(hitOf(A, drawing, null))).toEqual(plain("box", A));
    expect(hitOf(A, drawing, null).box).toBe(drawing.boxes[0]);
    expect(hitOf(A, drawing, sourceOf(drawing, "form/card")).box).toBe(boxOf(drawing, "form/card"));
  });

  it.each([
    ["the root's line", 52.294921875, 68.953125],
    ["the middle of a nested segment's boundary", 227.294921875, 36.4765625],
    ["the card's top left corner", 8, 8],
    ["the card's bottom right corner", 469.573974609375, 103.9296875],
  ])("finds form/card under %s", (_, x, y) => {
    expect(hitOf(A, drawing, null, { x, y }).within?.address).toBe("form/card");
    expect(boxAt(drawing, { x, y })).toBe(boxOf(drawing, "form/card"));
  });

  it.each([
    ["the box's padding", 4, 4],
    ["just right of the card", 470, 50],
    ["the shadow's rim", 471, 105],
  ])("finds no box under %s", (_, x, y) => {
    expect(hitOf(A, drawing, null, { x, y }).within).toBeNull();
  });

  it("finds no box without a point", () => {
    expect(hitOf(A, drawing, sourceOf(drawing, "form/card")).within).toBeNull();
  });

  it("tells the box, the card, its shadow and the boundaries by their descriptors' sources", () => {
    expect(roles(drawing)).toEqual([
      [0, null, "box"],
      [1, "form/card", "shadow"],
      [2, "form/card", "card"],
      [15, "b/start", "boundary"],
      [16, "b2/start", "boundary"],
      [17, "c/start", "boundary"],
    ]);
  });

  it("draws the one rect of a card without a shadow as the card", () => {
    const flat = drawingIn(styled(view, { select: { element: "card" }, set: { shadow: "none" } }));
    expect(roles(flat)).toEqual([
      [0, null, "box"],
      [1, "form/card", "card"],
      [14, "b/start", "boundary"],
      [15, "b2/start", "boundary"],
      [16, "c/start", "boundary"],
    ]);
  });

  it("highlights the card and the boundary under the pointer", () => {
    const point = { x: 227.294921875, y: 36.4765625 };
    const at = hitOf(A, drawing, sourceOf(drawing, "b2/start", "boundary"), point);
    expect(hoverOf(at)).toEqual({ box: "form/card", boundary: "b2/start", band: null });
  });
});

describe("boxes in a manifest with one group", () => {
  const view = viewOf({ id: A, fixture: CHILD_MEMBER });
  const drawing = drawingIn(view);
  const hit = (address: string | null, type?: DrawnElement["type"]) =>
    hitOf(A, drawing, sourceOf(drawing, address, type));

  it("tells a frame from a line of the same address form", () => {
    expect(summary(hit("group_1"))).toMatchObject({ kind: "frame", address: `${A}/group_1` });
    expect(summary(hit("recording", "timeline"))).toMatchObject({
      kind: "element",
      address: `${A}/recording`,
    });
    expect(summary(hit("recording/card"))).toMatchObject({
      kind: "card",
      address: `${A}/recording/card`,
    });
    expect(summary(hit("group_1/name"))).toMatchObject({
      kind: "element",
      address: `${A}/group_1/name`,
    });
  });

  it.each([
    ["the frame above the first card", 12, 12, "group_1"],
    ["the gap between the cards", 100, 120, "group_1"],
    ["the start of the ancestor line", 108.61962890625, 67.78125, "second-half/card"],
    ["the start of recording's line", 120.61962890625, 139.16015625, "recording/card"],
    ["the box's padding", 4, 4, null],
    ["the right of the frame", 552, 100, null],
  ])("finds under %s the box %s", (_, x, y, expected) => {
    expect(hitOf(A, drawing, null, { x, y }).within?.address ?? null).toBe(expected);
  });

  it("tells the frame, each card and each shadow", () => {
    expect(roles(drawing)).toEqual([
      [0, null, "box"],
      [1, "group_1", "frame"],
      [3, "second-half/card", "shadow"],
      [4, "second-half/card", "card"],
      [22, "recording/card", "shadow"],
      [23, "recording/card", "card"],
    ]);
  });

  it("finds the frame where a hidden card would be", () => {
    const hidden = drawingIn(styled(view, HIDDEN_CARDS));
    const point = { x: 120.61962890625, y: 139.16015625 };
    expect(hitOf(A, hidden, null, point).within?.address).toBe("group_1");
    expect(roles(hidden)).toEqual([
      [0, null, "box"],
      [1, "group_1", "frame"],
    ]);
  });

  it("selects what a press hit", () => {
    const inside = insideOf(blockIn(view, A).manifest, drawing, null);
    const pressed = (address: string | null, type?: DrawnElement["type"]) =>
      selectionOf(hit(address, type), null, inside);
    expect(pressed("recording/card")).toBe(`${A}/recording/card`);
    expect(pressed("group_1")).toBe(`${A}/group_1`);
    expect(pressed(null)).toBe(A);
    expect(pressed("recording", "timeline")).toBe(`${A}/recording`);
    expect(pressed("recording/start", "wedge")).toBe(`${A}/recording/start`);
    expect(pressed("group_1/name")).toBe(`${A}/group_1/name`);
  });

  it("highlights the innermost box under the pointer, never the block", () => {
    const hover = (address: string | null, x: number, y: number) =>
      hoverOf(hitOf(A, drawing, address === null ? null : sourceOf(drawing, address), { x, y }));
    expect(hover("recording", 120.61962890625, 139.16015625)).toEqual({
      box: "recording/card",
      boundary: null,
      band: null,
    });
    expect(hover("group_1", 12, 12)).toEqual({ box: "group_1", boundary: null, band: null });
    expect(hover(null, 4, 4)).toEqual({ box: null, boundary: null, band: null });
  });

  it("gives Enter the hit of a selected address from the drawing alone", () => {
    expect(hitForAddress(A, drawing, A)).toEqual({
      block: A,
      kind: "box",
      address: A,
      box: drawing.boxes[0],
      boundary: false,
      within: null,
    });
    expect(hitForAddress(A, drawing, `${A}/group_1`)?.box).toBe(boxOf(drawing, "group_1"));
    expect(hitForAddress(A, drawing, `${A}/recording/card`)?.kind).toBe("card");
    expect(hitForAddress(A, drawing, `${A}/recording`)).toEqual({
      block: A,
      kind: "element",
      address: `${A}/recording`,
      box: null,
      boundary: false,
      within: null,
    });
    expect(hitForAddress(A, drawing, `${A}/nobody`)).toBeNull();
    expect(hitForAddress(A, drawing, `${B}/recording`)).toBeNull();
    const hidden = drawingIn(styled(view, HIDDEN_CARDS));
    expect(hitForAddress(A, hidden, `${A}/recording/card`)).toBeNull();
  });

  it("lets every other reader fold a selected card into its timeline", () => {
    const card = hit("recording/card");
    const inside = insideOf(blockIn(view, A).manifest, drawing, null);
    const selection = click(new Set(), selectionOf(card, null, inside) ?? "", false);
    expect(selection).toEqual(new Set([`${A}/recording/card`]));
    expect(existing(view, selection, null)).toBe(selection);
    expect(removeCommand(view, selection, null)).toEqual({
      type: "remove",
      targets: [`${A}/recording`],
    });
    expect(affectedBy(blockIn(view, A).manifest, new Set(["recording/card"]), null)).toEqual(
      new Set([
        "recording",
        "recording/name",
        "recording/start",
        "recording/start/label",
        "recording/end",
        "recording/end/label",
      ]),
    );
  });
});

describe("the boxes holding part of the selection", () => {
  /** `bundle_mixed` with the child `dlt_1` below the member `excerpt`, and a region on `excerpt`. */
  const mixed = [
    {
      type: "add",
      into: `${A}/excerpt`,
      child: { id: "dlt_1", offset: 0, unit: "samples", length: 100 },
    },
    {
      type: "add",
      into: `${A}/excerpt`,
      region: { id: "region_1", name: "A", start: 0, end: 10 },
    },
  ].reduce(changed, viewOf({ id: A, fixture: "bundles/bundle_mixed" }));

  const holding = (selected: readonly string[], view: View = mixed) =>
    holdingOf(drawingIn(view), new Set(selected));
  const held = (...boxes: string[]) => ({ block: true, boxes: new Set(boxes) });

  it.each([
    ["a member's line", ["score"], ["group_1", "score/card"]],
    ["a member's start", ["score/start"], ["group_1", "score/card"]],
    ["a child's line", ["dlt_1"], ["group_2", "excerpt/card"]],
    ["a region's label", ["recording/region_1/label"], ["group_2", "excerpt/card"]],
    ["a member that is a child", ["excerpt"], ["group_2", "excerpt/card"]],
    ["the ancestor line on a member's card", ["recording"], ["group_2", "excerpt/card"]],
    ["a member's card", ["page/card"], ["group_2"]],
    ["the group itself", ["group_1"], []],
    ["the group's title", ["group_1/name"], ["group_1"]],
    ["the manifest's title", ["name"], []],
    ["a root outside every frame", ["annotations"], ["annotations/card"]],
    ["the card of a root outside every frame", ["annotations/card"], []],
    [
      "a member of each group",
      ["score", "page"],
      ["group_1", "score/card", "group_2", "page/card"],
    ],
    ["a selected frame and a member in it", ["group_1", "score"], ["group_1", "score/card"]],
  ])("with %s (%j) selected, holds it in exactly its boxes and the block", (_, selected, boxes) => {
    expect(holding(selected)).toEqual(held(...boxes));
  });

  it("holds nothing without a selection, nor an address that is not drawn", () => {
    expect(holding([])).toEqual({ block: false, boxes: new Set() });
    expect(holding(["nobody"])).toEqual({ block: false, boxes: new Set() });
  });

  it.each([
    ["a root's line", ["recording"], ["recording/card"]],
    ["a boundary on a root's line", ["page_2/start"], ["pages/card"]],
  ])(
    "without groups, with %s (%j) selected, holds it in exactly its card",
    (_, selected, boxes) => {
      expect(holding(selected, viewOf({ id: A, fixture: "bundles/bundle_ungrouped" }))).toEqual(
        held(...boxes),
      );
    },
  );

  it.each([
    ["cards", "score", HIDDEN_CARDS, ["group_1"]],
    ["frames", "score", HIDDEN_FRAMES, ["score/card"]],
    ["frames", "group_1/name", HIDDEN_FRAMES, []],
  ])("with the %s hidden, %s is held only by displayed boxes", (_, selected, statement, boxes) => {
    expect(holding([selected], styled(mixed, statement))).toEqual(held(...boxes));
  });

  describe("with an item over another", () => {
    // The README's view `over`: `annotations`' card moved to (8, 60), over `group_1`'s frame.
    const plain = mixedPlain();
    const over = changed(plain, itemMoveCommand(plain, A, "annotations", 8, 60, metrics));
    const drawing = drawingIn(over);
    const rect = (address: string) => {
      const box = boxOf(drawing, address);
      if (box === undefined) throw new Error(`no box ${address}`);
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const element = (type: DrawnElement["type"], address: string) =>
      drawing.elements[sourceOf(drawing, address, type).element];

    it("draws each card's member drawing inside the other card", () => {
      const width = 562.484619140625;
      expect(rect("annotations/card")).toEqual({ x: 8, y: 60, width, height: 71.85546875 });
      expect(rect("group_1")).toEqual({ x: 8, y: 28.8046875, width, height: 169.234375 });
      expect(rect("score/card")).toEqual({
        x: 16,
        y: 53.609375,
        width: 546.484619140625,
        height: 78.953125,
      });
      const line = element("timeline", "score") as LineElement;
      expect([line.xs, line.xe]).toEqual([126.29150390625, 526.29150390625]);
      const name = element("name", "annotations/name") as TextElement;
      expect(name.x).toBe(24);
    });

    it("gives the card drawn on top as the box under a point both cards hold", () => {
      const line = element("timeline", "score") as LineElement;
      const point = { x: (line.xs + line.xe) / 2, y: line.y };
      expect(hitOf(A, drawing, null, point).within?.address).toBe("annotations/card");
    });

    it.each([
      ["the name of the card on top", ["annotations/name"], ["annotations/card"]],
      ["the line of the card underneath", ["score"], ["group_1", "score/card"]],
      ["the card on top", ["annotations/card"], []],
    ])("with %s (%j) selected, holds it only in the boxes it is drawn in", (_, selected, boxes) => {
      expect(holding(selected, over)).toEqual(held(...boxes));
    });
  });

  describe("with an element drawn twice and hidden once", () => {
    // `recording` made a member of `group_1`: its card draws its child `excerpt` with its map.
    const twice = recordingInGroup1(viewOf({ id: A, fixture: MIXED }));
    const hidden = styled(twice, {
      select: { element: "map", inside: "child" },
      set: { display: "none" },
    });

    it.each([
      ["drawn on both cards", twice, ["group_1", "recording/card", "group_2", "excerpt/card"]],
      ["hidden on the card of `recording`", hidden, ["group_2", "excerpt/card"]],
    ])("holds it in the boxes of each copy drawn, %s", (_, view, boxes) => {
      expect(holding(["recording/cmap_2"], view)).toEqual(held(...boxes));
    });
  });
});

describe("selection and hover inside an editor", () => {
  const view = mixedPlain();
  const block = blockIn(view, A);
  const drawing = drawingOf(block, view.settings, metrics);
  const group = insideOf(block.manifest, drawing, "group_1");
  const every = insideOf(block.manifest, drawing, null);
  const hit = (kind: Hit["kind"], element: string | null): Hit => ({
    block: A,
    kind,
    address: element === null ? A : `${A}/${element}`,
    box: kind === "element" ? null : (boxOf(drawing, element) ?? null),
    boundary: false,
    within: null,
  });

  it("selects only what lies inside the edited element", () => {
    const editing: Editing = { target: `${A}/group_1`, kind: "group" };
    expect(selectionOf(hit("card", "score/card"), editing, group)).toBe(`${A}/score/card`);
    expect(selectionOf(hit("frame", "group_1"), editing, group)).toBe(`${A}/group_1`);
    expect(selectionOf(hit("element", "score"), editing, group)).toBe(`${A}/score`);
    expect(selectionOf(hit("card", "page/card"), editing, group)).toBeNull();
    expect(selectionOf(hit("element", "annotations"), editing, group)).toBeNull();
    expect(selectionOf(hit("element", "name"), editing, group)).toBeNull();
    expect(selectionOf(hit("box", null), editing, group)).toBeNull();
  });

  it("selects the block's own box on the arranger and in its own bundle editor only", () => {
    expect(selectionOf(hit("box", null), null, every)).toBe(A);
    expect(selectionOf(hit("box", null), { target: A, kind: "bundle" }, every)).toBe(A);
    expect(selectionOf(hit("box", null), { target: B, kind: "bundle" }, new Set())).toBeNull();
  });
});

describe("the bands of the edited timeline", () => {
  const scoreEditor: Editing = { target: `${A}/score`, kind: "timeline" };
  const card = (drawing: Drawing = STYLED_DRAWN) => sourceOf(drawing, "score/card");
  const at = (
    source: ReturnType<typeof card> | null,
    x: number,
    y: number,
    editing?: Editing | null,
  ) => hitOf(A, STYLED_DRAWN, source, { x, y }, editing);
  const band = (address: string) => {
    const record = bandsOf(STYLED_DRAWN).find((drawn) => drawn.address === address);
    if (record === undefined) throw new Error(`S records no band ${address}`);
    return {
      block: A,
      kind: "band",
      address: `${A}/${address}`,
      box: record,
      boundary: false,
      within: boxOf(STYLED_DRAWN, "score/card"),
    };
  };

  it("offers the bands of the edited timeline of this block only", () => {
    expect(bandTimelineOf(A, scoreEditor)).toBe("score");
    expect(bandTimelineOf(A, { target: `${A}/phrase`, kind: "timeline" })).toBe("phrase");
    expect(bandTimelineOf(A, { target: A, kind: "bundle" })).toBeNull();
    expect(bandTimelineOf(A, { target: `${A}/group_1`, kind: "group" })).toBeNull();
    expect(bandTimelineOf(A, { target: `${B}/score`, kind: "timeline" })).toBeNull();
    expect(bandTimelineOf(A, null)).toBeNull();
  });

  it("hits the band where the hit is a container or nothing", () => {
    expect(at(card(), 150, 55, scoreEditor)).toEqual(band("score/children_1"));
    expect(at(null, 150, 124, scoreEditor)).toEqual(band("score/regions_1"));
    expect(at(sourceOf(STYLED_DRAWN, null), 150, 149, scoreEditor)).toEqual(
      band("score/flow_control_1"),
    );
  });

  it("hits a drawn element inside a band before the band", () => {
    expect(summary(at(sourceOf(STYLED_DRAWN, "b"), 350, 55, scoreEditor))).toEqual({
      kind: "element",
      address: `${A}/b`,
      boundary: false,
      within: "score/card",
    });
    expect(at(sourceOf(STYLED_DRAWN, "score"), 150, 100, scoreEditor).address).toBe(`${A}/score`);
  });

  it("hits the card in a gap between bands and without a point", () => {
    expect(summary(at(card(), 150, 75, scoreEditor))).toMatchObject({
      kind: "card",
      address: `${A}/score/card`,
      within: "score/card",
    });
    expect(summary(hitOf(A, STYLED_DRAWN, card(), undefined, scoreEditor))).toEqual({
      kind: "card",
      address: `${A}/score/card`,
      boundary: false,
      within: null,
    });
  });

  it("hits no band of another timeline", () => {
    const onCard = { kind: "card", address: `${A}/score/card` };
    expect(at(card(), 150, 55, { target: `${A}/b`, kind: "timeline" })).toMatchObject(onCard);
    const phrase: Editing = { target: `${A}/phrase`, kind: "timeline" };
    const melody: Editing = { target: `${A}/melody`, kind: "timeline" };
    const map = (x: number, y: number, editing: Editing) =>
      hitOf(A, MAP_DRAWN, sourceOf(MAP_DRAWN, "melody/card"), { x, y }, editing).address;
    expect(map(150, 78, phrase)).toBe(`${A}/melody/card`);
    expect(map(150, 18, phrase)).toBe(`${A}/melody/card`);
    expect(map(300, 25, phrase)).toBe(`${A}/phrase/conversion_maps_1`);
    expect(map(300, 25, melody)).toBe(`${A}/melody/children_1`);
  });

  it("hits no band outside a timeline editor of this block", () => {
    const onCard = { kind: "card", address: `${A}/score/card` };
    expect(at(card(), 150, 55, { target: A, kind: "bundle" })).toMatchObject(onCard);
    expect(at(card(), 150, 55, { target: `${A}/group_1`, kind: "group" })).toMatchObject(onCard);
    expect(at(card(), 150, 55, { target: `${B}/score`, kind: "timeline" })).toMatchObject(onCard);
    expect(at(card(), 150, 55, null)).toMatchObject(onCard);
    expect(at(card(), 150, 55)).toMatchObject(onCard);
  });

  it("hits no absent band", () => {
    const melody: Editing = { target: `${A}/melody`, kind: "timeline" };
    const hit = hitOf(A, MAP_DRAWN, sourceOf(MAP_DRAWN, "melody/card"), { x: 150, y: 95 }, melody);
    expect(hit).toMatchObject({ kind: "card", address: `${A}/melody/card` });
  });

  it("selects and hovers a band by its address", () => {
    const hit = at(card(), 150, 55, scoreEditor);
    expect(selectionOf(hit, scoreEditor, new Set())).toBe(`${A}/score/children_1`);
    expect(hoverOf(hit)).toEqual({ box: "score/card", boundary: null, band: "score/children_1" });
  });
});
