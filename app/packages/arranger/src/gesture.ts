/**
 * The one pointer gesture of the canvas. Every drag inside a block's drawing
 * (moving an item, reordering a frame's cards, moving a band) and every
 * resize handle is this attachment driven by a strategy: the strategy says
 * whether it takes a press, what value the pointer stands for, how that
 * value is previewed, and which command stores it; the engine owns
 * everything else, once.
 *
 * A press the strategy takes marks its element `nodrag nopan` for as long
 * as it is held, before Svelte Flow reads it (its pan and node drag start on
 * the `mousedown` and `touchstart` that follow `pointerdown`), so neither
 * starts, on a mouse and a touch screen alike; a press it refuses is the
 * canvas's (a click, a pan, a marquee). The pointer is captured and followed
 * on the window, so a reorder that moves the element in the document loses
 * nothing. A press released within the click distance is a click and stays
 * one: nothing is started, previewed or dispatched. Past it, `start` runs
 * once, every move whose value differs from the last is previewed, and the
 * release dispatches the command of the last value and withdraws the
 * preview. Escape (directly, or through the canvas's `GestureSlot`) and a
 * cancelled pointer end a started gesture without a command, the preview
 * withdrawn. The click a browser fires after a drag is swallowed.
 */

import type { Command } from "@timetoalign/tilie-core";
import type { DescriptorSource } from "@timetoalign/tilie-writers";
import type { Attachment } from "svelte/attachments";
import { drawingMatrix, pointIn } from "./motion.ts";

/**
 * How far, in screen pixels, a pointer may move between press and release
 * and still click (touch and trackpads wobble). Svelte Flow's pane uses the
 * same distance for a click and a marquee.
 */
export const CLICK_DISTANCE = 4;

/** A position: in a drawing's own units, or in client pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** One pointer position in drawing and screen coordinates. */
export interface GesturePoint {
  /** In the drawing's units, through its `<svg>`'s screen CTM; the screen point outside a drawing. */
  readonly drawing: Point;
  /** In client pixels. */
  readonly screen: Point;
}

/**
 * What a gesture does, from press to command. `P` is what a press holds,
 * `V` the plain value the pointer stands for (a point, an order, a delta):
 * the engine previews a value only when it differs, member by member, from
 * the last one previewed.
 */
export interface GestureStrategy<P, V> {
  /** What the press `event` at `at` holds; `null` leaves the press to the canvas. */
  takes(event: PointerEvent, at: GesturePoint): P | null;
  /** The press has become a gesture: past the click distance, once. */
  start?(press: P): void;
  /** The value for the pointer at `at`; `null` when it stands for none. */
  value(press: P, at: GesturePoint): V | null;
  /** Show `value`; `null` withdraws the preview, at the end of every started gesture. */
  preview(press: P, value: V | null): void;
  /** The command that stores `value`; `null` when it changes nothing. */
  command(press: P, value: V): Command | null;
  /**
   * Whether the gesture moves boxes (an item, a held card, a band) rather
   * than resizing one; the canvas's slot reports it while the gesture is
   * under way.
   */
  readonly moves?: boolean;
}

/**
 * The gesture in progress on one canvas, which Escape on the canvas ends. A
 * pointer drives one gesture at a time; the canvas holds one slot in its
 * context, so two canvases on a page never end each other's gestures.
 */
export class GestureSlot {
  #abort: (() => void) | null = null;
  readonly #moving: (moving: boolean) => void;

  /** `moving` hears whether a gesture that moves boxes is under way: on its start and on its end. */
  constructor(moving: (moving: boolean) => void = () => {}) {
    this.#moving = moving;
  }

  /** A gesture has started, moving boxes or not; `abort` ends it without a command. */
  hold(abort: () => void, moves = false): void {
    this.#abort = abort;
    this.#moving(moves);
  }

