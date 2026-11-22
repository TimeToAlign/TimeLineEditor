// @vitest-environment jsdom
/**
 * The progress of a raise: a raised root unfolds over time, folds back from
 * where it stands, and switches at once under reduced motion. The cases are
 * in `README.md` ("A raised card unfolding", points 8 to 12).
 */

import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UNFOLD_EASING } from "../src/animation/unfold.ts";
import { Unfolding } from "../src/animation/unfolding.svelte.ts";

/** An `Unfolding` following a `$state` root and flag, with its teardown. */
function follow(initial: string | null) {
  const state = $state({ raised: initial, reduced: false });
  let unfolding: Unfolding | undefined;
  const cleanup = $effect.root(() => {
    unfolding = new Unfolding(
      () => state.raised,
      () => state.reduced,
    );
  });
  flushSync();
  if (unfolding === undefined) throw new Error("not made");
  const made = unfolding;
  const read = () => ({ root: made.root, progress: made.progress, moving: made.moving });
  const raise = (root: string | null) => {
    state.raised = root;
    flushSync();
  };
  return { state, read, raise, cleanup };
}

/** Advance the faked clock by `ms`, running every animation frame due. */
function advance(ms: number): void {
  vi.advanceTimersByTime(ms);
  flushSync();
}

describe("the progress of a raise", () => {
  let cleanups: (() => void)[] = [];
  const made = (initial: string | null) => {
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

  it("shows a root raised when it is made at rest", () => {
    const { read } = made("R");
    expect(read()).toEqual({ root: "R", progress: 1, moving: false });
  });

  it("unfolds a raised root over the whole duration", () => {
    const { read, raise } = made(null);
    expect(read()).toEqual({ root: null, progress: 0, moving: false });
    raise("R");
    expect(read()).toEqual({ root: "R", progress: 0, moving: true });
    advance(192);
    expect(read()).toEqual({ root: "R", progress: UNFOLD_EASING(192 / 400), moving: true });
    advance(224);
    expect(read()).toEqual({ root: "R", progress: 1, moving: false });
  });

  it("folds back from where it stands, in the part of the time left", () => {
    const { read, raise } = made(null);
    raise("R");
    advance(192);
    const p = read().progress;
    expect(p).toBe(UNFOLD_EASING(192 / 400));
    raise(null);
    expect(read()).toEqual({ root: "R", progress: p, moving: true });
    advance(16);
    expect(read().progress).toBe(p - p * UNFOLD_EASING(16 / (400 * p)));
    // `400p` is 176.9472 ms: the frame at 352 ms is the last before the end.
    advance(144);
    expect(read()).toEqual({
      root: "R",
      progress: p - p * UNFOLD_EASING(160 / (400 * p)),
      moving: true,
    });
    advance(32);
    expect(read()).toEqual({ root: null, progress: 0, moving: false });
  });

  it("switches at once under reduced motion", () => {
    const { state, read, raise } = made(null);
    state.reduced = true;
    raise("R");
    expect(read()).toEqual({ root: "R", progress: 1, moving: false });
    raise(null);
    expect(read()).toEqual({ root: null, progress: 0, moving: false });
  });

  it("unfolds another root from the start", () => {
    const { read, raise } = made("R");
    raise("Q");
    expect(read()).toEqual({ root: "Q", progress: 0, moving: true });
    advance(416);
    expect(read()).toEqual({ root: "Q", progress: 1, moving: false });
  });
});
