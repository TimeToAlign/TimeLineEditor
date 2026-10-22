// @vitest-environment jsdom
/**
 * The one pointer gesture (README, "The gesture engine"): which presses it
 * takes and how it marks them, the click distance, the points a strategy
 * receives, one preview per new value, one command on release, Escape, the
 * canvas's slot and a cancelled pointer ending it without one, the slot
 * hearing whether boxes are moved, and the click a gesture's release fires
 * taken and no other. A recording strategy stands for the four the canvas
 * uses.
 */

import type { Command } from "@timetoalign/tilie-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GesturePoint, GestureStrategy, Point } from "../src/gesture.ts";
import {
  CLICK_DISTANCE,
  drawingPoint,
  drawn,
  GestureSlot,
  pointerGesture,
  sourceAt,
} from "../src/gesture.ts";
import { bandGesture } from "../src/gestures/band.ts";
import { heldGesture } from "../src/gestures/held.ts";
import type { NodeHost } from "../src/gestures/host.ts";
import { itemGesture } from "../src/gestures/item.ts";
import type { ResizeHost } from "../src/gestures/resize.ts";
import { resizeGesture } from "../src/gestures/resize.ts";
import type { Matrix } from "../src/motion.ts";
import {
  nextTask,
  pointer,
  pressEscape,
  recordingActions,
  stubPointerCapture,
  withScreenMatrix,
} from "./dom.ts";
import { mixedView } from "./support.ts";

const SVG = "http://www.w3.org/2000/svg";
const COMMAND: Command = { type: "remove", targets: [{ block: "bundle0001", id: "group_1" }] };

/** What the recording strategy was asked, in order. */
type Call =
  | { readonly takes: GesturePoint }
  | { readonly start: true }
  | { readonly preview: Point | null }
  | { readonly command: Point }
  | { readonly dispatch: Command };

interface Stage {
  readonly svg: SVGSVGElement;
  readonly element: SVGRectElement;
  /** The `<svg>`'s screen CTM, the drawing's, which a case may change between events. */
  matrix: Matrix;
  readonly calls: Call[];
  /** The clicks that reached the `<svg>`. */
  readonly clicks: Event[];
}

let detach: (() => void) | undefined;

beforeEach(stubPointerCapture);

afterEach(() => {
  detach?.();
  detach = undefined;
  document.body.innerHTML = "";
});

/**
 * A `rect.card` in an `<svg>`: the `<svg>`'s CTM a scale of 2 at (10, 20), so
 * client `(x, y)` is drawing `((x − 10) / 2, (y − 20) / 2)`; the `rect` has a
 * CTM of its own that no gesture may read (a card sliding).
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
    calls: [],
    clicks: [],
  };
  withScreenMatrix(svg, () => result.matrix);
  withScreenMatrix(element, () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: -1000 }));
  svg.addEventListener("click", (event) => result.clicks.push(event));
  return result;
}

/**
 * A strategy recording what it is asked: it takes a press above drawing
 * ordinate `limit`, its value is the drawing point with `y` rounded down to
 * a multiple of 10 (so small moves give the same value), and `command`
 * answers its command.
 */
function recording(
  calls: Call[],
  { limit = Number.POSITIVE_INFINITY, command = COMMAND as Command | null } = {},
): GestureStrategy<{ readonly at: GesturePoint }, Point> {
  return {
    takes(_event, at) {
      calls.push({ takes: at });
      return at.drawing.y < limit ? { at } : null;
    },
    start: () => calls.push({ start: true }),
    value: (_press, at) =>
      at.drawing.y < 0 ? null : { x: 0, y: Math.floor(at.drawing.y / 10) * 10 },
    preview: (_press, value) => calls.push({ preview: value }),
    command(_press, value) {
      calls.push({ command: value });
      return command;
    },
  };
}

function attach(
  scene: Stage,
  strategy = recording(scene.calls),
  options: { clickDistance?: number; slot?: GestureSlot } = {},
  on: Element = scene.element,
): void {
  detach =
    pointerGesture(strategy, {
      ...options,
      dispatch: (command) => scene.calls.push({ dispatch: command }),
    })(on) ?? undefined;
}

/** A click; a pointer's (`detail` 1) unless `detail` says otherwise (0: a key, `element.click()`). */
function click(target: Element, detail = 1): void {
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));
}

