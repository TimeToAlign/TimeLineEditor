// @vitest-environment jsdom
/**
 * The resize toolbar (README, "The resize toolbar"): the modes and handles
 * the level allows for a block, a frame or a card of its drawing, and a
 * handle's gesture: a click stays a click, a drag previews the view its
 * command gives and stores that command once, Escape through the canvas's
 * slot stores nothing. Mounted inside a Svelte Flow canvas of one node.
 */

import type { View } from "@timetoalign/tilie-core";
import { isCommandError, preview } from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boxOf } from "../src/boxes.ts";
import type { Level } from "../src/containers.ts";
import { LEVELS } from "../src/containers.ts";
import { drawingOf } from "../src/drawing.ts";
import { itemResizeCommand, itemResizeValues } from "../src/items.ts";
import type { ResizeMode } from "../src/resize.ts";
import { resize, resizeCommand } from "../src/resize.ts";
import type { Call } from "./dom.ts";
import { kinds, pointer, recordingActions, stubCanvasGlobals } from "./dom.ts";
import { A, blockIn, metrics, viewOf } from "./support.ts";
import Harness from "./ToolbarHarness.svelte";

const VIEW = viewOf({ id: A, fixture: "bundles/bundle_mixed" });
const BLOCK = blockIn(VIEW, A);
const DRAWING = drawingOf(BLOCK, VIEW.settings, metrics);

/** The box of A's drawing at `address`; `null` names the block's own box. */
function box(address: string | null): DrawnBox {
  const found = boxOf(DRAWING, address);
  if (found === undefined) throw new Error(`no box at ${address}`);
  return found;
}

let mounted: ReturnType<typeof mount> | undefined;

function clear(): void {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
}

beforeEach(() => {
  stubCanvasGlobals(() => false);
});

afterEach(() => {
  clear();
  vi.unstubAllGlobals();
});

interface Shown {
  readonly buttons: readonly string[];
  readonly pressed: readonly string[];
  readonly disabled: readonly string[];
  readonly handles: readonly string[];
}

/** Mount the toolbar on block A for the box at `address` and return the actions' calls. */
function mountOn(level: Level, mode: ResizeMode, address: string | null, locked = false): Call[] {
  clear();
  const { actions, calls } = recordingActions(VIEW, { rules: LEVELS[level] });
  const toolbar = {
    block: BLOCK,
    box: box(address),
    level,
    bounds: { x: 0, y: 0, width: 100, height: 50 },
    zoom: 1,
    locked,
    mode,
  };
  mounted = mount(Harness, { target: document.body, props: { toolbar, actions } });
  flushSync();
  return calls;
}

/** What the toolbar shows for the box at `address`. */
function show(level: Level, mode: ResizeMode, address: string | null, locked = false): Shown {
  mountOn(level, mode, address, locked);
  const buttons = [...document.querySelectorAll("button[data-testid^='mode-']")];
  const label = (button: Element) => button.textContent ?? "";
  return {
    buttons: buttons.map(label),
    pressed: buttons.filter((b) => b.getAttribute("aria-pressed") === "true").map(label),
    disabled: buttons.filter((b) => (b as HTMLButtonElement).disabled).map(label),
    handles: [...document.querySelectorAll("[data-testid^='handle-']")].map(
      (handle) => handle.getAttribute("data-testid")?.slice("handle-".length) ?? "",
    ),
  };
}

/** The titles of the mode buttons shown. */
function titles(): string[] {
  return [...document.querySelectorAll("button[data-testid^='mode-']")].map(
    (button) => button.getAttribute("title") ?? "",
  );
}

function handle(name: string): Element {
  const found = document.querySelector(`[data-testid="handle-${name}"]`);
  if (found === null) throw new Error(`no handle ${name}`);
  return found;
}

/** The view `command` gives. */
function after(view: View, command: Parameters<typeof preview>[1]): View {
  const shown = preview(view, command);
  if (isCommandError(shown)) throw new Error(shown.message);
  return shown;
}

const EIGHT = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
];
const CORNERS = ["top-left", "top-right", "bottom-right", "bottom-left"];
const THREE = ["Scale", "Box", "Stretch"];

