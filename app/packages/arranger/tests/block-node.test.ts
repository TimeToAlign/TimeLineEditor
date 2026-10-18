// @vitest-environment jsdom
/**
 * The block node in the editors: what lies outside the edited element is
 * faded, the elements keep their keys across a reorder and slide only
 * while a member drag previews an order, the item and member drags are
 * attached where an editor allows them and reach the canvas through its
 * actions, and in a timeline editor its timeline's bands are marked and
 * moved.
 */

import type { Command, View } from "@timetoalign/tilie-core";
import type { DrawnBand } from "@timetoalign/tilie-layout";
import { TextMeasure } from "@timetoalign/tilie-layout";
import { flushSync, mount, tick, unmount } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editing } from "../src/editors.ts";
import { itemMoveCommand } from "../src/items.ts";
import type { NodeActions, NodePreview } from "../src/nodeActions.ts";
import type { BlockNodeData } from "../src/project.ts";
import { project } from "../src/project.ts";
import { reorderCommand } from "../src/reorder.ts";
import NodeHarness from "./NodeHarness.svelte";
import { A, B, blockIn, changed, MIXED, metrics, viewOf } from "./support.ts";

const VIEW = viewOf({ id: A, fixture: MIXED, x: 40, y: 80 }, { id: B, fixture: "bare", x: 2000 });

const BUNDLE: Editing = { target: A, kind: "bundle" };
const GROUP: Editing = { target: `${A}/group_1`, kind: "group" };
const TIMELINE: Editing = { target: `${A}/score`, kind: "timeline" };

/**
 * The elements of a root member drawing of `bundle_mixed` with the maps `maps`
 * and the jumps `jumps`, as `<tag> <address>` in drawing order: the card's
 * shadow and card, the maps, each jump's shaft and arrowhead, the line, its
 * start dot and arrowhead, the start and end wedges, the name, the two
 * wedge labels and the jumps' labels.
 */
function memberElements(member: string, maps: string[], jumps: string[] = []): string[] {
  return [
    `rect ${member}/card`,
    `rect ${member}/card`,
    ...maps.map((map) => `polygon ${member}/${map}`),
    ...jumps.flatMap((jump) => [`path ${member}/${jump}`, `polygon ${member}/${jump}`]),
    `line ${member}`,
    `circle ${member}`,
    `polygon ${member}`,
    `polygon ${member}/start`,
    `polygon ${member}/end`,
    `text ${member}/name`,
    `text ${member}/start/label`,
    `text ${member}/end/label`,
    ...jumps.map((jump) => `text ${member}/${jump}/label`),
  ];
}

/** A recorded call of the node's actions, in the order it was made. */
type Call =
  | { readonly select: string }
  | { readonly preview: string; readonly with: NodePreview | null }
  | { readonly dispatch: unknown };

let mounted: ReturnType<typeof mount> | undefined;

/** Unmount the node mounted last, if any, and empty the page. */
function clear(): void {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
}

afterEach(() => {
  clear();
  vi.restoreAllMocks();
});

/** The data `project` gives block `id` of `view` under `editing` with `selection`. */
function dataOf(
  view: View,
  id: string,
  editing: Editing | null,
  selection: ReadonlySet<string> = new Set(),
): BlockNodeData {
  const node = project(view, selection, [], metrics, editing).find((found) => found.id === id);
  if (node === undefined) throw new Error(`no node for ${id}`);
  return node.data;
}

/** `data` with its drawing's band records replaced by `bands`, when given. */
function withBands(data: BlockNodeData, bands?: readonly DrawnBand[]): BlockNodeData {
  return bands === undefined ? data : { ...data, drawing: { ...data.drawing, bands } };
}

/**
 * The node of block `id` mounted on `view` under `editing` with `selection`,
 * its data read through a reactive map so a redraw can be passed in, with
 * actions that record every call; `bands` replaces the drawing's band
 * records, `locked` says whether the canvas is locked.
 */
