// @vitest-environment jsdom
/**
 * The flow switch (README, "Virtual cards, ribbons, the flow flag and the
 * flow switch"): the list offered on a card (none on a frame), the entry
 * shown chosen, the `style` commands a choice sends, each applied by core,
 * the select in the resize toolbar's row, and the switch's motion arithmetic.
 */

import type { ElementAddress, StyleCommand, View } from "@timetoalign/tilie-core";
import { addressKey, cardAddress, cardFlow, idAddress } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import { lineAxes } from "@timetoalign/tilie-layout";
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boxOf } from "../src/boxes.ts";
import { LEVELS } from "../src/containers.ts";
import type { FlowChoice } from "../src/flowSwitch.ts";
import {
  AS_WRITTEN,
  chosenFlow,
  flowChoices,
  flowCommands,
  morphTransform,
  SWITCH_WIDTH,
  spanAt,
  switchMorphs,
} from "../src/flowSwitch.ts";
import { recordingActions, stubCanvasGlobals } from "./dom.ts";
import { A, blockIn, changed, viewOf } from "./support.ts";
import Harness from "./ToolbarHarness.svelte";
import { DEFAULT, drawingIn, ROOT, virtualView } from "./virtualCards.ts";

const VIRTUAL = virtualView();
const SWITCHED = viewOf({ id: A, fixture: "flow/switched_card" });
const FRAME = viewOf({ id: A, fixture: "groups/switched_frame" });

/** The box of block A's drawing in `view` at `address`. */
function box(view: View, address: ElementAddress): DrawnBox {
  const found = boxOf(drawingIn(view), address);
  if (found === undefined) throw new Error(`no box at ${addressKey(address)}`);
  return found;
}

const manifest = (view: View) => blockIn(view, A).manifest;

/** The list's entries: "As written", then each FlowMap of `allegro` once. */
const ALLEGRO: FlowChoice[] = [
  AS_WRITTEN,
  { flow: "by_hand", label: "Practice" },
  { flow: "default", label: "default" },
  { flow: "printed", label: "printed" },
  { flow: "single", label: "single" },
];

/** The command setting `flow` on `allegro`'s cards in block A. */
const flowOn = (flow: string | null): StyleCommand => ({
  type: "style",
  select: { addresses: [{ id: ROOT, part: ["card"] }] },
  set: { flow },
  blocks: [A],
});

const choice = (flow: string | null) => ALLEGRO.find((entry) => entry.flow === flow) ?? AS_WRITTEN;

/** `virtual_cards` with `allegro`'s cards switched to the virtual timeline `allegro_default`. */
const NAMING_VIRTUAL = changed(VIRTUAL, flowOn(DEFAULT));

describe("the list", () => {
  it("offers As written and each FlowMap of the root once above its card", () => {
    expect(flowChoices(manifest(VIRTUAL), box(VIRTUAL, cardAddress(ROOT)))).toEqual(ALLEGRO);
    expect(flowChoices(manifest(SWITCHED), box(SWITCHED, cardAddress(ROOT)))).toEqual(ALLEGRO);
    expect(flowChoices(manifest(FRAME), box(FRAME, cardAddress(ROOT)))).toEqual(ALLEGRO);
  });

  it("offers nothing above a frame, a virtual card, the block or a member without flows", () => {
    expect(flowChoices(manifest(FRAME), box(FRAME, idAddress("performance")))).toBeNull();
    expect(flowChoices(manifest(VIRTUAL), box(VIRTUAL, cardAddress(DEFAULT)))).toBeNull();
    expect(flowChoices(manifest(VIRTUAL), box(VIRTUAL, {}))).toBeNull();
    expect(flowChoices(manifest(FRAME), box(FRAME, cardAddress("recording")))).toBeNull();
  });

  it("shows the FlowMap the card is drawn on, also where its flow names a virtual timeline", () => {
    expect(chosenFlow(manifest(VIRTUAL), box(VIRTUAL, cardAddress(ROOT)))).toEqual(AS_WRITTEN);
    expect(cardFlow(manifest(VIRTUAL), ROOT)).toBeNull();
    expect(chosenFlow(manifest(SWITCHED), box(SWITCHED, cardAddress(ROOT)))).toEqual(
      choice("default"),
    );
    expect(chosenFlow(manifest(FRAME), box(FRAME, cardAddress(ROOT)))).toEqual(choice("default"));
    expect(cardFlow(manifest(NAMING_VIRTUAL), ROOT)).toBe(DEFAULT);
    expect(chosenFlow(manifest(NAMING_VIRTUAL), box(NAMING_VIRTUAL, cardAddress(ROOT)))).toEqual(
      choice("default"),
    );
  });
});

