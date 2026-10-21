// @vitest-environment jsdom
/**
 * During a gesture inside a block the canvas reports the drawing its node
 * shows with the block's live placement, so the block's items and cards can
 * be followed live. The expected values are derived in `README.md` ("The live
 * placement of items and cards").
 */

import type { Address, Block, Store } from "@timetoalign/tilie-core";
import { idAddress, inBlock } from "@timetoalign/tilie-core";
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { itemOf } from "../src/boxes.ts";
import Canvas from "../src/Canvas.svelte";
import { drawingOf } from "../src/drawing.ts";
import { liveStore } from "../src/liveStore.svelte.ts";
import type { LivePlacement } from "../src/project.ts";
import { selectionOf } from "../src/selection.ts";
import { IDENTITY, pointer, settle, stubCanvasGlobals, withScreenMatrix } from "./dom.ts";
import { A, metrics, mixedPlain, storeOf } from "./support.ts";

let mounted: ReturnType<typeof mount> | undefined;
let store: Store;
/** Every value the canvas reported through `onlive`, in order. */
let reported: (LivePlacement | null)[];

beforeEach(() => {
  stubCanvasGlobals();
});

afterEach(() => {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The canvas on `mixedPlain()` in A's bundle editor, `selected` selected, at zoom 1. */
async function show(selected: Address, mode: "stretch" | "box"): Promise<void> {
  store = storeOf(mixedPlain());
  const refusal = store.open({ block: A });
  if (refusal !== null) throw new Error(refusal.message);
  reported = [];
  const canvas = mount(Canvas, {
    target: document.body,
    props: {
      live: liveStore(store),
      metrics,
      selection: selectionOf([selected]),
      locked: false,
      mode,
      viewport: { x: 0, y: 0, zoom: 1 },
      onlive: (placement: LivePlacement | null) => {
        reported.push(placement);
      },
    },
  });
  mounted = canvas;
  await settle();
  canvas.setViewport({ x: 100, y: 100, zoom: 1 });
  await settle();
  const pane = document.querySelector(".svelte-flow__pane");
  if (pane === null) throw new Error("no pane");
  vi.spyOn(pane, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 0, y: 0, width: 1000, height: 1000 }),
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
    await show(inBlock(A, idAddress("group_1")), "stretch");
    const before = stored();
    const drawing = drawingOf(before, store.view.settings, metrics);
    // Nothing is reported before a gesture.
    expect(reported).toEqual([]);
    const handle = document.querySelector('[data-testid="handle-right"]');
    if (handle === null) throw new Error("no resize handle");
    pointer(handle, "pointerdown", 0, 0);
    pointer(handle, "pointermove", 60, 0);
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
      spacing: 8,
      width: null,
      height: null,
    });
    pointer(handle, "pointerup", 60, 0);
    await settle();
    expect(last()).toBe(null);
    expect(stored().places).toStrictEqual({
      group_1: { length: 460 },
      group_2: { x: 8, y: 206.0390625 },
      annotations: { x: 8, y: 391.7734375 },
    });
    expect(shown).toStrictEqual(drawnWith(before, stored().places));
    expect(itemOf(shown, { item: "group_1" }).item.place).toStrictEqual({
      x: 8,
      y: 28.8046875,
      length: 460,
      scale: 1,
      spacing: 8,
      width: 622.484619140625,
      height: 169.234375,
    });
    for (const key of [{ item: "group_2" }, { item: "annotations" }]) {
      expect(itemOf(shown, key).item.place).toStrictEqual(itemOf(drawing, key).item.place);
    }
  });

  it("carries an item drag before release", async () => {
    await show(inBlock(A, idAddress("group_2")), "box");
    const before = stored();
    const node = document.querySelector(`.svelte-flow__node[data-id="${A}"]`);
    if (node === null) throw new Error("no node A");
    // The frame's own rectangle carries `data-id` alone; its title adds `data-part`.
    const frames = [
      ...node.querySelectorAll('svg [data-id="group_2"]:not([data-facet]):not([data-part])'),
    ];
    expect(frames).toHaveLength(1);
    const [frame] = frames;
    if (frame === undefined) throw new Error("no frame group_2");
    // jsdom draws nothing; the drag reads only that the drawing has a screen matrix.
    withScreenMatrix(node.querySelector("svg") as SVGSVGElement, () => IDENTITY);
    pointer(frame, "pointerdown", 100, 200);
    pointer(frame, "pointermove", 140, 224);
    await settle();
    const live = last();
    if (live == null) throw new Error("nothing reported during the drag");
    pointer(frame, "pointerup", 140, 224);
    await settle();
    expect(last()).toBe(null);
    expect(stored().places).toStrictEqual({
      group_2: { x: 48, y: 230.0390625 },
      group_1: { x: 8, y: 28.8046875 },
      annotations: { x: 8, y: 391.7734375 },
    });
    expect(live.drawing).toStrictEqual(drawnWith(before, stored().places));
    const { x, y } = itemOf(live.drawing, { item: "group_2" }).item.place;
    expect([x, y]).toEqual([48, 230.0390625]);
  });
});
