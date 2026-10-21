/**
 * The one box reader: what a press at a point hits in a block's drawing,
 * what it selects, what the pointer highlights, what each descriptor draws,
 * and which boxes hold part of the selection.
 */

import type {
  Address,
  ElementAddress,
  Facet,
  OwnerAddress,
  PlaceKey,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  BUNDLE_ADDRESS,
  bandAddress,
  cardAddress,
  idAddress,
  inBlock,
  partAddress,
  placeKeyText,
  sameAddress,
  TITLE_ADDRESS,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import type { Drawing, DrawnElement, LineElement, TextElement } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { affectedBy } from "../src/affected.ts";
import type { Hit } from "../src/boxes.ts";
import {
  blockBox,
  boxAt,
  boxOf,
  hitForAddress,
  hitOf,
  holdingOf,
  hoverOf,
  keyedBox,
  pressSelection,
  roleOf,
  workedBox,
} from "../src/boxes.ts";
import { removeCommand } from "../src/commands.ts";
import { levelOf, resolveSelection } from "../src/containers.ts";
import { descriptorsOf, drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { bandTimelineOf } from "../src/editing.ts";
import { itemMoveCommand } from "../src/items.ts";
import { insideOf, project } from "../src/project.ts";
import { click, existing, NOTHING_SELECTED, selectionOf } from "../src/selection.ts";
import { resizableOf } from "../src/selectionRules.ts";
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
    changes: [{ target: WORKSPACE, values: { graphical: { statements: [statement] } } }],
  });
}

const HIDDEN_CARDS = { select: { element: "card" }, set: { display: "none" } };
const HIDDEN_FRAMES = { select: { element: "frame" }, set: { display: "none" } };

/** The address in block A of the element address `element`. */
const inA = (element: ElementAddress): Address => inBlock(A, element);

/** The address of the part `words` of the element `id`. */
const part = (id: string, ...words: ("start" | "end" | "name" | "label")[]): ElementAddress =>
  words.reduce<OwnerAddress>((owner, word) => partAddress(owner, word), idAddress(id));

/** The card of `member` in the frame of `item`, or the card of the ungrouped root `item`. */
const cardKey = (item: string, member?: string): PlaceKey =>
  member === undefined ? { item } : { item, member };

/** Every descriptor that draws a container or a boundary, as its index, address and role. */
function roles(drawing: Drawing): [number, ElementAddress, string][] {
  return descriptorsOf(drawing).flatMap((descriptor, index) => {
    const role = roleOf(descriptor);
    return role === "element" ? [] : [[index, descriptor.source.address, role]];
  });
}

/** A hit as its kind, address, boundary flag and the place key of the box on top. */
const summary = ({ kind, address, boundary, within }: Hit) => ({
  kind,
  address,
  boundary,
  within: within?.key ?? null,
});

