// @vitest-environment jsdom
/**
 * The canvas opens, follows and leaves editors: the gestures reach the store
 * with the targets `editorTargetOf` names, the selection is pruned to the
 * opened editor, and the view moves to the edited element and back. The
 * expected values are derived in `README.md` ("The canvas in an editor").
 */

import type { Store, View } from "@timetoalign/tilie-core";
import { createStore } from "@timetoalign/tilie-core";
import type { RectElement } from "@timetoalign/tilie-layout";
import type { Viewport } from "@xyflow/svelte";
import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { removeCommand } from "../src/commands.ts";
import { drawingOf } from "../src/drawing.ts";
import { GRID_FREE, quantize } from "../src/numbers.ts";
import type { Selection } from "../src/selection.ts";
import Harness from "./CanvasHarness.svelte";
import { A, B, changed, load, metrics, mixedView } from "./support.ts";

interface Mounted {
  current(): { selection: Selection; viewport: Viewport };
  select(next: Selection): void;
  showAt(next: Viewport): void;
}

let mounted: ReturnType<typeof mount> | undefined;
let harness: Mounted;
let store: Store;

/** Whether the `matchMedia` stub reports reduced motion, so that every move of the view is at once. */
let reduced = true;

/**
 * Every `ResizeObserver` made in this file, with the elements it observes, so
 * that a case can report a size change (`resizeArranger`). Kept across cases:
 * Svelte observes element sizes through one observer, made once per module.
 */
const observers = new Set<{ callback: ResizeObserverCallback; targets: Set<Element> }>();

