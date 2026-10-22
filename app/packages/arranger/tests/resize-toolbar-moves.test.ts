// @vitest-environment jsdom
/**
 * The resize toolbar is not shown while boxes are moved: a block dragged by
 * Svelte Flow and a frame moved in the bundle editor hide every handle and
 * the mode menu, which come back at the bounds the store leaves, also after
 * a move that stores nothing; a handle's resize hides nothing. The expected
 * bounds are derived in `README.md` ("The resize toolbar while boxes
 * move").
 */

import type { Address, ElementAddress, Store, View } from "@timetoalign/tilie-core";
import { idAddress, inBlock } from "@timetoalign/tilie-core";
import type { Viewport } from "@xyflow/svelte";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boxOf } from "../src/boxes.ts";
import { drawingOf, nodePosition } from "../src/drawing.ts";
import { selectionOf } from "../src/selection.ts";
import Harness from "./CanvasHarness.svelte";
import {
  IDENTITY,
  settle,
  stubCanvasGlobals,
  stubPointerCapture,
  withScreenMatrix,
} from "./dom.ts";
import { A, metrics, mixedView, storeOf, withGrid } from "./support.ts";

interface Mounted {
  select(next: ReturnType<typeof selectionOf>): void;
  showAt(next: Viewport): void;
}

let mounted: ReturnType<typeof mount> | undefined;
let harness: Mounted;
let store: Store;

beforeEach(() => {
  stubCanvasGlobals();
  stubPointerCapture();
});

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** `view` (`bundle_mixed` alone at (40, 80)) shown at (100, 100), zoom 1, with `selected` selected. */
async function show(selected: readonly Address[], view: View = mixedView()): Promise<void> {
  store = storeOf(view);
  const instance = mount(Harness, { target: document.body, props: { store, metrics } });
  mounted = instance;
  // `tsc` reads the harness through Svelte's generic module declaration, which leaves its exports untyped.
  harness = instance as Mounted;
  await settle();
  harness.showAt({ x: 100, y: 100, zoom: 1 });
  await settle();
  harness.select(selectionOf([...selected]));
  await settle();
}

function open(target: Address): void {
  const refusal = store.open(target);
  if (refusal !== null) throw new Error(refusal.message);
  flushSync();
}

/** How many handles and mode buttons are in the document. */
function toolbar(): { handles: number; modes: number } {
  return {
    handles: document.querySelectorAll("[data-testid^='handle-']").length,
    modes: document.querySelectorAll("[data-testid^='mode-']").length,
  };
}

const SHOWN = { handles: 8, modes: 3 };
const HIDDEN = { handles: 0, modes: 0 };

/** The canvas point of the top-left handle, from its `left` and `top`. */
function topLeft(): { x: number; y: number } {
  const handle = document.querySelector<HTMLElement>('[data-testid="handle-top-left"]');
  if (handle === null) throw new Error("no top-left handle");
  return { x: Number.parseFloat(handle.style.left), y: Number.parseFloat(handle.style.top) };
}

/** Block A's node position, derived from the block as stored. */
function storedNode(): { x: number; y: number } {
  const block = store.view.blocks[A];
  if (block === undefined) throw new Error("no block A");
  return nodePosition(block, drawingOf(block, store.view.settings, metrics));
}

/** The top-left corner of the frame or card `address` of block A on the canvas, as stored. */
function storedBox(address: ElementAddress): { x: number; y: number } {
  const block = store.view.blocks[A];
  if (block === undefined) throw new Error("no block A");
  const drawing = drawingOf(block, store.view.settings, metrics);
  const rect = boxOf(drawing, address);
  if (rect === undefined) throw new Error(`no box ${JSON.stringify(address)}`);
  const at = nodePosition(block, drawing);
  return { x: at.x + rect.x * block.scale, y: at.y + rect.y * block.scale };
}

function nodeOf(block: string): Element {
  const found = [...document.querySelectorAll(".svelte-flow__node[data-id]")].find(
    (node) => node.getAttribute("data-id") === block,
  );
  if (found === undefined) throw new Error(`no node ${block}`);
  return found;
}

