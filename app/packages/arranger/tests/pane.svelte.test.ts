// @vitest-environment jsdom
/**
 * A canvas's pane (README, "Elisions on the canvas", the pane): the first
 * size settles at once, a later one `PANE_SETTLE` ms after the last one;
 * sizes that are not positive are skipped; `release` withdraws it; a
 * reaction reads it again; `drawingOf` reads it only for a manifest drawing
 * an ancestor card.
 */

import { draw } from "@timetoalign/tilie-layout";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawingOf, styleLayers } from "../src/drawing.ts";
import { PANE_SETTLE, Pane } from "../src/pane.ts";
import { A, blockIn, metrics, viewOf } from "./support.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the pane", () => {
  it("gives no view before it is measured, then settles its first size at once", () => {
    const pane = new Pane();
    expect(pane.view).toBeUndefined();
    pane.measure(640, 360);
    expect(pane.view).toEqual({ width: 640, height: 360 });
  });

  it("settles a later size only after the last one measured", () => {
    const pane = new Pane();
    pane.measure(640, 360);
    pane.measure(800, 360);
    vi.advanceTimersByTime(100);
    pane.measure(900, 400);
    vi.advanceTimersByTime(PANE_SETTLE - 1);
    expect(pane.view).toEqual({ width: 640, height: 360 });
    vi.advanceTimersByTime(1);
    expect(pane.view).toEqual({ width: 900, height: 400 });
    pane.measure(1000, 400);
    pane.measure(900, 400);
    vi.advanceTimersByTime(PANE_SETTLE);
    expect(pane.view).toEqual({ width: 900, height: 400 });
  });

  it("skips a size that is not positive and finite, and is withdrawn by release", () => {
    const pane = new Pane();
    pane.measure(0, 360);
    pane.measure(-5, 100);
    pane.measure(Number.NaN, 100);
    expect(pane.view).toBeUndefined();
    pane.measure(640, 360);
    pane.release();
    expect(pane.view).toBeUndefined();
  });

  it("is read again by a reaction when it settles", () => {
    const pane = new Pane();
    const seen: (number | undefined)[] = [];
    const stop = $effect.root(() => {
      const width = $derived(pane.view?.width);
      $effect(() => {
        seen.push(width);
      });
    });
    flushSync();
    pane.measure(640, 360);
    flushSync();
    pane.release();
    flushSync();
    stop();
    expect(seen).toEqual([undefined, 640, undefined]);
  });
});

describe("a drawing at a pane", () => {
  it("draws a manifest with an ancestor card for the pane, as layout draws that view", () => {
    const view = viewOf({ id: A, fixture: "groups/group_grandchild" });
    const block = blockIn(view, A);
    const pane = new Pane();
    pane.measure(640, 360);
    const drawn = drawingOf(block, view.graphical, metrics, undefined, pane);
    const { length, spacing, margin, width, height, places } = block;
    const expected = draw(
      block.manifest,
      { length, spacing, margin, width, height, places, view: { width: 640, height: 360 } },
      styleLayers(view.graphical, block.manifest),
      metrics,
    );
    expect(drawn.elisions).toEqual(expected.elisions);
    expect(drawn).not.toBe(drawingOf(block, view.graphical, metrics));
    expect(drawn.elisions).not.toEqual(drawingOf(block, view.graphical, metrics).elisions);
  });

  it("never reads it for a manifest without an ancestor card", () => {
    const view = viewOf({ id: A, fixture: "bundles/bundle_matchstamps" });
    const block = blockIn(view, A);
    let reads = 0;
    const pane = {
      get view() {
        reads += 1;
        return { width: 640, height: 360 };
      },
    };
    expect(drawingOf(block, view.graphical, metrics, undefined, pane)).toBe(
      drawingOf(block, view.graphical, metrics),
    );
    expect(reads).toBe(0);
  });
});