beforeEach(() => {
  reduced = true;
  // Svelte Flow measures its pane and reads media queries; every query but reduced motion fails.
  vi.stubGlobal(
    "matchMedia",
    (media: string): Partial<MediaQueryList> => ({
      matches: reduced && media === "(prefers-reduced-motion: reduce)",
      media,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly #observed: { callback: ResizeObserverCallback; targets: Set<Element> };
      constructor(callback: ResizeObserverCallback) {
        this.#observed = { callback, targets: new Set() };
        observers.add(this.#observed);
      }
      observe(target: Element) {
        this.#observed.targets.add(target);
      }
      unobserve(target: Element) {
        this.#observed.targets.delete(target);
      }
      disconnect() {
        this.#observed.targets.clear();
      }
    },
  );
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
    into: "workspace",
    block: { id: B, manifest: load("bare"), x: 1000, y: 0 },
  });
}

/** The view of section "Marquee inside an editor": `mixed` with `region_1` on `dlt_1`. */
function withRegion(): View {
  return changed(mixedView(), {
    type: "add",
    into: `${A}/dlt_1`,
    region: { id: "region_1", name: "A", start: 0, end: 10 },
  });
}

async function settle(): Promise<void> {
  flushSync();
  await tick();
  flushSync();
  await tick();
  flushSync();
}

async function show(view: View = twoBlocks()): Promise<void> {
  clear();
  store = createStore({ view, journal: [], sessions: {} });
  mounted = mount(Harness, { target: document.body, props: { store, metrics } });
  harness = mounted as unknown as Mounted;
  await settle();
}

function open(target: string): void {
  const refusal = store.open(target);
  if (refusal !== null) throw new Error(refusal.message);
  flushSync();
}

async function select(...addresses: string[]): Promise<void> {
  harness.select(new Set(addresses));
  await settle();
}

function path(): { target: string; kind: string }[] {
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

/** The last drawn element of `block` carrying `address` (a card's own rect, not its shadow). */
function drawn(address: string, block = A): Element {
  const found = [...nodeOf(block).querySelectorAll("[data-address]")].findLast(
    (element) => element.getAttribute("data-address") === address,
  );
  if (found === undefined) throw new Error(`nothing drawn at ${address}`);
  return found;
}

function background(block: string): Element {
  const found = nodeOf(block).querySelector("svg rect:not([data-address])");
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
  measure(width, height);
  const target = arranger();
  for (const { callback, targets } of observers) {
    if (targets.has(target)) {
      callback([{ target } as unknown as ResizeObserverEntry], {} as ResizeObserver);
    }
  }
  await settle();
}

function selected(): string[] {
  return [...harness.current().selection];
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
    const cases: [() => Element, { target: string; kind: string }][] = [
      [() => background(A), { target: A, kind: "bundle" }],
      [() => drawn("group_1"), { target: `${A}/group_1`, kind: "group" }],
      [() => drawn("score/card"), { target: `${A}/score`, kind: "timeline" }],
      [() => drawn("dlt_1"), { target: `${A}/dlt_1`, kind: "timeline" }],
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
    const [, , width = 0, height = 0] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
    // Client points are drawing points: the drawing shown at its own size at (0, 0).
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 0, y: 0, width, height }),
    );
    const textAt = async (address: string) => {
      const text = drawn(address);
      const x = Number(text.getAttribute("x"));
      const y = Number(text.getAttribute("y"));
      await doubleClick(text, x, y);
    };
    await textAt("score/name");
    expect(path()).toEqual([{ target: `${A}/score`, kind: "timeline" }]);
    store.done();
    await settle();
    await textAt("group_1/name");
    expect(path()).toEqual([{ target: `${A}/group_1`, kind: "group" }]);
    store.done();
    await settle();
    await textAt("name");
    expect(path()).toEqual([]);
  });

  it("opens nothing on the edited element, and an inside box on top", async () => {
    await show();
    open(A);
    await doubleClick(background(A));
    expect(path()).toEqual([{ target: A, kind: "bundle" }]);
    store.done();
    open(`${A}/group_1`);
    await settle();
    await doubleClick(drawn("group_1"));
    expect(path()).toEqual([{ target: `${A}/group_1`, kind: "group" }]);
    await doubleClick(drawn("score/card"));
    expect(path()).toEqual([
      { target: `${A}/group_1`, kind: "group" },
      { target: `${A}/score`, kind: "timeline" },
    ]);
  });

  it("opens the editor of the single selected address on Enter", async () => {
    const opened: [string, { target: string; kind: string }][] = [
      [`${A}/group_1`, { target: `${A}/group_1`, kind: "group" }],
      [`${A}/score/card`, { target: `${A}/score`, kind: "timeline" }],
      [A, { target: A, kind: "bundle" }],
    ];
    for (const [address, editor] of opened) {
      await show();
      await select(address);
      await press("Enter");
      expect(path()).toEqual([editor]);
    }
    await show();
    await select(`${A}/score/start`);
    await press("Enter");
    await select(`${A}/group_1`, `${A}/group_2`);
    await press("Enter");
    expect(path()).toEqual([]);
    open(`${A}/group_1`);
    await select(`${A}/group_1`);
    await press("Enter");
    expect(path()).toEqual([{ target: `${A}/group_1`, kind: "group" }]);
  });

  it("opens an editor on two taps within 300 ms and 10 px on one target", async () => {
    await show();
    await tap(drawn("group_1"), 100, 100, 1000);
    await tap(drawn("group_1"), 105, 105, 1250);
    expect(path()).toEqual([{ target: `${A}/group_1`, kind: "group" }]);

    await show();
    await tap(drawn("group_1"), 100, 100, 1000);
    await tap(drawn("group_1"), 100, 100, 1301);
    await tap(drawn("group_1"), 100, 100, 2000);
    await tap(drawn("group_1"), 111, 100, 2100);
    await tap(drawn("group_1"), 100, 100, 3000);
    await tap(drawn("group_2"), 100, 100, 3100);
    await tap(drawn("group_1"), 100, 100, 4000, "mouse");
    await tap(drawn("group_1"), 100, 100, 4100, "mouse");
    expect(path()).toEqual([]);
  });
});

