// @vitest-environment jsdom
/**
 * The canvas opens, follows and leaves editors: the gestures reach the store
 * with the targets `editorTargetOf` names, and the view moves to the edited
 * element and back. The
 * expected values are derived in `README.md` ("The canvas in an editor").
 */

import type {
  Address,
  EditorKind,
  ElementAddress,
  Facet,
  Store,
  View,
} from "@timetoalign/tilie-core";
import {
  bandAddress,
  cardAddress,
  idAddress,
  inBlock,
  partAddress,
  TITLE_ADDRESS,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import type { Viewport } from "@xyflow/svelte";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boxOf, itemOf } from "../src/boxes.ts";
import { removeCommand } from "../src/commands.ts";
import { drawingOf } from "../src/drawing.ts";
import { GRID_FREE, quantize } from "../src/numbers.ts";
import { type Selection, selectionOf } from "../src/selection.ts";
import Harness from "./CanvasHarness.svelte";
import { IDENTITY, settle, stubCanvasGlobals, withScreenMatrix } from "./dom.ts";
import { A, B, changed, load, marqueeView, metrics, mixedView, storeOf } from "./support.ts";

interface Mounted {
  current(): { selection: Selection; viewport: Viewport };
  select(next: Selection): void;
  showAt(next: Viewport): void;
}

let mounted: ReturnType<typeof mount> | undefined;
let harness: Mounted;
let store: Store;
/** How many entries the store's journal held when the case began: the blocks added. */
let stored = 0;

/** Whether the `matchMedia` stub reports reduced motion, so that every move of the view is at once. */
let reduced = true;
/** The stubbed resize observers, which a case reports a size change to (`resizeArranger`). */
let stubs: ReturnType<typeof stubCanvasGlobals>;

beforeEach(() => {
  reduced = true;
  stubs = stubCanvasGlobals(() => reduced);
});

function clear(): void {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
}

afterEach(() => {
  clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A holding `mixed` at (40, 80) and B holding `bare` at (1000, 0). */
function twoBlocks(): View {
  return changed(mixedView(), {
    type: "add",
    into: WORKSPACE,
    block: { id: B, manifest: load("bare"), x: 1000, y: 0 },
  });
}

async function show(view: View = twoBlocks()): Promise<void> {
  clear();
  store = storeOf(view);
  stored = store.journal.length;
  const instance = mount(Harness, { target: document.body, props: { store, metrics } });
  mounted = instance;
  // `tsc` reads the harness through Svelte's generic module declaration, which leaves its exports untyped.
  harness = instance as Mounted;
  await settle();
}

/** The element `element` of block A. */
const at = (element: ElementAddress): Address => inBlock(A, element);
/** The element of block A with the ID `id`: a timeline's line, a group. */
const id = (element: string): Address => at(idAddress(element));
/** The cards of `timeline` in block A. */
const card = (timeline: string): Address => at(cardAddress(timeline));
/** The band of `score` drawing `facet`, in block A. */
const scoreBand = (facet: Facet): Address => at(bandAddress("score", facet));
/** Block A itself. */
const blockA: Address = { block: A };

function open(target: Address): void {
  const refusal = store.open(target);
  if (refusal !== null) throw new Error(refusal.message);
  flushSync();
}

async function select(...addresses: Address[]): Promise<void> {
  harness.select(selectionOf(addresses));
  await settle();
}

function path(): { target: Address; kind: EditorKind }[] {
  return store.editing.map(({ target, kind }) => ({ target, kind }));
}

function arranger(): HTMLElement {
  const found = document.querySelector<HTMLElement>('[aria-label="Arranger"]');
  if (found === null) throw new Error("no arranger");
  return found;
}

function nodeOf(block: string): Element {
  const found = [...document.querySelectorAll(".svelte-flow__node[data-id]")].find(
    (node) => node.getAttribute("data-id") === block,
  );
  if (found === undefined) throw new Error(`no node ${block}`);
  return found;
}

/**
 * Whether `element` is drawn with exactly `address`: its `data-id`,
 * `data-facet` and `data-part` (the part words joined by one space, as the
 * writers write them) each equal to the address's member, and absent where
 * the address has none.
 */
function carries(element: Element, address: ElementAddress): boolean {
  return (
    element.getAttribute("data-id") === (address.id ?? null) &&
    element.getAttribute("data-facet") === (address.facet ?? null) &&
    element.getAttribute("data-part") === (address.part?.join(" ") ?? null)
  );
}

/** The last drawn element of `block` carrying `address` (a card's own rect, not its shadow). */
function drawn(address: ElementAddress, block = A): Element {
  const found = [
    ...nodeOf(block).querySelectorAll("svg [data-id], svg [data-facet], svg [data-part]"),
  ].findLast((element) => carries(element, address));
  if (found === undefined) throw new Error(`nothing drawn at ${JSON.stringify(address)}`);
  return found;
}

function background(block: string): Element {
  const found = nodeOf(block).querySelector(
    "svg rect:not([data-id]):not([data-facet]):not([data-part]):not(.tilie-mark)",
  );
  if (found === null) throw new Error(`no background in ${block}`);
  return found;
}

function pane(): Element {
  const found = document.querySelector(".svelte-flow__pane");
  if (found === null) throw new Error("no pane");
  return found;
}

async function doubleClick(target: Element, clientX = 0, clientY = 0): Promise<void> {
  target.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX, clientY }));
  await settle();
}

