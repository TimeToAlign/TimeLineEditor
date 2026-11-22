// @vitest-environment jsdom
/**
 * A flag stays on screen (README, "The flag stays on screen"): it starts
 * beside its wedge and is shifted by exactly the amount that keeps it inside
 * the canvas, on every side, and not at all where it fits.
 */

import { createRawSnippet, flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FlagPlace } from "../src/coordinates.ts";
import Flag from "../src/Flag.svelte";
import { onScreen } from "../src/onScreen.ts";
import { settle, stubCanvasGlobals } from "./dom.ts";

/** A flag starting at (`left`, `top`), its pole as `flagPlace` leaves it for these tests. */
function startingAt(left: number, top: number): FlagPlace {
  return { pole: { x: 100, top: 128, bottom: 200 }, left, top };
}

const SCREEN = { width: 800, height: 600 };
const FLAG = { width: 180, height: 100 };

describe("onScreen", () => {
  it.each([
    ["inside", [100.5, 128], [100.5, 128]],
    ["past the right border", [700, 128], [620, 128]],
    ["past the left border", [-30.5, 128], [0, 128]],
    ["past the top border", [100.5, -12], [100.5, 0]],
    ["past the bottom border", [100.5, 550], [100.5, 500]],
    ["past the bottom right corner", [700, 550], [620, 500]],
    ["exactly on the right and bottom borders", [620, 500], [620, 500]],
  ])("keeps a flag %s at %j", (_, [left, top], [keptLeft, keptTop]) => {
    const start = startingAt(left as number, top as number);
    expect(onScreen(start, FLAG, SCREEN)).toEqual({
      pole: { x: 100, top: 128, bottom: 200 },
      left: keptLeft,
      top: keptTop,
    });
  });

  it("returns the very place where nothing moves", () => {
    const start = startingAt(100.5, 128);
    expect(onScreen(start, FLAG, SCREEN)).toBe(start);
    expect(onScreen(startingAt(620, 500), FLAG, SCREEN)).toEqual(startingAt(620, 500));
  });

  it("keeps the left edge of a flag wider than the canvas on the border", () => {
    expect(onScreen(startingAt(100.5, 128), { width: 900, height: 100 }, SCREEN)).toEqual(
      startingAt(0, 128),
    );
  });

  it("moves nothing along an axis not measured yet", () => {
    const start = startingAt(100.5, 550);
    expect(onScreen(start, FLAG, { width: 800, height: 0 })).toBe(start);
    expect(onScreen(start, { width: 180, height: 0 }, SCREEN)).toBe(start);
  });
});

describe("the flag component", () => {
  let mounted: ReturnType<typeof mount> | undefined;

  afterEach(() => {
    if (mounted !== undefined) unmount(mounted);
    mounted = undefined;
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  /** The flag marking (700, 580) below `top` 560 on a canvas 800 wide, 180 × 100, its layer `height` high. */
  async function flagOn(height: number) {
    const { resize } = stubCanvasGlobals(() => true);
    const children = createRawSnippet(() => ({ render: () => "<div>parts</div>" }));
    mounted = mount(Flag, {
      target: document.body,
      props: {
        kind: "coordinate",
        label: "Coordinates",
        x: 700,
        y: 580,
        top: 560,
        width: 800,
        children,
      },
    });
    flushSync();
    const one = (selector: string) => {
      const found = document.querySelector<HTMLElement>(selector);
      if (found === null) throw new Error(`no ${selector}`);
      return found;
    };
    const flag = one(".tilie-coordinates-flag");
    Object.defineProperty(flag, "offsetWidth", { value: 180, configurable: true });
    Object.defineProperty(flag, "offsetHeight", { value: 100, configurable: true });
    resize(flag, 180, 100);
    resize(one('[data-testid="coordinate-flag"]'), 800, height);
    await settle();
    const pole = one('[data-testid="coordinate-pole"]');
    return {
      flag: [flag.style.left, flag.style.top],
      pole: [pole.style.left, pole.style.top, pole.style.height],
    };
  }

  it("keeps its side and is shifted left and up by exactly its overflow, its pole kept", async () => {
    // Started right of the pole at 700.5: its right edge 880.5 lies 80.5 past 800, its bottom 638 lies 38 below 600.
    expect(await flagOn(600)).toEqual({
      flag: ["620px", "500px"],
      pole: ["699.5px", "538px", "42px"],
    });
  });

  it("is shifted left alone while the canvas's height is not measured", async () => {
    expect(await flagOn(0)).toEqual({
      flag: ["620px", "538px"],
      pole: ["699.5px", "538px", "42px"],
    });
  });
});
