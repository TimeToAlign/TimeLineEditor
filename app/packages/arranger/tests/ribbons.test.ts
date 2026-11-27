// @vitest-environment jsdom
/**
 * The ribbons of a virtual card's chunk (README, "Virtual cards, ribbons,
 * the flow flag and the flow switch"): which addresses name a chunk, each
 * ribbon's two ends read off the drawing, the chunks lit, and the block
 * node drawing them as an overlay while a chunk is hovered or selected.
 */

import type { ElementAddress, View } from "@timetoalign/tilie-core";
import { addressKey, idAddress, inBlock } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { TextMeasure } from "@timetoalign/tilie-layout";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BlockNodeData } from "../src/node.ts";
import { project } from "../src/project.ts";
import type { ChunkRef, ChunkZone, Ribbon, RibbonEnd } from "../src/ribbons.ts";
import {
  allLights,
  chunkLights,
  chunkOf,
  chunksAt,
  chunkZones,
  NO_LIGHTS,
  ribbonPath,
} from "../src/ribbons.ts";
import type { Selection } from "../src/selection.ts";
import { NOTHING_SELECTED, selectionOf } from "../src/selection.ts";
import {
  IDENTITY,
  pointer,
  recordingActions,
  stubPointerCapture,
  withScreenMatrix,
} from "./dom.ts";
import NodeHarness from "./NodeHarness.svelte";
import { A, blockIn, metrics, viewOf } from "./support.ts";
import {
  BY_HAND,
  chunkAt,
  chunkSpan,
  DEFAULT,
  drawingIn,
  lineOf,
  placedVirtual,
  ROOT,
  virtualView,
} from "./virtualCards.ts";

const VIEW = virtualView();
const MANIFEST = blockIn(VIEW, A).manifest;
const DRAWING = drawingIn(VIEW);

/** Where the written stretch `[s, e)` lies on the one line of `timeline`, as the README derives it. */
function written(drawing: Drawing, timeline: string, s: number, e: number): RibbonEnd {
  const [, line] = lineOf(drawing, timeline);
  const at = (value: number) => line.xStart + (value / 1644) * (line.xEnd - line.xStart);
  expect([String(line.start), String(line.length)]).toEqual(["0", "1644"]);
  return { x1: at(s), x2: at(e), y: line.y };
}

/** The virtual end of chunk `index` of `id`: its drawn span's ends at its line's ordinate. */
function played(drawing: Drawing, id: string, index: number): RibbonEnd {
  const [, line] = lineOf(drawing, id, 0);
  const { x1, x2 } = chunkSpan(drawing, id, index);
  return { x1, x2, y: line.y };
}

/** The ends of `ribbons`, in order. */
const ends = (ribbons: readonly Ribbon[]) => ribbons.map(({ from, to }) => ({ from, to }));

describe("chunkOf", () => {
  it("reads a chunk from its address, its label, leader and boundary and its window's bands", () => {
    expect(chunkOf(MANIFEST, chunkAt(DEFAULT, 1))).toEqual({ timeline: DEFAULT, index: 1 });
    for (const word of ["label", "leader", "start"] as const) {
      const address: ElementAddress = { id: DEFAULT, part: [2, word] };
      expect(chunkOf(MANIFEST, address)).toEqual({ timeline: DEFAULT, index: 2 });
    }
    const band: ElementAddress = { id: DEFAULT, facet: "children", part: [2] };
    expect(chunkOf(MANIFEST, band)).toEqual({ timeline: DEFAULT, index: 2 });
    expect(chunkOf(MANIFEST, { id: ROOT, facet: "regions" })).toBeNull();
    expect(chunkOf(MANIFEST, { id: DEFAULT, facet: "regions" })).toBeNull();
    expect(chunkOf(MANIFEST, idAddress(DEFAULT))).toBeNull();
    expect(chunkOf(MANIFEST, idAddress("section_a"))).toBeNull();
    // A switched card's chunk is no chunk of a virtual timeline.
    expect(chunkOf(MANIFEST, { id: ROOT, part: [0] })).toBeNull();
  });
});

