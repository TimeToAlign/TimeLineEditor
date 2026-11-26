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
import type { Ribbon, RibbonEnd } from "../src/ribbons.ts";
import { allLights, chunkLights, chunkOf, NO_LIGHTS, ribbonPath } from "../src/ribbons.ts";
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