function mountOn(
  view: View,
  id: string,
  editing: Editing | null,
  reducedMotion = false,
  zoom = 1,
  selection: ReadonlySet<string> = new Set(),
  { bands, locked = false }: { bands?: readonly DrawnBand[]; locked?: boolean } = {},
) {
  const props = new SvelteMap([["data", withBands(dataOf(view, id, editing, selection), bands)]]);
  const calls: Call[] = [];
  const actions: NodeActions = {
    dispatch: (command) => calls.push({ dispatch: command }),
    select: (address) => calls.push({ select: address }),
    preview: (block, preview) => calls.push({ preview: block, with: preview }),
    metrics: new TextMeasure(metrics),
    view: () => view,
    reducedMotion: () => reducedMotion,
    zoom: () => zoom,
    locked: () => locked,
  };
  mounted = mount(NodeHarness, {
    target: document.body,
    props: {
      get data() {
        return props.get("data") as BlockNodeData;
      },
      actions,
    },
  });
  flushSync();
  const svg = document.querySelector("svg");
  if (svg === null) throw new Error("the block node rendered no svg");
  return {
    svg,
    calls,
    redraw(next: View, redrawn: readonly DrawnBand[] | undefined = bands) {
      props.set("data", withBands(dataOf(next, id, editing, selection), redrawn));
      flushSync();
    },
  };
}

/** The drawing's elements of `svg`, the boxes' and bands' marks and a dragged copy left out. */
function drawn(svg: SVGSVGElement): Element[] {
  return Array.from(svg.children).filter(
    (element) =>
      !element.classList.contains("tilie-holding") &&
      !element.classList.contains("tilie-band") &&
      !element.classList.contains("tilie-dragged"),
  );
}

function named(element: Element): string {
  return `${element.localName} ${element.getAttribute("data-address")}`;
}

/** The drawn elements of `svg` as `<tag> <address>`, with or without `attribute`. */
function marked(svg: SVGSVGElement, attribute: string, present = true): string[] {
  return drawn(svg)
    .filter((element) => element.hasAttribute(attribute) === present)
    .map(named);
}

/** The drawn elements of `svg` carrying `address`, in document order. */
function addressed(svg: SVGSVGElement, address: string): Element[] {
  return drawn(svg).filter((element) => element.getAttribute("data-address") === address);
}

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/**
 * Give `element` and its `<svg>` the identity screen CTM, the element
 * pointer capture that records nothing; `ctm` changes the element's own.
 */
function placed(element: Element): { ctm: typeof IDENTITY } {
  const own = { ctm: IDENTITY };
  const capture = new Set<number>();
  Object.assign(element.closest("svg") as SVGSVGElement, { getScreenCTM: () => IDENTITY });
  Object.assign(element, {
    getScreenCTM: () => own.ctm,
    setPointerCapture: (pointer: number) => capture.add(pointer),
    hasPointerCapture: (pointer: number) => capture.has(pointer),
    releasePointerCapture: (pointer: number) => capture.delete(pointer),
  });
  return own;
}

function pointer(target: Element, type: string, x: number, y: number): void {
  target.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, clientX: x, clientY: y, button: 0, bubbles: true }),
  );
  flushSync();
}

const SCORE = memberElements("score", ["cmap_1", "cmap_2"], ["jump_1"]);
const PERFORMANCE = memberElements("performance", ["cmap_1"]);

describe("data-outside", () => {
  it("marks nothing on the arranger and in the bundle editor", () => {
    expect(marked(mountOn(VIEW, A, null).svg, "data-outside")).toEqual([]);
    clear();
    expect(marked(mountOn(VIEW, A, BUNDLE).svg, "data-outside")).toEqual([]);
  });

  it("marks everything but the edited group in the group editor", () => {
    const { svg } = mountOn(VIEW, A, GROUP);
    const inside = ["rect group_1", "text group_1/name", ...SCORE, ...PERFORMANCE];
    expect(marked(svg, "data-outside", false)).toEqual(inside);
    expect(marked(svg, "data-outside").length).toBe(drawn(svg).length - 28);
    expect(drawn(svg)[0]?.hasAttribute("data-outside")).toBe(true);
  });

  it("marks everything but the edited timeline in the timeline editor", () => {
    expect(marked(mountOn(VIEW, A, TIMELINE).svg, "data-outside", false)).toEqual(SCORE);
  });

  it("marks nothing in another block, faded through its node", () => {
    expect(marked(mountOn(VIEW, B, GROUP).svg, "data-outside")).toEqual([]);
  });
});