/** The calls but the presses taken. */
function asked(calls: readonly Call[]): Call[] {
  return calls.filter((call) => !("takes" in call));
}

describe("a press", () => {
  it("is read in the drawing's units through the <svg>'s CTM, never the element's", () => {
    const scene = stage();
    attach(scene);
    pointer(scene.element, "pointerdown", 30, 110);
    expect(scene.calls).toEqual([
      { takes: { drawing: { x: 10, y: 45 }, screen: { x: 30, y: 110 } } },
    ]);
  });

  it("refused leaves the element unmarked and uncaptured, and the pointer to the canvas", () => {
    const scene = stage();
    attach(scene, recording(scene.calls, { limit: 40 }));
    pointer(scene.element, "pointerdown", 30, 110);
    expect(scene.element.getAttribute("class")).toBe("card");
    expect(scene.element.hasPointerCapture(1)).toBe(false);
    pointer(scene.element, "pointermove", 30, 150);
    pointer(scene.element, "pointerup", 30, 150);
    expect(asked(scene.calls)).toEqual([]);
  });

  it("taken marks the element nodrag nopan and captures the pointer while it is held", () => {
    const scene = stage();
    attach(scene);
    pointer(scene.element, "pointerdown", 30, 110);
    expect(scene.element.getAttribute("class")).toBe("card nodrag nopan");
    expect(scene.element.hasPointerCapture(1)).toBe(true);
    pointer(scene.element, "pointerup", 30, 110);
    expect(scene.element.getAttribute("class")).toBe("card");
    expect(scene.element.hasPointerCapture(1)).toBe(false);
  });

  it("keeps marks the element carries of its own", () => {
    const scene = stage();
    scene.element.setAttribute("class", "card nodrag nopan");
    attach(scene);
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointerup", 30, 110);
    expect(scene.element.getAttribute("class")).toBe("card nodrag nopan");
  });

  it("other than the primary button's is never taken", () => {
    const scene = stage();
    attach(scene);
    pointer(scene.element, "pointerdown", 30, 110, { button: 2 });
    expect(scene.calls).toEqual([]);
  });

  it("on an element outside a drawing is read at its screen point", () => {
    const scene = stage();
    const handle = document.createElement("div");
    document.body.append(handle);
    attach(scene, recording(scene.calls), {}, handle);
    pointer(handle, "pointerdown", 30, 110);
    expect(scene.calls).toEqual([
      { takes: { drawing: { x: 30, y: 110 }, screen: { x: 30, y: 110 } } },
    ]);
  });
});

describe("the click distance", () => {
  it("leaves a press released within it a click: nothing starts", () => {
    const scene = stage();
    attach(scene);
    expect(CLICK_DISTANCE).toBe(4);
    pointer(scene.element, "pointerdown", 100, 100);
    pointer(scene.element, "pointermove", 103, 102);
    pointer(scene.element, "pointermove", 104, 100);
    pointer(scene.element, "pointerup", 104, 100);
    click(scene.element);
    expect(asked(scene.calls)).toEqual([]);
    expect(scene.clicks).toHaveLength(1);
  });

  it("is the option's where one is given", () => {
    const scene = stage();
    attach(scene, recording(scene.calls), { clickDistance: 10 });
    pointer(scene.element, "pointerdown", 100, 100);
    pointer(scene.element, "pointermove", 108, 106);
    pointer(scene.element, "pointerup", 108, 106);
    expect(asked(scene.calls)).toEqual([]);
  });
});

