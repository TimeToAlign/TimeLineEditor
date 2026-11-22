// @vitest-environment jsdom
/**
 * The progress of a card's elisions moving: a changed drawing moves its
 * cards over time, a hidden card folds back, and nothing moves under
 * reduced motion, during a preview or for the same drawing. The cases are
 * in `README.md` ("A card's elisions moving", points 23 to 26).
 */

import type { View } from "@timetoalign/tilie-core";
import { TextMeasure } from "@timetoalign/tilie-layout";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardMotions } from "../src/animation/cardMotions.svelte.ts";
import type { Drawn } from "../src/animation/elide.ts";
import { blockMotion } from "../src/animation/elide.ts";
import { placedAt, UNFOLD_EASING } from "../src/animation/unfold.ts";
import { descriptorsOf, drawingOf } from "../src/drawing.ts";
import { A, blockIn, metrics, viewOf, withFullCards, withoutAncestorCards } from "./support.ts";

const measure = new TextMeasure(metrics);

function drawnOf(view: View): Drawn {
  const block = blockIn(view, A);
  const drawing = drawingOf(block, view.graphical, metrics);
  return { manifest: block.manifest, drawing, descriptors: descriptorsOf(drawing) };
}

const VIEW = viewOf({ id: A, fixture: "groups/group_elided_inside" });
const ELIDED = drawnOf(VIEW);
const FULL = drawnOf(withFullCards(VIEW));
const HIDDEN = drawnOf(withoutAncestorCards(VIEW));

/** The index of the ancestor card's root line in `drawn`, and of an element outside the card. */
function indexes({ drawing }: Drawn): { readonly line: number; readonly outside: number } {
  const card = drawing.boxes.find((box) => box.ancestor !== undefined);
  if (card === undefined) throw new Error("no ancestor card");
  const line = drawing.elements.findIndex(
    (element, index) =>
      index >= card.range.start && index < card.range.end && element.type === "timeline",
  );
  return { line, outside: card.range.end };
}

/** A `CardMotions` following a `$state` drawing and flags, with its teardown. */
function follow(initial: Drawn) {
  const state = $state({ drawn: initial, reduced: false, still: false });
  let motions: CardMotions | undefined;
  const cleanup = $effect.root(() => {
    motions = new CardMotions(
      () => state.drawn,
      measure,
      () => state.reduced,
      () => state.still,
    );
  });
  flushSync();
  if (motions === undefined) throw new Error("not made");
  const made = motions;
  const show = (drawn: Drawn) => {
    state.drawn = drawn;
    flushSync();
  };
  return { state, made, show, cleanup };
}

function advance(ms: number): void {
  vi.advanceTimersByTime(ms);
  flushSync();
}

describe("the progress of a card's elisions", () => {
  let cleanups: (() => void)[] = [];
  const made = (initial: Drawn) => {
    const followed = follow(initial);
    cleanups.push(followed.cleanup);
    return followed;
  };

  beforeEach(() => {
    vi.useFakeTimers({
      now: 0,
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });
  });

  afterEach(() => {
    for (const cleanup of cleanups) cleanup();
    cleanups = [];
    vi.useRealTimers();
  });

  it("moves nothing when made", () => {
    const { made: motions } = made(ELIDED);
    expect([motions.moving, motions.progress, motions.leaving]).toEqual([false, 1, []]);
    expect(motions.placedOf(indexes(ELIDED).line)).toBeNull();
  });

  it("moves the card from the drawing before over the whole duration", () => {
    const { made: motions, show } = made(ELIDED);
    const { line, outside } = indexes(FULL);
    const [card] = blockMotion(ELIDED, FULL, measure).cards;
    if (card === undefined) throw new Error("no card moves");
    show(FULL);
    expect([motions.moving, motions.progress]).toEqual([true, 0]);
    expect(motions.placedOf(line)).toEqual(placedAt(card.motionOf(line), 0));
    expect(motions.placedOf(outside)).toBeNull();
    advance(192);
    const t = UNFOLD_EASING(192 / 400);
    expect([motions.moving, motions.progress]).toEqual([true, t]);
    expect(motions.placedOf(line)).toEqual(placedAt(card.motionOf(line), t));
    expect(motions.placedOf(outside)).toBeNull();
    advance(224);
    expect([motions.moving, motions.progress]).toEqual([false, 1]);
    expect(motions.placedOf(line)).toBeNull();
  });

  it("folds a hidden card back over the same time", () => {
    const { made: motions, show } = made(ELIDED);
    show(HIDDEN);
    expect(motions.moving).toBe(true);
    expect(motions.leaving.length).toBe(1);
    advance(192);
    expect(motions.leaving.length).toBe(1);
    advance(224);
    expect([motions.moving, motions.leaving]).toEqual([false, []]);
  });

  it("moves nothing under reduced motion, during a preview or for the same drawing", () => {
    const { made: motions, show, state } = made(ELIDED);
    const { line } = indexes(FULL);
    state.reduced = true;
    show(FULL);
    expect([motions.moving, motions.placedOf(line)]).toEqual([false, null]);
    state.reduced = false;
    state.still = true;
    show(ELIDED);
    expect([motions.moving, motions.placedOf(indexes(ELIDED).line)]).toEqual([false, null]);
    state.still = false;
    show({ ...ELIDED });
    expect([motions.moving, motions.placedOf(indexes(ELIDED).line)]).toEqual([false, null]);
  });
});