describe("the modes and handles", () => {
  it("offers a block every mode on the arranger", () => {
    expect(show("arranger", "stretch", null)).toEqual({
      buttons: THREE,
      pressed: ["Stretch"],
      disabled: [],
      handles: EIGHT,
    });
    expect(show("arranger", "scale", null).handles).toEqual(CORNERS);
    expect(titles()[2]).toBe("Stretch: stretch lengths and distances (3)");
  });

  it("shows no handle and disables the modes while locked", () => {
    expect(show("arranger", "box", null, true)).toEqual({
      buttons: THREE,
      pressed: ["Box"],
      disabled: THREE,
      handles: [],
    });
  });

  it("offers a frame every mode on the arranger, scaled from its corners", () => {
    expect(show("arranger", "scale", "group_1")).toEqual({
      buttons: THREE,
      pressed: ["Scale"],
      disabled: [],
      handles: CORNERS,
    });
    expect(titles()).toEqual([
      "Scale: scale everything, proportions kept (1)",
      "Box: resize the box, the content stays (2)",
      "Stretch: stretch lengths and distances (3)",
    ]);
  });

  it("offers the edited block and its cards every mode in the bundle editor", () => {
    expect(show("bundle", "box", null).handles).toEqual(EIGHT);
    expect(show("bundle", "stretch", "annotations/card")).toEqual({
      buttons: THREE,
      pressed: ["Stretch"],
      disabled: [],
      handles: EIGHT,
    });
  });

  it("offers the edited frame and its held cards every mode in the group editor", () => {
    expect(show("group", "box", "group_1").handles).toEqual(EIGHT);
    expect(show("group", "stretch", "group_1").handles).toEqual([
      "top",
      "top-right",
      "right",
      "bottom-right",
      "bottom",
    ]);
    expect(show("group", "scale", "performance/card")).toEqual({
      buttons: THREE,
      pressed: ["Scale"],
      disabled: [],
      handles: ["bottom-right"],
    });
    expect(titles()).toEqual([
      "Scale: scale the whole group (1)",
      "Box: resize the box, the content stays (2)",
      "Stretch: stretch every member's length, this card's distances (3)",
    ]);
    expect(show("group", "box", "performance/card").handles).toEqual([
      "right",
      "bottom-right",
      "bottom",
    ]);
  });

  it("offers the edited card every mode in the timeline editor", () => {
    expect(show("timeline", "box", "annotations/card").handles).toEqual(EIGHT);
    expect(show("timeline", "stretch", "score/card").handles).toEqual([
      "right",
      "bottom-right",
      "bottom",
    ]);
  });

  it("shows nothing where the level does not resize the box", () => {
    const nothing = { buttons: [], pressed: [], disabled: [], handles: [] };
    expect(show("group", "box", null)).toEqual(nothing);
    expect(show("timeline", "box", "group_1")).toEqual(nothing);
  });
});

describe("a handle's gesture", () => {
  it("resizes the block: previews the view its command gives and stores the command once", () => {
    const calls = mountOn("arranger", "box", null);
    const right = handle("right");
    pointer(right, "pointerdown", 100, 25);
    pointer(right, "pointermove", 160, 25);
    pointer(right, "pointerup", 160, 25);
    const { values } = resize(BLOCK, VIEW.settings, metrics, "box", "right", { dx: 60, dy: 0 });
    const command = resizeCommand(BLOCK, values);
    if (command === null) throw new Error("the resize changes nothing");
    expect(calls).toEqual([
      { preview: A, with: { view: after(VIEW, command) } },
      { dispatch: command },
      { preview: A, with: null },
    ]);
  });

  it("resizes a frame by the places its command states", () => {
    const calls = mountOn("arranger", "box", "group_1");
    const right = handle("right");
    pointer(right, "pointerdown", 100, 25);
    pointer(right, "pointerup", 160, 25);
    const places = itemResizeValues(
      VIEW,
      A,
      box("group_1"),
      "arranger",
      "box",
      "right",
      { dx: 60, dy: 0 },
      metrics,
    );
    const command = itemResizeCommand(VIEW, A, places, "arranger", metrics);
    if (command === null) throw new Error("the resize changes nothing");
    expect(calls).toEqual([
      { preview: A, with: { view: after(VIEW, command) } },
      { dispatch: command },
      { preview: A, with: null },
    ]);
  });

  it("is a click within the click distance, and stores nothing after Escape", () => {
    const calls = mountOn("arranger", "box", null);
    const right = handle("right");
    pointer(right, "pointerdown", 100, 25);
    pointer(right, "pointermove", 103, 25);
    pointer(right, "pointerup", 103, 25);
    expect(calls).toEqual([]);

    clear();
    const escaped = mountOn("arranger", "box", null);
    pointer(handle("right"), "pointerdown", 100, 25);
    pointer(handle("right"), "pointermove", 160, 25);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
    flushSync();
    pointer(handle("right"), "pointerup", 160, 25);
    expect(kinds(escaped)).toEqual(["preview", "preview"]);
    expect(escaped[1]).toEqual({ preview: A, with: null });
  });
});
