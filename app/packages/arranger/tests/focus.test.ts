import type { Address } from "@timetoalign/tilie-core";
import { idAddress, inBlock } from "@timetoalign/tilie-core";
import { boundsOf, TextMeasure } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import { boxOf, keyedBox } from "../src/boxes.ts";
import {
  elidedReach,
  FOCUS_DURATION,
  focusedOf,
  focusViewport,
  targetBounds,
} from "../src/focus.ts";
import { rectOnCanvas } from "../src/marquee.ts";
import type { BlockNode } from "../src/node.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import {
  A,
  changed,
  metrics,
  mixedView,
  viewOf,
  withAutoElisions,
  withFullCards,
  withoutAncestorCards,
} from "./support.ts";
import { DEFAULT, ROOT, virtualView } from "./virtualCards.ts";

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
      width: 579.052001953125,
      height: 469.14453125,
    });
    expect(targetBounds(node, at("group_1"), metrics)).toEqual({
      x: 48,
      y: 292.5625,
      width: 561.052001953125,
      height: 166.7265625,
    });
    expect(targetBounds(node, at("annotations"), metrics)).toEqual({
      x: 48,
      y: 467.2890625,
      width: 561.052001953125,
      height: 71.85546875,
    });
  });

  it("is a drawn band's own rectangle, and a band not drawn stands for its timeline", () => {
    const band = { id: "excerpt", facet: "children" } as const;
    const drawn = boxOf(node.data.drawing, band);
    if (drawn === undefined) throw new Error("no children band");
    expect(targetBounds(node, inBlock(A, band), metrics)).toEqual(rectOnCanvas(node, drawn));
    expect(targetBounds(node, inBlock(A, { id: "dlt_1", facet: "regions" }), metrics)).toEqual(
      targetBounds(node, at("dlt_1"), metrics),
    );
  });

  it("centres a children editor on its timeline's children band, every other on its target", () => {
    expect(focusedOf(at("excerpt"), "children")).toEqual({
      block: A,
      id: "excerpt",
      facet: "children",
    });
    for (const kind of ["timeline", "flow", "group"] as const) {
      expect(focusedOf(at("excerpt"), kind)).toEqual(at("excerpt"));
    }
  });

  it("spans a child's drawn elements, its line and its name", () => {
    expect(targetBounds(node, at("dlt_1"), metrics)).toEqual({
      x: 64,
      y: 199.68359375,
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
      y: 199.68359375,
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
      x: -215.70361328125,
      y: 133.609375,
      width: 2233.755615234375,
      height: 142.953125,
    });
  });

  it("scales with the block", () => {
    expect(targetBounds(nodeOf(2), at("group_1"), metrics)).toEqual({
      x: 56,
      y: 505.125,
      width: 1122.10400390625,
      height: 333.453125,
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

  /**
   * The node of `fixture` in block A at (0, 0), its ancestor cards deriving their elisions
   * (`elision-mode` `auto`), the editor of `editing` open, Full when `full`.
   */
  function opened(
    fixture: string,
    editing: Address,
    kind: "group" | "timeline" | "bundle",
    full = false,
  ) {
    const view = withAutoElisions(viewOf({ id: A, fixture }));
    const [node] = project(full ? withFullCards(view) : view, NOTHING_SELECTED, [], metrics, {
      target: editing,
      kind,
    });
    if (node === undefined) throw new Error("no node");
    return node;
  }

  it("zooms out until group_grandchild's elided card fits around the frame", () => {
    const node = opened("groups/group_grandchild", group("group_1"), "group");
    expect(node.position.x).toBe(-245.69419642857133);
    const reach = elidedReach(node, group("group_1"));
    expect(reach).toBe(517.5460030691963);
    const bounds = targetBounds(node, group("group_1"), metrics);
    expect(focusViewport(bounds, PANE, 0)).toEqual({
      x: 112.932967521475,
      y: 164.56263779686665,
      zoom: 1.8833790598156273,
    });
    expect(focusViewport(bounds, PANE, 0, reach)).toEqual({
      x: 363.14707455900725,
      y: 257.3424590569266,
      zoom: 0.9892840384500954,
    });
  });

  it.each([
    ["group_1", 726.0790527343779, 0.7051573765581493],
    ["group_2", 609.9776663078683, 0.8393749940044248],
    ["group_3", 655.4553894081382, 0.7811363035130807],
    ["group_4", 716.8000000000029, 0.7142857142857114],
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

describe("targetBounds on a virtual card's windows", () => {
  /** `virtualView()` with the child `theme` [100, 150] in `allegro`, the sources' children shown on `allegro_default`. */
  const view = changed(
    changed(virtualView(), {
      type: "add",
      into: inBlock(A, idAddress(ROOT)),
      child: { id: "theme", unit: "quarters", offset: [100, 1], length: [50, 1] },
    }),
    {
      type: "style",
      select: { facet: "children", inside: "chunk", within: DEFAULT },
      set: { display: "inline" },
      blocks: [A],
    },
  );
  const [node] = project(view, NOTHING_SELECTED, [], metrics, null);
  if (node === undefined) throw new Error("no node");
  const { drawing } = node.data;
  const cardOf = (id: string) => {
    const box = keyedBox(drawing, { item: id });
    if (box === undefined) throw new Error(`no card of ${id}`);
    return box;
  };
  /** The rectangle on the canvas spanning the drawings of `theme` inside the card of `id`. */
  const spanIn = (id: string) => {
    const { range } = cardOf(id);
    const measure = new TextMeasure(metrics);
    const spans = drawing.elements
      .slice(range.start, range.end)
      .filter((drawn) => drawn.address.id === "theme")
      .map((drawn) => boundsOf(drawn, measure));
    const x = Math.min(...spans.map((span) => span.left));
    const y = Math.min(...spans.map((span) => span.top));
    const right = Math.max(...spans.map((span) => span.right));
    const bottom = Math.max(...spans.map((span) => span.bottom));
    return {
      count: spans.length,
      rect: rectOnCanvas(node, { x, y, width: right - x, height: bottom - y }),
    };
  };

  it("frames a child where it is written, never its copies in a window", () => {
    // Its line in each window playing A (chunks 0 and 2), its name once in its row.
    expect(spanIn(DEFAULT).count).toBe(3);
    expect(targetBounds(node, inBlock(A, idAddress("theme")), metrics)).toEqual(spanIn(ROOT).rect);
  });

  it("frames a virtual timeline's editor on its card", () => {
    expect(targetBounds(node, inBlock(A, idAddress(DEFAULT)), metrics)).toEqual(
      rectOnCanvas(node, cardOf(DEFAULT)),
    );
  });
});
