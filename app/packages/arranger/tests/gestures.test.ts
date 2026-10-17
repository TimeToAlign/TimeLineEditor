// @vitest-environment jsdom
/**
 * The drags inside a block's drawing: a press stays a click within the
 * click distance, a drag previews in drawing units (an item move by the
 * zoom and the block's scale, a reorder through the drawing's screen CTM)
 * and ends in one command, Escape and a cancelled pointer abort
 * it, only the click its release fires is taken; and the resize modes each
 * editor's gestures offer.
 */

import type { Command } from "@timetoalign/tilie-core";
import type { Attachment } from "svelte/attachments";
import { afterEach, describe, expect, it } from "vitest";
import { GESTURES } from "../src/editors.ts";
import type { Point } from "../src/gestures.svelte.ts";
import {
  abortDrag,
  CLICK_DISTANCE,
  itemDrag,
  memberDrag,
  resizeModes,
} from "../src/gestures.svelte.ts";
import type { Matrix } from "../src/motion.ts";

const SVG = "http://www.w3.org/2000/svg";

/** A recorded call of the drag's callbacks, in the order they were made. */
type Call =
  | { readonly preview: unknown }
  | { readonly command: unknown }
  | { readonly dispatch: Command };

interface Stage {
  readonly svg: SVGSVGElement;
  readonly element: SVGRectElement;
  /** The `<svg>`'s screen CTM, the drawing's, which a test may change between events. */
  matrix: Matrix;
  readonly captured: number[];
  readonly released: number[];
  /** The clicks that reached the `<svg>`. */
  readonly clicks: Event[];
}

/**
 * A `rect.card` in an `<svg>` in the document: the `<svg>` with a CTM, the
 * `rect` with a CTM of its own that no drag may read (a card sliding), and
 * recorded pointer capture.
 */
function stage(): Stage {
  const svg = document.createElementNS(SVG, "svg");
  const element = document.createElementNS(SVG, "rect");
  element.setAttribute("class", "card");
  svg.append(element);
  document.body.append(svg);
  const result: Stage = {
    svg,
    element,
    matrix: { a: 2, b: 0, c: 0, d: 2, e: 10, f: 20 },
    captured: [],
    released: [],
    clicks: [],
  };
  const capture = new Set<number>();
  Object.assign(svg, { getScreenCTM: () => result.matrix });
  Object.assign(element, {
    getScreenCTM: (): Matrix => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: -1000 }),
    setPointerCapture: (pointer: number) => {
      capture.add(pointer);
      result.captured.push(pointer);
    },
    hasPointerCapture: (pointer: number) => capture.has(pointer),
    releasePointerCapture: (pointer: number) => {
      capture.delete(pointer);
      result.released.push(pointer);
    },
  });
  svg.addEventListener("click", (event) => result.clicks.push(event));
  return result;
}

function pointer(target: Element, type: string, x: number, y: number, button = 0): void {
  target.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, button, bubbles: true }),
  );
}

/** A click; a pointer's (`detail` 1) unless `detail` says otherwise (0: a key or `element.click()`). */
function click(target: Element, detail = 1): void {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));
}

/** One task: what the browser runs after the task that fired a release and its click. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const COMMAND: Command = { type: "remove", targets: ["bundle0001/group_1"] };

/**
 * An item drag of the place `{x: 40, y: 200}` recording its calls, at zoom
 * 4 in a block of scale 1/2: a drawing unit is 2 screen pixels, as the
 * stage's CTM says.
 */
function itemOptions(calls: Call[], command: Command | null = COMMAND) {
  return {
    place: (): Point => ({ x: 40, y: 200 }),
    zoom: () => 4,
    scale: () => 0.5,
    preview: (place: Point | null) => calls.push({ preview: place }),
    command: (place: Point) => {
      calls.push({ command: place });
      return command;
    },
    dispatch: (sent: Command) => calls.push({ dispatch: sent }),
  };
}

let detach: (() => void) | undefined;

afterEach(() => {
  detach?.();
  detach = undefined;
  document.body.innerHTML = "";
});

function attach(element: SVGElement, attachment: Attachment<SVGElement>): void {
  detach = attachment(element) ?? undefined;
}