describe("a gesture", () => {
  it("starts once, previews each new value, and dispatches one command on release", () => {
    const scene = stage();
    attach(scene);
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointermove", 30, 116);
    pointer(scene.element, "pointermove", 30, 118);
    pointer(scene.element, "pointermove", 30, 130);
    pointer(scene.element, "pointerup", 30, 130);
    click(scene.element);
    expect(asked(scene.calls)).toEqual([
      { start: true },
      { preview: { x: 0, y: 40 } },
      { preview: { x: 0, y: 50 } },
      { command: { x: 0, y: 50 } },
      { dispatch: COMMAND },
      { preview: null },
    ]);
    expect(scene.clicks).toEqual([]);
  });

  it("reads every point through the drawing's CTM of the moment", () => {
    const scene = stage();
    attach(scene);
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointermove", 30, 116);
    scene.matrix = { ...scene.matrix, f: -60 };
    pointer(scene.element, "pointermove", 30, 116);
    expect(asked(scene.calls)).toEqual([
      { start: true },
      { preview: { x: 0, y: 40 } },
      { preview: { x: 0, y: 80 } },
    ]);
  });

  it("previews nothing for a point with no value, and dispatches nothing without a value", () => {
    const scene = stage();
    attach(scene);
    pointer(scene.element, "pointerdown", 30, 30);
    pointer(scene.element, "pointermove", 30, 10);
    pointer(scene.element, "pointerup", 30, 10);
    expect(asked(scene.calls)).toEqual([{ start: true }, { preview: null }]);
  });

  it("dispatches nothing when the command changes nothing", () => {
    const scene = stage();
    attach(scene, recording(scene.calls, { command: null }));
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointerup", 30, 130);
    expect(asked(scene.calls)).toEqual([
      { start: true },
      { preview: { x: 0, y: 50 } },
      { command: { x: 0, y: 50 } },
      { preview: null },
    ]);
  });

  it("is withdrawn when its element goes away", () => {
    const scene = stage();
    attach(scene);
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointermove", 30, 130);
    detach?.();
    detach = undefined;
    pointer(scene.element, "pointerup", 30, 130);
    expect(asked(scene.calls)).toEqual([
      { start: true },
      { preview: { x: 0, y: 50 } },
      { preview: null },
    ]);
  });
});

describe("ending a gesture without a command", () => {
  it("through the canvas's slot, which says whether a gesture was under way", () => {
    const scene = stage();
    const slot = new GestureSlot();
    attach(scene, recording(scene.calls), { slot });
    expect(slot.abort()).toBe(false);
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointermove", 32, 111);
    expect(slot.abort()).toBe(false);
    pointer(scene.element, "pointermove", 30, 130);
    expect(slot.abort()).toBe(true);
    expect(slot.abort()).toBe(false);
    pointer(scene.element, "pointerup", 30, 130);
    click(scene.element);
    expect(asked(scene.calls)).toEqual([
      { start: true },
      { preview: { x: 0, y: 50 } },
      { preview: null },
    ]);
    expect(scene.clicks).toEqual([]);
  });

  it("by Escape, which the gesture takes from the page", () => {
    const scene = stage();
    const keys: string[] = [];
    document.addEventListener("keydown", (event) => keys.push(event.key));
    attach(scene);
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointermove", 30, 130);
    const key = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.body.dispatchEvent(key);
    pointer(scene.element, "pointerup", 30, 130);
    expect(asked(scene.calls)).toEqual([
      { start: true },
      { preview: { x: 0, y: 50 } },
      { preview: null },
    ]);
    expect(key.defaultPrevented).toBe(true);
    expect(keys).toEqual([]);
  });

  it("leaves an Escape before the click distance to the canvas", () => {
    const scene = stage();
    const keys: string[] = [];
    document.addEventListener("keydown", (event) => keys.push(event.key));
    attach(scene);
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointermove", 32, 110);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(keys).toEqual(["Escape"]);
    expect(asked(scene.calls)).toEqual([]);
  });

  it("by a cancelled pointer", () => {
    const scene = stage();
    attach(scene);
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointermove", 30, 130);
    pointer(scene.element, "pointercancel", 30, 130);
    pointer(scene.element, "pointerup", 30, 130);
    expect(asked(scene.calls)).toEqual([
      { start: true },
      { preview: { x: 0, y: 50 } },
      { preview: null },
    ]);
  });
});