describe("boxes in a manifest of one root", () => {
  const view = viewOf({ id: A, fixture: "segment_line" });
  const drawing = drawingIn(view);
  const hit = (address: ElementAddress, type?: DrawnElement["type"]) =>
    summary(hitOf(A, drawing, sourceOf(drawing, address, type)));
  const plain = (kind: Hit["kind"], address: Address, boundary = false) => ({
    kind,
    address,
    boundary,
    within: null,
  });

  it("classifies a hit by the drawing's containers and element types", () => {
    expect(hit(cardAddress("form"))).toEqual(plain("card", inA(cardAddress("form"))));
    expect(hit(idAddress("form"), "timeline")).toEqual(plain("element", inA(idAddress("form"))));
    expect(hit(part("b", "start"), "boundary")).toEqual(
      plain("element", inA(part("b", "start")), true),
    );
    expect(hit(part("b2", "start"), "boundary")).toEqual(
      plain("element", inA(part("b2", "start")), true),
    );
    // A line end's wedge carries a boundary's `{id: S, part: ["start"]}` form, but it is no boundary line.
    expect(hit(part("form", "start"), "wedge")).toEqual(
      plain("element", inA(part("form", "start"))),
    );
    expect(hit(BUNDLE_ADDRESS)).toEqual(plain("block", { block: A }));
    expect(summary(hitOf(A, drawing, null))).toEqual(plain("block", { block: A }));
    expect(hitOf(A, drawing, null).box).toBe(drawing.boxes[0]);
    expect(hitOf(A, drawing, sourceOf(drawing, cardAddress("form"))).box).toBe(
      keyedBox(drawing, cardKey("form")),
    );
  });

  it.each([
    ["the root's line", 52.294921875, 68.953125],
    ["the middle of a nested segment's boundary", 227.294921875, 36.4765625],
    ["the card's top left corner", 8, 8],
    ["the card's bottom right corner", 469.573974609375, 103.9296875],
  ])("finds the card of form under %s", (_, x, y) => {
    expect(hitOf(A, drawing, null, { x, y }).within?.key).toEqual(cardKey("form"));
    expect(boxAt(drawing, { x, y })).toBe(keyedBox(drawing, cardKey("form")));
  });

  it.each([
    ["the block's padding", 4, 4],
    ["just right of the card", 470, 50],
    ["the shadow's rim", 471, 105],
  ])("finds no box under %s", (_, x, y) => {
    expect(hitOf(A, drawing, null, { x, y }).within).toBeNull();
  });

  it("finds no box without a point", () => {
    expect(hitOf(A, drawing, sourceOf(drawing, cardAddress("form"))).within).toBeNull();
  });

  it("tells the block, the card, its shadow and the boundaries by their descriptors' sources", () => {
    expect(roles(drawing)).toEqual([
      [0, BUNDLE_ADDRESS, "block"],
      [1, cardAddress("form"), "shadow"],
      [2, cardAddress("form"), "card"],
      [15, part("b", "start"), "boundary"],
      [16, part("b2", "start"), "boundary"],
      [17, part("c", "start"), "boundary"],
    ]);
  });

  it("draws the one rect of a card without a shadow as the card", () => {
    const flat = drawingIn(styled(view, { select: { element: "card" }, set: { shadow: "none" } }));
    expect(roles(flat)).toEqual([
      [0, BUNDLE_ADDRESS, "block"],
      [1, cardAddress("form"), "card"],
      [14, part("b", "start"), "boundary"],
      [15, part("b2", "start"), "boundary"],
      [16, part("c", "start"), "boundary"],
    ]);
  });

  it("highlights the card and the boundary under the pointer", () => {
    const point = { x: 227.294921875, y: 36.4765625 };
    const at = hitOf(A, drawing, sourceOf(drawing, part("b2", "start"), "boundary"), point);
    expect(hoverOf(at)).toEqual({
      box: placeKeyText(cardKey("form")),
      boundary: addressKey(part("b2", "start")),
      band: null,
    });
  });
});