describe("a double-click outside the edited element", () => {
  it("closes the innermost editor, as Done does", async () => {
    await show();
    open(A);
    await doubleClick(pane());
    expect(path()).toEqual([]);

    open(A);
    open(`${A}/group_1`);
    await settle();
    await doubleClick(background(B));
    expect(path()).toEqual([{ target: A, kind: "bundle" }]);
    await doubleClick(background(B));
    expect(path()).toEqual([]);

    open(`${A}/group_1`);
    await settle();
    await doubleClick(drawn("page/card"));
    expect(path()).toEqual([]);
    open(`${A}/group_1`);
    await settle();
    await doubleClick(background(A));
    expect(path()).toEqual([]);
    expect(store.journal).toEqual([]);
  });

  it("keeps the editor on the edited element, and opens an editor inside it", async () => {
    await show();
    open(`${A}/group_1`);
    await settle();
    await doubleClick(drawn("group_1"));
    expect(path()).toEqual([{ target: `${A}/group_1`, kind: "group" }]);
    await doubleClick(drawn("performance/card"));
    expect(path()).toEqual([
      { target: `${A}/group_1`, kind: "group" },
      { target: `${A}/performance`, kind: "timeline" },
    ]);
  });

  it("returns the view to where the closed level was entered from", async () => {
    await show();
    harness.showAt({ x: 12, y: -34, zoom: 0.5 });
    await settle();
    measure(10000, 10000);
    await doubleClick(drawn("group_1"));
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4285.65625, zoom: 4 });
    await doubleClick(pane());
    expect(path()).toEqual([]);
    expect(viewport()).toEqual({ x: 12, y: -34, zoom: 0.5 });
  });

  it("closes the innermost editor on a double tap, once", async () => {
    await show();
    open(A);
    open(`${A}/group_1`);
    await settle();
    await tap(pane(), 50, 50, 1000);
    await tap(pane(), 55, 55, 1250);
    expect(path()).toEqual([{ target: A, kind: "bundle" }]);
    // The double-click a browser may derive from the two taps closes nothing more.
    await doubleClick(pane(), 55, 55);
    expect(path()).toEqual([{ target: A, kind: "bundle" }]);
    await tap(pane(), 50, 50, 2000);
    await tap(pane(), 50, 50, 2301);
    expect(path()).toEqual([{ target: A, kind: "bundle" }]);
  });

  it("does nothing on the arranger", async () => {
    await show();
    await select(`${A}/group_1`);
    await doubleClick(pane());
    expect(path()).toEqual([]);
    expect(store.journal).toEqual([]);
  });
});

