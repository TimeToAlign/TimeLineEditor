// @vitest-environment jsdom
/**
 * The pane drawings are fitted to (README, "Elisions on the canvas"):
 * settled by a canvas, skipped for a size that is not positive, withdrawn
 * by its settler only, and read again by a reaction.
 */

import { flushSync } from "svelte";
import { afterEach, describe, expect, it } from "vitest";
import { drawingOf } from "../src/drawing.ts";
import { paneView, releasePane, settlePane } from "../src/pane.ts";
import { stripsOf } from "../src/strips.ts";
import { A, blockIn, metrics, viewOf } from "./support.ts";

const VIEW = viewOf({ id: A, fixture: "groups/group_grandchild" });
const BLOCK = blockIn(VIEW, A);
const CANVAS = {};
const OTHER = {};

const drawn = () => drawingOf(BLOCK, VIEW.graphical, metrics);
const strips = () => stripsOf(drawn()).map(({ element }) => [element.x1, element.x2]);

afterEach(() => releasePane(CANVAS));

describe("the pane", () => {
  it("is layout's default view until a canvas settles one", () => {
    expect(paneView()).toBeUndefined();
    expect(strips()[0]).toEqual([82.265625, 196.55133928571422]);
  });

  it("draws every drawing for the settled pane", () => {
    const before = drawn();
    settlePane(CANVAS, 640, 360);
    expect(drawn()).not.toBe(before);
    expect(strips()).toEqual([
      [82.265625, 141.53972167968755],
      [141.53972167968755, 171.17677001953143],
      [571.1767700195314, 689.7249633789065],
    ]);
  });

  it("skips a size that is not positive and finite", () => {
    settlePane(CANVAS, 640, 360);
    const settled = drawn();
    settlePane(OTHER, 0, 360);
    settlePane(OTHER, -5, 100);
    settlePane(OTHER, Number.NaN, 100);
    expect(paneView()).toEqual({ width: 640, height: 360 });
    expect(drawn()).toBe(settled);
  });

  it("is withdrawn by the canvas that settled it alone", () => {
    settlePane(CANVAS, 640, 360);
    releasePane(OTHER);
    expect(paneView()).toEqual({ width: 640, height: 360 });
    releasePane(CANVAS);
    expect(paneView()).toBeUndefined();
    expect(strips()[0]).toEqual([82.265625, 196.55133928571422]);
  });

  it("is read again by a reaction when it changes", () => {
    const seen: (number | undefined)[] = [];
    const stop = $effect.root(() => {
      const width = $derived(paneView()?.width);
      $effect(() => {
        seen.push(width);
      });
    });
    flushSync();
    settlePane(CANVAS, 640, 360);
    flushSync();
    releasePane(CANVAS);
    flushSync();
    stop();
    expect(seen).toEqual([undefined, 640, undefined]);
  });
});
