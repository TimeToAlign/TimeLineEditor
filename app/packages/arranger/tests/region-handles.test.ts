// @vitest-environment jsdom
/**
 * The handles of a selected region (README, "Regions on the canvas"): what
 * takes handles, the value a drag gives, its command, the gesture with
 * recorded node actions, and the handles on the canvas.
 */

import type { Address, ElementAddress, View } from "@timetoalign/tilie-core";
import { apply, idAddress, inBlock, isCommandError, partAddress } from "@timetoalign/tilie-core";
import type { RegionElement } from "@timetoalign/tilie-layout";
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LEVELS } from "../src/containers.ts";
import type { RegionEdge, RegionLive, RegionSubject } from "../src/gestures/region.ts";
import {
  regionCommand,
  regionDrag,
  regionGesture,
  regionSubjectsOf,
} from "../src/gestures/region.ts";
import type { BlockNode } from "../src/node.ts";
import type { NodeActions } from "../src/nodeActions.ts";
import { project } from "../src/project.ts";
import { NOTHING_SELECTED, type Selection, selectionOf } from "../src/selection.ts";
import Harness from "./CanvasHarness.svelte";
import { recordingActions, settle, stubCanvasGlobals } from "./dom.ts";
import { A, changed, metrics, storeOf, viewOf } from "./support.ts";

const REGION = viewOf({ id: A, fixture: "with_region" });
/** `with_region` with the region `motif` of the child `clt_2`, 1–3 on its own axis. */
const CHILD = changed(REGION, {
  type: "add",
  into: { block: A, id: "clt_2" },
  region: { id: "motif", start: [1, 1], end: [3, 1] },
});
const CONTEXT = { block: A, granularity: REGION.settings.granularity };
const TOLERANCE = 8;
const REACH = 0.5;

function nodeOf(view: View): BlockNode {
  const [node] = project(view, NOTHING_SELECTED, [], metrics, null);
  if (node === undefined) throw new Error("no node");
  return node;
}

function subjectsOf(view: View, address: ElementAddress): readonly RegionSubject[] {
  const node = nodeOf(view);
  return regionSubjectsOf(node.data.block.manifest, node.data.drawing, address);
}

function subjectOf(view: View, id: string): RegionSubject {
  const [subject] = subjectsOf(view, idAddress(id));
  if (subject === undefined) throw new Error(`no brace of ${id}`);
  return subject;
}

/** The brace of `region_1` as layout records it, and `k`, block units per quarter. */
const brace: RegionElement = subjectOf(REGION, "region_1").piece.element;
const k = (brace.x2 - brace.x1) / 4;

/** The first region of `flow/sonata_exposition`, an atomic section. */
const ATOMIC = viewOf({ id: A, fixture: "flow/sonata_exposition" });
const atomicId = ATOMIC.blocks[A]?.manifest.timelines[0]?.regions[0]?.id ?? "";

const text = (value: ReturnType<typeof regionDrag>) =>
  value === null ? null : `${value.numerator}/${value.denominator}`;

describe("a region's handles", () => {
  it("rest on a card one quarter of which is between 16 and 48 block units", () => {
    expect(k > 16 && k < 48).toBe(true);
  });

  it("are taken by both ends of each brace its card's axis reads back", () => {
    const [subject] = subjectsOf(REGION, idAddress("region_1"));
    expect(subjectsOf(REGION, idAddress("region_1")).length).toBe(1);
    expect([subject?.piece.card, subject?.edges]).toEqual([{ item: "clt_1" }, ["start", "end"]]);
    expect(subjectsOf(REGION, idAddress("clt_1"))).toEqual([]);
    expect(subjectsOf(REGION, partAddress(idAddress("region_1"), "label"))).toEqual([]);
    expect(atomicId).not.toBe("");
    expect(subjectsOf(ATOMIC, idAddress(atomicId))).toEqual([]);
    const child = subjectOf(CHILD, "motif");
    expect([child.piece.card, child.timeline.id, child.edges]).toEqual([
      { item: "clt_1" },
      "clt_2",
      ["start", "end"],
    ]);
  });

  it("drag an end to the simplest value, a snapping value, or hold it", () => {
    const subject = subjectOf(REGION, "region_1");
    const drag = (edge: RegionEdge, dx: number) =>
      text(regionDrag(CONTEXT, subject, edge, dx, TOLERANCE, REACH));
    expect([
      drag("start", -k),
      drag("start", -1.5 * k),
      drag("start", 10 * k),
      drag("end", 20 * k),
    ]).toEqual(["1/1", "1/3", "6/1", "12/1"]);
    expect(
      text(regionDrag(CONTEXT, subjectOf(CHILD, "motif"), "start", -k, TOLERANCE, REACH)),
    ).toBe("0/1");
  });

  it("store one set of the end that changes, in the axis's number type", () => {
    const subject = subjectOf(REGION, "region_1");
    const command = (edge: RegionEdge, dx: number) => {
      const value = regionDrag(CONTEXT, subject, edge, dx, TOLERANCE, REACH);
      if (value === null) throw new Error("no value");
      return regionCommand(REGION, A, subject, edge, value);
    };
    const set = (values: object) => ({
      type: "set",
      changes: [{ target: inBlock(A, idAddress("region_1")), values }],
    });
    expect(command("start", -k)).toEqual(set({ start: [1, 1] }));
    expect(command("start", -1.5 * k)).toEqual(set({ start: [1, 3] }));
    expect(command("end", 20 * k)).toEqual(set({ end: [12, 1] }));
    expect(command("start", 0)).toBeNull();
  });
});