describe("the canvas leaves editors", () => {
  it("aborts the gesture, then clears the selection, then closes the editor on Escape", async () => {
    // jsdom has no pointer capture, which a resize handle takes on its press (installed once).
    const element = Element.prototype as Partial<Element>;
    element.setPointerCapture ??= () => {};
    element.releasePointerCapture ??= () => {};
    await show();
    open(`${A}/group_1`);
    await select(`${A}/group_1`);
    const handle = document.querySelector('[data-testid="handle-right"]');
    if (handle === null) throw new Error("no resize handle");
    pointer("pointerdown", handle, { clientX: 0, clientY: 0, pointerType: "mouse" });
    pointer("pointermove", handle, { clientX: 20, clientY: 0, pointerType: "mouse" });
    await settle();
    await press("Escape");
    expect(store.entries).toEqual([]);
    expect(selected()).toEqual([`${A}/group_1`]);
    expect(path()).toEqual([{ target: `${A}/group_1`, kind: "group" }]);
    await press("Escape");
    expect(selected()).toEqual([]);
    expect(path()).toEqual([{ target: `${A}/group_1`, kind: "group" }]);
    await press("Escape");
    expect(path()).toEqual([]);
  });

  it("aborts an item drag before it clears the selection on Escape", async () => {
    // The item drag also asks whether it holds the capture when it ends.
    const element = Element.prototype as Partial<Element>;
    element.setPointerCapture ??= () => {};
    element.hasPointerCapture ??= () => false;
    element.releasePointerCapture ??= () => {};
    await show();
    open(A);
    await select(`${A}/group_2`);
    const frame = drawn("group_2");
    // jsdom draws nothing; the drag reads only that the drawing has a screen CTM.
    Object.assign(nodeOf(A).querySelector("svg") as SVGSVGElement, {
      getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    });
    pointer("pointerdown", frame, { clientX: 100, clientY: 200, pointerType: "mouse" });
    pointer("pointermove", frame, { clientX: 140, clientY: 224, pointerType: "mouse" });
    await settle();
    await press("Escape");
    expect(selected()).toEqual([`${A}/group_2`]);
    expect(path()).toEqual([{ target: A, kind: "bundle" }]);
    pointer("pointerup", frame, { clientX: 140, clientY: 224, pointerType: "mouse" });
    await settle();
    expect(store.entries).toEqual([]);
    expect(store.view.blocks[A]?.places).toEqual({});
    await press("Escape");
    expect(selected()).toEqual([]);
    expect(path()).toEqual([{ target: A, kind: "bundle" }]);
    await press("Escape");
    expect(path()).toEqual([]);
  });

  it("moves the view to the edited element and back to where each level was", async () => {
    await show();
    harness.showAt({ x: 12, y: -34, zoom: 0.5 });
    await settle();
    measure(10000, 10000);
    await doubleClick(drawn("group_1"));
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4285.65625, zoom: 4 });
    await doubleClick(drawn("score/card"));
    expect(path().map(({ target }) => target)).toEqual([`${A}/group_1`, `${A}/score`]);
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4366.8046875, zoom: 4 });
    await press("Escape");
    expect(path().map(({ target }) => target)).toEqual([`${A}/group_1`]);
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4285.65625, zoom: 4 });
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
    open(A);
    await atZoomOne();
    expect(classes(A)).toEqual({ selectable: true, draggable: false, outside: false });
    expect(classes(B)).toEqual({ selectable: false, draggable: false, outside: true });
    await select(`${A}/group_1`);
    await clickOn(background(B));
    expect(selected()).toEqual([`${A}/group_1`]);
    await clickOn(pane(), 1110, 110);
    expect(selected()).toEqual([`${A}/group_1`]);
    await clickOn(pane(), 50, 50);
    expect(selected()).toEqual([]);
    await select(`${A}/group_1`);
    store.done();
    open(`${A}/group_1`);
    await settle();
    await clickOn(drawn("group_2"));
    expect(selected()).toEqual([`${A}/group_1`]);
    await clickOn(drawn("score/card"));
    expect(selected()).toEqual([`${A}/score/card`]);
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
    await show(withRegion());
    open(`${A}/dlt_1`);
    await atZoomOne();
    await marqueeFrom(40, 380, 640, 463);
    expect(selected()).toEqual([
      `${A}/recording/region_1`,
      `${A}/dlt_1`,
      `${A}/dlt_1/name`,
      `${A}/recording/region_1/label`,
    ]);
    store.done();
    open(`${A}/group_1`);
    await atZoomOne();
    await marqueeFrom(40, 380, 640, 463);
    expect(selected()).toEqual([]);
  });

  it("show a refusal of the store in the status line", async () => {
    await show();
    open(`${A}/group_1`);
    await select(`${A}/annotations`);
    const before = store.view;
    const command = removeCommand(before, new Set([`${A}/annotations`]));
    const twin = createStore({ view: twoBlocks(), journal: [], sessions: {} });
    twin.open(`${A}/group_1`);
    const refusal = twin.dispatch(command);
    expect(refusal?.code).toBe("side_effect");
    await press("Delete");
    expect(document.querySelector('[data-testid="hint"]')?.textContent).toBe(refusal?.message);
    expect(store.view).toBe(before);
  });
});

describe("the selection when an editor opens", () => {
  it("keeps only what lies inside the opened editor", async () => {
    const opening = async (target: string, ...addresses: string[]) => {
      await select(...addresses);
      open(target);
      await settle();
      return selected();
    };
    await show();
    expect(await opening(A, A, B, `${A}/group_1`, `${A}/annotations/card`)).toEqual([
      A,
      `${A}/group_1`,
      `${A}/annotations/card`,
    ]);
    store.done();
    expect(
      await opening(
        `${A}/group_1`,
        A,
        `${A}/group_1`,
        `${A}/score/card`,
        `${A}/performance`,
        `${A}/page/card`,
      ),
    ).toEqual([`${A}/score/card`, `${A}/performance`]);
    expect(
      await opening(`${A}/score`, `${A}/score/card`, `${A}/score/start`, `${A}/performance`),
    ).toEqual([`${A}/score/start`]);
    store.done();
    store.done();
    expect(await opening(`${A}/score`, `${A}/score`, `${A}/score/name`)).toEqual([
      `${A}/score/name`,
    ]);
  });
});