async function clickOn(target: Element, clientX = 0, clientY = 0): Promise<void> {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX, clientY }));
  await settle();
}

async function shiftClickOn(target: Element, clientX = 0, clientY = 0): Promise<void> {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, clientX, clientY, shiftKey: true }),
  );
  await settle();
}

/** Wait `ms` milliseconds of real time, then let the canvas settle. */
async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await settle();
}

async function press(key: string, target: EventTarget = arranger()): Promise<void> {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await settle();
}

function pointer(
  type: string,
  target: Element,
  init: PointerEventInit & { timeStamp?: number },
): void {
  const { timeStamp, ...rest } = init;
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    isPrimary: true,
    button: 0,
    pointerId: 1,
    ...rest,
  });
  if (timeStamp !== undefined) Object.defineProperty(event, "timeStamp", { value: timeStamp });
  target.dispatchEvent(event);
}

async function tap(
  target: Element,
  x: number,
  y: number,
  time: number,
  pointerType = "touch",
): Promise<void> {
  pointer("pointerdown", target, { clientX: x, clientY: y, pointerType, timeStamp: time });
  pointer("pointerup", target, { clientX: x, clientY: y, pointerType, timeStamp: time });
  await settle();
}

function measure(width: number, height: number): void {
  Object.defineProperty(arranger(), "clientWidth", { value: width, configurable: true });
  Object.defineProperty(arranger(), "clientHeight", { value: height, configurable: true });
}

function viewport(): Viewport {
  return { ...harness.current().viewport };
}

/** Measure the arranger `width` × `height` px and report the change to whatever observes its size. */
async function resizeArranger(width: number, height: number): Promise<void> {
  stubs.resize(arranger(), width, height);
  await settle();
}

function selected(): Address[] {
  return [...harness.current().selection.values()];
}

/**
 * The view at `{x: 100, y: 100, zoom: 1}` once opening the editor has moved
 * it, and the pane measured 1000 × 1000 px, so the marquee lies more than
 * Svelte Flow's 40 px edge band inside the pane and nothing pans during it.
 */
async function atZoomOne(): Promise<void> {
  await settle();
  harness.showAt({ x: 100, y: 100, zoom: 1 });
  await settle();
  vi.spyOn(pane(), "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 1000, height: 1000 }),
  );
}