describe("the commands", () => {
  it("sets the chosen FlowMap on the card, applied by core", () => {
    const card = box(VIRTUAL, cardAddress(ROOT));
    const commands = flowCommands(A, manifest(VIRTUAL), card, choice("default"));
    expect(commands).toEqual([flowOn("default")]);
    const next = commands.reduce(changed, VIRTUAL);
    expect(cardFlow(manifest(next), ROOT)).toBe("default");
  });

  it("replaces a flow by one command and removes it for As written", () => {
    const card = box(SWITCHED, cardAddress(ROOT));
    expect(flowCommands(A, manifest(SWITCHED), card, choice("single"))).toEqual([flowOn("single")]);
    expect(cardFlow(manifest(changed(SWITCHED, flowOn("single"))), ROOT)).toBe("single");
    const written = flowCommands(A, manifest(SWITCHED), card, AS_WRITTEN);
    expect(written).toEqual([flowOn(null)]);
    expect(cardFlow(manifest(written.reduce(changed, SWITCHED)), ROOT)).toBeNull();
    expect(flowCommands(A, manifest(SWITCHED), card, choice("default"))).toEqual([]);
  });

  it("treats a flow naming a virtual timeline as its FlowMap's entry", () => {
    const card = box(NAMING_VIRTUAL, cardAddress(ROOT));
    const of = (entry: FlowChoice) => flowCommands(A, manifest(NAMING_VIRTUAL), card, entry);
    expect(of(choice("default"))).toEqual([]);
    expect(of(AS_WRITTEN)).toEqual([flowOn(null)]);
    expect(of(choice("single"))).toEqual([flowOn("single")]);
  });

  it("sends nothing for a frame", () => {
    const frame = box(FRAME, idAddress("performance"));
    expect(flowCommands(A, manifest(FRAME), frame, AS_WRITTEN)).toEqual([]);
    expect(flowCommands(A, manifest(FRAME), frame, choice("printed"))).toEqual([]);
  });
});