describe("boxes in a manifest with one group", () => {
  const view = viewOf({ id: A, fixture: CHILD_MEMBER });
  const drawing = drawingIn(view);
  const hit = (address: ElementAddress, type?: DrawnElement["type"]) =>
    hitOf(A, drawing, sourceOf(drawing, address, type));

  it("tells a frame from a line of the same address shape", () => {
    expect(summary(hit(idAddress("group_1")))).toMatchObject({
      kind: "frame",
      address: inA(idAddress("group_1")),
    });
    expect(summary(hit(idAddress("recording"), "timeline"))).toMatchObject({
      kind: "element",
      address: inA(idAddress("recording")),
    });
    expect(summary(hit(cardAddress("recording")))).toMatchObject({
      kind: "card",
      address: inA(cardAddress("recording")),
    });
    expect(summary(hit(part("group_1", "name")))).toMatchObject({
      kind: "element",
      address: inA(part("group_1", "name")),
    });
  });

  it.each([
    ["the frame above the first card", 12, 12, cardKey("group_1")],
    ["the gap between the cards", 100, 120, cardKey("group_1")],
    [
      "the start of the ancestor line",
      108.61962890625,
      67.78125,
      cardKey("group_1", "second-half"),
    ],
    [
      "the start of recording's line",
      120.61962890625,
      139.16015625,
      cardKey("group_1", "recording"),
    ],
    ["the block's padding", 4, 4, null],
    ["the right of the frame", 552, 100, null],
  ])("finds under %s the box %j", (_, x, y, expected) => {
    expect(hitOf(A, drawing, null, { x, y }).within?.key ?? null).toEqual(expected);
  });

  it("tells the frame, each card and each shadow", () => {
    expect(roles(drawing)).toEqual([
      [0, BUNDLE_ADDRESS, "block"],
      [1, idAddress("group_1"), "frame"],
      [3, cardAddress("second-half"), "shadow"],
      [4, cardAddress("second-half"), "card"],
      [22, cardAddress("recording"), "shadow"],
      [23, cardAddress("recording"), "card"],
    ]);
  });

  it("finds the frame where a hidden card would be", () => {
    const hidden = drawingIn(styled(view, HIDDEN_CARDS));
    const point = { x: 120.61962890625, y: 139.16015625 };
    expect(hitOf(A, hidden, null, point).within?.key).toEqual(cardKey("group_1"));
    expect(roles(hidden)).toEqual([
      [0, BUNDLE_ADDRESS, "block"],
      [1, idAddress("group_1"), "frame"],
    ]);
  });

  it("selects what a press hit", () => {
    const inside = insideOf(blockIn(view, A).manifest, drawing, null);
    const pressed = (address: ElementAddress, type?: DrawnElement["type"]) =>
      pressSelection(hit(address, type), null, inside);
    expect(pressed(cardAddress("recording"))).toEqual(inA(cardAddress("recording")));
    expect(pressed(idAddress("group_1"))).toEqual(inA(idAddress("group_1")));
    expect(pressed(BUNDLE_ADDRESS)).toEqual({ block: A });
    expect(pressed(idAddress("recording"), "timeline")).toEqual(inA(idAddress("recording")));
    expect(pressed(part("recording", "start"), "wedge")).toEqual(inA(part("recording", "start")));
    expect(pressed(part("group_1", "name"))).toEqual(inA(part("group_1", "name")));
  });

  it("highlights the innermost box under the pointer, never the block", () => {
    const hover = (address: ElementAddress | null, x: number, y: number) =>
      hoverOf(hitOf(A, drawing, address === null ? null : sourceOf(drawing, address), { x, y }));
    expect(hover(idAddress("recording"), 120.61962890625, 139.16015625)).toEqual({
      box: placeKeyText(cardKey("group_1", "recording")),
      boundary: null,
      band: null,
    });
    expect(hover(idAddress("group_1"), 12, 12)).toEqual({
      box: placeKeyText(cardKey("group_1")),
      boundary: null,
      band: null,
    });
    expect(hover(null, 4, 4)).toEqual({ box: null, boundary: null, band: null });
  });

  it("gives Enter the hit of a selected address from the drawing alone", () => {
    expect(hitForAddress(A, drawing, { block: A })).toEqual({
      block: A,
      kind: "block",
      address: { block: A },
      box: drawing.boxes[0],
      boundary: false,
      within: null,
    });
    expect(hitForAddress(A, drawing, inA(idAddress("group_1")))?.box).toBe(
      keyedBox(drawing, cardKey("group_1")),
    );
    expect(hitForAddress(A, drawing, inA(cardAddress("recording")))?.kind).toBe("card");
    expect(hitForAddress(A, drawing, inA(idAddress("recording")))).toEqual({
      block: A,
      kind: "element",
      address: inA(idAddress("recording")),
      box: null,
      boundary: false,
      within: null,
    });
    expect(hitForAddress(A, drawing, inA(idAddress("nobody")))).toBeNull();
    expect(hitForAddress(A, drawing, inBlock(B, idAddress("recording")))).toBeNull();
    const hidden = drawingIn(styled(view, HIDDEN_CARDS));
    expect(hitForAddress(A, hidden, inA(cardAddress("recording")))).toBeNull();
  });

  it("lets every other reader take a selected card for its timeline", () => {
    const card = hit(cardAddress("recording"));
    const inside = insideOf(blockIn(view, A).manifest, drawing, null);
    const pressed = pressSelection(card, null, inside);
    if (pressed === null) throw new Error("the card selects nothing");
    const selection = click(NOTHING_SELECTED, pressed, false);
    expect(selection).toEqual(selectionOf([inA(cardAddress("recording"))]));
    expect(existing(view, selection, null)).toBe(selection);
    expect(removeCommand(view, selection, null)).toEqual({
      type: "remove",
      targets: [inA(idAddress("recording"))],
    });
    const selected = new Map([[addressKey(cardAddress("recording")), cardAddress("recording")]]);
    expect(affectedBy(blockIn(view, A).manifest, selected, null)).toEqual(
      new Set(
        [
          idAddress("recording"),
          part("recording", "name"),
          part("recording", "start"),
          part("recording", "start", "label"),
          part("recording", "end"),
          part("recording", "end", "label"),
        ].map(addressKey),
      ),
    );
  });
});