describe("itemDrag", () => {
  it("marks its element nodrag nopan while attached", () => {
    const { element, captured } = stage();
    const calls: Call[] = [];
    attach(element, itemDrag(itemOptions(calls)));
    expect(element.getAttribute("class")).toBe("card nodrag nopan");
    pointer(element, "pointerdown", 100, 100, 2);
    pointer(element, "pointermove", 140, 140);
    pointer(element, "pointerup", 140, 140);
    expect(captured).toEqual([]);
    expect(calls).toEqual([]);
    detach?.();
    detach = undefined;
    expect(element.getAttribute("class")).toBe("card");
  });

  it("leaves a press within the click distance a click", () => {
    const { element, captured, released, clicks } = stage();
    const calls: Call[] = [];
    attach(element, itemDrag(itemOptions(calls)));
    expect(CLICK_DISTANCE).toBe(4);
    pointer(element, "pointerdown", 100, 100);
    pointer(element, "pointermove", 103, 102);
    pointer(element, "pointermove", 104, 100);
    pointer(element, "pointerup", 104, 100);
    click(element);
    expect(calls).toEqual([]);
    expect(clicks).toHaveLength(1);
    expect(captured).toEqual([1]);
    expect(released).toEqual([1]);
  });

  it("previews in drawing units and dispatches one command on release", () => {
    const { element, clicks } = stage();
    const calls: Call[] = [];
    attach(element, itemDrag(itemOptions(calls)));
    pointer(element, "pointerdown", 100, 100);
    pointer(element, "pointermove", 110, 96);
    pointer(element, "pointermove", 110, 96);
    pointer(element, "pointermove", 121, 100);
    pointer(element, "pointerup", 121, 100);
    click(element);
    expect(calls).toEqual([
      { preview: { x: 45, y: 198 } },
      { preview: { x: 50.5, y: 200 } },
      { command: { x: 50.5, y: 200 } },
      { dispatch: COMMAND },
      { preview: null },
    ]);
    expect(clicks).toEqual([]);
  });

  it("quantizes the place to GRID_FREE", () => {
    const { element } = stage();
    const calls: Call[] = [];
    attach(element, itemDrag(itemOptions(calls)));
    pointer(element, "pointerdown", 100, 100);
    pointer(element, "pointermove", 100.0004, 110);
    pointer(element, "pointermove", 100.0006, 110);
    expect(calls).toEqual([
      { preview: { x: 40, y: 205 } },
      { preview: { x: 40.00048828125, y: 205 } },
    ]);
  });

  it("converts the travel by the zoom and the scale, not by the drawing's CTM", () => {
    const scene = stage();
    // An engine lays the <svg> out at its layout unit, so its CTM's scale is off in the last digits.
    scene.matrix = { a: 0.9999813045672942, b: 0, c: 0, d: 0.9999813045672942, e: 40, f: 72 };
    const calls: Call[] = [];
    attach(scene.element, itemDrag({ ...itemOptions(calls), zoom: () => 1, scale: () => 1 }));
    pointer(scene.element, "pointerdown", 100, 100);
    pointer(scene.element, "pointerup", 140, 124);
    expect(calls).toEqual([
      { preview: { x: 80, y: 224 } },
      { command: { x: 80, y: 224 } },
      { dispatch: COMMAND },
      { preview: null },
    ]);
  });

  it("reads the zoom and the scale at the press", () => {
    const { element } = stage();
    const calls: Call[] = [];
    let zoom = 1;
    attach(element, itemDrag({ ...itemOptions(calls), zoom: () => zoom, scale: () => 2.5 }));
    pointer(element, "pointerdown", 100, 100);
    zoom = 8;
    pointer(element, "pointermove", 125, 110);
    expect(calls).toEqual([{ preview: { x: 50, y: 204 } }]);
  });

  it("dispatches nothing when the command changes nothing", () => {
    const { element } = stage();
    const calls: Call[] = [];
    attach(element, itemDrag(itemOptions(calls, null)));
    pointer(element, "pointerdown", 100, 100);
    pointer(element, "pointermove", 110, 96);
    pointer(element, "pointerup", 110, 96);
    expect(calls).toEqual([
      { preview: { x: 45, y: 198 } },
      { command: { x: 45, y: 198 } },
      { preview: null },
    ]);
  });

  it("is ended by abortDrag as by Escape, which reports whether a drag was in progress", () => {
    const { element, clicks } = stage();
    const calls: Call[] = [];
    attach(element, itemDrag(itemOptions(calls)));
    expect(abortDrag()).toBe(false);
    pointer(element, "pointerdown", 100, 100);
    pointer(element, "pointermove", 103, 102);
    expect(abortDrag()).toBe(false);
    pointer(element, "pointermove", 110, 96);
    expect(abortDrag()).toBe(true);
    expect(abortDrag()).toBe(false);
    pointer(element, "pointerup", 110, 96);
    click(element);
    expect(calls).toEqual([{ preview: { x: 45, y: 198 } }, { preview: null }]);
    expect(clicks).toEqual([]);
  });

  it("aborts on Escape, which it takes from the canvas", () => {
    const { element, clicks } = stage();
    const calls: Call[] = [];
    const keys: string[] = [];
    document.addEventListener("keydown", (event) => keys.push(event.key));
    attach(element, itemDrag(itemOptions(calls)));
    pointer(element, "pointerdown", 100, 100);
    pointer(element, "pointermove", 110, 96);
    const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.body.dispatchEvent(key);
    pointer(element, "pointerup", 110, 96);
    click(element);
    expect(calls).toEqual([{ preview: { x: 45, y: 198 } }, { preview: null }]);
    expect(key.defaultPrevented).toBe(true);
    expect(keys).toEqual([]);
    expect(clicks).toEqual([]);
  });

  it("leaves an Escape before the click distance to the canvas", () => {
    const { element } = stage();
    const calls: Call[] = [];
    const keys: string[] = [];
    document.addEventListener("keydown", (event) => keys.push(event.key));
    attach(element, itemDrag(itemOptions(calls)));
    pointer(element, "pointerdown", 100, 100);
    pointer(element, "pointermove", 102, 100);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(keys).toEqual(["Escape"]);
    expect(calls).toEqual([]);
  });

  it("aborts on a cancelled pointer", () => {
    const { element } = stage();
    const calls: Call[] = [];
    attach(element, itemDrag(itemOptions(calls)));
    pointer(element, "pointerdown", 100, 100);
    pointer(element, "pointermove", 110, 96);
    pointer(element, "pointercancel", 110, 96);
    pointer(element, "pointerup", 110, 96);
    expect(calls).toEqual([{ preview: { x: 45, y: 198 } }, { preview: null }]);
  });

  it("takes only the click a drag's release fires", async () => {
    const { element, clicks } = stage();
    attach(element, itemDrag(itemOptions([])));
    const drag = () => {
      pointer(element, "pointerdown", 100, 100);
      pointer(element, "pointermove", 110, 96);
    };
    drag();
    pointer(element, "pointerup", 110, 96);
    click(element, 0);
    expect(clicks).toHaveLength(1);
    click(element);
    expect(clicks).toHaveLength(1);

    drag();
    pointer(element, "pointerup", 110, 96);
    await nextTask();
    click(element);
    expect(clicks).toHaveLength(2);

    drag();
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await nextTask();
    pointer(element, "pointerup", 110, 96);
    click(element);
    expect(clicks).toHaveLength(2);
    await nextTask();
    click(element);
    expect(clicks).toHaveLength(3);
  });
});