  /** The gesture holding `abort` has ended. */
  release(abort: () => void): void {
    if (this.#abort !== abort) return;
    this.#abort = null;
    this.#moving(false);
  }

  /** End the gesture in progress as Escape does; whether there was one. */
  abort(): boolean {
    const abort = this.#abort;
    if (abort === null) return false;
    abort();
    return true;
  }
}

/** What the engine needs besides the strategy. */
export interface GestureOptions {
  /** Screen pixels a press may travel and still click; `CLICK_DISTANCE` by default. */
  readonly clickDistance?: number;
  /** Runs the command a release yields. */
  readonly dispatch: (command: Command) => void;
  /** The canvas's slot, which holds the gesture from its start to its end. */
  readonly slot?: GestureSlot;
}

/**
 * Listen to `type` on `target` at once; the function returned stops
 * listening. Unlike `svelte/events`' `on`, which adds pointer listeners a
 * microtask later, a stop called right away leaves no listener behind.
 */
export function listen<E extends Event>(
  target: EventTarget,
  type: string,
  handler: (event: E) => void,
  options: AddEventListenerOptions = {},
): () => void {
  const listener = handler as EventListener;
  target.addEventListener(type, listener, options);
  return () => target.removeEventListener(type, listener, options);
}

/**
 * The point of the drawing under the client point `client`, read through
 * the screen CTM of the `<svg>` that `target` is drawn in (or is), never the
 * target's own, which a sliding reorder moves; `null` off every drawing or
 * where it is drawn at no size. The one conversion that hover, a click and a
 * press read.
 */
export function drawingPoint(target: EventTarget | null, client: Point): Point | null {
  const svg =
    target instanceof SVGElement
      ? target
      : target instanceof Element
        ? target.closest("svg")
        : null;
  const matrix = svg === null ? null : drawingMatrix(svg);
  return matrix === null ? null : pointIn(matrix, client.x, client.y);
}

/** The source of each drawn descriptor element, by its DOM element (`drawn`). */
const sources = new WeakMap<Element, DescriptorSource>();

/**
 * Record that the element it is attached to draws the descriptor of
 * `source`, so a pointer target is read back as the drawing's element it
 * draws (`sourceAt`), never from the DOM's attributes.
 */
export function drawn(source: DescriptorSource): Attachment<Element> {
  return (element) => {
    sources.set(element, source);
    return () => {
      sources.delete(element);
    };
  };
}

/** The descriptor source a pointer target draws (`drawn`); `null` for anything else. */
export function sourceAt(target: EventTarget | null): DescriptorSource | null {
  return target instanceof Element ? (sources.get(target) ?? null) : null;
}

/** Whether two values are the same plain data: equal primitives, arrays and records member by member. */
function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left)) {
    return (
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => same(item, right[index]))
    );
  }
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) {
    return false;
  }
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => same(Reflect.get(left, key), Reflect.get(right, key)))
  );
}

const MARKS = ["nodrag", "nopan"] as const;
const CAPTURE = { capture: true } as const;

/** A press the strategy took: its pointer, where it went down, and what it holds. */
interface Held<P, V> {
  readonly pointer: number;
  readonly origin: Point;
  readonly press: P;
  /** The marks the press added, removed again when it ends. */
  readonly marked: readonly string[];
  /** Whether the press became a gesture. */
  started: boolean;
  /** The last value previewed; `undefined` before the first. */
  shown: V | null | undefined;
}

/**
 * The attachment that drives `strategy` on an element: an element of a
 * block's drawing (whose points are read in the drawing's units) or a
 * control outside one (a resize handle, whose drawing point is its screen
 * point).
 */