describe("chunkLights", () => {
  it("joins B to its written stretch and lights nothing", () => {
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: DEFAULT, index: 1 });
    const from = played(DRAWING, DEFAULT, 1);
    const to = written(DRAWING, ROOT, 476.5, 500);
    expect(ends(lights.ribbons)).toEqual([{ from, to }]);
    expect(lights.ribbons[0]?.d).toBe(ribbonPath(from, to));
    expect(lights.lit).toEqual([]);
  });

  it("joins A to its stretch and lights every other A, the run's chunk first", () => {
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: DEFAULT, index: 0 });
    expect(ends(lights.ribbons)).toEqual([
      { from: played(DRAWING, DEFAULT, 0), to: written(DRAWING, ROOT, 0, 476.5) },
    ]);
    expect(lights.lit).toEqual([chunkAt(BY_HAND, 0), chunkAt(DEFAULT, 2)]);
  });

  it("starts a chunk after a run drawn once where its drawn span lies", () => {
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: BY_HAND, index: 5 });
    const line = DRAWING.elements.find(
      (element) => element.type === "timeline" && element.address.id === BY_HAND,
    );
    if (line?.type !== "timeline") throw new Error(`${BY_HAND} draws no line`);
    const from = played(DRAWING, BY_HAND, 5);
    expect(from.x1).not.toBe(line.xs + (1910 / 3054) * (line.xe - line.xs));
    expect(ends(lights.ribbons)).toEqual([{ from, to: written(DRAWING, ROOT, 500, 1644) }]);
    expect(lights.lit).toEqual([chunkAt(DEFAULT, 3)]);
  });

  it("draws no ribbon from a run's later entry, which is not drawn, and still lights", () => {
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: BY_HAND, index: 1 });
    expect(lights.ribbons).toEqual([]);
    expect(lights.lit).toEqual([chunkAt(BY_HAND, 0), chunkAt(DEFAULT, 0), chunkAt(DEFAULT, 2)]);
  });

  it("shows nothing for a gap", () => {
    expect(chunkLights(MANIFEST, DRAWING, { timeline: BY_HAND, index: 4 })).toBe(NO_LIGHTS);
  });

  it("joins a member card's chunk to the root's card", () => {
    const view = viewOf({ id: A, fixture: "groups/virtual_member" });
    const drawing = drawingIn(view);
    const manifest = blockIn(view, A).manifest;
    const lights = chunkLights(manifest, drawing, { timeline: DEFAULT, index: 1 });
    expect(ends(lights.ribbons)).toEqual([
      { from: played(drawing, DEFAULT, 1), to: written(drawing, ROOT, 476.5, 500) },
    ]);
  });

  it("gives several chunks' ribbons in turn and lights each other chunk once", () => {
    const chunks = [
      { timeline: DEFAULT, index: 0 },
      { timeline: DEFAULT, index: 2 },
    ];
    const lights = allLights(MANIFEST, DRAWING, chunks);
    const one = chunkLights(MANIFEST, DRAWING, chunks[0] as (typeof chunks)[number]);
    const two = chunkLights(MANIFEST, DRAWING, chunks[1] as (typeof chunks)[number]);
    expect(lights.ribbons.map((ribbon) => ribbon.key)).toEqual([
      ...one.ribbons.map((ribbon) => `${addressKey(chunkAt(DEFAULT, 0))}#${ribbon.key}`),
      ...two.ribbons.map((ribbon) => `${addressKey(chunkAt(DEFAULT, 2))}#${ribbon.key}`),
    ]);
    expect(lights.lit).toEqual([chunkAt(BY_HAND, 0)]);
    expect(allLights(MANIFEST, DRAWING, [])).toBe(NO_LIGHTS);
  });

  it("writes a ribbon's path from its two ends", () => {
    const path = ribbonPath({ x1: 1, x2: 3, y: 10 }, { x1: 5, x2: 9, y: 2 });
    expect(path).toBe("M 1 10 L 3 10 C 3 6 9 6 9 2 L 5 2 C 5 6 1 6 1 10 Z");
  });
});

