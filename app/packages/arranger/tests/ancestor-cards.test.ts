/**
 * Ancestor cards on the canvas: hit, selected and opened as cards, never
 * placed, raised over the frames while their root's timeline lying in no
 * group is edited. Derived in `README.md` ("Ancestor cards").
 */

import type { View } from "@timetoalign/tilie-core";
import { cardAddress, idAddress, inBlock } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { describe, expect, it } from "vitest";
import {
  boxAt,
  hitOf,
  isAncestorCard,
  isCard,
  isHeld,
  isItem,
  keyedBox,
  pressSelection,
  raisedRoot,
  workedBox,
} from "../src/boxes.ts";
import { fieldsOf, type Level, resizes } from "../src/containers.ts";
import { descriptorsOf, drawingOf, raisedLayers } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { editorTargetOf } from "../src/editors.ts";
import { insideOf } from "../src/project.ts";
import { A, blockIn, metrics, sourceOf, viewOf, withoutAncestorCards } from "./support.ts";

const LEVELS: readonly Level[] = ["arranger", "bundle", "group", "timeline"];

/** `fixture` in block `A`, its ancestor cards shown, as the defaults draw them, or hidden. */
function viewWith(fixture: string, shown = true): View {
  const view = viewOf({ id: A, fixture: `groups/${fixture}` });
  return shown ? view : withoutAncestorCards(view);
}

const drawingIn = (view: View): Drawing => drawingOf(blockIn(view, A), view.graphical, metrics);

/** The one ancestor card of `root` a drawing records. */
function ancestorCard(drawing: Drawing, root: string) {
  const found = drawing.boxes.filter((box) => isAncestorCard(box) && box.address.id === root);
  if (found.length !== 1) throw new Error(`${root} has ${found.length} ancestor cards`);
  return found[0] as (typeof found)[number];
}

const timelineEditor = (id: string): Editing => ({
  target: inBlock(A, idAddress(id)),
  kind: "timeline",
});

describe("an ancestor card's record", () => {
  const drawing = drawingIn(viewWith("group_parent_both"));
  const card = ancestorCard(drawing, "piece");

  it("is a card with no place", () => {
    expect(card.ancestor).toEqual({ group: "group_1", member: "middle" });
    expect(drawing.boxes.filter(isAncestorCard)).toEqual([card]);
    expect([isItem(card), isCard(card), isHeld(card)]).toEqual([false, false, false]);
    expect(keyedBox(drawing, { item: "group_1", member: "piece" })).toBeUndefined();
    for (const level of LEVELS) {
      expect(resizes(card, level, true), level).toBe(false);
      expect(fieldsOf(card, level), level).toEqual([]);
    }
  });

  it("is hit as a card outside the frame and selected on the arranger", () => {
    const address = inBlock(A, cardAddress("piece"));
    for (const role of ["primary", "shadow"] as const) {
      const source = sourceOf(drawing, cardAddress("piece"), "ancestor_card", role);
      const hit = hitOf(A, drawing, source, { x: 20, y: 40 }, null);
      expect(hit).toEqual({
        block: A,
        kind: "card",
        address,
        box: card,
        boundary: false,
        within: card,
      });
      const inside = insideOf(blockIn(viewWith("group_parent_both"), A).manifest, drawing, null);
      expect(pressSelection(hit, null, inside)).toEqual(address);
    }
    expect(boxAt(drawing, { x: 300, y: 40 })?.key).toEqual({ item: "group_1", member: "middle" });
  });

  it("opens its root, and is the worked box of its root's card address", () => {
    const view = viewWith("group_parent_both");
    const source = sourceOf(drawing, cardAddress("piece"), "ancestor_card");
    const hit = hitOf(A, drawing, source, { x: 20, y: 40 }, null);
    expect(editorTargetOf(view, hit, null)).toEqual(inBlock(A, idAddress("piece")));
    expect(workedBox(drawing, A, cardAddress("piece"), null)).toBe(card);
    expect(workedBox(drawing, A, cardAddress("middle"), null)?.key).toEqual({
      item: "group_1",
      member: "middle",
    });
  });
});

describe("raised layers", () => {
  /** The drawing's descriptors in the layers `raisedLayers` gives them, the editor's root raised. */
  const layersIn = (view: View, editing: Editing | null) => {
    const drawing = drawingIn(view);
    const entries = descriptorsOf(drawing).map((descriptor) => ({ descriptor }));
    const layers = raisedLayers(entries, drawing, raisedRoot(blockIn(view, A), editing));
    return { drawing, entries, layers };
  };

  /** What `raisedLayers` gives with `root`'s card raised: every other entry below, then the card's. */
  const raisedOne = (
    drawing: Drawing,
    entries: readonly { descriptor: Descriptor }[],
    root: string,
  ) => {
    const box = ancestorCard(drawing, root);
    const inCard = (entry: (typeof entries)[number]) =>
      box.range.start <= entry.descriptor.source.element &&
      entry.descriptor.source.element < box.range.end;
    return {
      below: entries.filter((entry) => !inCard(entry)),
      raised: [{ box, entries: entries.filter(inCard) }],
    };
  };

  it("raise nothing but while the root's own timeline lying in no group is edited", () => {
    const view = viewWith("group_parent_both");
    const group: Editing = { target: inBlock(A, idAddress("group_1")), kind: "group" };
    for (const editing of [null, group, timelineEditor("middle")]) {
      const { entries, layers } = layersIn(view, editing);
      expect(layers.below).toBe(entries);
      expect(layers.raised).toEqual([]);
    }
    const { drawing, entries, layers } = layersIn(view, timelineEditor("piece"));
    const { start, end } = ancestorCard(drawing, "piece").range;
    expect([start, end]).toEqual([1, 10]);
    expect(layers).toEqual(raisedOne(drawing, entries, "piece"));
  });

  it("raise one root's cards alone, and nothing hidden", () => {
    const mixed = viewWith("group_parents_mixed");
    const { drawing, entries, layers } = layersIn(mixed, timelineEditor("session"));
    expect(layers).toEqual(raisedOne(drawing, entries, "session"));
    const member = layersIn(mixed, timelineEditor("take"));
    expect(member.layers.below).toBe(member.entries);
    expect(member.layers.raised).toEqual([]);
    const hidden = layersIn(viewWith("group_parent_both", false), timelineEditor("piece"));
    expect(hidden.layers.below).toBe(hidden.entries);
    expect(hidden.layers.raised).toEqual([]);
  });
});
