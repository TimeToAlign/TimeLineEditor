// @vitest-environment jsdom
/**
 * What a pointer target hits in a block's drawing, what a press selects,
 * what the pointer highlights, and the block node holding the highlight by
 * address across a redraw.
 */

import type { View } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { flushSync, mount, unmount } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { afterEach, describe, expect, it, vi } from "vitest";
import BlockNode from "../src/BlockNode.svelte";
import type { Hit } from "../src/boxes.ts";
import { marksOf } from "../src/boxes.ts";
import {
  affectedBy,
  click,
  descriptorsOf,
  drawingOf,
  existing,
  hitOf,
  hoverOf,
  removeCommand,
  selectionOf,
} from "../src/index.ts";
import type { BlockNodeData } from "../src/project.ts";
import { A, blockIn, CHILD_MEMBER, changed, metrics, viewOf } from "./support.ts";

const SVG = "http://www.w3.org/2000/svg";

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

/** An SVG element of `tag`, carrying `address` when given, inside an `<svg>` inside a `div`. */
function target(tag: string, address: string | null = null): Element {
  const holder = document.createElement("div");
  const svg = document.createElementNS(SVG, "svg");
  const element = document.createElementNS(SVG, tag);
  if (address !== null) element.setAttribute("data-address", address);
  svg.append(element);
  holder.append(svg);
  return element;
}

/** Every descriptor `marksOf` names, as its index, address and mark, in order. */
function marked(drawing: Drawing): [number, unknown, string][] {
  const descriptors = descriptorsOf(drawing);
  const marks = marksOf(drawing, descriptors);
  return descriptors.flatMap((descriptor, index) => {
    const mark = marks.get(descriptor);
    if (mark === undefined) return [];
    const address = descriptor.attrs.find(([name]) => name === "data-address")?.[1];
    return [[index, address, mark]];
  });
}

const kindOf = ({ kind, address, boundary }: Hit) => ({ kind, address, boundary });

describe("boxes in a manifest of one root", () => {
  const view = viewOf({ id: A, fixture: "segment_line" });
  const drawing = drawingIn(view);
  const hit = (element: Element | null) => kindOf(hitOf(A, drawing, element));

  it("classifies a hit by the drawing's element types", () => {
    expect(hit(target("rect", "form/card"))).toEqual({
      kind: "card",
      address: `${A}/form/card`,
      boundary: false,
    });
    expect(hit(target("line", "form"))).toEqual({
      kind: "element",
      address: `${A}/form`,
      boundary: false,
    });
    expect(hit(target("line", "b2/start"))).toEqual({
      kind: "element",
      address: `${A}/b2/start`,
      boundary: true,
    });
    expect(hit(target("polygon", "b2/start"))).toEqual({
      kind: "element",
      address: `${A}/b2/start`,
      boundary: false,
    });
    expect(hit(target("polygon", "form/start"))).toEqual({
      kind: "element",
      address: `${A}/form/start`,
      boundary: false,
    });
    const block = { kind: "block", address: A, boundary: false };
    expect(hit(target("rect"))).toEqual(block);
    const svg = target("rect").parentElement;
    expect(hit(svg)).toEqual(block);
    expect(hit(null)).toEqual(block);
  });

  it.each([
    ["the root's line", 52.294921875, 68.953125],
    ["the middle of a nested segment's boundary", 227.294921875, 36.4765625],
    ["the card's top left corner", 8, 8],
    ["the card's bottom right corner", 469.573974609375, 103.9296875],
  ])("finds form/card under %s", (_, x, y) => {
    expect(hitOf(A, drawing, null, { x, y }).within).toBe("form/card");
  });

  it.each([
    ["the box's padding", 4, 4],
    ["just right of the card", 470, 50],
    ["the shadow's rim", 471, 105],
  ])("finds no box under %s", (_, x, y) => {
    expect(hitOf(A, drawing, null, { x, y }).within).toBeNull();
  });

  it("finds no box without a point", () => {
    expect(hitOf(A, drawing, target("rect", "form/card")).within).toBeNull();
  });

  it("marks the card, its shadow and the boundaries", () => {
    expect(marked(drawing)).toEqual([
      [1, "form/card", "shadow"],
      [2, "form/card", "card"],
      [15, "b/start", "boundary"],
      [16, "b2/start", "boundary"],
      [17, "c/start", "boundary"],
    ]);
  });

  it("marks the one rect of a card without a shadow as the card", () => {
    const plain = drawingIn(styled(view, { select: { element: "card" }, set: { shadow: "none" } }));
    expect(marked(plain)).toEqual([
      [1, "form/card", "card"],
      [14, "b/start", "boundary"],
      [15, "b2/start", "boundary"],
      [16, "c/start", "boundary"],
    ]);
  });

  it("highlights the card and the boundary under the pointer", () => {
    const at = hitOf(A, drawing, target("line", "b2/start"), { x: 227.294921875, y: 36.4765625 });
    expect(hoverOf(at)).toEqual({ box: "form/card", boundary: "b2/start" });
  });
});

