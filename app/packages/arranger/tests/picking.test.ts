// @vitest-environment jsdom
/**
 * Picking an element: what a press picks (`pickable`), and the canvas
 * calling `picking` instead of selecting. The expected values are derived in
 * `README.md` ("Picking an element").
 */

import type { Address, ElementAddress, Store } from "@timetoalign/tilie-core";
import { bandAddress, cardAddress, idAddress, inBlock, partAddress } from "@timetoalign/tilie-core";
import type { Drawing, DrawnElement } from "@timetoalign/tilie-layout";
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hit } from "../src/boxes.ts";
import { hitOf } from "../src/boxes.ts";
import { drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { pickable } from "../src/picking.ts";
import type { Selection } from "../src/selection.ts";
import { selectionOf } from "../src/selection.ts";
import Harness from "./CanvasHarness.svelte";
import { IDENTITY, settle, stubCanvasGlobals, withScreenMatrix } from "./dom.ts";
import { A, blockIn, CHILD_MEMBER, metrics, sourceOf, storeOf, viewOf } from "./support.ts";

/** The block A of `fixture`: its manifest and drawing. */
function blockOf(fixture: string) {
  const view = viewOf({ id: A, fixture });
  const block = blockIn(view, A);
  return { manifest: block.manifest, drawing: drawingOf(block, view.graphical, metrics) };
}

const picked = (id: string): Address => ({ block: A, id });

describe("what a press picks", () => {
  const region = blockOf("with_region");
  /** What a press on the descriptor drawing `address` (of `type`, in `role`) picks. */
  const pick = (
    { manifest, drawing }: { manifest: Parameters<typeof pickable>[1]; drawing: Drawing },
    address: ElementAddress,
    type?: DrawnElement["type"],
    role: "primary" | "shadow" = "primary",
  ) => pickable(hitOf(A, drawing, sourceOf(drawing, address, type, role)), manifest);

  it("picks a timeline by its line, card, shadow and name", () => {
    expect(pick(region, idAddress("clt_1"), "timeline")).toEqual(picked("clt_1"));
    expect(pick(region, cardAddress("clt_1"))).toEqual(picked("clt_1"));
    expect(pick(region, cardAddress("clt_1"), "card", "shadow")).toEqual(picked("clt_1"));
    expect(pick(region, partAddress(idAddress("clt_1"), "name"))).toEqual(picked("clt_1"));
    expect(pick(region, idAddress("clt_2"), "child")).toEqual(picked("clt_2"));
    expect(pick(region, partAddress(idAddress("clt_2"), "name"))).toEqual(picked("clt_2"));
  });

  it("picks a region by itself and its label", () => {
    expect(pick(region, idAddress("region_1"), "region")).toEqual(picked("region_1"));
    expect(pick(region, partAddress(idAddress("region_1"), "label"))).toEqual(picked("region_1"));
  });

  it("picks nothing on the block, a named timestamp or its label", () => {
    expect(pickable(hitOf(A, region.drawing, null), region.manifest)).toBeNull();
    expect(pick(region, idAddress("timestamp_1"), "wedge")).toBeNull();
    expect(pick(region, partAddress(idAddress("timestamp_1"), "coordinate"))).toBeNull();
  });

  it("picks the edited timeline by its band in its editor", () => {
    const editing: Editing = { target: inBlock(A, idAddress("clt_1")), kind: "timeline" };
    const point = { x: 42.49951171875 + 417.695068359375 / 2, y: 81.9765625 + 18.4765625 / 2 };
    const hit: Hit = hitOf(A, region.drawing, null, point, editing);
    expect(hit.address).toEqual(inBlock(A, bandAddress("clt_1", "regions")));
    expect(pickable(hit, region.manifest)).toEqual(picked("clt_1"));
  });

  it("picks no frame or group title, and the timeline of a line or mark in a card", () => {
    const member = blockOf(CHILD_MEMBER);
    expect(pick(member, idAddress("group_1"), "frame")).toBeNull();
    expect(pick(member, partAddress(idAddress("group_1"), "name"))).toBeNull();
    expect(pick(member, idAddress("piece"), "ancestor")).toEqual(picked("piece"));
    expect(pick(member, partAddress(idAddress("second-half"), "start"), "wedge")).toEqual(
      picked("second-half"),
    );
  });

  it("picks a segment by its boundary", () => {
    const segments = blockOf("segment_line");
    expect(pick(segments, partAddress(idAddress("b"), "start"), "boundary")).toEqual(picked("b"));
  });

  it("picks no flow-control element", () => {
    const flow = blockOf("flow_control");
    expect(pick(flow, idAddress("flow_marker_1"), "flow_marker")).toBeNull();
    expect(pick(flow, idAddress("jump_from_1"), "jump_from")).toBeNull();
  });
});

describe("the canvas while picking", () => {
  interface Mounted {
    current(): { selection: Selection };
    select(next: Selection): void;
  }
  let mounted: Mounted | undefined;
  let instance: ReturnType<typeof mount> | undefined;
  let store: Store;
  let picks: Address[];

  beforeEach(() => {
    stubCanvasGlobals();
    store = storeOf(viewOf({ id: A, fixture: "with_region" }));
    picks = [];
  });

  afterEach(() => {
    if (instance !== undefined) unmount(instance);
    instance = undefined;
    mounted = undefined;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** The canvas over `store`, picking into `picks` when `picks` is on. */
  async function show(picking: boolean): Promise<void> {
    instance = mount(Harness, {
      target: document.body,
      props: {
        store,
        metrics,
        picking: picking ? (address: Address) => void picks.push(address) : null,
      },
    });
    // `tsc` reads the harness through Svelte's generic module declaration, which leaves its exports untyped.
    mounted = instance as Mounted;
    await settle();
    withScreenMatrix(svg(), () => IDENTITY);
  }

  function arranger(): HTMLElement {
    const found = document.querySelector<HTMLElement>('[aria-label="Arranger"]');
    if (found === null) throw new Error("no arranger");
    return found;
  }

  function svg(): SVGSVGElement {
    const found = document.querySelector<SVGSVGElement>(".svelte-flow__node[data-id] svg");
    if (found === null) throw new Error("no drawing");
    return found;
  }

  /** The card's own rectangle of `clt_1` (the last element carrying its address, after its shadow). */
  function card(): Element {
    const found = [...svg().querySelectorAll('[data-id="clt_1"][data-part="card"]')].at(-1);
    if (found === undefined) throw new Error("no card");
    return found;
  }

  function background(): Element {
    const found = svg().querySelector(
      "rect:not([data-id]):not([data-facet]):not([data-part]):not(.tilie-mark)",
    );
    if (found === null) throw new Error("no background");
    return found;
  }

  /** A primary press, its release and its click on `target`. */
  async function pressOn(target: Element): Promise<void> {
    const init = { bubbles: true, cancelable: true, clientX: 60, clientY: 30 };
    const pointer = { ...init, isPrimary: true, button: 0, pointerId: 1 };
    target.dispatchEvent(new PointerEvent("pointerdown", pointer));
    target.dispatchEvent(new PointerEvent("pointerup", pointer));
    target.dispatchEvent(new MouseEvent("click", init));
    await settle();
  }

  const selected = () => [...(mounted?.current().selection.values() ?? [])];

  async function pressEscape(): Promise<void> {
    arranger().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await settle();
  }

  it("marks the arranger while picking, and only then", async () => {
    await show(true);
    expect(arranger().hasAttribute("data-picking")).toBe(true);
    if (instance !== undefined) unmount(instance);
    document.body.innerHTML = "";
    await show(false);
    expect(arranger().hasAttribute("data-picking")).toBe(false);
  });

  it("calls picking with a press on a card, and selects nothing", async () => {
    await show(true);
    const journal = store.journal.length;
    await pressOn(card());
    expect(picks).toEqual([picked("clt_1")]);
    expect(selected()).toEqual([]);
    expect(store.journal.length).toBe(journal);
  });

  it("selects the card with the same press when not picking", async () => {
    await show(false);
    await pressOn(card());
    expect(picks).toEqual([]);
    expect(selected()).toEqual([inBlock(A, cardAddress("clt_1"))]);
  });

  it("calls nothing with a press on the block, says what can be picked, and selects nothing", async () => {
    await show(true);
    await pressOn(background());
    expect(picks).toEqual([]);
    expect(document.querySelector('[data-testid="hint"]')?.textContent).toBe(
      "Pick a timeline or a region; Escape cancels.",
    );
    expect(selected()).toEqual([]);
  });

  it("leaves Escape to the caller while picking", async () => {
    expect(store.open(inBlock(A, idAddress("clt_1")))).toBeNull();
    await show(true);
    await pressEscape();
    expect(store.editing.length).toBe(1);
  });

  function pane(): Element {
    const found = document.querySelector(".svelte-flow__pane");
    if (found === null) throw new Error("no pane");
    return found;
  }

  function blockNode(): HTMLElement {
    const found = document.querySelector<HTMLElement>(`.svelte-flow__node[data-id="${A}"]`);
    if (found === null) throw new Error("no block node");
    return found;
  }

  async function select(addresses: readonly Address[]): Promise<void> {
    mounted?.select(selectionOf(addresses));
    await settle();
  }

  async function keyOn(target: Element, key: string): Promise<void> {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    await settle();
  }

  async function clickOn(target: Element): Promise<void> {
    target.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
    );
    await settle();
  }

  const hintText = () => document.querySelector('[data-testid="hint"]')?.textContent;

  it("keeps the selection on a press and a click on the pane while picking", async () => {
    await show(true);
    await select([{ block: A }]);
    await pressOn(pane());
    expect(picks).toEqual([]);
    expect(hintText()).toBe("Pick a timeline or a region; Escape cancels.");
    expect(selected()).toEqual([{ block: A }]);
    await clickOn(pane());
    expect(selected()).toEqual([{ block: A }]);
  });

  it("clears the selection with a click on the pane when not picking", async () => {
    await show(false);
    await select([{ block: A }]);
    await clickOn(pane());
    expect(selected()).toEqual([]);
  });

  it("picks the element Enter is sent to, and selects nothing", async () => {
    await show(true);
    await keyOn(card(), "Enter");
    expect(picks).toEqual([picked("clt_1")]);
    expect(selected()).toEqual([]);
  });

  it("picks nothing with Enter or Space on the focused block, and selects nothing", async () => {
    await show(true);
    for (const key of ["Enter", " "]) {
      await keyOn(blockNode(), key);
      expect(picks).toEqual([]);
      expect(hintText()).toBe("Pick a timeline or a region; Escape cancels.");
      expect(selected()).toEqual([]);
    }
  });

  it("selects the focused block with Enter when not picking", async () => {
    await show(false);
    await keyOn(blockNode(), "Enter");
    expect(selected()).toEqual([{ block: A }]);
  });

  it("closes the editor on Escape when not picking", async () => {
    expect(store.open(inBlock(A, idAddress("clt_1")))).toBeNull();
    await show(false);
    await pressEscape();
    expect(store.editing.length).toBe(0);
  });
});
