/**
 * The DOM helpers the component tests share: what jsdom lacks (media
 * queries, resize observers, pointer capture, screen CTMs), pointer events,
 * the settling of Svelte's updates, and a node's actions that record every
 * call.
 */

import type { Address, Command, View } from "@timetoalign/tilie-core";
import { flushSync, tick } from "svelte";
import { vi } from "vitest";
import type { LevelRules } from "../src/containers.ts";
import { LEVELS } from "../src/containers.ts";
import { GestureSlot } from "../src/gesture.ts";
import type { Matrix } from "../src/motion.ts";
import type { NodeActions, NodePreview } from "../src/nodeActions.ts";
import { metrics } from "./support.ts";

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/**
 * Stub what Svelte Flow and the canvas read and jsdom has not: media queries
 * (every one fails but reduced motion, which `reduced()` answers), resize
 * observers (each recorded, so a case can measure an element and report the
 * change through `resize`) and pointer capture. The globals are restored by
 * `vi.unstubAllGlobals()`.
 */
export function stubCanvasGlobals(reduced: () => boolean = () => true): {
  resize(target: Element, width: number, height: number): void;
} {
  vi.stubGlobal(
    "matchMedia",
    (media: string): Partial<MediaQueryList> => ({
      matches: reduced() && media === "(prefers-reduced-motion: reduce)",
      media,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class Observer {
      readonly callback: ResizeObserverCallback;
      readonly targets = new Set<Element>();
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        observers.add(this);
      }
      observe(target: Element) {
        this.targets.add(target);
      }
      unobserve(target: Element) {
        this.targets.delete(target);
      }
      disconnect() {
        this.targets.clear();
      }
    },
  );
  stubPointerCapture();
  return {
    resize(target, width, height) {
      Object.defineProperty(target, "clientWidth", { value: width, configurable: true });
      Object.defineProperty(target, "clientHeight", { value: height, configurable: true });
      const size: ResizeObserverSize = { inlineSize: width, blockSize: height };
      const entry: ResizeObserverEntry = {
        target,
        contentRect: DOMRect.fromRect({ width, height }),
        borderBoxSize: [size],
        contentBoxSize: [size],
        devicePixelContentBoxSize: [size],
      };
      for (const observer of observers) {
        if (observer.targets.has(target)) observer.callback([entry], observer);
      }
    },
  };
}

/** A resize observer as `stubCanvasGlobals` makes it: its callback and what it observes. */
interface Observer extends ResizeObserver {
  readonly callback: ResizeObserverCallback;
  readonly targets: Set<Element>;
}

/**
 * Every resize observer made in a test file, kept across its cases: Svelte
 * observes element sizes through one observer, made once per module, so the
 * observer of a later case may be an earlier case's.
 */
const observers = new Set<Observer>();

/** Give every element pointer capture, which jsdom lacks, recorded per element. */
export function stubPointerCapture(): void {
  const captured = new WeakMap<Element, Set<number>>();
  const of = (element: Element) => {
    let found = captured.get(element);
    if (found === undefined) {
      found = new Set();
      captured.set(element, found);
    }
    return found;
  };
  for (const [name, value] of [
    [
      "setPointerCapture",
      function (this: Element, pointer: number) {
        of(this).add(pointer);
      },
    ],
    [
      "hasPointerCapture",
      function (this: Element, pointer: number) {
        return of(this).has(pointer);
      },
    ],
    [
      "releasePointerCapture",
      function (this: Element, pointer: number) {
        of(this).delete(pointer);
      },
    ],
  ] as const) {
    Object.defineProperty(Element.prototype, name, { value, configurable: true, writable: true });
  }
}

/** Give `element` a screen CTM (its `<svg>`'s, for a drawing): `matrix`, read at every call. */
export function withScreenMatrix(element: Element, matrix: () => Matrix): void {
  Object.assign(element, { getScreenCTM: matrix });
}

/** Flush Svelte's updates and the microtasks they schedule, twice over. */
export async function settle(): Promise<void> {
  flushSync();
  await tick();
  flushSync();
  await tick();
  flushSync();
}

/** One task: what the browser runs after the task that fired a release and its click. */
export function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Dispatch a primary mouse pointer event of `type` at client `(x, y)` on `target`, then flush. */
export function pointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      clientX: x,
      clientY: y,
      button: 0,
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
  flushSync();
}

/** A press at `from` moved to `to` and released there. */
export function drag(
  target: EventTarget,
  from: readonly [number, number],
  to: readonly [number, number],
): void {
  pointer(target, "pointerdown", ...from);
  pointer(target, "pointermove", ...to);
  pointer(target, "pointerup", ...to);
}

/** Escape pressed on the window, then flushed. */
export function pressEscape(): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
  flushSync();
}

/** A recorded call of a node's actions, in the order it was made. */
export type Call =
  | { readonly select: Address }
  | { readonly preview: string; readonly with: NodePreview | null }
  | { readonly dispatch: Command };

/**
 * Node actions on `view` that record every call; `rules` are the canvas's
 * rules (the arranger's by default), `zoom` its zoom.
 */
export function recordingActions(
  view: View,
  {
    rules = LEVELS.arranger,
    zoom = 1,
    reducedMotion = false,
  }: {
    rules?: LevelRules;
    zoom?: number;
    reducedMotion?: boolean;
  } = {},
): { actions: NodeActions; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    actions: {
      dispatch: (command) => calls.push({ dispatch: command }),
      select: (address) => calls.push({ select: address }),
      preview: (block, preview) => calls.push({ preview: block, with: preview }),
      metrics,
      view: () => view,
      zoom: () => zoom,
      rules: () => rules,
      reducedMotion: () => reducedMotion,
      gestures: new GestureSlot(),
    },
  };
}

/** The kinds of the calls, in order. */
export function kinds(calls: readonly Call[]): string[] {
  return calls.map((call) => Object.keys(call)[0] ?? "");
}