describe("keys", () => {
  it("keep every element across a reorder", () => {
    const { svg, redraw } = mountOn(VIEW, A, GROUP);
    const score = addressed(svg, "score/card");
    const performance = addressed(svg, "performance/card");
    expect(score.length).toBe(2);
    expect(addressed(svg, "excerpt/start").length).toBe(2);
    const command = reorderCommand(blockIn(VIEW, A), "group_1", ["performance", "score"]);
    redraw(changed(VIEW, command));
    expect(addressed(svg, "score/card")).toEqual(score);
    expect(addressed(svg, "score/card").every((element, index) => element === score[index])).toBe(
      true,
    );
    expect(
      addressed(svg, "performance/card").every((element, index) => element === performance[index]),
    ).toBe(true);
    const order = drawn(svg);
    expect(order.indexOf(performance[1] as Element)).toBeLessThan(
      order.indexOf(score[0] as Element),
    );
    expect(order.length).toBe(dataOf(changed(VIEW, command), A, GROUP).descriptors.length);
  });
});

describe("attachments", () => {
  function attached(svg: SVGSVGElement): string[] {
    return drawn(svg)
      .filter((element) => element.classList.contains("nodrag"))
      .map((element) => {
        const address = element.getAttribute("data-address") as string;
        return `${named(element)} ${addressed(svg, address).indexOf(element)}`;
      });
  }

  it("are on no element on the arranger", () => {
    expect(attached(mountOn(VIEW, A, null).svg)).toEqual([]);
  });

  it("are on the items in the bundle editor", () => {
    expect(attached(mountOn(VIEW, A, BUNDLE).svg)).toEqual([
      "rect group_1 0",
      "rect group_2 0",
      "rect annotations/card 1",
    ]);
  });

  it("are on the edited group's member cards in the group editor", () => {
    expect(attached(mountOn(VIEW, A, GROUP).svg)).toEqual([
      "rect score/card 1",
      "rect performance/card 1",
    ]);
  });

  it("are on no element in the timeline editor or in another block", () => {
    expect(attached(mountOn(VIEW, A, TIMELINE).svg)).toEqual([]);
    clear();
    expect(attached(mountOn(VIEW, B, BUNDLE).svg)).toEqual([]);
  });
});

describe("the member drag", () => {
  function orderOf(call: Call | undefined): unknown {
    return call !== undefined && "preview" in call ? call.with?.manifest?.graphical?.order : null;
  }

  it("selects, previews each order, dispatches the reorder and withdraws the preview", () => {
    const { svg, calls } = mountOn(VIEW, A, GROUP);
    const card = addressed(svg, "score/card")[1] as Element;
    const own = placed(card);
    pointer(card, "pointerdown", 100, 70);
    // The card slides 60 pixels down to a previewed slot; the drag reads the drawing's CTM.
    own.ctm = { ...IDENTITY, f: 60 };
    pointer(card, "pointermove", 100, 76);
    const dragged = () => svg.querySelectorAll("g.tilie-dragged");
    expect(dragged().length).toBe(1);
    expect(dragged()[0]?.getAttribute("transform")).toBe("translate(0 6)");
    pointer(card, "pointermove", 110, 170);
    expect(dragged()[0]?.getAttribute("transform")).toBe("translate(10 100)");
    const copy = Array.from((dragged()[0] as Element).children);
    expect(copy.map((element) => element.localName)).toEqual(
      SCORE.map((element) => element.split(" ")[0]),
    );
    expect(copy.some((element) => element.hasAttribute("data-address"))).toBe(false);
    expect(marked(svg, "visibility")).toEqual(SCORE);
    pointer(card, "pointerup", 110, 170);

    expect(calls.map((call) => Object.keys(call)[0])).toEqual([
      "select",
      "preview",
      "preview",
      "dispatch",
      "preview",
    ]);
    expect(calls[0]).toEqual({ select: `${A}/score/card` });
    expect(orderOf(calls[1])).toEqual({
      group_1: ["score", "performance"],
      group_2: ["page", "excerpt"],
    });
    expect(orderOf(calls[2])).toEqual({
      group_1: ["performance", "score"],
      group_2: ["page", "excerpt"],
    });
    expect(calls[1]).toMatchObject({ preview: A });
    expect(calls[2]).toMatchObject({ preview: A });
    expect(calls[3]).toEqual({
      dispatch: { type: "set", changes: [{ target: `${A}/group_1`, values: { order: null } }] },
    });
    expect(calls[4]).toEqual({ preview: A, with: null });
    expect(dragged().length).toBe(0);
    expect(marked(svg, "visibility")).toEqual([]);
  });

  it("calls nothing for a press released within the click distance", () => {
    const { svg, calls } = mountOn(VIEW, A, GROUP);
    const card = addressed(svg, "score/card")[1] as Element;
    placed(card);
    pointer(card, "pointerdown", 100, 70);
    pointer(card, "pointermove", 102, 72);
    pointer(card, "pointerup", 102, 72);
    expect(calls).toEqual([]);
    expect(svg.querySelectorAll("g.tilie-dragged").length).toBe(0);
  });
});

