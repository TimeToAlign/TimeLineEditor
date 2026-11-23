/**
 * Items moving between arrangements (README, "Arrangements on the canvas",
 * Motion): an item whose place changes travels whole, and the ancestor cards
 * a switch to or from side by side leaves or brings fade.
 */

import type { View } from "@timetoalign/tilie-core";
import { placeKeyText, WORKSPACE } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import { TextMeasure } from "@timetoalign/tilie-layout";
import { describe, expect, it } from "vitest";
import type { Drawn } from "../src/animation/elide.ts";
import { blockMotion, itemMotions } from "../src/animation/elide.ts";
import { AT_REST, placedAt } from "../src/animation/unfold.ts";
import { descriptorsOf, drawingOf } from "../src/drawing.ts";
import { A, blockIn, changed, metrics, viewOf } from "./support.ts";

const measure = new TextMeasure(metrics);

const ROOTS = viewOf({ id: A, fixture: "bundles/bundle_arranged_roots" });

const arranged = (direction: "vertical" | "horizontal") =>
  changed(ROOTS, {
    type: "set",
    changes: [{ target: { block: A }, values: { arrangement: { direction, order: [] } } }],
  });

function drawnOf(view: View): Drawn {
  const block = blockIn(view, A);
  const drawing = drawingOf(block, view.graphical, metrics);
  return { manifest: block.manifest, drawing, descriptors: descriptorsOf(drawing) };
}

const VERTICAL = drawnOf(arranged("vertical"));
const HORIZONTAL = drawnOf(arranged("horizontal"));

function keyed(drawing: Drawing, item: string, member?: string): DrawnBox {
  const box = drawing.boxes.find(
    (candidate) => candidate.key?.item === item && candidate.key.member === member,
  );
  if (box === undefined) throw new Error(`no box ${item} ${member}`);
  return box;
}

describe("itemMotions", () => {
  const motions = itemMotions(VERTICAL.drawing, HORIZONTAL.drawing);
  const was = keyed(VERTICAL.drawing, "group_2");
  const now = keyed(HORIZONTAL.drawing, "group_2");
  const dx = was.x - VERTICAL.drawing.origin.x - (now.x - HORIZONTAL.drawing.origin.x);
  const dy = was.y - VERTICAL.drawing.origin.y - (now.y - HORIZONTAL.drawing.origin.y);
  const motion = motions.find((card) => card.key === placeKeyText({ item: "group_2" }));

  it("moves an item from its old place to its new one", () => {
    if (motion === undefined) throw new Error("group_2 does not move");
    const element = now.range.start;
    expect(motion.holds(element)).toBe(true);
    expect(motion.holds(now.range.end)).toBe(false);
    expect(placedAt(motion.motionOf(element), 0)).toEqual({ sx: 1, dx, dy, opacity: 1 });
    expect(placedAt(motion.motionOf(element), 0.5)).toEqual({
      sx: 1,
      dx: dx * 0.5,
      dy: dy * 0.5,
      opacity: 1,
    });
    expect(placedAt(motion.motionOf(element), 1)).toBe(AT_REST);
  });

  it("moves no item drawn at the same place", () => {
    expect(itemMotions(HORIZONTAL.drawing, HORIZONTAL.drawing)).toEqual([]);
  });
});

describe("blockMotion between one under another and side by side", () => {
  it("moves the items first, so a member card takes its frame's motion", () => {
    const motion = blockMotion(VERTICAL, HORIZONTAL, measure);
    const items = itemMotions(VERTICAL.drawing, HORIZONTAL.drawing).map((card) => card.key);
    expect(motion.cards.slice(0, items.length).map((card) => card.key)).toEqual(items);
    const member = keyed(HORIZONTAL.drawing, "group_2", "development").range.start;
    const holder = motion.cards.find((card) => card.holds(member));
    expect(holder?.key).toBe(placeKeyText({ item: "group_2" }));
  });

  it("fades out the ancestor cards side by side no longer draws", () => {
    const motion = blockMotion(VERTICAL, HORIZONTAL, measure);
    expect(motion.leaving.map((card) => card.key).sort()).toEqual(
      [
        placeKeyText({ item: "group_2", member: "score" }),
        placeKeyText({ item: "group_3", member: "score" }),
        placeKeyText({ item: "group_3", member: "session" }),
      ].sort(),
    );
    const origin = {
      dx: HORIZONTAL.drawing.origin.x - VERTICAL.drawing.origin.x,
      dy: HORIZONTAL.drawing.origin.y - VERTICAL.drawing.origin.y,
    };
    for (const card of motion.leaving) {
      const [descriptor] = card.descriptors;
      if (descriptor === undefined) throw new Error("a card draws nothing");
      expect(card.placedAt(descriptor, 0)).toEqual({ sx: 1, ...origin, opacity: 1 });
      expect(card.placedAt(descriptor, 0.5)).toEqual({ sx: 1, ...origin, opacity: 0.5 });
    }
  });

  it("fades the ancestor cards in again back one under another", () => {
    const motion = blockMotion(HORIZONTAL, VERTICAL, measure);
    expect(motion.leaving).toEqual([]);
    const card = keyed(VERTICAL.drawing, "group_3", "session");
    const fading = motion.cards.find((candidate) => candidate.holds(card.range.start));
    if (fading === undefined) throw new Error("the card does not move");
    expect(placedAt(fading.motionOf(card.range.start), 0).opacity).toBe(0);
  });

  it("keeps the once card under its key, moving it", () => {
    const motion = blockMotion(VERTICAL, HORIZONTAL, measure);
    const once = keyed(HORIZONTAL.drawing, "group_1", "score");
    expect(motion.cards.some((card) => card.key === placeKeyText(once.key ?? { item: "" }))).toBe(
      true,
    );
  });
});

describe("a workspace arrangement", () => {
  it("leaves a block's drawing as it is", () => {
    const view = changed(arranged("horizontal"), {
      type: "set",
      changes: [{ target: WORKSPACE, values: { arrangement: { direction: "vertical" } } }],
    });
    expect(drawnOf(view).drawing).toBe(HORIZONTAL.drawing);
  });
});
