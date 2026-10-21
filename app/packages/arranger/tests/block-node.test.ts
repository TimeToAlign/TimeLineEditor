// @vitest-environment jsdom
/**
 * The block node in the editors (README, "The block node"): what lies
 * outside the edited element is faded, the elements keep their keys across
 * a reorder and slide only while a reorder previews an order, a press is
 * taken where the editor moves or reorders a box, and every gesture ends in
 * exactly the calls its command predicts: the press that became a gesture
 * selects, each preview is the view its command gives, the release
 * dispatches that command, and the preview is withdrawn.
 */

import type {
  Address,
  Block,
  Command,
  ElementAddress,
  Facet,
  OwnerAddress,
  PlaceKey,
  SetCommand,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  BUNDLE_ADDRESS,
  bandAddress,
  cardAddress,
  idAddress,
  inBlock,
  isCommandError,
  partAddress,
  placeKeyText,
  preview as previewOf,
  sameAddress,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import type { DrawnBox } from "@timetoalign/tilie-layout";
import { flushSync, mount, tick, unmount } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keyedBox } from "../src/boxes.ts";
import { rulesOf } from "../src/containers.ts";
import { drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { sourceAt } from "../src/gesture.ts";
import { itemMoveCommand } from "../src/items.ts";
import { CUBIC_OUT } from "../src/motion.ts";
import type { BlockNodeData } from "../src/project.ts";
import { project } from "../src/project.ts";
import { reorderCommand } from "../src/reorder.ts";
import type { Selection } from "../src/selection.ts";
import { NOTHING_SELECTED, selectionOf } from "../src/selection.ts";
import type { Call } from "./dom.ts";
import {
  drag,
  IDENTITY,
  kinds,
  pointer,
  pressEscape,
  recordingActions,
  stubPointerCapture,
  withScreenMatrix,
} from "./dom.ts";
import NodeHarness from "./NodeHarness.svelte";
import { A, B, blockIn, CHILD_MEMBER, changed, MIXED, metrics, viewOf } from "./support.ts";

const VIEW = viewOf({ id: A, fixture: MIXED, x: 40, y: 80 }, { id: B, fixture: "bare", x: 2000 });

/** The address in block A of the element address `element`. */
const inA = (element: ElementAddress): Address => inBlock(A, element);

/** The address of the part `words` of the element `id`. */
const part = (id: string, ...words: ("start" | "end" | "name" | "label")[]): ElementAddress =>
  words.reduce<OwnerAddress>((owner, word) => partAddress(owner, word), idAddress(id));

const BUNDLE: Editing = { target: { block: A }, kind: "bundle" };
const GROUP: Editing = { target: inA(idAddress("group_1")), kind: "group" };
const TIMELINE: Editing = { target: inA(idAddress("score")), kind: "timeline" };

/** A drawn element as `<tag> <key of its address>` (`addressKey`). */
const tagged = (tag: string, address: ElementAddress): string => `${tag} ${addressKey(address)}`;

/**
 * The elements of a root member drawing of `bundle_mixed` with the maps `maps`
 * and the jumps `jumps`, as `<tag> <address key>` in drawing order: the
 * card's shadow and card, the maps, each jump's shaft and arrowhead, the
 * line, its start dot and arrowhead, the start and end wedges, the name, the
 * two wedge labels and the jumps' labels.
 */
function memberElements(member: string, maps: string[], jumps: string[] = []): string[] {
  const line = idAddress(member);
  return [
    tagged("rect", cardAddress(member)),
    tagged("rect", cardAddress(member)),
    ...maps.map((map) => tagged("polygon", idAddress(map))),
    ...jumps.flatMap((jump) => [
      tagged("path", idAddress(jump)),
      tagged("polygon", idAddress(jump)),
    ]),
    tagged("line", line),
    tagged("circle", line),
    tagged("polygon", line),
    tagged("polygon", part(member, "start")),
    tagged("polygon", part(member, "end")),
    tagged("text", part(member, "name")),
    tagged("text", part(member, "start", "label")),
    tagged("text", part(member, "end", "label")),
    ...jumps.map((jump) => tagged("text", part(jump, "label"))),
  ];
}

const SCORE = memberElements("score", ["cmap_1", "cmap_2"], ["jump_from_1"]);
const PERFORMANCE = memberElements("performance", ["cmap_3"]);

/** The selection of the element addresses `elements` of block A. */
const selectedIn = (...elements: ElementAddress[]): Selection =>
  selectionOf(elements.map((element) => inA(element)));

let mounted: ReturnType<typeof mount> | undefined;

/** Unmount the node mounted last, if any, and empty the page. */
function clear(): void {
  if (mounted !== undefined) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
}

beforeEach(stubPointerCapture);

afterEach(() => {
  clear();
  vi.restoreAllMocks();
});

/** The data `project` gives block `id` of `view` under `editing` with `selection`. */
function dataOf(
  view: View,
  id: string,
  editing: Editing | null,
  selection: Selection = NOTHING_SELECTED,
): BlockNodeData {
  const node = project(view, selection, [], metrics, editing).find((found) => found.id === id);
  if (node === undefined) throw new Error(`no node for ${id}`);
  return node.data;
}

/** `data` with its drawing's band records replaced by `bands`, when given. */
function withBands(data: BlockNodeData, bands?: readonly DrawnBox[]): BlockNodeData {
  if (bands === undefined) return data;
  const boxes = [...data.drawing.boxes.filter((box) => box.kind !== "band"), ...bands];
  return { ...data, drawing: { ...data.drawing, boxes } };
}

interface Options {
  readonly selection?: Selection;
  readonly bands?: readonly DrawnBox[];
  readonly locked?: boolean;
  readonly zoom?: number;
  readonly reducedMotion?: boolean;
}

/**
 * The node of block `id` mounted on `view` under `editing`, its data read
 * through a reactive map so a redraw can be passed in, with actions that
 * record every call and the canvas's rules at that editor; its `<svg>` has
 * the identity screen CTM, so a client point is a drawing point.
 */
function mountOn(view: View, id: string, editing: Editing | null, options: Options = {}) {
  const {
    selection = NOTHING_SELECTED,
    bands,
    locked = false,
    zoom = 1,
    reducedMotion = false,
  } = options;
  const props = new SvelteMap([["data", withBands(dataOf(view, id, editing, selection), bands)]]);
  const rules = rulesOf(editing, { locked, readonly: false });
  const { actions, calls } = recordingActions(view, { rules, zoom, reducedMotion });
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
  withScreenMatrix(svg, () => IDENTITY);
  return {
    svg,
    calls,
    redraw(next: View, redrawn: readonly DrawnBox[] | undefined = bands) {
      props.set("data", withBands(dataOf(next, id, editing, selection), redrawn));
      flushSync();
    },
  };
}

/** The drawing's elements of `svg`, the boxes' and bands' marks and a dragged copy left out. */
function drawn(svg: SVGSVGElement): Element[] {
  return Array.from(svg.children).filter(
    (element) =>
      !element.classList.contains("tilie-mark") && !element.classList.contains("tilie-dragged"),
  );
}

/** The element address `element` draws, read from its descriptor's source; `null` for none. */
function addressOf(element: Element): ElementAddress | null {
  return sourceAt(element)?.address ?? null;
}

/** A DOM element as `<tag> <key of the address it draws>`, `<tag> none` where it draws none. */
function named(element: Element): string {
  const address = addressOf(element);
  return address === null ? `${element.localName} none` : tagged(element.localName, address);
}

/** Whether `element` carries an attribute writing an address: `data-id`, `data-facet`, `data-part`. */
function writesAddress(element: Element): boolean {
  return ["data-id", "data-facet", "data-part"].some((name) => element.hasAttribute(name));
}

/** The drawn elements of `svg` as `<tag> <address key>`, with or without `attribute`. */
function marked(svg: SVGSVGElement, attribute: string, present = true): string[] {
  return drawn(svg)
    .filter((element) => element.hasAttribute(attribute) === present)
    .map(named);
}

/** The drawn elements of `svg` drawing `address`, in document order. */
function addressed(svg: SVGSVGElement, address: ElementAddress): Element[] {
  return drawn(svg).filter((element) => {
    const drawnAddress = addressOf(element);
    return drawnAddress !== null && sameAddress(drawnAddress, address);
  });
}

/** The block `call` previews: block A of the view it shows; `null` for a withdrawal. */
function previewed(call: Call | undefined): Block | null | undefined {
  if (call === undefined || !("preview" in call)) return undefined;
  return call.with === null ? null : call.with.view.blocks[A];
}

/** The block A of `view` after `command`, as core's preview gives it. */
function after(view: View, command: Command | null): Block {
  const shown = command === null ? view : previewOf(view, command);
  if (isCommandError(shown)) throw new Error(shown.message);
  return blockIn(shown, A);
}

describe("data-outside", () => {
  it("marks nothing on the arranger and in the bundle editor", () => {
    expect(marked(mountOn(VIEW, A, null).svg, "data-outside")).toEqual([]);
    clear();
    expect(marked(mountOn(VIEW, A, BUNDLE).svg, "data-outside")).toEqual([]);
  });

  it("marks everything but the edited group in the group editor", () => {
    const { svg } = mountOn(VIEW, A, GROUP);
    const inside = [
      tagged("rect", idAddress("group_1")),
      tagged("text", part("group_1", "name")),
      ...SCORE,
      ...PERFORMANCE,
    ];
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

describe("the hover marks", () => {
  /** The hover marks over the drawing, in document order, as `<tag> <data-marks>`. */
  function hovered(svg: SVGSVGElement): string[] {
    return Array.from(
      svg.querySelectorAll('.tilie-mark[data-mark="hover"]'),
      (mark) => `${mark.localName} ${mark.getAttribute("data-marks")}`,
    );
  }

  function move(at: Element, x: number, y: number, buttons = 0): void {
    pointer(at, "pointermove", x, y, { buttons });
  }

  it("marks a hovered box only inside the edited element", () => {
    // In group_1's editor, a member's card is marked and an ungrouped root's card is not.
    const view = viewOf({ id: A, fixture: MIXED });
    const { svg } = mountOn(view, A, GROUP);
    withScreenMatrix(
      svg,
      vi.fn(() => IDENTITY),
    );
    const drawing = drawingOf(blockIn(view, A), view.settings, metrics);
    const centre = (key: PlaceKey): [number, number] => {
      const box = keyedBox(drawing, key);
      if (box === undefined) throw new Error(`no box ${placeKeyText(key)}`);
      return [box.x + box.width / 2, box.y + box.height / 2];
    };
    move(svg, ...centre({ item: "group_1", member: "score" }));
    expect(hovered(svg)).toEqual([tagged("rect", cardAddress("score"))]);
    move(svg, ...centre({ item: "annotations" }));
    expect(hovered(svg)).toEqual([]);
  });

  it("keeps both marks across a redraw, changes only the marks, and reads nothing during a press", () => {
    const view = viewOf({ id: A, fixture: "segment_line" });
    const { svg, redraw } = mountOn(view, A, null);
    const FORM_AND_BOUNDARY = [
      tagged("rect", cardAddress("form")),
      tagged("line", part("b2", "start")),
    ];
    const matrix = vi.fn(() => IDENTITY);
    withScreenMatrix(svg, matrix);
    const boundary = () =>
      addressed(svg, part("b2", "start")).find((element) => element.localName === "line");
    const line = boundary();
    if (line === undefined) throw new Error("no boundary of b2");

    move(line, 227.294921875, 36.4765625);
    expect(hovered(svg)).toEqual(FORM_AND_BOUNDARY);
    // The boundary's mark copies its line, the address left out.
    const mark = Array.from(svg.querySelectorAll("line.tilie-mark")).find(
      (found) => found.getAttribute("data-marks") === addressKey(part("b2", "start")),
    );
    if (mark === undefined) throw new Error("no mark of the boundary of b2");
    for (const name of ["x1", "y1", "x2", "y2", "stroke-width"]) {
      expect(mark.getAttribute(name)).toBe(line.getAttribute(name));
    }
    expect(writesAddress(mark)).toBe(false);

    const before = drawn(svg);
    redraw(
      changed(view, {
        type: "set",
        changes: [
          {
            target: WORKSPACE,
            values: {
              graphical: {
                statements: [{ select: { element: "boundary" }, set: { stroke: "#FF0000" } }],
              },
            },
          },
        ],
      }),
    );
    expect(drawn(svg).every((element, index) => element === before[index])).toBe(true);
    expect(boundary()?.getAttribute("stroke")).toBe("#FF0000");
    expect(hovered(svg)).toEqual(FORM_AND_BOUNDARY);

    // Leaving the boundary for the card removes the boundary's mark and touches nothing else.
    const changes = new MutationObserver(() => {});
    changes.observe(svg, { subtree: true, childList: true, attributes: true });
    move(svg, 52.294921875, 68.953125);
    const records = changes.takeRecords();
    changes.disconnect();
    expect(hovered(svg)).toEqual([tagged("rect", cardAddress("form"))]);
    expect(records.every(({ type, target }) => type === "childList" && target === svg)).toBe(true);
    const elements = (nodes: NodeList[]) =>
      nodes.flatMap((list) => Array.from(list)).filter((node) => node instanceof Element);
    expect(elements(records.map(({ removedNodes }) => removedNodes)).map(named)).toEqual([
      "line none",
    ]);
    expect(elements(records.map(({ addedNodes }) => addedNodes))).toEqual([]);

    matrix.mockClear();
    move(line, 4, 4, 1);
    expect(matrix).toHaveBeenCalledTimes(0);
    expect(hovered(svg)).toEqual([tagged("rect", cardAddress("form"))]);
    move(svg, 4, 4);
    expect(matrix).toHaveBeenCalledTimes(1);
    expect(hovered(svg)).toEqual([]);

    move(line, 227.294921875, 36.4765625);
    expect(hovered(svg)).toEqual(FORM_AND_BOUNDARY);
    svg.dispatchEvent(new PointerEvent("pointerleave"));
    flushSync();
    expect(hovered(svg)).toEqual([]);
  });

  it("marks a frame, the card rather than the frame around it, and a selected card by its selection", () => {
    const view = viewOf({ id: A, fixture: CHILD_MEMBER });
    const { svg } = mountOn(view, A, null, { selection: selectedIn(idAddress("group_1")) });
    const frame = addressed(svg, idAddress("group_1"))[0];
    const line = addressed(svg, idAddress("recording")).find(
      (element) => element.localName === "line",
    );
    if (frame === undefined || line === undefined) throw new Error("no frame or line");

    move(frame, 12, 12);
    expect(hovered(svg)).toEqual([]);
    move(line, 120.61962890625, 139.16015625);
    expect(hovered(svg)).toEqual([tagged("rect", cardAddress("recording"))]);
    const own = addressed(svg, cardAddress("recording"))[1];
    const mark = svg.querySelector('.tilie-mark[data-mark="hover"]');
    for (const name of ["x", "y", "width", "height", "rx"]) {
      expect(mark?.getAttribute(name)).toBe(own?.getAttribute(name));
    }
    expect(
      Array.from(svg.querySelectorAll(".tilie-mark"), (found) => [
        found.getAttribute("data-mark"),
        found.getAttribute("data-marks"),
      ]),
    ).toEqual([
      ["holding", addressKey(BUNDLE_ADDRESS)],
      ["selection", addressKey(idAddress("group_1"))],
      ["hover", addressKey(cardAddress("recording"))],
    ]);
    move(frame, 12, 12);
    expect(hovered(svg)).toEqual([]);
  });

  it("marks the frame under the pointer when it is not selected", () => {
    const { svg } = mountOn(viewOf({ id: A, fixture: CHILD_MEMBER }), A, null);
    const frame = addressed(svg, idAddress("group_1"))[0];
    if (frame === undefined) throw new Error("no frame");
    move(frame, 12, 12);
    expect(hovered(svg)).toEqual([tagged("rect", idAddress("group_1"))]);
  });
});

describe("the selection marks", () => {
  it("marks both cards of a member of two groups, which share one address", () => {
    // `t` is a member of `g1` and of `g2`: a card in each frame, both `{id: "t", part: ["card"]}`.
    const view = viewOf({ id: A, fixture: "bundles/bundle_shared_member" });
    const { svg } = mountOn(view, A, null, { selection: selectedIn(cardAddress("t")) });
    const drawing = drawingOf(blockIn(view, A), view.settings, metrics);
    /** The outline of the card under `key`: its record's own rectangle, as the node draws it. */
    const rectangle = (key: PlaceKey) => {
      const box = keyedBox(drawing, key);
      if (box === undefined) throw new Error(`no card ${placeKeyText(key)}`);
      const own = drawn(svg).find((element) => {
        const source = sourceAt(element);
        return source?.element === box.range.start && source.role === "primary";
      });
      if (own === undefined) throw new Error(`no rectangle of ${placeKeyText(key)}`);
      return ["x", "y", "width", "height"].map((name) => own.getAttribute(name));
    };
    const marks = Array.from(svg.querySelectorAll('.tilie-mark[data-mark="selection"]'));
    expect(
      marks.map((mark) => [
        mark.localName,
        mark.getAttribute("data-marks"),
        mark.getAttribute("data-box"),
        ...["x", "y", "width", "height"].map((name) => mark.getAttribute(name)),
      ]),
    ).toEqual([
      ["rect", addressKey(cardAddress("t")), "card", ...rectangle({ item: "g1", member: "t" })],
      ["rect", addressKey(cardAddress("t")), "card", ...rectangle({ item: "g2", member: "t" })],
    ]);
  });
});

describe("keys", () => {
  it("keep every element across a reorder", () => {
    const { svg, redraw } = mountOn(VIEW, A, GROUP);
    const score = addressed(svg, cardAddress("score"));
    const performance = addressed(svg, cardAddress("performance"));
    expect(score.length).toBe(2);
    expect(addressed(svg, part("excerpt", "start")).length).toBe(2);
    const command = reorderCommand(blockIn(VIEW, A), "group_1", ["performance", "score"]);
    redraw(changed(VIEW, command));
    expect(
      addressed(svg, cardAddress("score")).every((element, index) => element === score[index]),
    ).toBe(true);
    expect(
      addressed(svg, cardAddress("performance")).every(
        (element, index) => element === performance[index],
      ),
    ).toBe(true);
    const order = drawn(svg);
    expect(order.indexOf(performance[1] as Element)).toBeLessThan(
      order.indexOf(score[0] as Element),
    );
    expect(order.length).toBe(dataOf(changed(VIEW, command), A, GROUP).descriptors.length);
  });
});

describe("the presses taken", () => {
  /**
   * The drawn elements of `svg` that take a press: each pressed in turn at a
   * point no band holds, marked `nodrag` while the press is held, released
   * in place (a click, which calls nothing).
   */
  function taken(svg: SVGSVGElement): string[] {
    return drawn(svg).flatMap((element) => {
      pointer(element, "pointerdown", -1000, -1000);
      const marks = element.classList.contains("nodrag") && element.classList.contains("nopan");
      pointer(element, "pointerup", -1000, -1000);
      const address = addressOf(element);
      if (!marks || address === null) return [];
      return [`${named(element)} ${addressed(svg, address).indexOf(element)}`];
    });
  }

  it("are none on the arranger", () => {
    expect(taken(mountOn(VIEW, A, null).svg)).toEqual([]);
  });

  it("are the items' own rectangles in the bundle editor", () => {
    const { svg, calls } = mountOn(VIEW, A, BUNDLE);
    expect(taken(svg)).toEqual([
      `${tagged("rect", idAddress("group_1"))} 0`,
      `${tagged("rect", idAddress("group_2"))} 0`,
      `${tagged("rect", cardAddress("annotations"))} 1`,
    ]);
    expect(calls).toEqual([]);
  });

  it("are the edited frame's cards in the group editor", () => {
    expect(taken(mountOn(VIEW, A, GROUP).svg)).toEqual([
      `${tagged("rect", cardAddress("score"))} 1`,
      `${tagged("rect", cardAddress("performance"))} 1`,
    ]);
  });

  it("are none in the timeline editor, in another block, or on a locked canvas", () => {
    expect(taken(mountOn(VIEW, A, TIMELINE).svg)).toEqual([]);
    clear();
    expect(taken(mountOn(VIEW, B, BUNDLE).svg)).toEqual([]);
    clear();
    expect(taken(mountOn(VIEW, A, BUNDLE, { locked: true }).svg)).toEqual([]);
  });
});

describe("the reorder of a frame's cards", () => {
  /** The Web Animations a settling copy runs, recorded; `finish` ends the last one. */
  let settles: ReturnType<typeof vi.fn>;
  let finish: () => void;

  beforeEach(() => {
    const animation = { cancel() {}, onfinish: null as (() => void) | null };
    finish = () => {
      animation.onfinish?.();
      flushSync();
    };
    settles = vi.fn(() => animation);
    Object.defineProperty(Element.prototype, "animate", {
      value: settles,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "animate");
  });

  /** Wait for the next animation frame, after the callbacks requested before it. */
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  it("selects, previews each order as its command leaves the block, stores one set", async () => {
    const { svg, calls } = mountOn(VIEW, A, GROUP);
    const card = addressed(svg, cardAddress("score"))[1] as Element;
    // The card slides 60 pixels down to a previewed slot; the gesture reads the drawing's CTM.
    withScreenMatrix(card, () => ({ ...IDENTITY, f: 60 }));
    pointer(card, "pointerdown", 100, 70);
    pointer(card, "pointermove", 100, 76);
    const ghost = () => svg.querySelectorAll("g.tilie-dragged");
    expect(ghost().length).toBe(1);
    expect(ghost()[0]?.getAttribute("transform")).toBe("translate(0 6)");
    pointer(card, "pointermove", 110, 170);
    expect(ghost()[0]?.getAttribute("transform")).toBe("translate(10 100)");
    const copy = Array.from((ghost()[0] as Element).children);
    expect(copy.map((element) => element.localName)).toEqual(
      SCORE.map((element) => element.split(" ")[0]),
    );
    expect(copy.some(writesAddress)).toBe(false);
    expect(marked(svg, "visibility")).toEqual(SCORE);
    pointer(card, "pointerup", 110, 170);

    const reorder = reorderCommand(blockIn(VIEW, A), "group_1", ["performance", "score"]);
    expect(kinds(calls)).toEqual(["select", "preview", "preview", "dispatch", "preview"]);
    expect(calls[0]).toEqual({ select: inA(cardAddress("score")) });
    expect(previewed(calls[1])).toEqual(blockIn(VIEW, A));
    expect(previewed(calls[2])).toEqual(after(VIEW, reorder));
    expect(calls[3]).toEqual({ dispatch: reorder });
    expect(reorder).toEqual({
      type: "set",
      changes: [{ target: inA(idAddress("group_1")), values: { order: null } }],
    });
    expect(previewed(calls[4])).toBeNull();
    // The node's view is not changed by the recorded dispatch: the copy settles on the card's old place.
    // Until the next frame it lies where it was dropped, no motion started.
    expect(ghost().length).toBe(1);
    expect(ghost()[0]?.getAttribute("transform")).toBe("translate(10 100)");
    expect(settles).not.toHaveBeenCalled();
    await nextFrame();
    expect(settles.mock.calls).toEqual([
      [
        [{ transform: "translate(10px, 100px)" }, { transform: "translate(0px, 0px)" }],
        {
          duration: Math.sqrt(Math.hypot(10, 100)) * 120,
          easing: CUBIC_OUT,
          fill: "forwards",
        },
      ],
    ]);
    expect(settles.mock.contexts[0]).toBe(ghost()[0]);
    expect(marked(svg, "visibility")).toEqual(SCORE);
    finish();
    expect(ghost().length).toBe(0);
    expect(marked(svg, "visibility")).toEqual([]);
  });

  it("starts no motion for a copy gone before the next frame", async () => {
    const { svg } = mountOn(VIEW, A, GROUP);
    const card = addressed(svg, cardAddress("score"))[1] as Element;
    drag(card, [100, 70], [110, 170]);
    expect(svg.querySelectorAll("g.tilie-dragged").length).toBe(1);
    clear();
    await nextFrame();
    expect(settles).not.toHaveBeenCalled();
  });

  it("removes the copy at once under reduced motion", () => {
    const { svg } = mountOn(VIEW, A, GROUP, { reducedMotion: true });
    const card = addressed(svg, cardAddress("score"))[1] as Element;
    drag(card, [100, 70], [110, 170]);
    expect(settles).not.toHaveBeenCalled();
    expect(svg.querySelectorAll("g.tilie-dragged").length).toBe(0);
    expect(marked(svg, "visibility")).toEqual([]);
  });

  it("calls nothing for a press released within the click distance", () => {
    const { svg, calls } = mountOn(VIEW, A, GROUP);
    const card = addressed(svg, cardAddress("score"))[1] as Element;
    pointer(card, "pointerdown", 100, 70);
    pointer(card, "pointermove", 102, 72);
    pointer(card, "pointerup", 102, 72);
    expect(calls).toEqual([]);
    expect(svg.querySelectorAll("g.tilie-dragged").length).toBe(0);
  });
});

describe("the item move", () => {
  /** `group_2` moved alone to (40, 200), the other items stating their drawn places. */
  const ALONE = itemMoveCommand(VIEW, A, { item: "group_2" }, 40, 200, metrics);
  /** `group_2` moved to (40, 200) with `annotations` by the same travel. */
  const BOTH = itemMoveCommand(VIEW, A, { item: "group_2" }, 40, 200, metrics, [
    { item: "annotations" },
  ]);

  it("is the command the bundle editor's rule gives", () => {
    expect(ALONE).toEqual({
      type: "set",
      changes: [
        { target: inA(idAddress("group_2")), values: { place: { x: 40, y: 200 } } },
        { target: inA(idAddress("group_1")), values: { place: { x: 8, y: 28.8046875 } } },
        { target: inA(idAddress("annotations")), values: { place: { x: 8, y: 391.7734375 } } },
      ],
    });
    expect(BOTH).toEqual({
      type: "set",
      changes: [
        { target: inA(idAddress("group_2")), values: { place: { x: 40, y: 200 } } },
        { target: inA(idAddress("annotations")), values: { place: { x: 40, y: 385.734375 } } },
        { target: inA(idAddress("group_1")), values: { place: { x: 8, y: 28.8046875 } } },
      ],
    });
  });

  /** The node of A on `view` in A's bundle editor with `selected` (element addresses of A). */
  function pressedWith(selected: ElementAddress[], view: View = VIEW, options: Options = {}) {
    const selection = selectedIn(...selected);
    const node = mountOn(view, A, BUNDLE, { ...options, selection });
    const frame = addressed(node.svg, idAddress("group_2"))[0] as Element;
    pointer(frame, "pointerdown", 100, 200);
    return { ...node, frame };
  }

  /** The calls of a gesture that previews and stores `command`, with or without its `select`. */
  function stored(view: View, command: SetCommand | null, selects: boolean): Call[] {
    if (command === null) throw new Error("the gesture stores nothing");
    const shown = previewOf(view, command);
    if (isCommandError(shown)) throw new Error(shown.message);
    return [
      ...(selects ? [{ select: inA(idAddress("group_2")) }] : []),
      { preview: A, with: { view: shown } },
      { dispatch: command },
      { preview: A, with: null },
    ];
  }

  it("moves an item outside the selection alone, selecting it", () => {
    const { calls, frame } = pressedWith([]);
    pointer(frame, "pointermove", 132, 193.9609375);
    expect(svg().querySelectorAll("g.tilie-dragged").length).toBe(0);
    pointer(frame, "pointerup", 132, 193.9609375);
    expect(calls).toEqual(stored(VIEW, ALONE, true));
    clear();

    const outside = pressedWith([idAddress("group_1"), cardAddress("annotations")]);
    pointer(outside.frame, "pointermove", 132, 193.9609375);
    pointer(outside.frame, "pointerup", 132, 193.9609375);
    expect(outside.calls).toEqual(stored(VIEW, ALONE, true));
  });

  it("moves two selected items together in one set and leaves the selection", () => {
    const { calls, frame } = pressedWith([idAddress("group_2"), cardAddress("annotations")]);
    pointer(frame, "pointermove", 132, 193.9609375);
    pointer(frame, "pointerup", 132, 193.9609375);
    expect(calls).toEqual(stored(VIEW, BOTH, false));
  });

  it("moves the one item in the selection alone and leaves the selection", () => {
    const { calls, frame } = pressedWith([idAddress("group_2"), idAddress("page")]);
    pointer(frame, "pointermove", 132, 193.9609375);
    pointer(frame, "pointerup", 132, 193.9609375);
    expect(calls).toEqual(stored(VIEW, ALONE, false));
  });

  it("leaves a frame under a moved card where it is", () => {
    // `annotations`' card drawn at (8, 60), over `group_1`'s frame; every item states its place.
    const over = changed(VIEW, itemMoveCommand(VIEW, A, { item: "annotations" }, 8, 60, metrics));
    const moved = itemMoveCommand(over, A, { item: "group_2" }, 40, 200, metrics, [
      { item: "annotations" },
    ]);
    expect(moved).toEqual({
      type: "set",
      changes: [
        { target: inA(idAddress("group_2")), values: { place: { x: 40, y: 200 } } },
        { target: inA(idAddress("annotations")), values: { place: { x: 40, y: 53.9609375 } } },
      ],
    });
    const { calls, frame } = pressedWith([part("annotations", "name"), idAddress("group_2")], over);
    pointer(frame, "pointermove", 132, 193.9609375);
    pointer(frame, "pointerup", 132, 193.9609375);
    expect(calls).toEqual(stored(over, moved, false));
  });

  it("withdraws the preview on Escape, and stores nothing for a drag back to its start", () => {
    const escaped = pressedWith([idAddress("group_2"), cardAddress("annotations")]);
    pointer(escaped.frame, "pointermove", 132, 193.9609375);
    pressEscape();
    pointer(escaped.frame, "pointerup", 132, 193.9609375);
    expect(kinds(escaped.calls)).toEqual(["preview", "preview"]);
    expect(previewed(escaped.calls[0])).toEqual(after(VIEW, BOTH));
    expect(previewed(escaped.calls[1])).toBeNull();
    clear();

    const back = pressedWith([idAddress("group_2"), cardAddress("annotations")]);
    pointer(back.frame, "pointermove", 132, 193.9609375);
    pointer(back.frame, "pointermove", 100, 200);
    pointer(back.frame, "pointerup", 100, 200);
    expect(kinds(back.calls)).toEqual(["preview", "preview", "preview"]);
    expect(previewed(back.calls[1])).toBe(blockIn(VIEW, A));
    expect(previewed(back.calls[2])).toBeNull();
  });

  it("reads the travel by the canvas zoom and the block's scale, not the drawing's CTM", () => {
    // Zoom 2 and scale 1.25 show a drawing unit as 2.5 pixels; the identity CTM disagrees.
    const scaled = viewOf({ id: A, fixture: MIXED, x: 40, y: 80, scale: 1.25 });
    const { calls, frame } = pressedWith([], scaled, { zoom: 2 });
    pointer(frame, "pointerup", 180, 184.90234375);
    expect(calls.at(-2)).toEqual({
      dispatch: itemMoveCommand(scaled, A, { item: "group_2" }, 40, 200, metrics),
    });
  });
});

/** The `<svg>` mounted last. */
function svg(): SVGSVGElement {
  const found = document.querySelector("svg");
  if (found === null) throw new Error("no svg");
  return found;
}

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
    for (const name of ["animate", "getAnimations"]) {
      Reflect.deleteProperty(Element.prototype, name);
    }
    Reflect.deleteProperty(SVGElement.prototype, "getScreenCTM");
  });

  const REORDERED = changed(
    VIEW,
    reorderCommand(blockIn(VIEW, A), "group_1", ["performance", "score"]),
  );

  /** A reorder of `score`'s card moved below `performance`'s middle, then the preview drawn. */
  async function previewed(reducedMotion: boolean): Promise<number> {
    const { svg, redraw } = mountOn(VIEW, A, GROUP, { reducedMotion });
    const animate = measured();
    const card = addressed(svg, cardAddress("score"))[1] as Element;
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

  it("slides every moved element but the dragged card's while a reorder previews an order", async () => {
    expect(await previewed(false)).toBe(
      dataOf(REORDERED, A, GROUP).descriptors.length - SCORE.length,
    );
  });

  it("does not slide under reduced motion", async () => {
    expect(await previewed(true)).toBe(0);
  });
});

describe("bands in the timeline editor", () => {
  /** A record of `score` on its line at 100, 540 wide from x 16 (README, "Stated records"). */
  function band(
    facet: Facet,
    level: number,
    elements: number,
    y: number,
    height: number,
  ): DrawnBox {
    return {
      kind: "band",
      key: null,
      address: bandAddress("score", facet),
      holder: { item: "group_1", member: "score" },
      x: 16,
      y,
      width: 540,
      height,
      range: { start: 0, end: 0 },
      displayed: false,
      band: { timeline: "score", facet, level, elements, line: 100 },
    };
  }

  const MAPS = band("conversion_maps", 1, 2, 60, 30);
  const MARKERS = band("markers", -1, 2, 104, 12);
  const FLOW = band("flow_control", -2, 1, 120, 8);
  const BANDS = [MAPS, MARKERS, FLOW];

  /** `score`'s order with its markers band moved just below its conversion maps band. */
  const MOVED = ["children", "conversion_maps", "markers", "line", "regions", "flow_control"];
  const MOVE = {
    type: "set",
    changes: [{ target: inA(idAddress("score")), values: { order: MOVED } }],
  } as const;
  const MARKERS_BAND = addressKey(bandAddress("score", "markers"));
  const MAPS_BAND = addressKey(bandAddress("score", "conversion_maps"));

  /** The node of A on `VIEW` under `editing` with the stated records, and `score`'s card. */
  function shown(
    editing: Editing | null,
    { selected = [], locked = false }: { selected?: ElementAddress[]; locked?: boolean } = {},
  ) {
    const selection = selectedIn(...selected);
    const node = mountOn(VIEW, A, editing, { selection, bands: BANDS, locked });
    return { ...node, card: addressed(node.svg, cardAddress("score"))[1] as Element };
  }

  /** The band marks of `svg` as `<data-marks> <data-mark>`. */
  function bandMarks(marks: SVGSVGElement): string[] {
    return Array.from(
      marks.querySelectorAll('rect.tilie-mark[data-box="band"]'),
      (mark) => `${mark.getAttribute("data-marks")} ${mark.getAttribute("data-mark")}`,
    );
  }

  it("marks the hovered band, the selected ones, and a band both with the selection's mark", () => {
    const hovered = shown(TIMELINE);
    pointer(hovered.card, "pointermove", 200, 110, { buttons: 0 });
    const marks = hovered.svg.querySelectorAll('rect.tilie-mark[data-box="band"]');
    expect(marks).toHaveLength(1);
    const mark = marks[0] as Element;
    expect(hovered.svg.lastElementChild).toBe(mark);
    expect(
      Object.fromEntries(
        Array.from(mark.attributes, (attribute) => [attribute.name, attribute.value]),
      ),
    ).toEqual({
      class: "tilie-mark",
      "data-mark": "hover",
      "data-marks": MARKERS_BAND,
      "data-box": "band",
      x: "16",
      y: "104",
      width: "540",
      height: "12",
      rx: "5",
      "aria-hidden": "true",
    });
    clear();

    const selected = shown(TIMELINE, { selected: [bandAddress("score", "markers")] });
    expect(bandMarks(selected.svg)).toEqual([`${MARKERS_BAND} selection`]);
    const children = Array.from(selected.svg.children);
    const holding = children.filter((element) => element.getAttribute("data-mark") === "holding");
    expect(holding.map((element) => element.getAttribute("data-box"))).toEqual([
      "block",
      "frame",
      "card",
    ]);
    const last = children.indexOf(holding.at(-1) as Element);
    expect(children.indexOf(selected.svg.querySelector('[data-box="band"]') as Element)).toBe(
      last + 1,
    );
    pointer(selected.card, "pointermove", 200, 110);
    expect(bandMarks(selected.svg)).toEqual([`${MARKERS_BAND} selection`]);
    pointer(selected.card, "pointermove", 200, 75);
    expect(bandMarks(selected.svg)).toEqual([`${MAPS_BAND} hover`, `${MARKERS_BAND} selection`]);
    selected.svg.dispatchEvent(new PointerEvent("pointerleave"));
    flushSync();
    expect(bandMarks(selected.svg)).toEqual([`${MARKERS_BAND} selection`]);
  });

  it("selects, previews and stores one set for a drag past the click distance", () => {
    const { svg: drawing, card, calls } = shown(TIMELINE);
    pointer(card, "pointerdown", 200, 110);
    expect(drawing.classList.contains("nodrag") && drawing.classList.contains("nopan")).toBe(true);
    pointer(card, "pointermove", 200, 113);
    expect(calls).toEqual([]);
    pointer(card, "pointermove", 200, 90);
    pointer(card, "pointerup", 200, 90);
    expect(kinds(calls)).toEqual(["select", "preview", "dispatch", "preview"]);
    expect(calls[0]).toEqual({ select: inA(bandAddress("score", "markers")) });
    expect(previewed(calls[1])).toEqual(after(VIEW, MOVE));
    expect(calls[2]).toEqual({ dispatch: MOVE });
    expect(previewed(calls[3])).toBeNull();
    expect(drawing.classList.contains("nodrag") || drawing.classList.contains("nopan")).toBe(false);
  });

  it("reads the drop against the drawing at the press, never the preview's", () => {
    const { card, calls, redraw } = shown(TIMELINE);
    pointer(card, "pointerdown", 200, 110);
    pointer(card, "pointermove", 200, 90);
    redraw(VIEW, [MAPS, { ...MARKERS, y: 86, height: 10 }, { ...FLOW, y: 104 }]);
    pointer(card, "pointermove", 200, 112);
    expect(calls).toHaveLength(3);
    expect(previewed(calls[2])).toBe(blockIn(VIEW, A));
  });

  it("stores nothing for a click, a release in place or Escape", () => {
    const clicked = shown(TIMELINE);
    pointer(clicked.card, "pointerdown", 200, 110);
    pointer(clicked.card, "pointermove", 202, 112);
    pointer(clicked.card, "pointerup", 202, 112);
    expect(clicked.calls).toEqual([]);
    clear();

    const back = shown(TIMELINE);
    pointer(back.card, "pointerdown", 200, 110);
    pointer(back.card, "pointermove", 200, 90);
    pointer(back.card, "pointermove", 200, 112);
    pointer(back.card, "pointerup", 200, 112);
    expect(kinds(back.calls)).toEqual(["select", "preview", "preview", "preview"]);
    expect(previewed(back.calls[2])).toBe(blockIn(VIEW, A));
    expect(previewed(back.calls[3])).toBeNull();
    clear();

    const escaped = shown(TIMELINE);
    pointer(escaped.card, "pointerdown", 200, 110);
    pointer(escaped.card, "pointermove", 200, 90);
    pressEscape();
    pointer(escaped.card, "pointerup", 200, 90);
    expect(kinds(escaped.calls)).toEqual(["select", "preview", "preview"]);
    expect(previewed(escaped.calls[2])).toBeNull();
  });

  /** A press on `target` of `node` at the markers band, moved and released: no call, no mark. */
  function untaken(node: ReturnType<typeof shown>, target: Element, shiftKey = false): void {
    const marks: boolean[] = [];
    const isMarked = () =>
      node.svg.classList.contains("nodrag") || node.svg.classList.contains("nopan");
    pointer(target, "pointerdown", 200, 110, { shiftKey });
    marks.push(isMarked());
    pointer(target, "pointermove", 200, 90, { shiftKey });
    marks.push(isMarked());
    pointer(target, "pointerup", 200, 90, { shiftKey });
    expect(node.calls).toEqual([]);
    expect(marks).toEqual([false, false]);
    clear();
  }

  it("starts no drag on a locked canvas, with Shift, or on an element over the band", () => {
    const locked = shown(TIMELINE, { locked: true });
    untaken(locked, locked.card);
    const shifted = shown(TIMELINE);
    untaken(shifted, shifted.card, true);
    const wedge = shown(TIMELINE);
    untaken(wedge, addressed(wedge.svg, part("score", "start"))[0] as Element);
  });

  it("marks and moves no band outside its timeline's editor", () => {
    const performance: Editing = { target: inA(idAddress("performance")), kind: "timeline" };
    const outside: [Editing | null, (node: ReturnType<typeof shown>) => Element][] = [
      [null, (node) => node.card],
      [BUNDLE, (node) => node.card],
      [GROUP, (node) => addressed(node.svg, idAddress("group_1"))[0] as Element],
      [performance, (node) => node.card],
    ];
    for (const [editing, target] of outside) {
      const marks = shown(editing, { selected: [bandAddress("score", "markers")] });
      pointer(marks.card, "pointermove", 200, 110);
      expect(bandMarks(marks.svg)).toEqual([]);
      clear();
      const node = shown(editing);
      untaken(node, target(node));
    }
  });
});