describe("the item drag", () => {
  it("selects, previews the moved places, dispatches the move and withdraws the preview", () => {
    const { svg, calls } = mountOn(VIEW, A, BUNDLE);
    const frame = addressed(svg, "group_2")[0] as Element;
    placed(frame);
    pointer(frame, "pointerdown", 100, 200);
    pointer(frame, "pointermove", 132, 193.9609375);
    expect(svg.querySelectorAll("g.tilie-dragged").length).toBe(0);
    pointer(frame, "pointerup", 132, 193.9609375);
    const command: Command = {
      type: "set",
      changes: [
        { target: `${A}/group_2`, values: { place: { x: 40, y: 200 } } },
        { target: `${A}/group_1`, values: { place: { x: 8, y: 28.8046875 } } },
        { target: `${A}/annotations`, values: { place: { x: 8, y: 391.7734375 } } },
      ],
    };
    expect(calls).toEqual([
      { select: `${A}/group_2` },
      {
        preview: A,
        with: {
          places: {
            group_2: { x: 40, y: 200 },
            group_1: { x: 8, y: 28.8046875 },
            annotations: { x: 8, y: 391.7734375 },
          },
        },
      },
      { dispatch: command },
      { preview: A, with: null },
    ]);
  });

  /**
   * The node of A on `view` in A's bundle editor with `selected` (element
   * addresses of A), `group_2`'s frame pressed at (100, 200).
   */
  function pressedWith(selected: string[], view: View = VIEW) {
    const node = mountOn(view, A, BUNDLE, false, 1, new Set(selected.map((at) => `${A}/${at}`)));
    const frame = addressed(node.svg, "group_2")[0] as Element;
    placed(frame);
    pointer(frame, "pointerdown", 100, 200);
    return { ...node, frame };
  }

  /** The calls of `group_2` moved alone to (40, 200): preview, dispatch, withdrawal. */
  const MOVED_ALONE: Call[] = [
    {
      preview: A,
      with: {
        places: {
          group_2: { x: 40, y: 200 },
          group_1: { x: 8, y: 28.8046875 },
          annotations: { x: 8, y: 391.7734375 },
        },
      },
    },
    {
      dispatch: {
        type: "set",
        changes: [
          { target: `${A}/group_2`, values: { place: { x: 40, y: 200 } } },
          { target: `${A}/group_1`, values: { place: { x: 8, y: 28.8046875 } } },
          { target: `${A}/annotations`, values: { place: { x: 8, y: 391.7734375 } } },
        ],
      },
    },
    { preview: A, with: null },
  ];

  /** The preview of `group_2` moved to (40, 200) with `annotations` by the same travel. */
  const BOTH_MOVED: Call = {
    preview: A,
    with: {
      places: {
        group_2: { x: 40, y: 200 },
        annotations: { x: 40, y: 385.734375 },
        group_1: { x: 8, y: 28.8046875 },
      },
    },
  };

  it("moves two selected items together in one set and leaves the selection", () => {
    const { calls, frame } = pressedWith(["group_2", "annotations/card"]);
    pointer(frame, "pointermove", 132, 193.9609375);
    pointer(frame, "pointerup", 132, 193.9609375);
    expect(calls).toEqual([
      BOTH_MOVED,
      {
        dispatch: {
          type: "set",
          changes: [
            { target: `${A}/group_2`, values: { place: { x: 40, y: 200 } } },
            { target: `${A}/annotations`, values: { place: { x: 40, y: 385.734375 } } },
            { target: `${A}/group_1`, values: { place: { x: 8, y: 28.8046875 } } },
          ],
        },
      },
      { preview: A, with: null },
    ]);
  });

  it("moves a pressed item outside the selection alone, selecting it", () => {
    const { calls, frame } = pressedWith(["group_1", "annotations/card"]);
    pointer(frame, "pointermove", 132, 193.9609375);
    pointer(frame, "pointerup", 132, 193.9609375);
    expect(calls).toEqual([{ select: `${A}/group_2` }, ...MOVED_ALONE]);
  });

  it("moves the one item in the selection alone and leaves the selection", () => {
    const { calls, frame } = pressedWith(["group_2", "page"]);
    pointer(frame, "pointermove", 132, 193.9609375);
    pointer(frame, "pointerup", 132, 193.9609375);
    expect(calls).toEqual(MOVED_ALONE);
  });

  it("leaves a frame under a moved card where it is", () => {
    // `annotations`' card drawn at (8, 60), over `group_1`'s frame; every item states its place.
    const over = changed(VIEW, itemMoveCommand(VIEW, A, "annotations", 8, 60, metrics));
    const { calls, frame } = pressedWith(["annotations/name", "group_2"], over);
    pointer(frame, "pointermove", 132, 193.9609375);
    pointer(frame, "pointerup", 132, 193.9609375);
    expect(calls).toEqual([
      {
        preview: A,
        with: {
          places: {
            annotations: { x: 40, y: 53.9609375 },
            group_1: { x: 8, y: 28.8046875 },
            group_2: { x: 40, y: 200 },
          },
        },
      },
      {
        dispatch: {
          type: "set",
          changes: [
            { target: `${A}/group_2`, values: { place: { x: 40, y: 200 } } },
            { target: `${A}/annotations`, values: { place: { x: 40, y: 53.9609375 } } },
          ],
        },
      },
      { preview: A, with: null },
    ]);
  });

  it("withdraws the whole preview on Escape and stores nothing for a drag back to its start", () => {
    const escaped = pressedWith(["group_2", "annotations/card"]);
    pointer(escaped.frame, "pointermove", 132, 193.9609375);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    flushSync();
    pointer(escaped.frame, "pointerup", 132, 193.9609375);
    expect(escaped.calls).toEqual([BOTH_MOVED, { preview: A, with: null }]);
    clear();

    const back = pressedWith(["group_2", "annotations/card"]);
    pointer(back.frame, "pointermove", 132, 193.9609375);
    pointer(back.frame, "pointermove", 100, 200);
    pointer(back.frame, "pointerup", 100, 200);
    expect(back.calls).toEqual([
      BOTH_MOVED,
      { preview: A, with: { places: {} } },
      { preview: A, with: null },
    ]);
  });

  it("reads the pointer's travel by the canvas zoom and the block's scale, not the drawing's CTM", () => {
    // Zoom 2 and scale 1.25 show a drawing unit as 2.5 pixels; the identity CTM disagrees.
    const scaled = viewOf({ id: A, fixture: MIXED, x: 40, y: 80, scale: 1.25 });
    const { svg, calls } = mountOn(scaled, A, BUNDLE, false, 2);
    const frame = addressed(svg, "group_2")[0] as Element;
    placed(frame);
    pointer(frame, "pointerdown", 100, 200);
    pointer(frame, "pointerup", 180, 184.90234375);
    expect(calls.at(-2)).toEqual({
      dispatch: {
        type: "set",
        changes: [
          { target: `${A}/group_2`, values: { place: { x: 40, y: 200 } } },
          { target: `${A}/group_1`, values: { place: { x: 8, y: 28.8046875 } } },
          { target: `${A}/annotations`, values: { place: { x: 8, y: 391.7734375 } } },
        ],
      },
    });
  });
});

