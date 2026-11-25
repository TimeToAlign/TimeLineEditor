// @vitest-environment jsdom
/**
 * A child's read-only flow control band (README, "A child's read-only flow
 * control band"): shown in the timeline editor of a child drawn as a line
 * in a card, holding the card's flow control on the child's stretch as the
 * card's band draws it, without addresses, never part of the drawing.
 */

import type { View } from "@timetoalign/tilie-core";
import { idAddress, inBlock } from "@timetoalign/tilie-core";
import { toDescriptors } from "@timetoalign/tilie-writers";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { rulesOf } from "../src/containers.ts";
import { drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { type FlowOverlay, flowOverlays } from "../src/flowOverlay.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED } from "../src/selection.ts";
import { recordingActions } from "./dom.ts";
import NodeHarness from "./NodeHarness.svelte";
import { A, B, blockIn, changed, metrics, viewOf } from "./support.ts";

/** The timeline editor of `id` in block `block`. */
const timelineEditor = (id: string, block = A): Editing => ({
  target: inBlock(block, idAddress(id)),
  kind: "timeline",
});

/** The overlays block A of `view` shows under `editing`. */
function overlaysOf(view: View, editing: Editing | null): FlowOverlay[] {
  const block = blockIn(view, A);
  const drawing = drawingOf(block, view.graphical, metrics);
  return flowOverlays(block, drawing, toDescriptors(drawing), editing, metrics);
}

/** What an overlay holds: each element as `<type> <address key>`, from the drawing. */
function heldOf(view: View, overlay: FlowOverlay): string[] {
  const drawing = drawingOf(blockIn(view, A), view.graphical, metrics);
  return overlay.elements.map((index) => {
    const element = drawing.elements[index];
    return `${element?.type} ${JSON.stringify(element?.address)}`;
  });
}

const CHILD_FLOW = viewOf({ id: A, fixture: "child_flow_control" });
const OSSIA = viewOf({ id: A, fixture: "flow/ossia" });

describe("when the read-only band appears", () => {
  it("appears in a child's timeline editor alone", () => {
    expect(overlaysOf(CHILD_FLOW, timelineEditor("verse"))).toHaveLength(1);
    expect(overlaysOf(CHILD_FLOW, null)).toEqual([]);
    expect(overlaysOf(CHILD_FLOW, { target: { block: A }, kind: "bundle" })).toEqual([]);
    expect(overlaysOf(CHILD_FLOW, timelineEditor("piece"))).toEqual([]);
    expect(overlaysOf(CHILD_FLOW, timelineEditor("verse", B))).toEqual([]);
  });

  it("is absent where the root's tree states no flow control", () => {
    expect(overlaysOf(viewOf({ id: A, fixture: "nested" }), timelineEditor("clt_3"))).toEqual([]);
  });

  it("is absent for a member that is a child, whose card draws its root's flow control", () => {
    const view = changed(viewOf({ id: A, fixture: "groups/group_child_member" }), {
      type: "add",
      into: inBlock(A, idAddress("piece")),
      flow_control: { id: "barline_1", role: "barline", coordinate: [12, 1] },
    });
    expect(overlaysOf(view, timelineEditor("second-half"))).toEqual([]);
  });
});

describe("what the read-only band holds", () => {
  it("holds the card's flow control on the child's stretch, as the card's band draws it", () => {
    const [overlay] = overlaysOf(CHILD_FLOW, timelineEditor("verse"));
    if (overlay === undefined) throw new Error("no overlay");
    expect(heldOf(CHILD_FLOW, overlay)).toEqual([
      'break {"id":"fine"}',
      'label {"id":"fine","part":["label"]}',
      'symbol {"id":"fine","part":["symbol"]}',
      'symbol {"id":"da_capo_al_fine","part":["symbol"]}',
    ]);
    expect(overlay.items.map(({ tag, text }) => [tag, text])).toEqual([
      ["line", null],
      ["text", "Fine"],
      ["text", "Fine"],
      ["text", "\u{1D10A}"],
    ]);
    for (const { attributes } of overlay.items) {
      expect(Object.keys(attributes).filter((name) => name.startsWith("data-"))).toEqual([]);
    }
    const [line] = overlay.items;
    expect([line?.attributes.x1, line?.attributes.y1, line?.attributes.y2]).toEqual([
      "255.3135",
      "67.9766",
      "96.4219",
    ]);
  });

  it("lies below the child's row, labelled with its root's name", () => {
    const [overlay] = overlaysOf(CHILD_FLOW, timelineEditor("verse"));
    expect(overlay && { ...overlay, elements: undefined, items: undefined }).toEqual({
      key: '["piece"] 23',
      timeline: "verse",
      card: { item: "piece" },
      label: "Flow control (from Piece)",
      x: 151.3134765625,
      y: 27,
      width: 208,
      height: 46.921875,
      labelX: 155.3134765625,
      baseline: 39.35400390625,
      dy: -26.5,
      elements: undefined,
      items: undefined,
    });
  });

  it("shows an element of the root on the child's stretch, a flow line a label line high", () => {
    const [overlay] = overlaysOf(OSSIA, timelineEditor("ossia"));
    if (overlay === undefined) throw new Error("no overlay");
    expect(heldOf(OSSIA, overlay)).toEqual(['break {"id":"break_1"}']);
    expect(overlay.label).toBe("Flow control (from Score)");
    expect(overlay.height).toBe(28.953125);
    const [line] = overlay.items;
    expect([line?.attributes.y1, line?.attributes.y2]).toEqual(["63.3047", "73.7812"]);
  });
});

describe("the read-only band on the canvas", () => {
  let mounted: ReturnType<typeof mount> | undefined;
  afterEach(() => {
    if (mounted !== undefined) unmount(mounted);
    mounted = undefined;
    document.body.innerHTML = "";
  });

  /** The svg of block A's node on `view` under `editing`. */
  function svgOf(view: View, editing: Editing | null): SVGSVGElement {
    const node = project(view, NOTHING_SELECTED, [], metrics, editing).find(({ id }) => id === A);
    if (node === undefined) throw new Error("no node");
    const rules = rulesOf(editing, { locked: false, readonly: false });
    const { actions } = recordingActions(view, { rules, zoom: 1, reducedMotion: false });
    mounted = mount(NodeHarness, { target: document.body, props: { data: node.data, actions } });
    flushSync();
    const svg = document.querySelector("svg");
    if (svg === null) throw new Error("no svg");
    return svg;
  }

  it("draws the band over the drawing in the child's editor, inert and without addresses", () => {
    const plain = svgOf(CHILD_FLOW, null);
    expect(plain.querySelectorAll(".tilie-flow-overlay")).toHaveLength(0);
    const drawnElements = plain.querySelectorAll("[data-id]").length;
    if (mounted !== undefined) unmount(mounted);
    mounted = undefined;
    document.body.innerHTML = "";

    const svg = svgOf(CHILD_FLOW, timelineEditor("verse"));
    const overlays = svg.querySelectorAll(".tilie-flow-overlay");
    expect(overlays).toHaveLength(1);
    const [overlay] = overlays;
    expect(overlay?.getAttribute("data-flow-overlay")).toBe("verse");
    expect(overlay?.getAttribute("pointer-events")).toBe("none");
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    expect(overlay?.querySelector("text.tilie-flow-overlay-label")?.textContent).toBe(
      "Flow control (from Piece)",
    );
    expect(overlay?.querySelectorAll("rect.tilie-flow-overlay-box")).toHaveLength(1);
    expect(overlay?.querySelector("g")?.children).toHaveLength(4);
    expect(overlay?.querySelectorAll("[data-id], [data-part], [data-facet]")).toHaveLength(0);
    expect(svg.querySelectorAll("[data-id]")).toHaveLength(drawnElements);
  });
});