describe("chunkZones and chunksAt", () => {
  const ZONES = chunkZones(MANIFEST, DRAWING);
  const ROOT_Y = lineOf(DRAWING, ROOT)[1].y;
  const DEFAULT_Y = lineOf(DRAWING, DEFAULT)[1].y;
  const BY_HAND_Y = lineOf(DRAWING, BY_HAND, 0)[1].y;

  /** The zone of chunk `index` of `id` on its virtual card: its drawn span, up to its label's top. */
  function onCard(id: string, index: number, y: number): ChunkZone {
    const { x1, x2, top } = chunkSpan(DRAWING, id, index);
    return { chunk: { timeline: id, index }, x1, x2, line: y, top, bottom: y };
  }

  /** The zone of chunk `index` of `id` on `allegro`'s line, over the written `[s, e)`. */
  function onRoot(id: string, index: number, s: number, e: number): ChunkZone {
    const { x1, x2 } = written(DRAWING, ROOT, s, e);
    return { chunk: { timeline: id, index }, x1, x2, line: ROOT_Y, top: ROOT_Y, bottom: ROOT_Y };
  }

  const chunk = (timeline: string, index: number): ChunkRef => ({ timeline, index });

  it("lays a zone over every drawn chunk and every written stretch it plays", () => {
    // A label in tier 1 of a line with boundaries: baseline `y − (k + 2) − d(9)`, top 9 above it.
    expect(chunkSpan(DRAWING, DEFAULT, 2).top).toBe(
      DEFAULT_Y - 10 - new TextMeasure(metrics).descent(9) - 9,
    );
    expect(
      DRAWING.boxes.some(
        (box) => box.kind === "band" && box.address.id === ROOT && box.address.facet === "regions",
      ),
    ).toBe(false);
    expect(ZONES).toEqual([
      onCard(BY_HAND, 0, BY_HAND_Y),
      onRoot(BY_HAND, 0, 0, 476.5),
      onCard(BY_HAND, 5, BY_HAND_Y),
      onRoot(BY_HAND, 5, 500, 1644),
      onCard(DEFAULT, 0, DEFAULT_Y),
      onRoot(DEFAULT, 0, 0, 476.5),
      onCard(DEFAULT, 1, DEFAULT_Y),
      onRoot(DEFAULT, 1, 476.5, 500),
      onCard(DEFAULT, 2, DEFAULT_Y),
      onRoot(DEFAULT, 2, 0, 476.5),
      onCard(DEFAULT, 3, DEFAULT_Y),
      onRoot(DEFAULT, 3, 500, 1644),
    ]);
  });

  it("shows a chunk on its segment, its label and the space between", () => {
    const two = chunkSpan(DRAWING, DEFAULT, 2);
    const x = (two.x1 + two.x2) / 2;
    for (const y of [DEFAULT_Y, two.top, (DEFAULT_Y + two.top) / 2]) {
      expect(chunksAt(ZONES, { x, y }, 0)).toEqual([chunk(DEFAULT, 2)]);
    }
    expect(chunksAt(ZONES, { x: two.x2, y: DEFAULT_Y }, 0)).toEqual([chunk(DEFAULT, 3)]);
    expect(chunksAt(ZONES, { x, y: two.top - 1 }, 0)).toEqual([]);
    expect(chunksAt(ZONES, { x, y: DEFAULT_Y + 1 }, 0)).toEqual([]);
    expect(chunksAt(ZONES, { x, y: DEFAULT_Y + 1 }, 2)).toEqual([chunk(DEFAULT, 2)]);
  });

  it("shows every chunk playing a written section on the source's line", () => {
    const at = (value: number) => written(DRAWING, ROOT, value, value).x1;
    expect(chunksAt(ZONES, { x: at(953 / 4), y: ROOT_Y }, 0)).toEqual([
      chunk(BY_HAND, 0),
      chunk(DEFAULT, 0),
      chunk(DEFAULT, 2),
    ]);
    expect(chunksAt(ZONES, { x: at(1072), y: ROOT_Y }, 0)).toEqual([
      chunk(BY_HAND, 5),
      chunk(DEFAULT, 3),
    ]);
    expect(chunksAt(ZONES, { x: at(488.25), y: ROOT_Y }, 0)).toEqual([chunk(DEFAULT, 1)]);
  });

  it("has no zones in a block placing no virtual card", () => {
    const view = viewOf({ id: A, fixture: "flow/virtual_cards" });
    expect(chunkZones(blockIn(view, A).manifest, drawingIn(view))).toEqual([]);
  });
});