describe("the slide of a reorder", () => {
  /**
   * Every element "moved" on each measurement, every SVG element given the
   * identity CTM, and Web Animations recorded: the calls of `animate`.
   */
  function measured(): ReturnType<typeof vi.fn> {
    let left = 0;
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() => {
      left += 1;
      return DOMRect.fromRect({ x: left, y: 0, width: 10, height: 10 });
    });
    const animate = vi.fn(() => ({ cancel() {}, onfinish: null }));
    for (const [name, value] of [
      ["animate", animate],
      ["getAnimations", () => []],
    ] as const) {
      Object.defineProperty(Element.prototype, name, { value, configurable: true, writable: true });
    }
    Object.defineProperty(SVGElement.prototype, "getScreenCTM", {
      value: () => IDENTITY,
      configurable: true,
      writable: true,
    });
    return animate;
  }

  afterEach(() => {
    for (const name of ["animate", "getAnimations"])
      Reflect.deleteProperty(Element.prototype, name);
    Reflect.deleteProperty(SVGElement.prototype, "getScreenCTM");
  });

  const REORDERED = changed(
    VIEW,
    reorderCommand(blockIn(VIEW, A), "group_1", ["performance", "score"]),
  );

  /** A member drag on `score`'s card moved below `performance`'s middle, then the preview drawn. */
  async function previewed(reducedMotion: boolean): Promise<number> {
    const { svg, redraw } = mountOn(VIEW, A, GROUP, reducedMotion);
    const animate = measured();
    const card = addressed(svg, "score/card")[1] as Element;
    placed(card);
    pointer(card, "pointerdown", 100, 70);
    pointer(card, "pointermove", 110, 170);
    redraw(REORDERED);
    await tick();
    return animate.mock.calls.length;
  }

  it("does not slide on a redraw that is no reorder preview", async () => {
    const { redraw } = mountOn(VIEW, A, GROUP);
    const animate = measured();
    redraw(REORDERED);
    await tick();
    expect(animate).not.toHaveBeenCalled();
  });

  it("slides every moved element while a member drag previews an order", async () => {
    expect(await previewed(false)).toBe(dataOf(REORDERED, A, GROUP).descriptors.length);
  });

  it("does not slide under reduced motion", async () => {
    expect(await previewed(true)).toBe(0);
  });
});