describe("the gesture of a region's handle", () => {
  function gesture(edge: RegionEdge, { readonly = false }: { readonly?: boolean } = {}) {
    const node = nodeOf(REGION);
    const subject = subjectOf(REGION, "region_1");
    const recorded = recordingActions(REGION, {
      rules: readonly ? { ...LEVELS.arranger, resize: false } : LEVELS.arranger,
    });
    const actions: NodeActions = { ...recorded.actions, view: () => REGION };
    const lives: (RegionLive | null)[] = [];
    const strategy = regionGesture(
      {
        actions,
        target: () => ({ node, subject }),
        viewport: () => ({ x: 0, y: 0, zoom: 1 }),
        granularity: () => REGION.settings.granularity,
        live: (live) => lives.push(live),
      },
      edge,
    );
    const at = (x: number) => ({ drawing: { x, y: 0 }, screen: { x, y: 0 } });
    const press = strategy.takes(new PointerEvent("pointerdown"), at(0));
    return { strategy, press, at, calls: recorded.calls, lives };
  }

  it("previews the start moved a quarter left and stores its set", () => {
    const { strategy, press, at, calls, lives } = gesture("start");
    if (press === null) throw new Error("not taken");
    const value = strategy.value(press, at(-k));
    if (value === null) throw new Error("no value");
    strategy.preview(press, value);
    const command = strategy.command(press, value);
    expect(command).toEqual({
      type: "set",
      changes: [{ target: inBlock(A, idAddress("region_1")), values: { start: [1, 1] } }],
    });
    expect(calls.map((call) => Object.keys(call)[0])).toEqual(["preview"]);
    if (command === null) throw new Error("no command");
    const after = apply(REGION, command);
    if (isCommandError(after)) throw new Error(after.message);
    const moved = subjectOf(after, "region_1").piece.element;
    expect(lives).toEqual([{ edge: "start", at: { x: moved.x1, y: moved.yb } }]);
    expect(text(subjectOf(after, "region_1").start)).toBe("1/1");
  });

  it("takes no press on a read-only canvas", () => {
    expect(gesture("start", { readonly: true }).press).toBeNull();
  });
});

describe("the handles on the canvas", () => {
  interface Mounted {
    select(next: Selection): void;
  }

  let mounted: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    stubCanvasGlobals(() => true);
  });

  afterEach(() => {
    if (mounted !== undefined) unmount(mounted);
    mounted = undefined;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  async function shown(view: View, address: Address | null): Promise<void> {
    if (mounted !== undefined) unmount(mounted);
    document.body.innerHTML = "";
    const store = storeOf(view);
    const instance = mount(Harness, { target: document.body, props: { store, metrics } });
    mounted = instance;
    // `tsc` reads the harness through Svelte's generic module declaration, which leaves its exports untyped.
    const harness = instance as Mounted;
    await settle();
    harness.select(address === null ? NOTHING_SELECTED : selectionOf([address]));
    await settle();
  }

  const handles = () =>
    [...document.querySelectorAll<HTMLElement>("[data-testid^='region-handle-']")].map((handle) => [
      handle.getAttribute("data-testid"),
      handle.style.left,
      handle.style.top,
    ]);

  it("shows one handle at each end of the selected region's brace", async () => {
    await shown(REGION, inBlock(A, idAddress("region_1")));
    expect(handles()).toEqual([
      ["region-handle-start", `${brace.x1}px`, `${brace.yb}px`],
      ["region-handle-end", `${brace.x2}px`, `${brace.yb}px`],
    ]);
    expect(document.querySelectorAll("[data-testid^='gap-handle-']").length).toBe(0);
  });

  it("shows none for a line, an atomic section or nothing", async () => {
    await shown(REGION, inBlock(A, idAddress("clt_1")));
    expect(handles()).toEqual([]);
    await shown(ATOMIC, inBlock(A, idAddress(atomicId)));
    expect(handles()).toEqual([]);
    await shown(REGION, null);
    expect(handles()).toEqual([]);
  });
});