describe("the canvas opens editors", () => {
  it("opens the editor of the box a double-click hits", async () => {
    const cases: [() => Element, { target: Address; kind: EditorKind }][] = [
      [() => background(A), { target: blockA, kind: "bundle" }],
      [() => drawn(idAddress("group_1")), { target: id("group_1"), kind: "group" }],
      [() => drawn(cardAddress("score")), { target: id("score"), kind: "timeline" }],
      [() => drawn(idAddress("dlt_1")), { target: id("dlt_1"), kind: "timeline" }],
    ];
    for (const [target, opened] of cases) {
      await show();
      await doubleClick(target());
      expect(path()).toEqual([opened]);
    }
    await show();
    const before = viewport();
    await doubleClick(pane());
    expect(path()).toEqual([]);
    expect(viewport()).toEqual(before);
  });

  it("opens the box holding text that a double-click hits", async () => {
    await show();
    const svg = nodeOf(A).querySelector("svg");
    if (svg === null) throw new Error("no svg");
    // Client points are drawing points: the drawing shown at its own size at (0, 0).
    withScreenMatrix(svg, () => IDENTITY);
    const textAt = async (address: ElementAddress) => {
      const text = drawn(address);
      const x = Number(text.getAttribute("x"));
      const y = Number(text.getAttribute("y"));
      await doubleClick(text, x, y);
    };
    await textAt(partAddress(idAddress("score"), "name"));
    expect(path()).toEqual([{ target: id("score"), kind: "timeline" }]);
    store.done();
    await settle();
    await textAt(partAddress(idAddress("group_1"), "name"));
    expect(path()).toEqual([{ target: id("group_1"), kind: "group" }]);
    store.done();
    await settle();
    await textAt(TITLE_ADDRESS);
    expect(path()).toEqual([]);
  });

  it("opens nothing on the edited element, and an inside box on top", async () => {
    await show();
    open(blockA);
    await doubleClick(background(A));
    expect(path()).toEqual([{ target: blockA, kind: "bundle" }]);
    store.done();
    open(id("group_1"));
    await settle();
    await doubleClick(drawn(idAddress("group_1")));
    expect(path()).toEqual([{ target: id("group_1"), kind: "group" }]);
    await doubleClick(drawn(cardAddress("score")));
    expect(path()).toEqual([
      { target: id("group_1"), kind: "group" },
      { target: id("score"), kind: "timeline" },
    ]);
  });

  it("opens the editor of the single selected address on Enter", async () => {
    const opened: [Address, { target: Address; kind: EditorKind }][] = [
      [id("group_1"), { target: id("group_1"), kind: "group" }],
      [card("score"), { target: id("score"), kind: "timeline" }],
      [blockA, { target: blockA, kind: "bundle" }],
    ];
    for (const [address, editor] of opened) {
      await show();
      await select(address);
      await press("Enter");
      expect(path()).toEqual([editor]);
    }
    await show();
    await select(at(partAddress(idAddress("score"), "start")));
    await press("Enter");
    await select(id("group_1"), id("group_2"));
    await press("Enter");
    expect(path()).toEqual([]);
    open(id("group_1"));
    await select(id("group_1"));
    await press("Enter");
    expect(path()).toEqual([{ target: id("group_1"), kind: "group" }]);
  });

  it("opens an editor on two taps within 300 ms and 10 px on one target", async () => {
    await show();
    await tap(drawn(idAddress("group_1")), 100, 100, 1000);
    await tap(drawn(idAddress("group_1")), 105, 105, 1250);
    expect(path()).toEqual([{ target: id("group_1"), kind: "group" }]);

    await show();
    await tap(drawn(idAddress("group_1")), 100, 100, 1000);
    await tap(drawn(idAddress("group_1")), 100, 100, 1301);
    await tap(drawn(idAddress("group_1")), 100, 100, 2000);
    await tap(drawn(idAddress("group_1")), 111, 100, 2100);
    await tap(drawn(idAddress("group_1")), 100, 100, 3000);
    await tap(drawn(idAddress("group_2")), 100, 100, 3100);
    await tap(drawn(idAddress("group_1")), 100, 100, 4000, "mouse");
    await tap(drawn(idAddress("group_1")), 100, 100, 4100, "mouse");
    expect(path()).toEqual([]);
  });
});

describe("a double-click outside the edited element", () => {
  it("closes the innermost editor, as Done does", async () => {
    await show();
    open(blockA);
    await doubleClick(pane());
    expect(path()).toEqual([]);

    open(blockA);
    open(id("group_1"));
    await settle();
    await doubleClick(background(B));
    expect(path()).toEqual([{ target: blockA, kind: "bundle" }]);
    await doubleClick(background(B));
    expect(path()).toEqual([]);

    open(id("group_1"));
    await settle();
    await doubleClick(drawn(cardAddress("page")));
    expect(path()).toEqual([]);
    open(id("group_1"));
    await settle();
    await doubleClick(background(A));
    expect(path()).toEqual([]);
    expect(store.journal).toHaveLength(stored);
  });

  it("keeps the editor on the edited element, and opens an editor inside it", async () => {
    await show();
    open(id("group_1"));
    await settle();
    await doubleClick(drawn(idAddress("group_1")));
    expect(path()).toEqual([{ target: id("group_1"), kind: "group" }]);
    await doubleClick(drawn(cardAddress("performance")));
    expect(path()).toEqual([
      { target: id("group_1"), kind: "group" },
      { target: id("performance"), kind: "timeline" },
    ]);
  });

  it("returns the view to where the closed level was entered from", async () => {
    await show();
    harness.showAt({ x: 12, y: -34, zoom: 0.5 });
    await settle();
    measure(10000, 10000);
    await doubleClick(drawn(idAddress("group_1")));
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4226.3125, zoom: 4 });
    await doubleClick(pane());
    expect(path()).toEqual([]);
    expect(viewport()).toEqual({ x: 12, y: -34, zoom: 0.5 });
  });

  it("closes the innermost editor on a double tap, once", async () => {
    await show();
    open(blockA);
    open(id("group_1"));
    await settle();
    await tap(pane(), 50, 50, 1000);
    await tap(pane(), 55, 55, 1250);
    expect(path()).toEqual([{ target: blockA, kind: "bundle" }]);
    // The double-click a browser may derive from the two taps closes nothing more.
    await doubleClick(pane(), 55, 55);
    expect(path()).toEqual([{ target: blockA, kind: "bundle" }]);
    await tap(pane(), 50, 50, 2000);
    await tap(pane(), 50, 50, 2301);
    expect(path()).toEqual([{ target: blockA, kind: "bundle" }]);
  });

  it("does nothing on the arranger", async () => {
    await show();
    await select(id("group_1"));
    await doubleClick(pane());
    expect(path()).toEqual([]);
    expect(store.journal).toHaveLength(stored);
  });
});