/**
 * A mouse event of `type` at client `(x, y)`: Svelte Flow drags a node on
 * the mouse's events, following the press on its `view`, which jsdom's
 * constructor does not take from the test's global window and is set after.
 */
function mouse(target: EventTarget, type: string, x: number, y: number): void {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "view", { value: window });
  target.dispatchEvent(event);
  flushSync();
}

function pointer(target: Element, type: string, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX: x,
      clientY: y,
    }),
  );
  flushSync();
}

/** The frame's own rectangle in block A's drawing: carrying `data-id` and neither `data-facet` nor `data-part`. */
function frameOf(id: string): Element {
  const found = [...nodeOf(A).querySelectorAll("svg [data-id]")].findLast(
    (element) =>
      element.getAttribute("data-id") === id &&
      !element.hasAttribute("data-facet") &&
      !element.hasAttribute("data-part"),
  );
  if (found === undefined) throw new Error(`no frame ${id}`);
  return found;
}

describe("a block dragged on the arranger", () => {
  it("hides the toolbar until the drop, then shows it at the stored bounds", async () => {
    await show([{ block: A }]);
    const before = storedNode();
    expect(before).toEqual({ x: 40, y: 80 });
    expect(toolbar()).toEqual(SHOWN);
    expect(topLeft()).toEqual(before);
    const entries = store.entries.length;

    const node = nodeOf(A);
    mouse(node, "mousedown", 0, 0);
    mouse(window, "mousemove", 32, 24);
    await settle();
    expect(toolbar()).toEqual(HIDDEN);
    mouse(window, "mousemove", 40, 30);
    await settle();
    expect(toolbar()).toEqual(HIDDEN);
    mouse(window, "mouseup", 40, 30);
    await settle();

    expect(store.entries).toHaveLength(entries + 1);
    expect(toolbar()).toEqual(SHOWN);
    expect(store.view.blocks[A]).toMatchObject({ x: 48, y: 88 });
    expect(storedNode()).toEqual({ x: 48, y: 88 });
    expect(topLeft()).toEqual(storedNode());
  });

  it("shows it at the original bounds after a drag that stores nothing", async () => {
    // Svelte Flow starts the drag where the pointer passes its threshold and moves the node from
    // there; released at that point, the node has not moved, and without snapping nothing is stored.
    await show([{ block: A }], withGrid(mixedView(), 8, false));
    const before = storedNode();
    const entries = store.entries.length;
    const node = nodeOf(A);
    mouse(node, "mousedown", 0, 0);
    mouse(window, "mousemove", 32, 24);
    await settle();
    expect(toolbar()).toEqual(HIDDEN);
    mouse(window, "mouseup", 32, 24);
    await settle();
    expect(store.entries).toHaveLength(entries);
    expect(toolbar()).toEqual(SHOWN);
    expect(topLeft()).toEqual(before);
  });
});

describe("a block drag Svelte Flow never stops", () => {
  it("shows the toolbar again once the press is cancelled", async () => {
    await show([{ block: A }], withGrid(mixedView(), 8, false));
    const before = storedNode();
    const entries = store.entries.length;
    mouse(nodeOf(A), "mousedown", 0, 0);
    mouse(window, "mousemove", 32, 24);
    await settle();
    expect(toolbar()).toEqual(HIDDEN);
    window.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, isPrimary: true }));
    await settle();
    expect(toolbar()).toEqual(SHOWN);
    expect(topLeft()).toEqual(before);
    // The release that ends Svelte Flow's own gesture stores nothing: the node has not moved.
    mouse(window, "mouseup", 32, 24);
    await settle();
    expect(store.entries).toHaveLength(entries);
    expect(toolbar()).toEqual(SHOWN);
    expect(topLeft()).toEqual(before);
  });

  it("leaves no move in progress when the dragged block is removed", async () => {
    await show([{ block: A }]);
    const before = storedNode();
    mouse(nodeOf(A), "mousedown", 0, 0);
    mouse(window, "mousemove", 32, 24);
    await settle();
    expect(toolbar()).toEqual(HIDDEN);
    expect(store.dispatch({ type: "remove", targets: [{ block: A }] })).toBeNull();
    await settle();
    // Svelte Flow aborts the drag on this move, its node gone, and calls no stop on the release.
    mouse(window, "mousemove", 40, 30);
    mouse(window, "mouseup", 40, 30);
    await settle();
    store.undo();
    await settle();
    expect(store.view.blocks[A]).toBeDefined();
    expect(toolbar()).toEqual(SHOWN);
    expect(topLeft()).toEqual(before);
  });
});

