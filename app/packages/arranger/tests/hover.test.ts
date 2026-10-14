// @vitest-environment jsdom
/**
 * What the pointer highlights in a block, and the block node holding it by
 * address across a redraw.
 */

import type { View } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { flushSync, mount, unmount } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { afterEach, describe, expect, it, vi } from "vitest";
import BlockNode from "../src/BlockNode.svelte";
import { boundaryOf, cardAt, hoverablesOf } from "../src/hover.ts";
import { descriptorsOf, drawingOf } from "../src/index.ts";
import type { BlockNodeData } from "../src/project.ts";
import { A, blockIn, CHILD_MEMBER, changed, metrics, viewOf } from "./support.ts";

function drawingIn(view: View): Drawing {
  return drawingOf(blockIn(view, A), view.settings, metrics);
}

/** Every descriptor `hoverablesOf` names, as its address and kind, in order. */
function hoverables(drawing: Drawing): [unknown, string][] {
  const descriptors = descriptorsOf(drawing);
  const kinds = hoverablesOf(drawing, descriptors);
  return descriptors.flatMap((descriptor) => {
    const kind = kinds.get(descriptor);
    if (kind === undefined) return [];
    const address = descriptor.attrs.find(([name]) => name === "data-address")?.[1];
    return [[address, kind]];
  });
}

/** The view with one workspace statement added. */
function styled(view: View, statement: object): View {
  return changed(view, {
    type: "set",
    changes: [{ target: "workspace", values: { graphical: { statements: [statement] } } }],
  });
}

describe("hover in a timeline file", () => {
  const drawing = drawingIn(viewOf({ id: A, fixture: "segment_line" }));

  it.each([
    ["the root's line", 52.294921875, 68.953125],
    ["a nested segment's boundary", 227.294921875, 36.4765625],
    ["the card's top left corner", 8, 8],
    ["the card's bottom right corner", 469.573974609375, 103.9296875],
  ])("finds form/card at %s", (_, x, y) => {
    expect(cardAt(drawing, x, y)).toBe("form/card");
  });

  it.each([
    ["the box's padding", 4, 4],
    ["just right of the card", 470, 50],
    ["the shadow's rim", 471, 105],
  ])("finds no card at %s", (_, x, y) => {
    expect(cardAt(drawing, x, y)).toBeNull();
  });

  it("names the card itself and the boundaries, never the shadow", () => {
    expect(hoverables(drawing)).toEqual([
      ["form/card", "card"],
      ["b/start", "boundary"],
      ["b2/start", "boundary"],
      ["c/start", "boundary"],
    ]);
    const descriptors = descriptorsOf(drawing);
    const [, shadow, card] = descriptors;
    expect(shadow?.tag).toBe("rect");
    expect(shadow?.attrs[0]).toEqual(["data-address", "form/card"]);
    const kinds = hoverablesOf(drawing, descriptors);
    expect(shadow === undefined ? undefined : kinds.get(shadow)).toBeUndefined();
    expect(card === undefined ? undefined : kinds.get(card)).toBe("card");
  });

  it("names the one rect of a card without a shadow", () => {
    const plain = drawingIn(
      styled(viewOf({ id: A, fixture: "segment_line" }), {
        select: { element: "card" },
        set: { shadow: "none" },
      }),
    );
    const descriptors = descriptorsOf(plain);
    const addressed = descriptors.filter(({ attrs }) =>
      attrs.some(([name, value]) => name === "data-address" && value === "form/card"),
    );
    expect(addressed.length).toBe(1);
    expect(descriptors.indexOf(addressed[0] as (typeof descriptors)[number])).toBe(1);
    expect(hoverables(plain)).toEqual([
      ["form/card", "card"],
      ["b/start", "boundary"],
      ["b2/start", "boundary"],
      ["c/start", "boundary"],
    ]);
  });

  it.each([
    ["line", "b2/start", "b2/start"],
    ["polygon", "b2/start", null],
    ["line", "form", null],
    ["line", null, null],
  ])("finds for a %s addressed %s the boundary %s", (tag, address, expected) => {
    expect(boundaryOf(drawing, tag, address)).toBe(expected);
  });
});

describe("hover in a group file", () => {
  const view = viewOf({ id: A, fixture: CHILD_MEMBER });
  const drawing = drawingIn(view);

  it.each([
    ["the ancestor line piece", 108.61962890625, 67.78125, "second-half/card"],
    ["second-half's own line", 120.61962890625, 81.78125, "second-half/card"],
    ["the start mark on the ancestor line", 120.61962890625, 66.28125, "second-half/card"],
    ["recording's line", 120.61962890625, 139.16015625, "recording/card"],
    ["the frame above the first card", 12, 12, null],
    ["the gap between the cards", 100, 120, null],
  ])("at %s finds %s", (_, x, y, expected) => {
    expect(cardAt(drawing, x, y)).toBe(expected);
  });

  it("names both cards and not the frame", () => {
    expect(hoverables(drawing)).toEqual([
      ["second-half/card", "card"],
      ["recording/card", "card"],
    ]);
  });

  it("finds no hidden card", () => {
    const hidden = drawingIn(
      changed(view, {
        type: "set",
        changes: [
          {
            target: "workspace",
            values: {
              graphical: {
                statements: [{ select: { element: "card" }, set: { display: "none" } }],
              },
            },
          },
        ],
      }),
    );
    expect(cardAt(hidden, 120.61962890625, 139.16015625)).toBeNull();
    expect(hoverables(hidden)).toEqual([]);
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
      containsSelection: false,
    };
  }

  /** The marked elements, in document order, as `<tag> <address>`. */
  function marked(): string[] {
    return Array.from(
      document.querySelectorAll("[data-hovered]"),
      (element) => `${element.localName} ${element.getAttribute("data-address")}`,
    );
  }

  function pointer(type: string, target: Element, init: MouseEventInit = {}): void {
    target.dispatchEvent(new MouseEvent(type, { bubbles: type !== "pointerleave", ...init }));
    flushSync();
  }

  it("keeps both marks across a redraw and does no work during a press", () => {
    const view = viewOf({ id: A, fixture: "segment_line" });
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
    const boundary = () => {
      const found = svg.querySelector('line[data-address="b2/start"]');
      if (found === null) throw new Error("no boundary b2/start");
      return found;
    };

    pointer("pointerover", boundary());
    expect(marked()).toEqual(["line b2/start"]);
    pointer("pointermove", boundary(), { clientX: 52.294921875, clientY: 68.953125 });
    expect(marked()).toEqual(["rect form/card", "line b2/start"]);
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
    expect(marked()).toEqual(["rect form/card", "line b2/start"]);

    pointer("pointerover", svg);
    expect(marked()).toEqual(["rect form/card"]);

    box.mockClear();
    pointer("pointerover", boundary(), { buttons: 1 });
    pointer("pointermove", svg, { buttons: 1, clientX: 4, clientY: 4 });
    expect(box).toHaveBeenCalledTimes(0);
    expect(marked()).toEqual(["rect form/card"]);
    pointer("pointermove", svg, { clientX: 4, clientY: 4 });
    expect(box).toHaveBeenCalledTimes(1);
    expect(marked()).toEqual([]);

    pointer("pointerover", boundary());
    pointer("pointermove", boundary(), { clientX: 52.294921875, clientY: 68.953125 });
    expect(marked()).toEqual(["rect form/card", "line b2/start"]);
    pointer("pointerleave", svg);
    expect(marked()).toEqual([]);
  });
});