describe("the view while it moves", () => {
  it("returns a level opened during a move to where that move was heading", async () => {
    reduced = false;
    await show();
    harness.showAt({ x: 12, y: -34, zoom: 0.5 });
    await settle();
    measure(10000, 10000);
    await doubleClick(drawn("group_1"));
    await doubleClick(drawn("score/card"));
    expect(path().map(({ target }) => target)).toEqual([`${A}/group_1`, `${A}/score`]);
    await wait(1100);
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4366.8046875, zoom: 4 });
    await press("Escape");
    await wait(1100);
    expect(path().map(({ target }) => target)).toEqual([`${A}/group_1`]);
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4285.65625, zoom: 4 });
  });
});

describe("the view when the canvas changes size", () => {
  it("centres the edited element again for the new size", async () => {
    await show();
    harness.showAt({ x: 12, y: -34, zoom: 0.5 });
    await settle();
    measure(10000, 10000);
    await doubleClick(drawn("group_1"));
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4285.65625, zoom: 4 });
    await resizeArranger(6000, 10000);
    expect(viewport()).toEqual({ x: 1683.03076171875, y: 4285.65625, zoom: 4 });
    harness.showAt({ x: 5, y: 6, zoom: 1 });
    await settle();
    await resizeArranger(6000, 10000);
    expect(viewport()).toEqual({ x: 5, y: 6, zoom: 1 });
    await resizeArranger(10000, 10000);
    expect(viewport()).toEqual({ x: 3683.03076171875, y: 4285.65625, zoom: 4 });
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
    const offered = async (address: string) => {
      await select(address);
      return modes();
    };
    await show();
    for (const address of [A, `${A}/group_2`, `${A}/score/card`, `${A}/annotations/card`]) {
      expect(await offered(address)).toEqual(three);
    }
    expect(await offered(`${A}/score`)).toEqual([]);
    open(A);
    await settle();
    for (const address of [A, `${A}/group_2`, `${A}/score/card`]) {
      expect(await offered(address)).toEqual(three);
    }
    store.done();
    open(`${A}/group_1`);
    expect(await offered(`${A}/group_1`)).toEqual(three);
    expect(await offered(`${A}/score/card`)).toEqual(three);
    store.done();
    open(`${A}/annotations`);
    expect(await offered(`${A}/annotations/card`)).toEqual(three);
    store.done();
    open(`${A}/score`);
    expect(await offered(`${A}/score/card`)).toEqual(three);
    store.done();
    open(`${A}/recording`);
    expect(await offered(`${A}/excerpt/card`)).toEqual([]);
    store.done();
    open(`${A}/dlt_1`);
    expect(await offered(`${A}/dlt_1`)).toEqual([]);
  });

  it("resizes a frame the arranger's click selects, in one set that moves nothing else", async () => {
    // jsdom has no pointer capture, which a resize handle takes on its press.
    const element = Element.prototype as Partial<Element>;
    element.setPointerCapture ??= () => {};
    element.releasePointerCapture ??= () => {};
    await show();
    await atZoomOne();
    await clickOn(drawn("group_1"));
    expect(selected()).toEqual([`${A}/group_1`]);
    expect(document.querySelectorAll("[data-testid^='handle-']")).toHaveLength(8);
    const before = store.view.blocks[A];
    if (before === undefined) throw new Error("no block A");
    const { items } = drawingOf(before, store.view.settings, metrics);
    const place = (key: string) => {
      const found = items.find((item) => item.key === key);
      if (found === undefined) throw new Error(`no item ${key}`);
      return found.place;
    };
    const handle = document.querySelector('[data-testid="handle-right"]');
    if (handle === null) throw new Error("no resize handle");
    pointer("pointerdown", handle, { clientX: 0, clientY: 0, pointerType: "mouse" });
    pointer("pointermove", handle, { clientX: 60, clientY: 0, pointerType: "mouse" });
    pointer("pointerup", handle, { clientX: 60, clientY: 0, pointerType: "mouse" });
    await settle();
    expect(store.journal).toHaveLength(1);
    expect(store.entries).toEqual(store.journal);
    const [entry] = store.journal;
    const { x: x2, y: y2 } = place("group_2");
    const { x: x3, y: y3 } = place("annotations");
    expect(entry !== undefined && "command" in entry ? entry.command : null).toEqual({
      type: "set",
      changes: [
        {
          target: `${A}/group_1`,
          values: { place: { width: quantize(place("group_1").width + 60, GRID_FREE) } },
        },
        { target: `${A}/group_2`, values: { place: { x: x2, y: y2 } } },
        { target: `${A}/annotations`, values: { place: { x: x3, y: y3 } } },
      ],
    });
    store.undo();
    expect(store.view.blocks[A]).toStrictEqual(before);
  });

  it("resizes the edited block itself in the bundle editor, as on the arranger", async () => {
    const element = Element.prototype as Partial<Element>;
    element.setPointerCapture ??= () => {};
    element.releasePointerCapture ??= () => {};
    await show();
    open(A);
    await atZoomOne();
    await select(A);
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
  function nodePositionOf(id: string): { x: number; y: number } {
    const match = /translate\((-?[\d.]+)px, *(-?[\d.]+)px\)/.exec(
      (nodeOf(id) as HTMLElement).style.transform,
    );
    if (match === null) throw new Error(`node ${id} has no position`);
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
  function drawnBox(address: string): { x: number; y: number; width: number } {
    const block = store.view.blocks[A];
    if (block === undefined) throw new Error("no block A");
    const rect = drawingOf(block, store.view.settings, metrics).elements.find(
      (element): element is RectElement =>
        (element.type === "group" || element.type === "card") && element.address === address,
    );
    if (rect === undefined) throw new Error(`no box ${address}`);
    const at = nodePositionOf(A);
    return {
      x: at.x + rect.x * block.scale,
      y: at.y + rect.y * block.scale,
      width: rect.width * block.scale,
    };
  }

  it("sits above the selected item, not above its block, and follows it", async () => {
    // jsdom has no pointer capture, which a handle and an item drag take on their press.
    const element = Element.prototype as Partial<Element>;
    element.setPointerCapture ??= () => {};
    element.hasPointerCapture ??= () => false;
    element.releasePointerCapture ??= () => {};
    await show();
    open(A);
    await atZoomOne();
    await select(`${A}/group_2`);
    const before = drawnBox("group_2");
    expect(menuTransform()).toBe(above(before));
    expect(above(before)).not.toBe(above({ ...nodePositionOf(A), width: 0 }));

    harness.showAt({ x: -20, y: 30, zoom: 2 });
    await settle();
    expect(menuTransform()).toBe(above(drawnBox("group_2")));

    harness.showAt({ x: 100, y: 100, zoom: 1 });
    await settle();
    const handle = document.querySelector('[data-testid="handle-right"]');
    if (handle === null) throw new Error("no resize handle");
    pointer("pointerdown", handle, { clientX: 0, clientY: 0, pointerType: "mouse" });
    pointer("pointermove", handle, { clientX: 60, clientY: 0, pointerType: "mouse" });
    pointer("pointerup", handle, { clientX: 60, clientY: 0, pointerType: "mouse" });
    await settle();
    const resized = drawnBox("group_2");
    expect(resized.width).not.toBe(before.width);
    expect(menuTransform()).toBe(above(resized));

    // jsdom draws nothing; the drag reads only that the drawing has a screen CTM.
    Object.assign(nodeOf(A).querySelector("svg") as SVGSVGElement, {
      getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    });
    const frame = drawn("group_2");
    pointer("pointerdown", frame, { clientX: 100, clientY: 200, pointerType: "mouse" });
    pointer("pointermove", frame, { clientX: 140, clientY: 224, pointerType: "mouse" });
    pointer("pointerup", frame, { clientX: 140, clientY: 224, pointerType: "mouse" });
    await settle();
    const moved = drawnBox("group_2");
    expect(moved.x).not.toBe(resized.x);
    expect(menuTransform()).toBe(above(moved));

    store.done();
    open(`${A}/annotations`);
    await select(`${A}/annotations/card`);
    expect(menuTransform()).toBe(above(drawnBox("annotations/card")));
  });

  it("sits above the selected block on the arranger", async () => {
    await show();
    await atZoomOne();
    await select(A);
    const svg = nodeOf(A).querySelector("svg");
    const [, , width = 0] = (svg?.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const scale = store.view.blocks[A]?.scale ?? 1;
    expect(menuTransform()).toBe(above({ ...nodePositionOf(A), width: width * scale }));
  });
});
