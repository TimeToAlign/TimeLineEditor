/**
 * Ancestor cards on the canvas: hit, selected and opened as cards, never
 * placed, raised over the frames while their root's timeline lying in no
 * group is edited. Derived in `README.md` ("Ancestor cards").
 */

import type { View } from "@timetoalign/tilie-core";
import { cardAddress, idAddress, inBlock, WORKSPACE } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
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
  workedBox,
} from "../src/boxes.ts";
import { fieldsOf, type Level, resizes } from "../src/containers.ts";
import { descriptorsOf, drawingOf, raisedEntries } from "../src/drawing.ts";
import type { Editing } from "../src/editing.ts";
import { editorTargetOf } from "../src/editors.ts";
import { insideOf } from "../src/project.ts";
import { A, blockIn, changed, metrics, sourceOf, viewOf } from "./support.ts";

const LEVELS: readonly Level[] = ["arranger", "bundle", "group", "timeline"];

/** `fixture` in block `A`, the workspace's `graphical` showing every ancestor card or not. */
function viewWith(fixture: string, shown = true): View {
  const view = viewOf({ id: A, fixture: `groups/${fixture}` });
  if (!shown) return view;
  return changed(view, {
    type: "set",
    changes: [
      {
        target: WORKSPACE,
        values: {
          graphical: {
            rules: [{ select: { element: "ancestor_card" }, set: { display: "inline" } }],
          },
        },
      },
    ],
  });
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

describe("raised entries", () => {
  /** The elements of the drawing's descriptors in the order `raisedEntries` gives them. */
  const order = (view: View, editing: Editing | null) => {
    const drawing = drawingIn(view);
    const entries = descriptorsOf(drawing).map((descriptor) => ({ descriptor }));
    const raised = raisedEntries(entries, blockIn(view, A), drawing, editing);
    return { drawing, entries, raised };
  };

  it("leave the drawing's order but while the root's own timeline lying in no group is edited", () => {
    const view = viewWith("group_parent_both");
    const group: Editing = { target: inBlock(A, idAddress("group_1")), kind: "group" };
    for (const editing of [null, group, timelineEditor("middle")]) {
      const { entries, raised } = order(view, editing);
      expect(raised).toBe(entries);
    }
    const { drawing, entries, raised } = order(view, timelineEditor("piece"));
    const { start, end } = ancestorCard(drawing, "piece").range;
    expect([start, end]).toEqual([1, 10]);
    const inCard = (entry: (typeof entries)[number]) =>
      start <= entry.descriptor.source.element && entry.descriptor.source.element < end;
    expect(raised).toEqual([
      ...entries.filter((entry) => !inCard(entry)),
      ...entries.filter(inCard),
    ]);
  });

  it("raise one root's cards alone, and nothing hidden", () => {
    const mixed = viewWith("group_parents_mixed");
    const { drawing, entries, raised } = order(mixed, timelineEditor("session"));
    const { start, end } = ancestorCard(drawing, "session").range;
    const inCard = (entry: (typeof entries)[number]) =>
      start <= entry.descriptor.source.element && entry.descriptor.source.element < end;
    expect(raised).toEqual([
      ...entries.filter((entry) => !inCard(entry)),
      ...entries.filter(inCard),
    ]);
    const member = order(mixed, timelineEditor("take"));
    expect(member.raised).toBe(member.entries);
    const hidden = order(viewWith("group_parent_both", false), timelineEditor("piece"));
    expect(hidden.raised).toBe(hidden.entries);
  });
});