describe("boxes in a manifest with one group", () => {
  const view = viewOf({ id: A, fixture: CHILD_MEMBER });
  const drawing = drawingIn(view);
  const hit = (element: Element) => kindOf(hitOf(A, drawing, element));

  it("tells a frame from a line of the same address form", () => {
    expect(hit(target("rect", "group_1"))).toEqual({
      kind: "group",
      address: `${A}/group_1`,
      boundary: false,
    });
    expect(hit(target("line", "recording"))).toEqual({
      kind: "element",
      address: `${A}/recording`,
      boundary: false,
    });
    expect(hit(target("rect", "recording/card"))).toEqual({
      kind: "card",
      address: `${A}/recording/card`,
      boundary: false,
    });
    expect(hit(target("text", "group_1/name"))).toEqual({
      kind: "element",
      address: `${A}/group_1/name`,
      boundary: false,
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
    expect(hitOf(A, drawing, null, { x, y }).within).toBe(expected);
  });

  it("marks the frame, each card and each shadow", () => {
    expect(marked(drawing)).toEqual([
      [1, "group_1", "group"],
      [3, "second-half/card", "shadow"],
      [4, "second-half/card", "card"],
      [22, "recording/card", "shadow"],
      [23, "recording/card", "card"],
    ]);
  });

  it("finds the frame where a hidden card would be", () => {
    const hidden = drawingIn(styled(view, HIDDEN_CARDS));
    expect(hitOf(A, hidden, null, { x: 120.61962890625, y: 139.16015625 }).within).toBe("group_1");
    expect(marked(hidden)).toEqual([[1, "group_1", "group"]]);
  });

  it("selects what a press hit", () => {
    const pressed = (element: Element) => selectionOf(hitOf(A, drawing, element));
    expect(pressed(target("rect", "recording/card"))).toBe(`${A}/recording/card`);
    expect(pressed(target("rect", "group_1"))).toBe(`${A}/group_1`);
    expect(pressed(target("rect"))).toBe(A);
    expect(pressed(target("line", "recording"))).toBe(`${A}/recording`);
    expect(pressed(target("polygon", "recording/start"))).toBe(`${A}/recording/start`);
    expect(pressed(target("text", "group_1/name"))).toBe(`${A}/group_1/name`);
  });

  it("highlights the innermost box under the pointer, never the block", () => {
    const hover = (element: Element | null, x: number, y: number) =>
      hoverOf(hitOf(A, drawing, element, { x, y }));
    expect(hover(target("line", "recording"), 120.61962890625, 139.16015625)).toEqual({
      box: "recording/card",
      boundary: null,
    });
    expect(hover(target("rect", "group_1"), 12, 12)).toEqual({ box: "group_1", boundary: null });
    expect(hover(target("rect").parentElement, 4, 4)).toEqual({ box: null, boundary: null });
  });

  it("lets every other reader fold a selected card into its timeline", () => {
    const card = hitOf(A, drawing, target("rect", "recording/card"));
    const selection = click(new Set(), selectionOf(card), false);
    expect(selection).toEqual(new Set([`${A}/recording/card`]));
    expect(existing(view, selection)).toBe(selection);
    expect(removeCommand(view, selection)).toEqual({
      type: "remove",
      targets: [`${A}/recording`],
    });
    expect(affectedBy(blockIn(view, A).manifest, new Set(["recording/card"]))).toEqual(
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

describe("the block node's hover marks", () => {
  let mounted: ReturnType<typeof mount> | undefined;

  afterEach(() => {
    if (mounted !== undefined) unmount(mounted);
    mounted = undefined;
    document.body.innerHTML = "";
  });

  function dataOf(view: View): BlockNodeData {
    const block = blockIn(view, A);
    const drawing = drawingOf(block, view.settings, metrics);
    return {
      block,
      drawing,
      descriptors: descriptorsOf(drawing),
      selectedElements: new Set(),
      affectedElements: new Set(),
      movedElements: new Set(),
      containsSelection: false,
    };
  }

  /** The marked elements, in document order, as `<tag> <address>`. */
  function hovered(): string[] {
    return Array.from(
      document.querySelectorAll("[data-hovered]"),
      (element) => `${element.localName} ${element.getAttribute("data-address")}`,
    );
  }

  function pointer(type: string, at: Element, init: MouseEventInit = {}): void {
    at.dispatchEvent(new MouseEvent(type, { bubbles: type !== "pointerleave", ...init }));
    flushSync();
  }

  /**
   * The node mounted on `view`, its props read through a reactive map so a
   * redraw can be passed in, and its `<svg>` laid out at the drawing's own
   * box at `(0, 0)` (jsdom lays nothing out).
   */
  function mountOn(view: View) {
    const props = new SvelteMap([["data", dataOf(view)]]);
    // The node reads only `data`; the other node props are Svelte Flow's.
    mounted = mount(BlockNode, {
      target: document.body,
      props: {
        get data() {
          return props.get("data");
        },
      } as never,
    });
    flushSync();
    const svg = document.querySelector("svg");
    if (svg === null) throw new Error("the block node rendered no svg");
    const { width, height } = dataOf(view).drawing;
    const box = vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width,
      height,
    } as DOMRect);
    const part = (selector: string) => {
      const found = svg.querySelector(selector);
      if (found === null) throw new Error(`no ${selector}`);
      return found;
    };
    return { props, svg, box, part };
  }

  it("keeps both marks across a redraw and does no work during a press", () => {
    const view = viewOf({ id: A, fixture: "segment_line" });
    const { props, svg, box, part } = mountOn(view);
    const boundary = () => part('line[data-address="b2/start"]');

    pointer("pointermove", boundary(), { clientX: 227.294921875, clientY: 36.4765625 });
    expect(hovered()).toEqual(["rect form/card", "line b2/start"]);
    expect(svg.children[2]?.hasAttribute("data-hovered")).toBe(true);
    expect(svg.children[1]?.hasAttribute("data-hovered")).toBe(false);

    const before = Array.from(svg.children);
    props.set(
      "data",
      dataOf(styled(view, { select: { element: "boundary" }, set: { stroke: "#FF0000" } })),
    );
    flushSync();
    expect(Array.from(svg.children).filter((element) => before.includes(element))).toEqual([]);
    expect(boundary().getAttribute("stroke")).toBe("#FF0000");
    expect(hovered()).toEqual(["rect form/card", "line b2/start"]);

    pointer("pointermove", svg, { clientX: 52.294921875, clientY: 68.953125 });
    expect(hovered()).toEqual(["rect form/card"]);

    box.mockClear();
    pointer("pointermove", boundary(), { buttons: 1, clientX: 4, clientY: 4 });
    expect(box).toHaveBeenCalledTimes(0);
    expect(hovered()).toEqual(["rect form/card"]);
    pointer("pointermove", svg, { clientX: 4, clientY: 4 });
    expect(box).toHaveBeenCalledTimes(1);
    expect(hovered()).toEqual([]);

    pointer("pointermove", boundary(), { clientX: 227.294921875, clientY: 36.4765625 });
    expect(hovered()).toEqual(["rect form/card", "line b2/start"]);
    pointer("pointerleave", svg);
    expect(hovered()).toEqual([]);
  });

  it("marks a frame, and the card rather than the frame around it", () => {
    const { svg, part } = mountOn(viewOf({ id: A, fixture: CHILD_MEMBER }));

    pointer("pointermove", part('rect[data-address="group_1"]'), { clientX: 12, clientY: 12 });
    expect(hovered()).toEqual(["rect group_1"]);

    pointer("pointermove", part('line[data-address="recording"]'), {
      clientX: 120.61962890625,
      clientY: 139.16015625,
    });
    expect(hovered()).toEqual(["rect recording/card"]);
    expect(svg.children[23]?.hasAttribute("data-hovered")).toBe(true);
  });
});