describe("the canvas leaves editors", () => {
  it("aborts the gesture, then clears the selection, then closes the editor on Escape", async () => {
    await show();
    open(id("group_1"));
    await select(id("group_1"));
    const handle = document.querySelector('[data-testid="handle-right"]');
    if (handle === null) throw new Error("no resize handle");
    pointer("pointerdown", handle, { clientX: 0, clientY: 0, pointerType: "mouse" });
    pointer("pointermove", handle, { clientX: 20, clientY: 0, pointerType: "mouse" });
    await settle();
    await press("Escape");
    expect(store.entries).toEqual([]);
    expect(selected()).toEqual([id("group_1")]);
    expect(path()).toEqual([{ target: id("group_1"), kind: "group" }]);
    await press("Escape");
    expect(selected()).toEqual([]);
    expect(path()).toEqual([{ target: id("group_1"), kind: "group" }]);
    await press("Escape");
    expect(path()).toEqual([]);
  });

  it("aborts an item drag before it clears the selection on Escape", async () => {
    await show();
    open(blockA);
    await select(id("group_2"));
    const frame = drawn(idAddress("group_2"));
    // jsdom draws nothing; the drag reads only that the drawing has a screen CTM.
    withScreenMatrix(nodeOf(A).querySelector("svg") as SVGSVGElement, () => IDENTITY);
    pointer("pointerdown", frame, { clientX: 100, clientY: 200, pointerType: "mouse" });
    pointer("pointermove", frame, { clientX: 140, clientY: 224, pointerType: "mouse" });
    await settle();
    await press("Escape");
    expect(selected()).toEqual([id("group_2")]);
    expect(path()).toEqual([{ target: blockA, kind: "bundle" }]);
    pointer("pointerup", frame, { clientX: 140, clientY: 224, pointerType: "mouse" });
    await settle();
    expect(store.entries).toEqual([]);
    expect(store.view.blocks[A]?.places).toEqual({});
    await press("Escape");
    expect(selected()).toEqual([]);
    expect(path()).toEqual([{ target: blockA, kind: "bundle" }]);
    await press("Escape");
    expect(path()).toEqual([]);
  });

  it("moves the view to the edited element and back to where each level was", async () => {
    await show();
    harness.showAt({ x: 12, y: -34, zoom: 0.5 });
    await settle();
    measure(10000, 10000);
    await doubleClick(drawn(idAddress("group_1")));
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4226.3125, zoom: 4 });
    await doubleClick(drawn(cardAddress("score")));
    expect(path().map(({ target }) => target)).toEqual([id("group_1"), id("score")]);
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4307.65625, zoom: 4 });
    await press("Escape");
    expect(path().map(({ target }) => target)).toEqual([id("group_1")]);
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4226.3125, zoom: 4 });
    await press("Escape");
    expect(path()).toEqual([]);
    expect(viewport()).toEqual({ x: 12, y: -34, zoom: 0.5 });
  });
});