describe("the select above a card", () => {
  let mounted: ReturnType<typeof mount> | undefined;

  beforeEach(() => {
    stubCanvasGlobals(() => false);
  });

  afterEach(() => {
    if (mounted !== undefined) unmount(mounted);
    mounted = undefined;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  function mountOn(view: View, address: ElementAddress, locked = false) {
    const { actions, calls } = recordingActions(view, { rules: LEVELS.arranger });
    const toolbar = {
      block: blockIn(view, A),
      box: box(view, address),
      level: "arranger" as const,
      bounds: { x: 0, y: 0, width: 100, height: 50 },
      zoom: 1,
      locked,
      mode: "box" as const,
    };
    mounted = mount(Harness, { target: document.body, props: { toolbar, actions } });
    flushSync();
    return calls;
  }

  const select = () =>
    document.querySelector<HTMLSelectElement>("select[data-testid='flow-switch']");

  it("lists the FlowMaps, the chosen one selected, and sends one command for a choice", () => {
    const calls = mountOn(SWITCHED, cardAddress(ROOT));
    const shown = select();
    expect([...(shown?.options ?? [])].map((option) => option.textContent)).toEqual([
      "As written",
      "Practice",
      "default",
      "printed",
      "single",
    ]);
    expect(shown?.value).toBe("2");
    expect(shown?.disabled).toBe(false);
    if (shown === null) throw new Error("no switch");
    shown.value = "4";
    shown.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();
    expect(calls).toEqual([{ dispatch: flowOn("single") }]);
  });

  it("stands in the mode menu's row, right of the modes", () => {
    mountOn(SWITCHED, cardAddress(ROOT));
    const modes = document.querySelector("[role='toolbar'][aria-label='Resize mode']");
    const panel = select()?.closest("label");
    expect(modes?.nextElementSibling).toBe(panel);
    expect(
      [...(modes?.querySelectorAll("button") ?? [])].map((button) => button.dataset.testid),
    ).toEqual(["mode-scale", "mode-box", "mode-stretch"]);
  });

  it("is absent above a frame, whose resize modes stay", () => {
    mountOn(FRAME, idAddress("performance"));
    expect(select()).toBeNull();
    expect(document.querySelector("[data-testid='mode-box']")).not.toBeNull();
  });

  it("keeps one width whatever the names and shows each name whole on hover", () => {
    expect(SWITCH_WIDTH).toBe("11rem");
    const cases = [
      [SWITCHED, cardAddress(ROOT), "default"],
      [VIRTUAL, cardAddress(ROOT), "As written"],
      [FRAME, cardAddress(ROOT), "default"],
    ] as const;
    for (const [view, address, chosen] of cases) {
      mountOn(view, address);
      const shown = select();
      expect([shown?.style.width, shown?.title]).toEqual(["11rem", chosen]);
      expect([...(shown?.options ?? [])].map((option) => option.title)).toEqual(
        ALLEGRO.map((entry) => entry.label),
      );
      if (mounted !== undefined) unmount(mounted);
      mounted = undefined;
      document.body.innerHTML = "";
    }
  });

  it("is disabled on a locked canvas and absent above a virtual card", () => {
    mountOn(VIRTUAL, cardAddress(ROOT), true);
    expect(select()?.disabled).toBe(true);
    if (mounted !== undefined) unmount(mounted);
    mounted = undefined;
    document.body.innerHTML = "";
    mountOn(VIRTUAL, cardAddress(DEFAULT));
    expect(select()).toBeNull();
  });
});

describe("the switch's motion", () => {
  it("moves nothing between two drawings of one manifest", () => {
    const drawing = drawingIn(SWITCHED);
    expect(switchMorphs(manifest(SWITCHED), drawing, drawing)).toEqual([]);
  });

  it("moves each chunk of a card switched from its written stretch to its drawn span", () => {
    const after = drawingIn(SWITCHED);
    const asWritten = flowCommands(
      A,
      manifest(SWITCHED),
      box(SWITCHED, cardAddress(ROOT)),
      AS_WRITTEN,
    );
    expect(asWritten).toEqual([flowOn(null)]);
    const before = drawingIn(asWritten.reduce(changed, SWITCHED));
    const linesOf = (drawing: Drawing) =>
      [...lineAxes(drawing).values()].filter((axis) => axis.timeline === ROOT);
    // As written: one line of 1644 quarters drawn over 400 units (layout's `abscissaOf`).
    const [written] = linesOf(before);
    if (written === undefined) throw new Error("no line as written");
    expect(written.xEnd - written.xStart).toBe(400);
    const xw = (s: number) => written.xStart + (s / 1644) * (written.xEnd - written.xStart);
    // Switched: `x(t) = x0 + 400 × u`, `u = t / (4241/2)` (layout's README, Switched cards, 2).
    const x0 = Math.min(...linesOf(after).map((axis) => axis.xStart));
    const x = (t: number) => x0 + 400 * (t / 2120.5);
    // Each chunk's elements, parts of the line, in drawing order: its boundary from k = 1, its
    // label (a chunk draws nothing of its own, section 8.10).
    const elementsOf = (k: number) =>
      (k === 0
        ? [[0, "label"]]
        : [
            [k, "start"],
            [k, "label"],
          ]
      ).map((part) =>
        after.elements.findIndex(
          (element) =>
            element.address.id === ROOT &&
            element.address.facet === undefined &&
            JSON.stringify(element.address.part) === JSON.stringify(part),
        ),
      );
    const morph = (k: number, from: [number, number], to: [number, number]) => ({
      elements: elementsOf(k),
      from: { x1: xw(from[0]), x2: xw(from[1]) },
      to: { x1: x(to[0]), x2: x(to[1]) },
    });
    const morphs = switchMorphs(manifest(SWITCHED), before, after);
    expect(morphs).toEqual([
      morph(0, [0, 476.5], [0, 476.5]),
      morph(1, [476.5, 500], [476.5, 500]),
      morph(2, [0, 476.5], [500, 976.5]),
      morph(3, [500, 1644], [976.5, 2120.5]),
    ]);
    expect(morphs.flatMap((item) => item.elements)).not.toContain(-1);
  });

  it("stretches an element and moves a text onto the span at its progress", () => {
    const morph = { elements: [3], from: { x1: 10, x2: 30 }, to: { x1: 50, x2: 60 } };
    expect(spanAt(morph.from, morph.to, 0.5)).toEqual({ x1: 30, x2: 45 });
    // At 0.5 the span is [30, 45]: 15 wide over 10, so s = 1.5 and x1 30 − 50 × 1.5 = −45.
    expect(morphTransform(morph, false, 0.5)).toBe("matrix(1.5 0 0 1 -45 0)");
    // Its middle 37.5 against 55.
    expect(morphTransform(morph, true, 0.5)).toBe("translate(-17.5 0)");
    expect(morphTransform(morph, false, 1)).toBeNull();
  });
});
