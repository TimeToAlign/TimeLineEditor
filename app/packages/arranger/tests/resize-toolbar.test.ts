// @vitest-environment jsdom
/**
 * The resize toolbar offers the modes and handles the open editor's
 * gestures allow, for a block or for an item of its drawing, mounted inside
 * a Svelte Flow canvas of one node.
 */

import type { EditorKind } from "@timetoalign/tilie-core";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Gestures } from "../src/editors.ts";
import { GESTURES } from "../src/editors.ts";
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
function show(
  gestures: Gestures,
  mode: ResizeMode,
  item?: { key: string; editor: EditorKind },
  locked = false,
): Shown {
  clear();
  const view = viewOf({ id: A, fixture: "bundles/bundle_mixed" });
  const toolbar = {
    block: blockIn(view, A),
    item,
    gestures,
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

describe("ResizeToolbar", () => {
  it("offers a block every mode on the arranger, as before", () => {
    expect(show(GESTURES.arranger, "stretch")).toEqual({
      buttons: ["Scale", "Box", "Stretch"],
      pressed: ["Stretch"],
      disabled: [],
      handles: EIGHT,
    });
    expect(show(GESTURES.arranger, "scale").handles).toEqual([
      "top-left",
      "top-right",
      "bottom-right",
      "bottom-left",
    ]);
  });

  it("shows no handle and disables the modes while locked", () => {
    expect(show(GESTURES.arranger, "box", undefined, true)).toEqual({
      buttons: ["Scale", "Box", "Stretch"],
      pressed: ["Box"],
      disabled: ["Scale", "Box", "Stretch"],
      handles: [],
    });
  });

  it("offers an item box and stretch in the bundle editor", () => {
    const item = { key: "group_2", editor: "bundle" as const };
    expect(show(GESTURES.bundle, "scale", item)).toEqual({
      buttons: ["Box", "Stretch"],
      pressed: ["Box"],
      disabled: [],
      handles: EIGHT,
    });
    expect(show(GESTURES.bundle, "stretch", item).handles).toEqual(["right", "left"]);
  });

  it("offers the edited frame its box and the members' stretch in the group editor", () => {
    const item = { key: "group_1", editor: "group" as const };
    expect(show(GESTURES.group, "box", item).buttons).toEqual(["Box", "Stretch"]);
    expect(show(GESTURES.group, "stretch", item).handles).toEqual(["right"]);
  });

  it("offers an ungrouped card only its stretch in the timeline editor", () => {
    const item = { key: "annotations", editor: "timeline" as const };
    expect(show(GESTURES.timeline, "box", item)).toEqual({
      buttons: ["Stretch"],
      pressed: ["Stretch"],
      disabled: [],
      handles: ["right", "left"],
    });
  });

  it("shows nothing where the editor allows no resize", () => {
    const nothing = { buttons: [], pressed: [], disabled: [], handles: [] };
    const member = { ...GESTURES.timeline, stretchCard: false };
    expect(show(member, "stretch", { key: "group_1", editor: "timeline" })).toEqual(nothing);
    expect(show(GESTURES.bundle, "box")).toEqual(nothing);
  });
});