describe("the boxes holding part of the selection", () => {
  /** `bundle_mixed` with the child `dlt_1` below the member `excerpt`, and a region on `excerpt`. */
  const mixed = [
    {
      type: "add",
      into: inA(idAddress("excerpt")),
      child: { id: "dlt_1", offset: 0, unit: "samples", length: 100 },
    },
    {
      type: "add",
      into: inA(idAddress("excerpt")),
      region: { id: "region_3", name: "A", start: 0, end: 10 },
    },
  ].reduce(changed, viewOf({ id: A, fixture: "bundles/bundle_mixed" }));

  const holding = (selected: readonly ElementAddress[], view: View = mixed) =>
    holdingOf(drawingIn(view), new Map(selected.map((address) => [addressKey(address), address])));
  const held = (...boxes: PlaceKey[]) => ({ block: true, boxes: new Set(boxes.map(placeKeyText)) });
  const g1 = cardKey("group_1");
  const g2 = cardKey("group_2");

  it.each([
    ["a member's line", [idAddress("score")], [g1, cardKey("group_1", "score")]],
    ["a member's start", [part("score", "start")], [g1, cardKey("group_1", "score")]],
    ["a child's line", [idAddress("dlt_1")], [g2, cardKey("group_2", "excerpt")]],
    ["a region's label", [part("region_3", "label")], [g2, cardKey("group_2", "excerpt")]],
    ["a member that is a child", [idAddress("excerpt")], [g2, cardKey("group_2", "excerpt")]],
    [
      "the ancestor line on a member's card",
      [idAddress("recording")],
      [g2, cardKey("group_2", "excerpt")],
    ],
    ["a member's card", [cardAddress("page")], [g2]],
    ["the group itself", [idAddress("group_1")], []],
    ["the group's title", [part("group_1", "name")], [g1]],
    ["the manifest's title", [TITLE_ADDRESS], []],
    ["a root outside every frame", [idAddress("annotations")], [cardKey("annotations")]],
    ["the card of a root outside every frame", [cardAddress("annotations")], []],
    [
      "a member of each group",
      [idAddress("score"), idAddress("page")],
      [g1, cardKey("group_1", "score"), g2, cardKey("group_2", "page")],
    ],
    [
      "a selected frame and a member in it",
      [idAddress("group_1"), idAddress("score")],
      [g1, cardKey("group_1", "score")],
    ],
  ])("with %s (%j) selected, holds it in exactly its boxes and the block", (_, selected, boxes) => {
    expect(holding(selected)).toEqual(held(...boxes));
  });

  it("holds nothing without a selection, nor an address that is not drawn", () => {
    expect(holding([])).toEqual({ block: false, boxes: new Set() });
    expect(holding([idAddress("nobody")])).toEqual({ block: false, boxes: new Set() });
  });

  it.each([
    ["a root's line", [idAddress("recording")], [cardKey("recording")]],
    ["a boundary on a root's line", [part("page_2", "start")], [cardKey("pages")]],
  ])(
    "without groups, with %s (%j) selected, holds it in exactly its card",
    (_, selected, boxes) => {
      expect(holding(selected, viewOf({ id: A, fixture: "bundles/bundle_ungrouped" }))).toEqual(
        held(...boxes),
      );
    },
  );

  it.each([
    ["cards", idAddress("score"), HIDDEN_CARDS, [g1]],
    ["frames", idAddress("score"), HIDDEN_FRAMES, [cardKey("group_1", "score")]],
    ["frames", part("group_1", "name"), HIDDEN_FRAMES, []],
  ])("with the %s hidden, %j is held only by displayed boxes", (_, selected, statement, boxes) => {
    expect(holding([selected], styled(mixed, statement))).toEqual(held(...boxes));
  });

  describe("with an item over another", () => {
    // The README's view `over`: `annotations`' card moved to (8, 60), over `group_1`'s frame.
    const plain = mixedPlain();
    const over = changed(plain, itemMoveCommand(plain, A, cardKey("annotations"), 8, 60, metrics));
    const drawing = drawingIn(over);
    const rect = (key: PlaceKey) => {
      const box = keyedBox(drawing, key);
      if (box === undefined) throw new Error(`no box ${placeKeyText(key)}`);
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const element = (type: DrawnElement["type"], address: ElementAddress) =>
      drawing.elements[sourceOf(drawing, address, type).element];

    it("draws each card's member drawing inside the other card", () => {
      const width = 562.484619140625;
      expect(rect(cardKey("annotations"))).toEqual({ x: 8, y: 60, width, height: 71.85546875 });
      expect(rect(g1)).toEqual({ x: 8, y: 28.8046875, width, height: 169.234375 });
      expect(rect(cardKey("group_1", "score"))).toEqual({
        x: 16,
        y: 53.609375,
        width: 546.484619140625,
        height: 78.953125,
      });
      const line = element("timeline", idAddress("score")) as LineElement;
      expect([line.xs, line.xe]).toEqual([126.29150390625, 526.29150390625]);
      const name = element("name", part("annotations", "name")) as TextElement;
      expect(name.x).toBe(24);
    });

    it("gives the card drawn on top as the box under a point both cards hold", () => {
      const line = element("timeline", idAddress("score")) as LineElement;
      const point = { x: (line.xs + line.xe) / 2, y: line.y };
      expect(hitOf(A, drawing, null, point).within?.key).toEqual(cardKey("annotations"));
    });

    it.each([
      ["the name of the card on top", [part("annotations", "name")], [cardKey("annotations")]],
      ["the line of the card underneath", [idAddress("score")], [g1, cardKey("group_1", "score")]],
      ["the card on top", [cardAddress("annotations")], []],
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
      [
        "drawn on both cards",
        twice,
        [g1, cardKey("group_1", "recording"), g2, cardKey("group_2", "excerpt")],
      ],
      ["hidden on the card of `recording`", hidden, [g2, cardKey("group_2", "excerpt")]],
    ])("holds it in the boxes of each copy drawn, %s", (_, view, boxes) => {
      expect(holding([idAddress("cmap_6")], view)).toEqual(held(...boxes));
    });
  });

  describe("with one address on two cards", () => {
    // `t` is a member of `g1` and of `g2`: a card in each frame, one address for both.
    const shared = viewOf({ id: A, fixture: "bundles/bundle_shared_member" });
    const drawing = drawingIn(shared);
    const t1 = cardKey("g1", "t");
    const t2 = cardKey("g2", "t");

    it("draws both cards of t with the one address", () => {
      expect(keyedBox(drawing, t1)?.address).toEqual(cardAddress("t"));
      expect(keyedBox(drawing, t2)?.address).toEqual(cardAddress("t"));
    });

    it("holds the cards' address in both frames and in neither card", () => {
      expect(holding([cardAddress("t")], shared)).toEqual(held(cardKey("g1"), cardKey("g2")));
    });

    it("holds the line drawn on both cards in both frames and both cards", () => {
      expect(holding([idAddress("t")], shared)).toEqual(held(cardKey("g1"), t1, cardKey("g2"), t2));
    });

    const groupEditor = (group: string): Editing => ({
      target: inA(idAddress(group)),
      kind: "group",
    });
    const bundleEditor: Editing = { target: { block: A }, kind: "bundle" };

    it("works on the card in the frame of the edited group, and on none where no frame is", () => {
      const worked = (editing: Editing | null) =>
        workedBox(drawing, A, cardAddress("t"), editing)?.key;
      expect(worked(groupEditor("g1"))).toEqual(t1);
      expect(worked(groupEditor("g2"))).toEqual(t2);
      expect(worked(null)).toBeUndefined();
      expect(worked(bundleEditor)).toBeUndefined();
      expect(worked({ target: inBlock(B, idAddress("g2")), kind: "group" })).toBeUndefined();
      expect(workedBox(drawing, A, cardAddress("u"), null)?.key).toEqual(cardKey("g1", "u"));
      expect(workedBox(drawing, A, idAddress("g2"), null)?.key).toEqual(cardKey("g2"));
    });

    it("gives Enter the card of the frame worked in, else the first card displayed", () => {
      const enter = (on: Drawing, editing: Editing | null) =>
        hitForAddress(A, on, inA(cardAddress("t")), editing)?.box?.key;
      expect(enter(drawing, groupEditor("g2"))).toEqual(t2);
      expect(enter(drawing, null)).toEqual(t1);
      // The card of `t` in `g1` hidden: it no longer hides the one in `g2`.
      const firstHidden: Drawing = {
        ...drawing,
        boxes: drawing.boxes.map((box) =>
          box.key !== null && placeKeyText(box.key) === placeKeyText(t1)
            ? { ...box, displayed: false }
            : box,
        ),
      };
      expect(enter(firstHidden, null)).toEqual(t2);
      expect(enter(firstHidden, bundleEditor)).toEqual(t2);
      expect(enter(firstHidden, groupEditor("g2"))).toEqual(t2);
      expect(enter(firstHidden, groupEditor("g1"))).toBeUndefined();
    });

    it("resizes and inspects the card of the frame worked in, and none where no frame is", () => {
      const selected = selectionOf([inA(cardAddress("t"))]);
      const resizedIn = (editing: Editing | null) => {
        const nodes = project(shared, selected, [], metrics, editing);
        const byId = new Map(nodes.map((node) => [node.id, node]));
        return resizableOf(selected, byId, editing, levelOf(editing))?.box.key;
      };
      expect(resizedIn(groupEditor("g1"))).toEqual(t1);
      expect(resizedIn(groupEditor("g2"))).toEqual(t2);
      expect(resizedIn(null)).toBeUndefined();
      expect(resizedIn(bundleEditor)).toBeUndefined();
      const inspected = (address: ElementAddress, editing: Editing | null) =>
        resolveSelection(shared, selectionOf([inA(address)]), editing, metrics)[0]?.box?.key ??
        null;
      expect(inspected(cardAddress("t"), groupEditor("g2"))).toEqual(t2);
      expect(inspected(idAddress("t"), groupEditor("g1"))).toEqual(t1);
      expect(inspected(part("t", "name"), groupEditor("g2"))).toEqual(t2);
      expect(inspected(cardAddress("t"), null)).toBeNull();
      expect(inspected(cardAddress("t"), bundleEditor)).toBeNull();
      expect(inspected(cardAddress("u"), null)).toEqual(cardKey("g1", "u"));
    });
  });
});

describe("selection and hover inside an editor", () => {
  const view = mixedPlain();
  const block = blockIn(view, A);
  const drawing = drawingOf(block, view.settings, metrics);
  const group = insideOf(block.manifest, drawing, "group_1");
  const every = insideOf(block.manifest, drawing, null);
  const hit = (kind: Hit["kind"], element: ElementAddress | null): Hit => ({
    block: A,
    kind,
    address: element === null ? { block: A } : inA(element),
    box:
      kind === "element"
        ? null
        : ((element === null ? blockBox(drawing) : boxOf(drawing, element)) ?? null),
    boundary: false,
    within: null,
  });

  it("selects only what lies inside the edited element", () => {
    const editing: Editing = { target: inA(idAddress("group_1")), kind: "group" };
    expect(pressSelection(hit("card", cardAddress("score")), editing, group)).toEqual(
      inA(cardAddress("score")),
    );
    expect(pressSelection(hit("frame", idAddress("group_1")), editing, group)).toEqual(
      inA(idAddress("group_1")),
    );
    expect(pressSelection(hit("element", idAddress("score")), editing, group)).toEqual(
      inA(idAddress("score")),
    );
    expect(pressSelection(hit("card", cardAddress("page")), editing, group)).toBeNull();
    expect(pressSelection(hit("element", idAddress("annotations")), editing, group)).toBeNull();
    expect(pressSelection(hit("element", TITLE_ADDRESS), editing, group)).toBeNull();
    expect(pressSelection(hit("block", null), editing, group)).toBeNull();
  });

  it("selects the block on the arranger and in its own bundle editor only", () => {
    expect(pressSelection(hit("block", null), null, every)).toEqual({ block: A });
    expect(
      pressSelection(hit("block", null), { target: { block: A }, kind: "bundle" }, every),
    ).toEqual({ block: A });
    expect(
      pressSelection(hit("block", null), { target: { block: B }, kind: "bundle" }, new Set()),
    ).toBeNull();
  });
});

describe("the bands of the edited timeline", () => {
  const scoreEditor: Editing = { target: inA(idAddress("score")), kind: "timeline" };
  const card = (drawing: Drawing = STYLED_DRAWN) => sourceOf(drawing, cardAddress("score"));
  const at = (
    source: ReturnType<typeof card> | null,
    x: number,
    y: number,
    editing?: Editing | null,
  ) => hitOf(A, STYLED_DRAWN, source, { x, y }, editing);
  const band = (facet: Facet) => {
    const address = bandAddress("score", facet);
    const record = bandsOf(STYLED_DRAWN).find((drawn) => sameAddress(drawn.address, address));
    if (record === undefined) throw new Error(`S records no band ${facet}`);
    return {
      block: A,
      kind: "band",
      address: inA(address),
      box: record,
      boundary: false,
      within: keyedBox(STYLED_DRAWN, cardKey("score")),
    };
  };

  it("offers the bands of the edited timeline of this block only", () => {
    expect(bandTimelineOf(A, scoreEditor)).toBe("score");
    expect(bandTimelineOf(A, { target: inA(idAddress("phrase")), kind: "timeline" })).toBe(
      "phrase",
    );
    expect(bandTimelineOf(A, { target: { block: A }, kind: "bundle" })).toBeNull();
    expect(bandTimelineOf(A, { target: inA(idAddress("group_1")), kind: "group" })).toBeNull();
    expect(
      bandTimelineOf(A, { target: inBlock(B, idAddress("score")), kind: "timeline" }),
    ).toBeNull();
    expect(bandTimelineOf(A, null)).toBeNull();
  });

  it("hits the band where the hit is a container or nothing", () => {
    expect(at(card(), 150, 55, scoreEditor)).toEqual(band("children"));
    expect(at(null, 150, 124, scoreEditor)).toEqual(band("regions"));
    expect(at(sourceOf(STYLED_DRAWN, BUNDLE_ADDRESS), 150, 149, scoreEditor)).toEqual(
      band("flow_control"),
    );
  });

  it("hits a drawn element inside a band before the band", () => {
    expect(summary(at(sourceOf(STYLED_DRAWN, idAddress("b")), 350, 55, scoreEditor))).toEqual({
      kind: "element",
      address: inA(idAddress("b")),
      boundary: false,
      within: cardKey("score"),
    });
    expect(at(sourceOf(STYLED_DRAWN, idAddress("score")), 150, 100, scoreEditor).address).toEqual(
      inA(idAddress("score")),
    );
  });

  it("hits the card in a gap between bands and without a point", () => {
    expect(summary(at(card(), 150, 75, scoreEditor))).toMatchObject({
      kind: "card",
      address: inA(cardAddress("score")),
      within: cardKey("score"),
    });
    expect(summary(hitOf(A, STYLED_DRAWN, card(), undefined, scoreEditor))).toEqual({
      kind: "card",
      address: inA(cardAddress("score")),
      boundary: false,
      within: null,
    });
  });

  it("hits no band of another timeline", () => {
    const onCard = { kind: "card", address: inA(cardAddress("score")) };
    expect(at(card(), 150, 55, { target: inA(idAddress("b")), kind: "timeline" })).toMatchObject(
      onCard,
    );
    const phrase: Editing = { target: inA(idAddress("phrase")), kind: "timeline" };
    const melody: Editing = { target: inA(idAddress("melody")), kind: "timeline" };
    const map = (x: number, y: number, editing: Editing) =>
      hitOf(A, MAP_DRAWN, sourceOf(MAP_DRAWN, cardAddress("melody")), { x, y }, editing).address;
    expect(map(150, 78, phrase)).toEqual(inA(cardAddress("melody")));
    expect(map(150, 18, phrase)).toEqual(inA(cardAddress("melody")));
    expect(map(300, 25, phrase)).toEqual(inA(bandAddress("phrase", "conversion_maps")));
    expect(map(300, 25, melody)).toEqual(inA(bandAddress("melody", "children")));
  });

  it("hits no band outside a timeline editor of this block", () => {
    const onCard = { kind: "card", address: inA(cardAddress("score")) };
    expect(at(card(), 150, 55, { target: { block: A }, kind: "bundle" })).toMatchObject(onCard);
    expect(at(card(), 150, 55, { target: inA(idAddress("group_1")), kind: "group" })).toMatchObject(
      onCard,
    );
    expect(
      at(card(), 150, 55, { target: inBlock(B, idAddress("score")), kind: "timeline" }),
    ).toMatchObject(onCard);
    expect(at(card(), 150, 55, null)).toMatchObject(onCard);
    expect(at(card(), 150, 55)).toMatchObject(onCard);
  });

  it("hits no absent band", () => {
    const melody: Editing = { target: inA(idAddress("melody")), kind: "timeline" };
    const hit = hitOf(
      A,
      MAP_DRAWN,
      sourceOf(MAP_DRAWN, cardAddress("melody")),
      { x: 150, y: 95 },
      melody,
    );
    expect(hit).toMatchObject({ kind: "card", address: inA(cardAddress("melody")) });
  });

  it("selects and hovers a band by its address", () => {
    const hit = at(card(), 150, 55, scoreEditor);
    expect(pressSelection(hit, scoreEditor, new Set())).toEqual(
      inA(bandAddress("score", "children")),
    );
    expect(hoverOf(hit)).toEqual({
      box: placeKeyText(cardKey("score")),
      boundary: null,
      band: addressKey(bandAddress("score", "children")),
    });
  });
});