describe("the slot hears whether boxes are moved", () => {
  /** The scene with a slot recording what it hears, driving `strategy`. */
  function heard(scene: Stage, moves: boolean): boolean[] {
    const said: boolean[] = [];
    const slot = new GestureSlot((moving) => said.push(moving));
    attach(scene, { ...recording(scene.calls), moves }, { slot });
    return said;
  }

  it("nothing for a press within the click distance", () => {
    const scene = stage();
    const said = heard(scene, true);
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointermove", 32, 111);
    pointer(scene.element, "pointerup", 32, 111);
    expect(said).toEqual([]);
  });

  it("true from a moving gesture's start, false at its end, however it ends", () => {
    const ends: [string, (scene: Stage) => void][] = [
      ["release", (scene) => pointer(scene.element, "pointerup", 30, 130)],
      ["Escape", () => pressEscape()],
      ["cancel", (scene) => pointer(scene.element, "pointercancel", 30, 130)],
    ];
    for (const [name, end] of ends) {
      const scene = stage();
      const said = heard(scene, true);
      pointer(scene.element, "pointerdown", 30, 110);
      pointer(scene.element, "pointermove", 30, 130);
      expect(said, name).toEqual([true]);
      pointer(scene.element, "pointermove", 30, 150);
      expect(said, name).toEqual([true]);
      end(scene);
      expect(said, name).toEqual([true, false]);
      detach?.();
      detach = undefined;
      document.body.innerHTML = "";
    }
  });

  it("false at the start and the end of a gesture that moves no box", () => {
    const scene = stage();
    const said = heard(scene, false);
    pointer(scene.element, "pointerdown", 30, 110);
    pointer(scene.element, "pointermove", 30, 130);
    expect(said).toEqual([false]);
    pointer(scene.element, "pointerup", 30, 130);
    expect(said).toEqual([false, false]);
  });

  it("is told so by the item, held-card and band strategies, never by the resize handle's", () => {
    const { actions } = recordingActions(mixedView());
    const node: NodeHost = {
      actions,
      data() {
        throw new Error("no strategy reads its node when it is made");
      },
      slide() {},
      ghost() {},
    };
    const resizing: ResizeHost = {
      actions,
      target() {
        throw new Error("no strategy reads its target when it is made");
      },
      level: () => "arranger",
      mode: () => "box",
      locked: () => false,
      viewport: () => ({ x: 0, y: 0, zoom: 1 }),
      autoPan: () => Promise.resolve(false),
    };
    expect([
      itemGesture(node, { item: "group_2" }).moves,
      heldGesture(node, "group_1", "score").moves,
      bandGesture(node).moves,
      resizeGesture(resizing, "right").moves,
    ]).toEqual([true, true, true, undefined]);
  });
});

describe("the click after a gesture", () => {
  it("is taken, and no other: not a click without a pointer, nor one a task later", async () => {
    const scene = stage();
    attach(scene);
    const drag = () => {
      pointer(scene.element, "pointerdown", 30, 110);
      pointer(scene.element, "pointermove", 30, 130);
    };
    drag();
    pointer(scene.element, "pointerup", 30, 130);
    click(scene.element, 0);
    expect(scene.clicks).toHaveLength(1);
    click(scene.element);
    expect(scene.clicks).toHaveLength(1);

    drag();
    pointer(scene.element, "pointerup", 30, 130);
    await nextTask();
    click(scene.element);
    expect(scene.clicks).toHaveLength(2);

    drag();
    pressEscape();
    await nextTask();
    pointer(scene.element, "pointerup", 30, 130);
    click(scene.element);
    expect(scene.clicks).toHaveLength(2);
    await nextTask();
    click(scene.element);
    expect(scene.clicks).toHaveLength(3);
  });
});

describe("pointer targets", () => {
  it("are read back as the descriptor they draw, and nothing else", () => {
    const scene = stage();
    const source = {
      element: 3,
      type: "card",
      address: { id: "score", part: ["card"] },
      role: "primary",
    } as const;
    const stop = drawn(source)(scene.element);
    expect(sourceAt(scene.element)).toBe(source);
    expect(sourceAt(scene.svg)).toBeNull();
    expect(sourceAt(null)).toBeNull();
    stop?.();
    expect(sourceAt(scene.element)).toBeNull();
  });

  it("are read in the drawing's units through their <svg>'s CTM, null off a drawing", () => {
    const scene = stage();
    expect(drawingPoint(scene.element, { x: 30, y: 110 })).toEqual({ x: 10, y: 45 });
    expect(drawingPoint(scene.svg, { x: 30, y: 110 })).toEqual({ x: 10, y: 45 });
    expect(drawingPoint(document.body, { x: 30, y: 110 })).toBeNull();
    scene.matrix = { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 };
    expect(drawingPoint(scene.element, { x: 30, y: 110 })).toBeNull();
  });
});