describe("the block node's ribbons", () => {
  let mounted: ReturnType<typeof mount> | undefined;

  beforeEach(stubPointerCapture);

  afterEach(() => {
    if (mounted !== undefined) unmount(mounted);
    mounted = undefined;
    document.body.innerHTML = "";
  });

  function mountOn(view: View, selection: Selection = NOTHING_SELECTED): SVGSVGElement {
    const node = project(view, selection, [], metrics, null).find((found) => found.id === A);
    if (node === undefined) throw new Error("no node for A");
    const { actions } = recordingActions(view);
    const data: BlockNodeData = node.data;
    mounted = mount(NodeHarness, { target: document.body, props: { data, actions } });
    flushSync();
    const svg = document.querySelector("svg");
    if (svg === null) throw new Error("the block node rendered no svg");
    withScreenMatrix(svg, () => IDENTITY);
    return svg;
  }

  /** The drawn element of `svg` whose address is `address` (no facet), by its address attributes. */
  function drawnAt(svg: SVGSVGElement, address: ElementAddress): Element {
    const found = svg.querySelector(
      `[data-id="${address.id}"][data-part="${address.part?.join(" ")}"]:not([data-facet])`,
    );
    if (found === null) throw new Error(`nothing drawn at ${addressKey(address)}`);
    return found;
  }

  const shown = (svg: SVGSVGElement) => ({
    ribbons: [...svg.querySelectorAll("g.tilie-ribbons path.tilie-ribbon")].map((path) =>
      path.getAttribute("d"),
    ),
    lit: [...svg.querySelectorAll("g.tilie-ribbons .tilie-lit")].map((copy) => ({
      line: ["x1", "x2", "y1", "y2"].map((name) => Number(copy.getAttribute(name))),
      addressed: ["data-id", "data-facet", "data-part"].some((name) => copy.hasAttribute(name)),
    })),
  });

  /** A lit chunk's copy: a line over its drawn span at its line's ordinate. */
  const litLine = (id: string, index: number) => {
    const { x1, x2, y } = chunkSpan(DRAWING, id, index);
    return [x1, x2, y, y];
  };

  it("draws them while the pointer is on a chunk, letting the pointer through", () => {
    const svg = mountOn(VIEW);
    expect(svg.querySelector("g.tilie-ribbons")).toBeNull();
    pointer(drawnAt(svg, { id: DEFAULT, part: [0, "label"] }), "pointermove", 0, 0);
    flushSync();
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: DEFAULT, index: 0 });
    expect(shown(svg)).toEqual({
      ribbons: lights.ribbons.map((ribbon) => ribbon.d),
      lit: [litLine(BY_HAND, 0), litLine(DEFAULT, 2)].map((line) => ({ line, addressed: false })),
    });
    const group = svg.querySelector("g.tilie-ribbons");
    expect(group?.getAttribute("pointer-events")).toBe("none");
    expect(["data-id", "data-facet", "data-part"].some((name) => group?.hasAttribute(name))).toBe(
      false,
    );
    svg.dispatchEvent(new PointerEvent("pointerleave"));
    flushSync();
    expect(svg.querySelector("g.tilie-ribbons")).toBeNull();
  });

  it("draws them for a chunk's label alone, lighting no other B", () => {
    const svg = mountOn(VIEW);
    pointer(drawnAt(svg, { id: DEFAULT, part: [1, "label"] }), "pointermove", 0, 0);
    flushSync();
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: DEFAULT, index: 1 });
    expect(shown(svg)).toEqual({ ribbons: lights.ribbons.map((ribbon) => ribbon.d), lit: [] });
  });

  it("draws them where the pointer lies in a chunk's zone, off any element", () => {
    const svg = mountOn(VIEW);
    const { x1, x2 } = chunkSpan(DRAWING, DEFAULT, 2);
    pointer(svg, "pointermove", (x1 + x2) / 2, lineOf(DRAWING, DEFAULT)[1].y);
    const two = chunkLights(MANIFEST, DRAWING, { timeline: DEFAULT, index: 2 });
    expect(shown(svg).ribbons).toEqual(two.ribbons.map((ribbon) => ribbon.d));
    const [, root] = lineOf(DRAWING, ROOT);
    pointer(svg, "pointermove", written(DRAWING, ROOT, 953 / 4, 953 / 4).x1, root.y);
    const playing = [
      { timeline: BY_HAND, index: 0 },
      { timeline: DEFAULT, index: 0 },
      { timeline: DEFAULT, index: 2 },
    ];
    expect(shown(svg)).toEqual({
      ribbons: allLights(MANIFEST, DRAWING, playing).ribbons.map((ribbon) => ribbon.d),
      lit: [],
    });
    expect(shown(svg).ribbons).toHaveLength(3);
  });

  it("draws them for a selected chunk without a pointer", () => {
    const svg = mountOn(VIEW, selectionOf([inBlock(A, chunkAt(DEFAULT, 1))]));
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: DEFAULT, index: 1 });
    expect(shown(svg)).toEqual({ ribbons: lights.ribbons.map((ribbon) => ribbon.d), lit: [] });
  });

  it("lights only chunks drawn: C on the one placed card", () => {
    const view = placedVirtual(viewOf({ id: A, fixture: "flow/virtual_cards" }), DEFAULT, 0, 200);
    const svg = mountOn(view);
    pointer(drawnAt(svg, { id: DEFAULT, part: [3, "label"] }), "pointermove", 0, 0);
    flushSync();
    expect(shown(svg).lit).toEqual([]);
    expect(shown(svg).ribbons).toHaveLength(1);
  });
});
