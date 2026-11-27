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
  brace,
  braceEnds,
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

/** The virtual end of chunk `index` of `id`: its brace's ends at its line's ordinate. */
function played(drawing: Drawing, id: string, index: number): RibbonEnd {
  const [, line] = lineOf(drawing, id, 0);
  return { ...braceEnds(drawing, id, index), y: line.y };
}

/** The ends of `ribbons`, in order. */
const ends = (ribbons: readonly Ribbon[]) => ribbons.map(({ from, to }) => ({ from, to }));

describe("chunkOf", () => {
  it("reads a chunk from its brace, label, leader and boundary, and nothing else", () => {
    expect(chunkOf(MANIFEST, brace(DEFAULT, 1))).toEqual({ timeline: DEFAULT, index: 1 });
    for (const word of ["label", "leader", "start"] as const) {
      const address: ElementAddress = { id: DEFAULT, facet: "regions", part: [2, word] };
      expect(chunkOf(MANIFEST, address)).toEqual({ timeline: DEFAULT, index: 2 });
    }
    expect(chunkOf(MANIFEST, { id: ROOT, facet: "regions" })).toBeNull();
    expect(chunkOf(MANIFEST, { id: DEFAULT, facet: "regions" })).toBeNull();
    expect(chunkOf(MANIFEST, idAddress(DEFAULT))).toBeNull();
    expect(chunkOf(MANIFEST, idAddress("section_a"))).toBeNull();
    expect(chunkOf(MANIFEST, { id: ROOT, facet: "regions", part: [0] })).toBeNull();
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

  it("joins A to its stretch and lights every other A, the run's brace first", () => {
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: DEFAULT, index: 0 });
    expect(ends(lights.ribbons)).toEqual([
      { from: played(DRAWING, DEFAULT, 0), to: written(DRAWING, ROOT, 0, 476.5) },
    ]);
    expect(lights.lit).toEqual([brace(BY_HAND, 0), brace(DEFAULT, 2)]);
  });

  it("starts a chunk after a run drawn once where its brace lies", () => {
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: BY_HAND, index: 5 });
    const line = DRAWING.elements.find(
      (element) => element.type === "timeline" && element.address.id === BY_HAND,
    );
    if (line?.type !== "timeline") throw new Error(`${BY_HAND} draws no line`);
    const from = played(DRAWING, BY_HAND, 5);
    expect(from.x1).not.toBe(line.xs + (1910 / 3054) * (line.xe - line.xs));
    expect(ends(lights.ribbons)).toEqual([{ from, to: written(DRAWING, ROOT, 500, 1644) }]);
    expect(lights.lit).toEqual([brace(DEFAULT, 3)]);
  });

  it("draws no ribbon from a run's later entry, which draws no brace, and still lights", () => {
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: BY_HAND, index: 1 });
    expect(lights.ribbons).toEqual([]);
    expect(lights.lit).toEqual([brace(BY_HAND, 0), brace(DEFAULT, 0), brace(DEFAULT, 2)]);
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

  it("gives several chunks' ribbons in turn and lights each other brace once", () => {
    const chunks = [
      { timeline: DEFAULT, index: 0 },
      { timeline: DEFAULT, index: 2 },
    ];
    const lights = allLights(MANIFEST, DRAWING, chunks);
    const one = chunkLights(MANIFEST, DRAWING, chunks[0] as (typeof chunks)[number]);
    const two = chunkLights(MANIFEST, DRAWING, chunks[1] as (typeof chunks)[number]);
    expect(lights.ribbons.map((ribbon) => ribbon.key)).toEqual([
      ...one.ribbons.map((ribbon) => `${addressKey(brace(DEFAULT, 0))}#${ribbon.key}`),
      ...two.ribbons.map((ribbon) => `${addressKey(brace(DEFAULT, 2))}#${ribbon.key}`),
    ]);
    expect(lights.lit).toEqual([brace(BY_HAND, 0)]);
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

  /** The regions band of `timeline` as the drawing records it: its top and bottom. */
  function bandOf(timeline: string): { top: number; bottom: number } {
    const box = DRAWING.boxes.find(
      (one) =>
        one.kind === "band" && one.address.id === timeline && one.address.facet === "regions",
    );
    if (box === undefined) throw new Error(`${timeline} draws no regions band`);
    return { top: box.y, bottom: box.y + box.height };
  }

  /** The zone of chunk `index` of `id` on its virtual card: its brace's ends, out to its band. */
  function onCard(id: string, index: number, y: number): ChunkZone {
    const { x1, x2 } = braceEnds(DRAWING, id, index);
    return { chunk: { timeline: id, index }, x1, x2, line: y, top: y, bottom: bandOf(id).bottom };
  }

  /** The zone of chunk `index` of `id` on `allegro`'s line, over the written `[s, e)`. */
  function onRoot(id: string, index: number, s: number, e: number): ChunkZone {
    const { x1, x2 } = written(DRAWING, ROOT, s, e);
    return { chunk: { timeline: id, index }, x1, x2, line: ROOT_Y, top: ROOT_Y, bottom: ROOT_Y };
  }

  const chunk = (timeline: string, index: number): ChunkRef => ({ timeline, index });

  it("lays a zone over every drawn brace and every written stretch it plays", () => {
    expect([DEFAULT_Y, bandOf(DEFAULT)]).toEqual([216, { top: 228, bottom: 246.4765625 }]);
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

  it("shows a chunk on its segment, its brace and the space between", () => {
    const brace2 = DRAWING.elements.find(
      (element) =>
        element.type === "region" &&
        element.address.id === DEFAULT &&
        element.address.part?.length === 1 &&
        element.address.part[0] === 2,
    );
    if (brace2?.type !== "region") throw new Error("no brace 2");
    const x = (brace2.x1 + brace2.x2) / 2;
    for (const y of [DEFAULT_Y, brace2.yb, (DEFAULT_Y + brace2.yb) / 2]) {
      expect(chunksAt(ZONES, { x, y }, 0)).toEqual([chunk(DEFAULT, 2)]);
    }
    expect(chunksAt(ZONES, { x: brace2.x2, y: DEFAULT_Y }, 0)).toEqual([chunk(DEFAULT, 3)]);
    expect(chunksAt(ZONES, { x, y: bandOf(DEFAULT).bottom + 1 }, 0)).toEqual([]);
    expect(chunksAt(ZONES, { x, y: DEFAULT_Y - 1 }, 0)).toEqual([]);
    expect(chunksAt(ZONES, { x, y: DEFAULT_Y - 1 }, 2)).toEqual([chunk(DEFAULT, 2)]);
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

  /** The drawn element of `svg` whose address is `address`, by its address attributes. */
  function drawnAt(svg: SVGSVGElement, address: ElementAddress): Element {
    const found = svg.querySelector(
      `[data-id="${address.id}"][data-facet="regions"][data-part="${address.part?.join(" ")}"]`,
    );
    if (found === null) throw new Error(`nothing drawn at ${addressKey(address)}`);
    return found;
  }

  const shown = (svg: SVGSVGElement) => ({
    ribbons: [...svg.querySelectorAll("g.tilie-ribbons path.tilie-ribbon")].map((path) =>
      path.getAttribute("d"),
    ),
    lit: [...svg.querySelectorAll("g.tilie-ribbons .tilie-lit")].map((copy) => ({
      d: copy.getAttribute("d"),
      addressed: ["data-id", "data-facet", "data-part"].some((name) => copy.hasAttribute(name)),
    })),
  });

  const braceD = (svg: SVGSVGElement, address: ElementAddress) =>
    drawnAt(svg, address).getAttribute("d");

  it("draws them while the pointer is on a chunk, letting the pointer through", () => {
    const svg = mountOn(VIEW);
    expect(svg.querySelector("g.tilie-ribbons")).toBeNull();
    pointer(drawnAt(svg, brace(DEFAULT, 0)), "pointermove", 0, 0);
    flushSync();
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: DEFAULT, index: 0 });
    expect(shown(svg)).toEqual({
      ribbons: lights.ribbons.map((ribbon) => ribbon.d),
      lit: [brace(BY_HAND, 0), brace(DEFAULT, 2)].map((address) => ({
        d: braceD(svg, address),
        addressed: false,
      })),
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

  it("draws them for a chunk's label too", () => {
    const svg = mountOn(VIEW);
    pointer(
      drawnAt(svg, { id: DEFAULT, facet: "regions", part: [1, "label"] }),
      "pointermove",
      0,
      0,
    );
    flushSync();
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: DEFAULT, index: 1 });
    expect(shown(svg)).toEqual({ ribbons: lights.ribbons.map((ribbon) => ribbon.d), lit: [] });
  });

  it("draws them where the pointer lies in a chunk's zone, off any element", () => {
    const svg = mountOn(VIEW);
    const { x1, x2 } = braceEnds(DRAWING, DEFAULT, 2);
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
    const svg = mountOn(VIEW, selectionOf([inBlock(A, brace(DEFAULT, 1))]));
    const lights = chunkLights(MANIFEST, DRAWING, { timeline: DEFAULT, index: 1 });
    expect(shown(svg)).toEqual({ ribbons: lights.ribbons.map((ribbon) => ribbon.d), lit: [] });
  });

  it("lights only braces drawn: C on the one placed card", () => {
    const view = placedVirtual(viewOf({ id: A, fixture: "flow/virtual_cards" }), DEFAULT, 0, 200);
    const svg = mountOn(view);
    pointer(drawnAt(svg, brace(DEFAULT, 3)), "pointermove", 0, 0);
    flushSync();
    expect(shown(svg).lit).toEqual([]);
    expect(shown(svg).ribbons).toHaveLength(1);
  });
});