describe("memberDrag", () => {
  const SCORE_FIRST = ["score", "performance"];
  const PERFORMANCE_FIRST = ["performance", "score"];

  function memberOptions(calls: Call[]) {
    return {
      order: (y: number) => (y < 50 ? SCORE_FIRST : PERFORMANCE_FIRST),
      preview: (order: readonly string[] | null) => calls.push({ preview: order }),
      command: (order: readonly string[]) => {
        calls.push({ command: order });
        return COMMAND;
      },
      dispatch: (sent: Command) => calls.push({ dispatch: sent }),
    };
  }

  it("previews each new order and dispatches one command on release", () => {
    const { element } = stage();
    const calls: Call[] = [];
    attach(element, memberDrag(memberOptions(calls)));
    pointer(element, "pointerdown", 30, 110);
    pointer(element, "pointermove", 30, 116);
    pointer(element, "pointermove", 30, 122);
    pointer(element, "pointermove", 30, 130);
    pointer(element, "pointerup", 30, 130);
    expect(calls).toEqual([
      { preview: SCORE_FIRST },
      { preview: PERFORMANCE_FIRST },
      { command: PERFORMANCE_FIRST },
      { dispatch: COMMAND },
      { preview: null },
    ]);
  });

  it("reads the ordinate through the drawing's CTM of the moment", () => {
    const scene = stage();
    const calls: Call[] = [];
    attach(scene.element, memberDrag(memberOptions(calls)));
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointermove", 30, 116);
    scene.matrix = { ...scene.matrix, f: 0 };
    pointer(scene.element, "pointermove", 30, 106);
    expect(calls).toEqual([{ preview: SCORE_FIRST }, { preview: PERFORMANCE_FIRST }]);
  });
});

describe("resizeModes", () => {
  it("offers what each editor's gestures allow", () => {
    const rows = Object.fromEntries(
      Object.entries(GESTURES).map(([row, gestures]) => [
        row,
        { block: resizeModes(gestures, "block"), item: resizeModes(gestures, "item") },
      ]),
    );
    expect(rows).toEqual({
      arranger: { block: ["scale", "box", "stretch"], item: [] },
      bundle: { block: [], item: ["box", "stretch"] },
      group: { block: [], item: ["box", "stretch"] },
      timeline: { block: [], item: ["stretch"] },
    });
    // A group member's timeline editor: its length would change its siblings unseen.
    expect(resizeModes({ ...GESTURES.timeline, stretchCard: false }, "item")).toEqual([]);
  });
});