describe("a frame moved in the bundle editor", () => {
  const group2 = inBlock(A, idAddress("group_2"));

  /** Block A's editor open, `group_2` selected, its drawing given a screen CTM. */
  async function editing(): Promise<void> {
    await show([]);
    open({ block: A });
    harness.select(selectionOf([group2]));
    await settle();
    // jsdom draws nothing; the drag reads only that the drawing has a screen CTM.
    withScreenMatrix(nodeOf(A).querySelector("svg") as SVGSVGElement, () => IDENTITY);
  }

  it("hides the toolbar until the release, then shows it at the stored bounds", async () => {
    await editing();
    const before = storedBox(idAddress("group_2"));
    expect(before).toEqual({ x: 48, y: 286.0390625 });
    expect(toolbar()).toEqual(SHOWN);
    expect(topLeft()).toEqual(before);
    const entries = store.entries.length;
    const frame = frameOf("group_2");
    pointer(frame, "pointerdown", 100, 200);
    pointer(frame, "pointermove", 140, 224);
    await settle();
    expect(toolbar()).toEqual(HIDDEN);
    pointer(frame, "pointerup", 140, 224);
    await settle();
    expect(store.entries).toHaveLength(entries + 1);
    expect(toolbar()).toEqual(SHOWN);
    const after = storedBox(idAddress("group_2"));
    expect(after).toEqual({ x: 848, y: 766.0390625 });
    expect(topLeft()).toEqual(after);
  });

  it("shows it at the original bounds after Escape or a cancelled pointer", async () => {
    const ends: [string, (frame: Element) => void][] = [
      [
        "Escape",
        () =>
          window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })),
      ],
      ["cancel", (frame) => pointer(frame, "pointercancel", 140, 224)],
    ];
    for (const [name, end] of ends) {
      if (mounted !== undefined) unmount(mounted);
      document.body.innerHTML = "";
      await editing();
      const before = storedBox(idAddress("group_2"));
      const entries = store.entries.length;
      const frame = frameOf("group_2");
      pointer(frame, "pointerdown", 100, 200);
      pointer(frame, "pointermove", 140, 224);
      await settle();
      expect(toolbar(), name).toEqual(HIDDEN);
      end(frame);
      await settle();
      expect(toolbar(), name).toEqual(SHOWN);
      expect(topLeft(), name).toEqual(before);
      pointer(frame, "pointerup", 140, 224);
      await settle();
      expect(store.entries, name).toHaveLength(entries);
      expect(topLeft(), name).toEqual(before);
    }
  });
});

describe("a handle's resize", () => {
  it("keeps every handle and the mode menu through the drag", async () => {
    await show([{ block: A }]);
    vi.spyOn(
      document.querySelector(".svelte-flow") as HTMLElement,
      "getBoundingClientRect",
    ).mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 1000, height: 1000 }));
    const handle = document.querySelector('[data-testid="handle-right"]');
    if (handle === null) throw new Error("no resize handle");
    pointer(handle, "pointerdown", 0, 0);
    pointer(handle, "pointermove", 60, 0);
    await settle();
    expect(toolbar()).toEqual(SHOWN);
    pointer(handle, "pointerup", 60, 0);
    await settle();
    expect(toolbar()).toEqual(SHOWN);
  });
});
