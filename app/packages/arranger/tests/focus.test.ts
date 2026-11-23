import type { Address } from "@timetoalign/tilie-core";
import { idAddress, inBlock } from "@timetoalign/tilie-core";
import { describe, expect, it } from "vitest";
import { elidedReach, FOCUS_DURATION, focusViewport, targetBounds } from "../src/focus.ts";
import type { BlockNode } from "../src/node.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import {
  A,
  changed,
  metrics,
  mixedView,
  viewOf,
  withFullCards,
  withoutAncestorCards,
} from "./support.ts";

/**
 * The node of block A, at `scale` when one is given, drawn without `recording`'s ancestor
 * card, whose room would move the block's place origin.
 */
function nodeOf(scale?: number): BlockNode {
  const mixed = withoutAncestorCards(mixedView());
  const view =
    scale === undefined
      ? mixed
      : changed(mixed, { type: "set", changes: [{ target: { block: A }, values: { scale } }] });
  const [node] = project(view, NOTHING_SELECTED, [], metrics, null);
  if (node === undefined) throw new Error("no node");
  return node;
}

describe("targetBounds", () => {
  const node = nodeOf();
  const at = (id: string): Address => inBlock(A, idAddress(id));

  it("is the block, a frame or a card on the canvas", () => {
    expect(targetBounds(node, { block: A }, metrics)).toEqual({
      x: 40,
      y: 80,
      width: 581.9150390625,
      height: 491.62890625,
    });
    expect(targetBounds(node, at("group_1"), metrics)).toEqual({
      x: 48,
      y: 108.8046875,
      width: 563.9150390625,
      height: 169.234375,
    });
    expect(targetBounds(node, at("annotations"), metrics)).toEqual({
      x: 48,
      y: 489.7734375,
      width: 563.9150390625,
      height: 71.85546875,
    });
  });

  it("spans a child's drawn elements, its line and its name", () => {
    expect(targetBounds(node, at("dlt_1"), metrics)).toEqual({
      x: 64,
      y: 376.91796875,
      width: 306.79150390625,
      height: 12.8046875,
    });
  });

  it("leaves out what an ancestor card draws behind the frames, and spans a raised card", () => {
    const full = withFullCards(mixedView());
    const [shown] = project(full, NOTHING_SELECTED, [], metrics, null);
    if (shown === undefined) throw new Error("no node");
    expect(targetBounds(shown, at("dlt_1"), metrics)).toEqual({
      x: 64,
      y: 376.91796875,
      width: 306.79150390625,
      height: 12.8046875,
    });
    const recording = at("recording");
    const [raised] = project(full, NOTHING_SELECTED, [], metrics, {
      target: recording,
      kind: "timeline",
    });
    if (raised === undefined) throw new Error("no node");
    expect(targetBounds(raised, recording, metrics)).toEqual({
      x: -97.412109375,
      y: 376.91796875,
      width: 2072.70361328125,
      height: 88.85546875,
    });
  });

  it("scales with the block", () => {
    expect(targetBounds(nodeOf(2), at("group_1"), metrics)).toEqual({
      x: 56,
      y: 137.609375,
      width: 1127.830078125,
      height: 338.46875,
    });
  });

  it("refuses a target of another block", () => {
    expect(() => targetBounds(node, inBlock("0000000009", idAddress("group_1")), metrics)).toThrow(
      RangeError,
    );
  });
});

describe("focusViewport", () => {
  const pane = { width: 1200, height: 800 };

  it.each([
    [
      { x: 100, y: 50, width: 320, height: 160 },
      { x: -120, y: 140, zoom: 2 },
    ],
    [
      { x: 100, y: 50, width: 10, height: 10 },
      { x: -20, y: 180, zoom: 4 },
    ],
    [
      { x: 100, y: 50, width: 100000, height: 100 },
      { x: -2105, y: 395, zoom: 0.05 },
    ],
  ])("centres %o left of the drawer", (bounds, viewport) => {
    expect(focusViewport(bounds, pane, 400)).toEqual(viewport);
  });

  it("uses the whole pane without a drawer", () => {
    expect(
      focusViewport({ x: 0, y: 0, width: 400, height: 100 }, { width: 1000, height: 500 }, 0),
    ).toEqual({ x: 100, y: 150, zoom: 2 });
  });

  it("takes a second", () => {
    expect(FOCUS_DURATION).toBe(1000);
  });
});

describe("a group's frame with elided ancestor cards", () => {
  const PANE = { width: 1280, height: 720 };
  const group = (id: string): Address => inBlock(A, idAddress(id));

  /** The node of `fixture` in block A at (0, 0), the editor of `editing` open, Full when `full`. */
  function opened(
    fixture: string,
    editing: Address,
    kind: "group" | "timeline" | "bundle",
    full = false,
  ) {
    const view = viewOf({ id: A, fixture });
    const [node] = project(full ? withFullCards(view) : view, NOTHING_SELECTED, [], metrics, {
      target: editing,
      kind,
    });
    if (node === undefined) throw new Error("no node");
    return node;
  }

  it("zooms out until group_grandchild's elided card fits around the frame", () => {
    const node = opened("groups/group_grandchild", group("group_1"), "group");
    expect(node.position.x).toBe(-141.99058314732133);
    const reach = elidedReach(node, group("group_1"));
    expect(reach).toBe(477.42323521205367);
    const bounds = targetBounds(node, group("group_1"), metrics);
    expect(focusViewport(bounds, PANE, 0)).toEqual({
      x: 112.932967521475,
      y: 145.7509180470676,
      zoom: 1.8833790598156273,
    });
    expect(focusViewport(bounds, PANE, 0, reach)).toEqual({
      x: 339.88028559950897,
      y: 238.00342399730465,
      zoom: 1.0724237159772683,
    });
  });

  it.each([
    ["group_1", 688.680908203125, 0.7434502596215237],
    ["group_2", 569.9776663078683, 0.8982808103983636],
    ["group_3", 520.5248352012404, 0.9836226158201565],
    ["group_4", 700.48876953125, 0.7309182134962962],
  ])("zooms LayerIt's %s to its elided card", (id, reach, zoom) => {
    const node = opened("bundles/bundle_elided_layerit", group(id), "group");
    expect(elidedReach(node, group(id))).toBe(reach);
    const bounds = targetBounds(node, group(id), metrics);
    expect(focusViewport(bounds, PANE, 0, reach).zoom).toBe(zoom);
  });

  it("keeps the frame's zoom in the Full view and for any other target", () => {
    const full = opened("groups/group_grandchild", group("group_1"), "group", true);
    expect(elidedReach(full, group("group_1"))).toBeNull();
    const timeline = opened("groups/group_grandchild", group("score"), "timeline");
    expect(elidedReach(timeline, group("score"))).toBeNull();
    const bundle = opened("groups/group_grandchild", { block: A }, "bundle");
    expect(elidedReach(bundle, { block: A })).toBeNull();
  });

  it("takes the reach's zoom where it is smaller, never below the smallest", () => {
    const bounds = { x: 0, y: 0, width: 400, height: 100 };
    const pane = { width: 1000, height: 500 };
    expect(focusViewport(bounds, pane, 0, 400)).toEqual({ x: 300, y: 200, zoom: 1 });
    expect(focusViewport(bounds, pane, 0, 100)).toEqual({ x: 100, y: 150, zoom: 2 });
    expect(focusViewport(bounds, pane, 0, 1e6).zoom).toBe(0.05);
  });
});