describe("bands in the timeline editor", () => {
  /** A record of `score` on its line at 100, 540 wide from x 16 (README, "Stated records"). */
  function band(
    kind: DrawnBand["kind"],
    level: number,
    elements: number,
    y: number,
    height: number,
  ) {
    return {
      address: `score/${kind}_1`,
      timeline: "score",
      kind,
      level,
      line: 100,
      elements,
      x: 16,
      y,
      width: 540,
      height,
    } satisfies DrawnBand;
  }

  const MAPS = band("conversion_maps", 1, 2, 60, 30);
  const MARKERS = band("markers", -1, 2, 104, 12);
  const FLOW = band("flow_control", -2, 1, 120, 8);
  const BANDS = [MAPS, MARKERS, FLOW];

  /** `score`'s order with its markers band moved just below its conversion maps band. */
  const MOVED = [
    "score/children_1",
    "score/conversion_maps_1",
    "score/markers_1",
    "score",
    "score/regions_1",
    "score/flow_control_1",
  ];
  const STORED_ORDER = { group_1: ["score", "performance"], group_2: ["page", "excerpt"] };

  /**
   * The node of A on `VIEW` under `editing` with the stated records, its
   * `<svg>` shown at client (0, 0) at the drawing's own size with the
   * identity CTM and pointer capture, and `score`'s card to press on.
   */
  function shown(
    editing: Editing | null,
    { selected = [], locked = false }: { selected?: string[]; locked?: boolean } = {},
  ) {
    const selection = new Set(selected.map((address) => `${A}/${address}`));
    const node = mountOn(VIEW, A, editing, false, 1, selection, { bands: BANDS, locked });
    const { svg } = node;
    const [, , width = 0, height = 0] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const capture = new Set<number>();
    Object.assign(svg, {
      getBoundingClientRect: () => DOMRect.fromRect({ x: 0, y: 0, width, height }),
      getScreenCTM: () => IDENTITY,
      setPointerCapture: (pointer: number) => capture.add(pointer),
      hasPointerCapture: (pointer: number) => capture.has(pointer),
      releasePointerCapture: (pointer: number) => capture.delete(pointer),
    });
    return { ...node, card: addressed(svg, "score/card")[1] as Element };
  }

  /** The band marks of `svg` as `<data-band> <data-mark>`. */
  function bandMarks(svg: SVGSVGElement): string[] {
    return Array.from(
      svg.querySelectorAll("rect.tilie-band"),
      (mark) => `${mark.getAttribute("data-band")} ${mark.getAttribute("data-mark")}`,
    );
  }

  function press(target: Element, type: string, x: number, y: number, shiftKey = false): void {
    target.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        clientX: x,
        clientY: y,
        button: 0,
        shiftKey,
        bubbles: true,
      }),
    );
    flushSync();
  }

  /** The `graphical.order` of the manifest a recorded preview draws. */
  function previewedOrder(call: Call | undefined): unknown {
    return call !== undefined && "preview" in call ? call.with?.manifest?.graphical?.order : null;
  }

  it("marks the hovered band, the selected ones, and a band both with the selection's mark", () => {
    const hovered = shown(TIMELINE);
    press(hovered.card, "pointermove", 200, 110);
    const marks = hovered.svg.querySelectorAll("rect.tilie-band");
    expect(marks).toHaveLength(1);
    const mark = marks[0] as Element;
    expect(hovered.svg.lastElementChild).toBe(mark);
    expect(
      Object.fromEntries(
        Array.from(mark.attributes, (attribute) => [attribute.name, attribute.value]),
      ),
    ).toEqual({
      class: "tilie-band",
      "data-band": "score/markers_1",
      "data-mark": "hover",
      x: "16",
      y: "104",
      width: "540",
      height: "12",
      rx: "5",
      "aria-hidden": "true",
    });
    clear();

    const selected = shown(TIMELINE, { selected: ["score/markers_1"] });
    expect(bandMarks(selected.svg)).toEqual(["score/markers_1 selection"]);
    const children = Array.from(selected.svg.children);
    const holding = children.filter((element) => element.classList.contains("tilie-holding"));
    expect(holding.map((element) => element.getAttribute("data-box"))).toEqual([
      "block",
      "group",
      "card",
    ]);
    const last = children.indexOf(holding.at(-1) as Element);
    expect(children.indexOf(selected.svg.querySelector("rect.tilie-band") as Element)).toBe(
      last + 1,
    );
    expect(selected.svg.querySelector("rect.tilie-band")?.getAttribute("y")).toBe("104");
    press(selected.card, "pointermove", 200, 110);
    expect(bandMarks(selected.svg)).toEqual(["score/markers_1 selection"]);
    press(selected.card, "pointermove", 200, 75);
    expect(bandMarks(selected.svg)).toEqual([
      "score/conversion_maps_1 hover",
      "score/markers_1 selection",
    ]);
    const maps = selected.svg.querySelector('rect.tilie-band[data-band="score/conversion_maps_1"]');
    expect([maps?.getAttribute("y"), maps?.getAttribute("height")]).toEqual(["60", "30"]);
    selected.svg.dispatchEvent(new PointerEvent("pointerleave"));
    flushSync();
    expect(bandMarks(selected.svg)).toEqual(["score/markers_1 selection"]);
  });

  it("selects, previews and stores one set for a drag past the click distance", () => {
    const { svg, card, calls } = shown(TIMELINE);
    press(card, "pointerdown", 200, 110);
    expect(svg.classList.contains("nodrag") && svg.classList.contains("nopan")).toBe(true);
    press(card, "pointermove", 200, 113);
    expect(calls).toEqual([]);
    press(card, "pointermove", 200, 90);
    press(card, "pointerup", 200, 90);
    expect(calls.map((call) => Object.keys(call)[0])).toEqual([
      "select",
      "preview",
      "dispatch",
      "preview",
    ]);
    expect(calls[0]).toEqual({ select: `${A}/score/markers_1` });
    expect(calls[1]).toMatchObject({ preview: A });
    expect(previewedOrder(calls[1])).toEqual({ ...STORED_ORDER, score: MOVED });
    expect(calls[2]).toEqual({
      dispatch: { type: "set", changes: [{ target: `${A}/score`, values: { order: MOVED } }] },
    });
    expect(calls[3]).toEqual({ preview: A, with: null });
    expect(svg.classList.contains("nodrag") || svg.classList.contains("nopan")).toBe(false);
  });

  it("reads the drop against the drawing at the press, never the preview's", () => {
    const { card, calls, redraw } = shown(TIMELINE);
    press(card, "pointerdown", 200, 110);
    press(card, "pointermove", 200, 90);
    redraw(VIEW, [MAPS, { ...MARKERS, y: 86, height: 10 }, { ...FLOW, y: 104 }]);
    press(card, "pointermove", 200, 112);
    expect(calls).toHaveLength(3);
    expect(previewedOrder(calls[2])).toEqual(STORED_ORDER);
  });

  it("stores nothing for a click, a release in place or Escape", () => {
    const clicked = shown(TIMELINE);
    press(clicked.card, "pointerdown", 200, 110);
    press(clicked.card, "pointermove", 202, 112);
    press(clicked.card, "pointerup", 202, 112);
    expect(clicked.calls).toEqual([]);
    clear();

    const back = shown(TIMELINE);
    press(back.card, "pointerdown", 200, 110);
    press(back.card, "pointermove", 200, 90);
    press(back.card, "pointermove", 200, 112);
    press(back.card, "pointerup", 200, 112);
    expect(back.calls.map((call) => Object.keys(call)[0])).toEqual([
      "select",
      "preview",
      "preview",
      "preview",
    ]);
    expect(previewedOrder(back.calls[1])).toEqual({ ...STORED_ORDER, score: MOVED });
    expect(previewedOrder(back.calls[2])).toEqual(STORED_ORDER);
    expect(back.calls[3]).toEqual({ preview: A, with: null });
    clear();

    const escaped = shown(TIMELINE);
    press(escaped.card, "pointerdown", 200, 110);
    press(escaped.card, "pointermove", 200, 90);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    flushSync();
    press(escaped.card, "pointerup", 200, 90);
    expect(escaped.calls.map((call) => Object.keys(call)[0])).toEqual([
      "select",
      "preview",
      "preview",
    ]);
    expect(escaped.calls[2]).toEqual({ preview: A, with: null });
  });

  /** A press on `target` of `node` at the markers band, moved and released: no call, no mark. */
  function untaken(node: ReturnType<typeof shown>, target: Element, shiftKey = false): void {
    const marked: boolean[] = [];
    press(target, "pointerdown", 200, 110, shiftKey);
    marked.push(node.svg.classList.contains("nodrag") || node.svg.classList.contains("nopan"));
    press(target, "pointermove", 200, 90, shiftKey);
    marked.push(node.svg.classList.contains("nodrag") || node.svg.classList.contains("nopan"));
    press(target, "pointerup", 200, 90, shiftKey);
    expect(node.calls).toEqual([]);
    expect(marked).toEqual([false, false]);
    clear();
  }

  it("starts no drag on a locked canvas, with Shift, or on an element over the band", () => {
    const locked = shown(TIMELINE, { locked: true });
    untaken(locked, locked.card);
    const shifted = shown(TIMELINE);
    untaken(shifted, shifted.card, true);
    const wedge = shown(TIMELINE);
    untaken(wedge, addressed(wedge.svg, "score/start")[0] as Element);
  });

  it("marks and moves no band outside its timeline's editor", () => {
    const performance: Editing = { target: `${A}/performance`, kind: "timeline" };
    const outside: [Editing | null, (node: ReturnType<typeof shown>) => Element][] = [
      [null, (node) => node.card],
      [BUNDLE, (node) => node.card],
      [GROUP, (node) => addressed(node.svg, "group_1")[0] as Element],
      [performance, (node) => node.card],
    ];
    for (const [editing, target] of outside) {
      const marked = shown(editing, { selected: ["score/markers_1"] });
      press(marked.card, "pointermove", 200, 110);
      expect(bandMarks(marked.svg)).toEqual([]);
      clear();
      const node = shown(editing);
      untaken(node, target(node));
    }
  });
});