describe("the surroundings of an editor", () => {
  function classes(block: string): { selectable: boolean; draggable: boolean; outside: boolean } {
    const list = nodeOf(block).classList;
    return {
      selectable: list.contains("selectable"),
      draggable: list.contains("draggable"),
      outside: list.contains("tilie-outside"),
    };
  }

  it("are neither selectable nor draggable, a press there changes nothing, the pane clears", async () => {
    await show();
    expect(classes(A)).toEqual({ selectable: true, draggable: true, outside: false });
    expect(classes(B)).toEqual({ selectable: true, draggable: true, outside: false });
    open(blockA);
    await atZoomOne();
    expect(classes(A)).toEqual({ selectable: true, draggable: false, outside: false });
    expect(classes(B)).toEqual({ selectable: false, draggable: false, outside: true });
    await select(id("group_1"));
    await shiftClickOn(background(B));
    expect(selected()).toEqual([id("group_1")]);
    await clickOn(background(B));
    expect(selected()).toEqual([]);
    await select(id("group_1"));
    await clickOn(pane(), 1110, 110);
    expect(selected()).toEqual([]);
    await select(id("group_1"));
    await shiftClickOn(pane(), 50, 50);
    expect(selected()).toEqual([id("group_1")]);
    await clickOn(pane(), 50, 50);
    expect(selected()).toEqual([]);
    store.done();
    open(id("group_1"));
    await settle();
    await clickOn(drawn(cardAddress("score")));
    expect(selected()).toEqual([card("score")]);
    await shiftClickOn(drawn(idAddress("group_2")));
    expect(selected()).toEqual([card("score")]);
    await clickOn(drawn(idAddress("group_2")));
    expect(selected()).toEqual([]);
    expect(path()).toEqual([{ target: id("group_1"), kind: "group" }]);
  });

  /**
   * A Shift+drag marquee on the pane between the canvas points (x0, y0) and
   * (x1, y1), given as the client points the canvas shows them at.
   */
  async function marqueeFrom(x0: number, y0: number, x1: number, y1: number): Promise<void> {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", shiftKey: true }));
    await settle();
    const on = pane();
    const { x, y, zoom } = viewport();
    [x0, y0, x1, y1] = [x0 * zoom + x, y0 * zoom + y, x1 * zoom + x, y1 * zoom + y];
    pointer("pointerdown", on, { clientX: x0, clientY: y0, shiftKey: true, pointerType: "mouse" });
    pointer("pointermove", on, { clientX: x1, clientY: y1, shiftKey: true, pointerType: "mouse" });
    pointer("pointerup", on, { clientX: x1, clientY: y1, shiftKey: true, pointerType: "mouse" });
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift" }));
    await settle();
  }

  it("select by marquee only the elements inside the edited element", async () => {
    await show(marqueeView());
    open(id("dlt_1"));
    await atZoomOne();
    await marqueeFrom(40, 410, 640, 496.25);
    expect(selected()).toEqual([
      id("cmap_7"),
      id("dlt_1"),
      at(partAddress(idAddress("dlt_1"), "name")),
    ]);
    store.done();
    open(id("group_1"));
    await atZoomOne();
    await marqueeFrom(40, 410, 640, 496.25);
    expect(selected()).toEqual([]);
  });

  it("show a refusal of the store in the status line", async () => {
    await show();
    open(id("group_1"));
    await select(id("annotations"));
    const before = store.view;
    const command = removeCommand(before, selectionOf([id("annotations")]), null);
    const twin = storeOf(twoBlocks());
    twin.open(id("group_1"));
    const refusal = twin.dispatch(command);
    expect(refusal?.code).toBe("side_effect");
    await press("Delete");
    expect(document.querySelector('[data-testid="hint"]')?.textContent).toBe(refusal?.message);
    expect(store.view).toBe(before);
  });

  it("show the refusal to delete the edited element in the status line", async () => {
    await show();
    open(id("group_1"));
    await select(id("group_1"));
    const [before, entries] = [store.view, store.journal.length];
    await press("Delete");
    expect(document.querySelector('[data-testid="hint"]')?.textContent).toBe(
      "Close its editor to delete the edited element.",
    );
    expect(store.view).toBe(before);
    expect(store.journal).toHaveLength(entries);
    expect(selected()).toEqual([id("group_1")]);
  });
});

describe("the view while it moves", () => {
  it("returns a level opened during a move to where that move was heading", async () => {
    reduced = false;
    await show();
    harness.showAt({ x: 12, y: -34, zoom: 0.5 });
    await settle();
    measure(10000, 10000);
    await doubleClick(drawn(idAddress("group_1")));
    await doubleClick(drawn(cardAddress("score")));
    expect(path().map(({ target }) => target)).toEqual([id("group_1"), id("score")]);
    await wait(1100);
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4307.65625, zoom: 4 });
    await press("Escape");
    await wait(1100);
    expect(path().map(({ target }) => target)).toEqual([id("group_1")]);
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4226.3125, zoom: 4 });
  });
});

describe("a double-click on the edited element", () => {
  for (const motion of ["reduced", "full"] as const) {
    it(`centres the view on it again as opening did, with ${motion} motion`, async () => {
      reduced = motion === "reduced";
      await show();
      harness.showAt({ x: 12, y: -34, zoom: 0.5 });
      await settle();
      measure(10000, 10000);
      await doubleClick(drawn(idAddress("group_1")));
      await wait(reduced ? 0 : 1100);
      expect(viewport()).toEqual({ x: 3683.03076171875, y: 4226.3125, zoom: 4 });
      harness.showAt({ x: 5, y: 6, zoom: 1 });
      await settle();
      await doubleClick(drawn(idAddress("group_1")));
      await wait(reduced ? 0 : 1100);
      expect(viewport()).toEqual({ x: 3683.03076171875, y: 4226.3125, zoom: 4 });
      expect(path()).toEqual([{ target: id("group_1"), kind: "group" }]);
      expect(store.journal).toHaveLength(stored);
    });
  }
});

