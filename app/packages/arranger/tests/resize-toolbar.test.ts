// @vitest-environment jsdom
/**
 * The resize toolbar offers the modes and handles the level allows, for a
 * block or for a frame or card of its drawing, mounted inside a Svelte Flow
 * canvas of one node.
 */

import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Level } from "../src/editors.ts";
import type { ResizedItem } from "../src/gestures.svelte.ts";
import type { ResizeMode } from "../src/resize.ts";
import { A, blockIn, metrics, viewOf } from "./support.ts";
import Harness from "./ToolbarHarness.svelte";

beforeAll(() => {
  // Svelte Flow measures its pane and follows the reduced-motion query, neither of which jsdom has.
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  Object.assign(window, {
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  });
});

let mounted: ReturnType<typeof mount> | undefined;

function clear(): void {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
}

afterEach(clear);

interface Shown {
  readonly buttons: readonly string[];
  readonly pressed: readonly string[];
  readonly disabled: readonly string[];
  readonly handles: readonly string[];
}

/** Mount the toolbar alone on block `A` holding `bundle_mixed` and read what it shows. */
function show(level: Level, mode: ResizeMode, item?: ResizedItem, locked = false): Shown {
  clear();
  const view = viewOf({ id: A, fixture: "bundles/bundle_mixed" });
  const toolbar = {
    block: blockIn(view, A),
    item,
    level,
    box: { x: 0, y: 0, width: 100, height: 50 },
    view,
    metrics,
    zoom: 1,
    locked,
    mode,
    onresize() {},
    onresizeend() {},
    onresizecancel() {},
  };
  mounted = mount(Harness, { target: document.body, props: { toolbar } });
  flushSync();
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
const FRAME: ResizedItem = { kind: "frame", key: "group_1", item: "group_1" };
const CARD: ResizedItem = { kind: "card", key: "annotations", item: "annotations" };
const PERFORMANCE: ResizedItem = { kind: "member", key: "performance", item: "group_1" };
const SCORE: ResizedItem = { kind: "member", key: "score", item: "group_1" };

describe("ResizeToolbar", () => {
  it("offers a block every mode on the arranger, as before", () => {
    expect(show("arranger", "stretch")).toEqual({
      buttons: THREE,
      pressed: ["Stretch"],
      disabled: [],
      handles: EIGHT,
    });
    expect(show("arranger", "scale").handles).toEqual(CORNERS);
    expect(titles()[2]).toBe("Stretch: stretch lengths and distances (3)");
  });

  it("shows no handle and disables the modes while locked", () => {
    expect(show("arranger", "box", undefined, true)).toEqual({
      buttons: THREE,
      pressed: ["Box"],
      disabled: THREE,
      handles: [],
    });
  });

  it("offers a frame every mode on the arranger, scaled from its corners", () => {
    expect(show("arranger", "scale", FRAME)).toEqual({
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
    expect(show("bundle", "box")).toEqual({
      buttons: THREE,
      pressed: ["Box"],
      disabled: [],
      handles: EIGHT,
    });
    expect(show("bundle", "stretch", CARD)).toEqual({
      buttons: THREE,
      pressed: ["Stretch"],
      disabled: [],
      handles: EIGHT,
    });
  });

  it("offers the edited frame and its members' cards every mode in the group editor", () => {
    expect(show("group", "box", FRAME).buttons).toEqual(THREE);
    expect(show("group", "box", FRAME).handles).toEqual(EIGHT);
    expect(show("group", "stretch", FRAME).handles).toEqual([
      "top",
      "top-right",
      "right",
      "bottom-right",
      "bottom",
    ]);
    expect(show("group", "scale", PERFORMANCE)).toEqual({
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
    expect(show("group", "box", PERFORMANCE).handles).toEqual(["right", "bottom-right", "bottom"]);
    expect(show("group", "stretch", PERFORMANCE).handles).toEqual([
      "right",
      "bottom-right",
      "bottom",
    ]);
  });

  it("offers the edited card every mode in the timeline editor", () => {
    expect(show("timeline", "box", CARD)).toEqual({
      buttons: THREE,
      pressed: ["Box"],
      disabled: [],
      handles: EIGHT,
    });
    expect(show("timeline", "stretch", SCORE)).toEqual({
      buttons: THREE,
      pressed: ["Stretch"],
      disabled: [],
      handles: ["right", "bottom-right", "bottom"],
    });
  });

  it("shows nothing where the level does not resize the box", () => {
    const nothing = { buttons: [], pressed: [], disabled: [], handles: [] };
    expect(show("group", "box")).toEqual(nothing);
    expect(show("timeline", "box", FRAME)).toEqual(nothing);
  });
});
