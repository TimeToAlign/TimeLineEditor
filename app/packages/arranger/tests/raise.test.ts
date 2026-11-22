// @vitest-environment jsdom
/**
 * A root standing in another group rises on double-click (README,
 * "Ancestor cards", point 6): its timeline editor raises the ancestor card
 * the other group's frame covers, the canvas draws that card over every
 * frame, and the place rule reads its rows.
 */

import type { Store, View } from "@timetoalign/tilie-core";
import { idAddress, inBlock } from "@timetoalign/tilie-core";
import { Rational } from "@timetoalign/tilie-core/numbers";
import { mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { raisedRoot } from "../src/boxes.ts";
import { placesAt } from "../src/coordinates.ts";
import { drawingOf } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import Harness from "./CanvasHarness.svelte";
import { settle, stubCanvasGlobals } from "./dom.ts";
import { A, blockIn, changed, metrics, storeOf, viewOf } from "./support.ts";

/** `group_parent_both` in block A at (0, 0) with `group_2` ("Parents") holding the root `piece`. */
const VIEW: View = changed(viewOf({ id: A, fixture: "groups/group_parent_both" }), {
  type: "add",
  into: { block: A },
  group: { id: "group_2", name: "Parents", members: ["piece"] },
});

const editorOf = (id: string, kind: Editing["kind"]): Editing => ({
  target: inBlock(A, idAddress(id)),
  kind,
});
const PIECE = editorOf("piece", "timeline");

const q = (numerator: number, denominator = 1) => Rational.of([numerator, denominator]);

describe("the decision of the raise", () => {
  it("raises the root member drawing an ancestor card in its own timeline editor alone", () => {
    const block = blockIn(VIEW, A);
    expect(
      [
        PIECE,
        null,
        editorOf("group_1", "group"),
        editorOf("group_2", "group"),
        editorOf("middle", "timeline"),
        editorOf("recording", "timeline"),
      ].map((editing) => raisedRoot(block, editing)),
    ).toEqual(["piece", null, null, null, null, null]);
  });

  it("reads the raised card's rows, the member card in the other frame kept", () => {
    const block = blockIn(VIEW, A);
    const drawing = drawingOf(block, VIEW.graphical, metrics);
    const at = (timeline: string, value: Rational, raised: string | null) =>
      placesAt(drawing, timeline, value, raised).map(({ axis, x }) => [axis.card, axis.y, x]);
    const X = 460.33544921875;
    const SECOND = { item: "group_2", member: "piece" };
    const CARD = { item: "group_1", member: "piece" };
    const MIDDLE = { item: "group_1", member: "middle" };
    expect([at("piece", q(8), null), at("piece", q(8), "piece")]).toEqual([
      [
        [MIDDLE, 67.78125, X],
        [SECOND, 263.91796875, X],
      ],
      [
        [CARD, 67.78125, X],
        [SECOND, 263.91796875, X],
      ],
    ]);
    expect([at("middle", q(4), null), at("middle", q(4), "piece")]).toEqual([
      [
        [MIDDLE, 81.78125, X],
        [SECOND, 229.94140625, X],
      ],
      [
        [CARD, 33.8046875, X],
        [SECOND, 229.94140625, X],
      ],
    ]);
  });
});

describe("the double-click on the covered card", () => {
  let mounted: ReturnType<typeof mount> | undefined;
  let store: Store;

  afterEach(() => {
    if (mounted !== undefined) unmount(mounted);
    mounted = undefined;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  /** The frames' and cards' rectangles of block A in the node's order, as `<data-id>:<x>`. */
  function boxes(): string[] {
    const node = document.querySelector('.svelte-flow__node[data-id="0000000000"]');
    if (node === null) throw new Error("no node A");
    return Array.from(
      node.querySelectorAll('svg rect[data-part="card"], svg rect[data-id^="group_"]'),
      (rect) => `${rect.getAttribute("data-id")}:${rect.getAttribute("x")}`,
    );
  }

  it("opens the root's timeline editor and brings the card to the front", async () => {
    stubCanvasGlobals(() => true);
    store = storeOf(VIEW);
    mounted = mount(Harness, { target: document.body, props: { store, metrics } });
    await settle();
    const before = boxes();
    expect(before).toEqual([
      "piece:10",
      "piece:8",
      "group_1:156.6318",
      "middle:166.6318",
      "middle:164.6318",
      "recording:166.6318",
      "recording:164.6318",
      "group_2:156.6318",
      "piece:166.6318",
      "piece:164.6318",
    ]);
    const card = document.querySelector('svg rect[data-id="piece"][data-part="card"][x="8"]');
    if (card === null) throw new Error("no ancestor card");
    card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await settle();
    expect(store.editing.map(({ target, kind }) => ({ target, kind }))).toEqual([PIECE]);
    expect(boxes()).toEqual([...before.slice(2), ...before.slice(0, 2)]);
  });
});