export function pointerGesture<P, V>(
  strategy: GestureStrategy<P, V>,
  options: GestureOptions,
): Attachment<Element> {
  const distance = options.clickDistance ?? CLICK_DISTANCE;
  return (element) => {
    let held: Held<P, V> | null = null;
    /** The listeners of the press in progress, then of the click that ends a gesture. */
    let stops: (() => void)[] = [];

    function unlisten(): void {
      for (const stop of stops) stop();
      stops = [];
    }

    /** The pointer at client `(x, y)`; `null` where the drawing is shown at no size. */
    function pointAt(x: number, y: number): GesturePoint | null {
      const screen = { x, y };
      if (!(element instanceof SVGElement)) return { drawing: screen, screen };
      const drawing = drawingPoint(element, screen);
      return drawing === null ? null : { drawing, screen };
    }

    /**
     * Take the click that follows a gesture, wherever it lands. A browser
     * fires it in the task of the pointer's release, if at all (a moved
     * touch fires none), so the swallow ends one task after the release
     * (`released`: it has come), and at the next press. A click without a
     * pointer (`detail` 0: a key on a button, `element.click()`) is never
     * taken.
     */
    function swallowClick(view: Window, released: boolean): void {
      let timer: number | undefined;
      const expire = () => {
        timer ??= view.setTimeout(unlisten, 0);
      };
      stops = [
        listen(
          view,
          "click",
          (event: MouseEvent) => {
            if (event.detail === 0) return;
            unlisten();
            event.stopPropagation();
            event.preventDefault();
          },
          CAPTURE,
        ),
        listen(view, "pointerdown", unlisten, CAPTURE),
        () => view.clearTimeout(timer),
      ];
      if (released) expire();
      else stops.push(listen(view, "pointerup", expire, CAPTURE));
    }

    /** End the press; a started gesture also swallows its click, the pointer `released` or not. */
    function finish(released: boolean): Held<P, V> | null {
      const ended = held;
      held = null;
      unlisten();
      if (ended === null) return null;
      options.slot?.release(escapeGesture);
      if (element.hasPointerCapture(ended.pointer)) element.releasePointerCapture(ended.pointer);
      element.classList.remove(...ended.marked);
      const view = element.ownerDocument.defaultView;
      if (ended.started && view !== null) swallowClick(view, released);
      return ended;
    }

    /** End a gesture without a command, the preview withdrawn; the pointer `released` or not. */
    function abort(released: boolean): void {
      const ended = finish(released);
      if (ended?.started === true) strategy.preview(ended.press, null);
    }

    /** Escape, from the canvas's slot or heard here: the pointer still down. */
    function escapeGesture(): void {
      abort(false);
    }

    function follow(event: PointerEvent): void {
      if (held === null || event.pointerId !== held.pointer) return;
      if (!held.started) {
        const travel = Math.hypot(event.clientX - held.origin.x, event.clientY - held.origin.y);
        if (travel <= distance) return;
        held.started = true;
        options.slot?.hold(escapeGesture, strategy.moves === true);
        strategy.start?.(held.press);
      }
      const at = pointAt(event.clientX, event.clientY);
      const value = at === null ? null : strategy.value(held.press, at);
      if (value === null || (held.shown != null && same(held.shown, value))) return;
      held.shown = value;
      strategy.preview(held.press, value);
    }

    function release(event: PointerEvent): void {
      if (held === null || event.pointerId !== held.pointer) return;
      follow(event);
      const ended = finish(true);
      if (ended === null || !ended.started) return;
      const { press, shown } = ended;
      const command = shown == null ? null : strategy.command(press, shown);
      if (command !== null) options.dispatch(command);
      strategy.preview(press, null);
    }

    function track(view: Window): void {
      stops = [
        listen(view, "pointermove", follow, CAPTURE),
        listen(view, "pointerup", release, CAPTURE),
        listen(
          view,
          "pointercancel",
          (event: PointerEvent) => {
            if (held !== null && event.pointerId === held.pointer) abort(true);
          },
          CAPTURE,
        ),
        listen(
          view,
          "keydown",
          (event: KeyboardEvent) => {
            if (event.key !== "Escape" || held === null || !held.started) return;
            // An Escape the canvas left alone: the gesture takes it, so no later listener
            // clears the selection or closes an editor.
            event.preventDefault();
            event.stopPropagation();
            escapeGesture();
          },
          CAPTURE,
        ),
      ];
    }

    const stopPress = listen(element, "pointerdown", (event: PointerEvent) => {
      if (event.button !== 0 || held !== null) return;
      const view = element.ownerDocument.defaultView;
      const at = pointAt(event.clientX, event.clientY);
      if (view === null || at === null) return;
      const press = strategy.takes(event, at);
      if (press === null) return;
      const marked = MARKS.filter((mark) => !element.classList.contains(mark));
      element.classList.add(...marked);
      unlisten();
      held = {
        pointer: event.pointerId,
        origin: at.screen,
        press,
        marked,
        started: false,
        shown: undefined,
      };
      element.setPointerCapture(event.pointerId);
      track(view);
    });

    return () => {
      abort(true);
      unlisten();
      stopPress();
    };
  };
}