describe("the view when the canvas changes size", () => {
  it("centres the edited element again for the new size", async () => {
    await show();
    harness.showAt({ x: 12, y: -34, zoom: 0.5 });
    await settle();
    measure(10000, 10000);
    await doubleClick(drawn(idAddress("group_1")));
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4226.3125, zoom: 4 });
    await resizeArranger(6000, 10000);
    expect(viewport()).toEqual({ x: 1683.03076171875, y: 4226.3125, zoom: 4 });
    harness.showAt({ x: 5, y: 6, zoom: 1 });
    await settle();
    await resizeArranger(6000, 10000);
    expect(viewport()).toEqual({ x: 5, y: 6, zoom: 1 });
    await resizeArranger(10000, 10000);
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4226.3125, zoom: 4 });
    await press("Escape");
    expect(path()).toEqual([]);
    expect(viewport()).toEqual({ x: 12, y: -34, zoom: 0.5 });
    await resizeArranger(6000, 10000);
    expect(viewport()).toEqual({ x: 12, y: -34, zoom: 0.5 });
  });
});

describe("the resize toolbar in an editor", () => {
  function modes(): string[] {
    return [...document.querySelectorAll("button[data-testid^='mode-']")].map(
      (button) => button.textContent ?? "",
    );
  }

  it("offers the modes the level allows", async () => {
    const three = ["Scale", "Box", "Stretch"];
    const offered = async (address: Address) => {
      await select(address);
      return modes();
    };
    await show();
    for (const address of [blockA, id("group_2"), card("score"), card("annotations")]) {
      expect(await offered(address)).toEqual(three);
    }
    expect(await offered(id("score"))).toEqual([]);
    open(blockA);
    await settle();
    for (const address of [blockA, id("group_2"), card("score")]) {
      expect(await offered(address)).toEqual(three);
    }
    store.done();
    open(id("group_1"));
    expect(await offered(id("group_1"))).toEqual(three);
    expect(await offered(card("score"))).toEqual(three);
    store.done();
    open(id("annotations"));
    expect(await offered(card("annotations"))).toEqual(three);
    store.done();
    open(id("score"));
    expect(await offered(card("score"))).toEqual(three);
    store.done();
    open(id("recording"));
    expect(await offered(card("excerpt"))).toEqual([]);
    store.done();
    open(id("dlt_1"));
    expect(await offered(id("dlt_1"))).toEqual([]);
  });

  it("resizes a frame the arranger's click selects, in one set that moves nothing else", async () => {
    await show();
    await atZoomOne();
    await clickOn(drawn(idAddress("group_1")));
    expect(selected()).toEqual([id("group_1")]);
    expect(document.querySelectorAll("[data-testid^='handle-']")).toHaveLength(8);
    const before = store.view.blocks[A];
    if (before === undefined) throw new Error("no block A");
    const drawing = drawingOf(before, store.view.settings, metrics);
    const place = (item: string) => itemOf(drawing, { item }).item.place;
    const handle = document.querySelector('[data-testid="handle-right"]');
    if (handle === null) throw new Error("no resize handle");
    pointer("pointerdown", handle, { clientX: 0, clientY: 0, pointerType: "mouse" });
    pointer("pointermove", handle, { clientX: 60, clientY: 0, pointerType: "mouse" });
    pointer("pointerup", handle, { clientX: 60, clientY: 0, pointerType: "mouse" });
    await settle();
    expect(store.journal).toHaveLength(stored + 1);
    expect(store.entries).toEqual(store.journal);
    const entry = store.journal.at(-1);
    const { x: x2, y: y2 } = place("group_2");
    const { x: x3, y: y3 } = place("annotations");
    expect(entry !== undefined && "command" in entry ? entry.command : null).toEqual({
      type: "set",
      changes: [
        {
          target: id("group_1"),
          values: { place: { width: quantize(place("group_1").width + 60, GRID_FREE) } },
        },
        { target: id("group_2"), values: { place: { x: x2, y: y2 } } },
        { target: id("annotations"), values: { place: { x: x3, y: y3 } } },
      ],
    });
    store.undo();
    expect(store.view.blocks[A]).toStrictEqual(before);
  });

  it("resizes the edited block itself in the bundle editor, as on the arranger", async () => {
    await show();
    open(blockA);
    await atZoomOne();
    await select(blockA);
    const before = store.view.blocks[A];
    if (before === undefined) throw new Error("no block A");
    const { width } = drawingOf(before, store.view.settings, metrics);
    const handle = document.querySelector('[data-testid="handle-right"]');
    if (handle === null) throw new Error("no resize handle");
    pointer("pointerdown", handle, { clientX: 0, clientY: 0, pointerType: "mouse" });
    pointer("pointermove", handle, { clientX: 60, clientY: 0, pointerType: "mouse" });
    pointer("pointerup", handle, { clientX: 60, clientY: 0, pointerType: "mouse" });
    await settle();
    expect(store.entries).toHaveLength(1);
    expect(store.view.blocks[A]?.width).toBe(quantize(width + 60, GRID_FREE));
  });

  /** The transform placing the mode menu, as its element carries it. */
  function menuTransform(): string {
    const menu = document.querySelector('[role="toolbar"][aria-label="Resize mode"]');
    const placed = menu?.parentElement;
    if (placed == null) throw new Error("no mode menu");
    return placed.style.transform;
  }

  /** Block `id`'s node position on the canvas, from the transform Svelte Flow gives its element. */
  function nodePositionOf(block: string): { x: number; y: number } {
    const match = /translate\((-?[\d.]+)px, *(-?[\d.]+)px\)/.exec(
      (nodeOf(block) as HTMLElement).style.transform,
    );
    if (match === null) throw new Error(`node ${block} has no position`);
    return { x: Number(match[1]), y: Number(match[2]) };
  }

  /**
   * The transform that centres the menu above the canvas box `box` and keeps
   * its bottom 10 screen pixels clear of the box's top at the current
   * viewport: the screen point of the box's top centre, less 10 px upwards,
   * then the menu moved left by half its width and up by its height.
   */
  function above(box: { x: number; y: number; width: number }): string {
    const { x, y, zoom } = viewport();
    const centre = (box.x + box.width / 2) * zoom + x;
    const top = box.y * zoom + y - 10;
    return `translate(${centre}px, ${top}px) translate(-50%, -100%)`;
  }

  /**
   * The canvas box of the frame or card `address` of block A as stored: its
   * rectangle in the block's drawing (exact; the drawn `rect` rounds its
   * attributes), placed at the node's position at the block's scale.
   */
  function drawnBox(address: ElementAddress): { x: number; y: number; width: number } {
    const block = store.view.blocks[A];
    if (block === undefined) throw new Error("no block A");
    const rect = boxOf(drawingOf(block, store.view.settings, metrics), address);
    if (rect === undefined) throw new Error(`no box ${JSON.stringify(address)}`);
    const at = nodePositionOf(A);
    return {
      x: at.x + rect.x * block.scale,
      y: at.y + rect.y * block.scale,
      width: rect.width * block.scale,
    };
  }

  it("sits above the selected item, not above its block, and follows it", async () => {
    await show();
    open(blockA);
    await atZoomOne();
    await select(id("group_2"));
    const before = drawnBox(idAddress("group_2"));
    expect(menuTransform()).toBe(above(before));
    expect(above(before)).not.toBe(above({ ...nodePositionOf(A), width: 0 }));

    harness.showAt({ x: -20, y: 30, zoom: 2 });
    await settle();
    expect(menuTransform()).toBe(above(drawnBox(idAddress("group_2"))));

    harness.showAt({ x: 100, y: 100, zoom: 1 });
    await settle();
    const handle = document.querySelector('[data-testid="handle-right"]');
    if (handle === null) throw new Error("no resize handle");
    pointer("pointerdown", handle, { clientX: 0, clientY: 0, pointerType: "mouse" });
    pointer("pointermove", handle, { clientX: 60, clientY: 0, pointerType: "mouse" });
    pointer("pointerup", handle, { clientX: 60, clientY: 0, pointerType: "mouse" });
    await settle();
    const resized = drawnBox(idAddress("group_2"));
    expect(resized.width).not.toBe(before.width);
    expect(menuTransform()).toBe(above(resized));

    // jsdom draws nothing; the drag reads only that the drawing has a screen CTM.
    withScreenMatrix(nodeOf(A).querySelector("svg") as SVGSVGElement, () => IDENTITY);
    const frame = drawn(idAddress("group_2"));
    pointer("pointerdown", frame, { clientX: 100, clientY: 200, pointerType: "mouse" });
    pointer("pointermove", frame, { clientX: 140, clientY: 224, pointerType: "mouse" });
    pointer("pointerup", frame, { clientX: 140, clientY: 224, pointerType: "mouse" });
    await settle();
    const moved = drawnBox(idAddress("group_2"));
    expect(moved.x).not.toBe(resized.x);
    expect(menuTransform()).toBe(above(moved));

    store.done();
    open(id("annotations"));
    await select(card("annotations"));
    expect(menuTransform()).toBe(above(drawnBox(cardAddress("annotations"))));
  });

  it("sits above the selected block on the arranger", async () => {
    await show();
    await atZoomOne();
    await select(blockA);
    const svg = nodeOf(A).querySelector("svg");
    const [, , width = 0] = (svg?.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const scale = store.view.blocks[A]?.scale ?? 1;
    expect(menuTransform()).toBe(above({ ...nodePositionOf(A), width: width * scale }));
  });
});

describe("the canvas and the bands of the edited timeline", () => {
  /** `score`'s band order with its markers band moved just above its line. */
  const MOVED = ["children", "conversion_maps", "markers", "line", "regions", "flow_control"];

  /**
   * `{block: A, id: "score"}`'s timeline editor open, A's `<svg>` shown at client (0, 0) at
   * the drawing's own size, so a client point is a drawing point.
   */
  async function inScoresEditor(): Promise<void> {
    await show();
    open(id("score"));
    await settle();
    const svg = nodeOf(A).querySelector("svg");
    if (svg === null) throw new Error("no svg");
    withScreenMatrix(svg, () => IDENTITY);
  }

  /** The middle of the record of `score`'s band `address` in A's drawing as layout draws it. */
  function middleOf(facet: Facet): { x: number; y: number } {
    const block = store.view.blocks[A];
    if (block === undefined) throw new Error("no block A");
    const address = bandAddress("score", facet);
    const band = boxOf(drawingOf(block, store.view.settings, metrics), address);
    if (band === undefined) throw new Error(`score's ${facet} band is not drawn`);
    return { x: band.x + band.width / 2, y: band.y + band.height / 2 };
  }

  /** A keydown with Ctrl (or with Meta, Cmd on macOS) on the arranger: whether it was consumed. */
  async function stepped(key: "ArrowUp" | "ArrowDown", meta = false): Promise<boolean> {
    const event = new KeyboardEvent("keydown", {
      key,
      ctrlKey: !meta,
      metaKey: meta,
      bubbles: true,
      cancelable: true,
    });
    arranger().dispatchEvent(event);
    await settle();
    return event.defaultPrevented;
  }

  function scoreOrder(): unknown {
    return store.view.blocks[A]?.manifest.graphical?.order?.score;
  }

  it("selects a band by a click, which opens and closes nothing, also on a locked canvas", async () => {
    await inScoresEditor();
    const { x, y } = middleOf("markers");
    await clickOn(drawn(cardAddress("score")), x, y);
    expect(selected()).toEqual([scoreBand("markers")]);
    await press("Enter");
    expect(path()).toEqual([{ target: id("score"), kind: "timeline" }]);
    await doubleClick(drawn(cardAddress("score")), x, y);
    expect(path()).toEqual([{ target: id("score"), kind: "timeline" }]);
    await select();
    await press("l");
    await clickOn(drawn(cardAddress("score")), x, y);
    expect(selected()).toEqual([scoreBand("markers")]);
  });

  it("steps the selected band past the next visible entry with Ctrl or Cmd and an arrow", async () => {
    await inScoresEditor();
    await select(scoreBand("markers"));
    expect(await stepped("ArrowUp")).toBe(true);
    expect(store.entries).toHaveLength(1);
    expect(scoreOrder()).toEqual(MOVED);
    expect(await stepped("ArrowDown", true)).toBe(true);
    expect(store.entries).toHaveLength(2);
    expect(Object.hasOwn(store.view.blocks[A]?.manifest.graphical?.order ?? {}, "score")).toBe(
      false,
    );
    expect(selected()).toEqual([scoreBand("markers")]);
  });

  it("consumes the key whenever a band is selected, and stores nothing it cannot step", async () => {
    await inScoresEditor();
    await select(scoreBand("conversion_maps"));
    expect(await stepped("ArrowUp")).toBe(true);
    await select(scoreBand("markers"), scoreBand("flow_control"));
    expect(await stepped("ArrowUp")).toBe(true);
    await select(scoreBand("markers"));
    await press("l");
    expect(await stepped("ArrowUp")).toBe(true);
    expect(store.entries).toEqual([]);
    expect(scoreOrder()).toBeUndefined();
    await press("l");
    await select(at(partAddress(idAddress("score"), "name")));
    expect(await stepped("ArrowUp")).toBe(false);
  });
});
