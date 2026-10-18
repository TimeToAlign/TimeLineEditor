// @vitest-environment jsdom
/**
 * During a gesture inside a block the canvas reports the drawing its node
 * shows with the block's live placement, so the block's items and cards can
 * be followed live. The expected values are derived in `README.md` ("The live
 * placement of items and cards").
 */

import type { Block, Store } from "@timetoalign/tilie-core";
import { createStore } from "@timetoalign/tilie-core";
import { flushSync, mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Canvas from "../src/Canvas.svelte";
import { drawingOf } from "../src/drawing.ts";
import { itemOf } from "../src/items.ts";
import { liveStore } from "../src/liveStore.svelte.ts";
import type { LivePlacement } from "../src/project.ts";
import { A, metrics, mixedPlain } from "./support.ts";

interface Mounted {
  setViewport(next: { x: number; y: number; zoom: number }): void;
}

let mounted: ReturnType<typeof mount> | undefined;
let store: Store;
/** Every value the canvas reported through `onlive`, in order. */
let reported: (LivePlacement | null)[];

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    (media: string): Partial<MediaQueryList> => ({
      matches: media === "(prefers-reduced-motion: reduce)",
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
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // jsdom has no pointer capture, which a resize handle and an item drag take on their press.
  const element = Element.prototype as Partial<Element>;
  element.setPointerCapture ??= () => {};
  element.hasPointerCapture ??= () => false;
  element.releasePointerCapture ??= () => {};
});

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  flushSync();
  await tick();
  flushSync();
  await tick();
  flushSync();
}

/** The canvas on `mixedPlain()` in A's bundle editor, `selected` selected, at zoom 1. */
async function show(selected: string, mode: "stretch" | "box"): Promise<void> {
  store = createStore({ view: mixedPlain(), journal: [], sessions: {} });
  const refusal = store.open(A);
  if (refusal !== null) throw new Error(refusal.message);
  reported = [];
  mounted = mount(Canvas, {
    target: document.body,
    props: {
      live: liveStore(store),
      metrics,
      selection: new Set([selected]),
      locked: false,
      mode,
      viewport: { x: 0, y: 0, zoom: 1 },
      onlive: (placement: LivePlacement | null) => {
        reported.push(placement);
      },
    },
  });
  await settle();
  (mounted as unknown as Mounted).setViewport({ x: 100, y: 100, zoom: 1 });
  await settle();
  const pane = document.querySelector(".svelte-flow__pane");
  if (pane === null) throw new Error("no pane");
  vi.spyOn(pane, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 1000, height: 1000 }),
  );
}

function pointer(type: string, target: Element, clientX: number, clientY: number): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      button: 0,
      pointerId: 1,
      pointerType: "mouse",
      clientX,
      clientY,
    }),
  );
}

function last(): LivePlacement | null | undefined {
  return reported.at(-1);
}

function stored(): Block {
  const block = store.view.blocks[A];
  if (block === undefined) throw new Error("no block A");
  return block;
}

/** The drawing of A as stored before the gesture, with `places`. */
function drawnWith(before: Block, places: Block["places"]) {
  return drawingOf(before, store.view.settings, metrics, { places });
}

describe("the live placement of a gesture inside a block", () => {
  it("carries a frame's Stretch before release", async () => {
    await show(`${A}/group_1`, "stretch");
    const before = stored();
    const drawing = drawingOf(before, store.view.settings, metrics);
    expect(last()).toBe(null);
    const handle = document.querySelector('[data-testid="handle-right"]');
    if (handle === null) throw new Error("no resize handle");
    pointer("pointerdown", handle, 0, 0);
    pointer("pointermove", handle, 60, 0);
    await settle();
    const live = last();
    if (live == null) throw new Error("nothing reported during the stretch");
    const { drawing: shown, ...fields } = live;
    expect(fields).toStrictEqual({
      id: A,
      x: 40,
      y: 80,
      scale: 1,
      length: 400,
      spacing: 1,
      width: null,
      height: null,
    });
    pointer("pointerup", handle, 60, 0);
    await settle();
    expect(last()).toBe(null);
    expect(stored().places).toStrictEqual({
      group_1: { length: 460 },
      group_2: { x: 8, y: 176.3671875 },
      annotations: { x: 8, y: 358.50390625 },
    });
    expect(shown).toStrictEqual(drawnWith(before, stored().places));
    expect(itemOf(shown, "group_1").place).toStrictEqual({
      x: 8,
      y: 28.8046875,
      length: 460,
      scale: 1,
      width: 622.484619140625,
      height: 139.5625,
    });
    for (const key of ["group_2", "annotations"]) {
      expect(itemOf(shown, key).place).toStrictEqual(itemOf(drawing, key).place);
    }
  });

  it("carries an item drag before release", async () => {
    await show(`${A}/group_2`, "box");
    const before = stored();
    const node = document.querySelector(`.svelte-flow__node[data-id="${A}"]`);
    if (node === null) throw new Error("no node A");
    const frame = [...node.querySelectorAll('[data-address="group_2"]')].at(-1);
    if (frame === undefined) throw new Error("no frame group_2");
    // jsdom draws nothing; the drag reads only that the drawing has a screen matrix.
    Object.assign(node.querySelector("svg") as SVGSVGElement, {
      getScreenCTM: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    });
    pointer("pointerdown", frame, 100, 200);
    pointer("pointermove", frame, 140, 224);
    await settle();
    const live = last();
    if (live == null) throw new Error("nothing reported during the drag");
    pointer("pointerup", frame, 140, 224);
    await settle();
    expect(last()).toBe(null);
    expect(stored().places).toStrictEqual({
      group_2: { x: 48, y: 200.3671875 },
      group_1: { x: 8, y: 28.8046875 },
      annotations: { x: 8, y: 358.50390625 },
    });
    expect(live.drawing).toStrictEqual(drawnWith(before, stored().places));
    const { x, y } = itemOf(live.drawing, "group_2").place;
    expect([x, y]).toEqual([48, 200.3671875]);
  });
});
