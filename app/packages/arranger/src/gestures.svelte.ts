/**
 * The gestures of the editors: moving an item in the bundle editor,
 * reordering a group's member cards in the group editor, moving a band of
 * the edited timeline in the timeline editor, and the resize modes each
 * level offers.
 *
 * Each drag is an attachment on the element pressed. It marks that element
 * `nodrag nopan`, so Svelte Flow neither drags the node nor pans the canvas
 * from it, and captures the pointer. A band draws nothing, so the band drag
 * is attached to the drawing's `<svg>` and takes only a press on a band: it
 * marks the `<svg>` only while it holds such a press, and every other press
 * and the wheel reach the canvas as before. A press released within `CLICK_DISTANCE` is a click
 * and stays one: nothing is previewed and the click selects as on any other
 * element. Past it, the drag previews through a callback while the pointer
 * moves and dispatches one command on release; Escape (on the canvas, through
 * `abortDrag`) or a cancelled pointer ends it without a command and with the
 * preview withdrawn. The
 * click that follows a drag is not a selection. An item move converts the
 * pointer's travel into drawing units by the canvas zoom and the block's
 * scale, the exact factor the drawing is shown at; a reorder and a band move
 * read the pointer's point through the screen CTM of the `<svg>` the element
 * is drawn in, never the element's own, which a sliding reorder moves.
 */

import type { Command } from "@timetoalign/tilie-core";
import type { Attachment } from "svelte/attachments";
import type { Level, ResizedKind } from "./editors.ts";
import { RESIZING } from "./editors.ts";
import type { Matrix } from "./motion.ts";
import { drawingMatrix, pointIn } from "./motion.ts";
import { GRID_FREE, quantize } from "./numbers.ts";
import type { ResizeMode } from "./resize.ts";

/**
 * How far, in screen pixels, a pointer may move between press and release
 * and still click (touch and trackpads wobble).
 */
export const CLICK_DISTANCE = 4;

/** A position in drawing units. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * What a drag needs from the element that holds it. Every member is a
 * function read when the drag needs it, never when the attachment is made,
 * so a preview that redraws the block does not make the attachment anew
 * and end the drag.
 */
interface DragOptions<T, S> {
  /**
   * Whether the drag takes the press `event` at the drawing point `point`,
   * read at every press with the primary button; without it, the drag takes
   * them all. A drag that refuses some presses leaves them to the canvas, so
   * it marks its element only while it holds a press it took.
   */
  readonly takes?: (event: PointerEvent, point: Point) => boolean;
  /** What the drag reads from its element's state at the press. */
  readonly hold: () => S;
  /**
   * The drag's value for the pointer at screen point `(x, y)`, given the
   * press and the drawing's screen CTM now; `null` when there is none.
   */
  readonly at: (press: Press<S>, x: number, y: number, matrix: Matrix) => T | null;
  readonly same: (a: T, b: T) => boolean;
  /** Show the block as `value` would leave it; `null` shows it as stored again. */
  readonly preview: (value: T | null) => void;
  /** The command that stores `value`; `null` when it changes nothing. */
  readonly command: (value: T) => Command | null;
  /** Called with that command, once, on release. */
  readonly dispatch: (command: Command) => void;
}

/**
 * A press on the element: its pointer, where it went down (screen pixels),
 * and what the drag held from it.
 */
interface Press<S> {
  readonly pointer: number;
  readonly x: number;
  readonly y: number;
  readonly held: S;
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

/** The abort of the drag in progress in any drawing: a pointer drags one thing at a time. */
let dragging: (() => void) | null = null;

/**
 * End the drag in progress inside a drawing as Escape does, without a
 * command and with its preview withdrawn; whether there was one. The canvas
 * calls it first on Escape: its own key listener on the window was added
 * before any drag's, so it hears the key first.
 */
export function abortDrag(): boolean {
  if (dragging === null) return false;
  dragging();
  return true;
}

function drag<T, S>(options: DragOptions<T, S>): Attachment<SVGElement> {
  return (element) => {
    const marks = ["nodrag", "nopan"] as const;
    /** Svelte rewrites `class` when the element's own classes change; the marks are kept. */
    const mark = () => element.classList.add(...marks);
    /** Whether the element is marked only while a press is held: its drag refuses some presses. */
    const pressedOnly = options.takes !== undefined;
    if (!pressedOnly) mark();

    let press: Press<S> | null = null;
    /** The last value previewed; `undefined` until the pointer passes the click distance. */
    let shown: T | null | undefined;
    /** The listeners of the press in progress, then of the click that ends a drag. */
    let stops: (() => void)[] = [];

    function unlisten(): void {
      for (const stop of stops) stop();
      stops = [];
    }

    /**
     * Take the click that follows a drag, wherever it lands: it ends the
     * drag rather than selects. A browser fires it in the task of the
     * pointer's release, if at all (a moved touch fires none), so the
     * swallow ends one task after the release (`released`: it has come),
     * and at the next press. A click without a pointer (`detail` 0: a key
     * on a button, or `element.click()`) is never taken.
     */
    function swallowClick(view: Window, released: boolean): void {
      let timer: number | undefined;
      const expire = () => {
        timer ??= view.setTimeout(unlisten, 0);
      };
      const capture = { capture: true };
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
          capture,
        ),
        listen(view, "pointerdown", unlisten, capture),
        () => view.clearTimeout(timer),
      ];
      if (released) expire();
      else stops.push(listen(view, "pointerup", expire, capture));
    }

    /**
     * End the press; with `swallow`, the click that follows it is taken,
     * the pointer `released` already or not yet.
     */
    function finish(swallow: boolean, released: boolean): void {
      const ended = press;
      press = null;
      shown = undefined;
      if (dragging === escapeDrag) dragging = null;
      unlisten();
      if (ended !== null && element.hasPointerCapture(ended.pointer)) {
        element.releasePointerCapture(ended.pointer);
      }
      if (pressedOnly) element.classList.remove(...marks);
      const view = element.ownerDocument.defaultView;
      if (swallow && view !== null) swallowClick(view, released);
    }

    /**
     * End a drag in progress without a command, the preview withdrawn; the
     * pointer `released` (cancelled) or still down (Escape).
     */
    function abort(released: boolean): void {
      const moved = shown !== undefined;
      finish(moved, released);
      if (moved) options.preview(null);
    }

    /** Escape on a drag in progress: the pointer still down. */
    function escapeDrag(): void {
      abort(false);
    }

    function follow(event: PointerEvent): void {
      if (press === null || event.pointerId !== press.pointer) return;
      if (shown === undefined) {
        const travel = Math.hypot(event.clientX - press.x, event.clientY - press.y);
        if (travel <= CLICK_DISTANCE) return;
        shown = null;
        dragging = escapeDrag;
      }
      const matrix = drawingMatrix(element);
      if (matrix === null) return;
      const value = options.at(press, event.clientX, event.clientY, matrix);
      if (value === null || (shown != null && options.same(shown, value))) return;
      shown = value;
      options.preview(value);
    }

    function release(event: PointerEvent): void {
      if (press === null || event.pointerId !== press.pointer) return;
      follow(event);
      const value = shown;
      finish(value !== undefined, true);
      if (value === undefined) return;
      const command = value === null ? null : options.command(value);
      if (command !== null) options.dispatch(command);
      options.preview(null);
    }

    /**
     * The press is followed on the window rather than on the element: the
     * captured pointer's events reach it too, and so do they when a reorder
     * moves the element in the document and its capture is lost.
     */
    function track(view: Window): void {
      const capture = { capture: true };
      stops = [
        listen(view, "pointermove", follow, capture),
        listen(view, "pointerup", release, capture),
        listen(
          view,
          "pointercancel",
          (event: PointerEvent) => {
            if (press !== null && event.pointerId === press.pointer) abort(true);
          },
          capture,
        ),
        listen(
          view,
          "keydown",
          (event: KeyboardEvent) => {
            if (event.key !== "Escape" || shown === undefined) return;
            // An Escape the canvas left alone (`abortDrag` ends the drag before it acts):
            // the drag takes it, so no later listener clears the selection or closes an editor.
            event.preventDefault();
            event.stopPropagation();
            escapeDrag();
          },
          capture,
        ),
      ];
    }

    const stopPress = listen(element, "pointerdown", (event: PointerEvent) => {
      if (event.button !== 0 || press !== null) return;
      const view = element.ownerDocument.defaultView;
      const matrix = drawingMatrix(element);
      if (view === null || matrix === null) return;
      if (options.takes !== undefined) {
        const point = pointIn(matrix, event.clientX, event.clientY);
        if (point === null || !options.takes(event, point)) return;
      }
      // Before Svelte Flow reads the press (its pan and node drag start on `mousedown` and
      // `touchstart`, which follow `pointerdown`), so neither starts.
      mark();
      unlisten();
      const { pointerId: pointer, clientX: x, clientY: y } = event;
      press = { pointer, x, y, held: options.hold() };
      element.setPointerCapture(pointer);
      track(view);
    });

    return () => {
      abort(true);
      unlisten();
      stopPress();
      element.classList.remove(...marks);
    };
  };
}

/** What an item drag needs; see `itemDrag`. */
export interface ItemDragOptions {
  /** The item's place `{x, y}` as drawn when the press starts. */
  readonly place: () => Point;
  /** The canvas zoom when the press starts: screen pixels per canvas unit. */
  readonly zoom: () => number;
  /** The block's scale when the press starts: canvas units per drawing unit. */
  readonly scale: () => number;
  /** Show the item at `place`; `null` shows it where it is stored. */
  readonly preview: (place: Point | null) => void;
  /** The command that moves the item to `place`; `null` when it changes nothing. */
  readonly command: (place: Point) => Command | null;
  readonly dispatch: (command: Command) => void;
}

/** What an item drag holds from its press: the item's place, the canvas zoom and the block's scale. */
interface ItemPress {
  readonly place: Point;
  readonly zoom: number;
  readonly scale: number;
}

/**
 * Move an item (a group's frame or an ungrouped root's card) freely inside
 * its box. The item's place moves by the pointer's travel since the press,
 * divided by the canvas zoom into canvas units and by the block's scale
 * into drawing units, both as they were at the press, and quantized to
 * `GRID_FREE`. The drawing's screen CTM is not read: an engine lays the
 * `<svg>` out at its own layout unit, so the CTM's scale differs from the
 * zoom times the scale in the last digits, and a whole-pixel travel would
 * not come out as a whole number of units.
 */
export function itemDrag(options: ItemDragOptions): Attachment<SVGElement> {
  return drag<Point, ItemPress>({
    ...options,
    hold: () => ({ place: options.place(), zoom: options.zoom(), scale: options.scale() }),
    at(press, x, y) {
      const { place, zoom, scale } = press.held;
      return {
        x: quantize(place.x + (x - press.x) / zoom / scale, GRID_FREE),
        y: quantize(place.y + (y - press.y) / zoom / scale, GRID_FREE),
      };
    },
    same: (a, b) => a.x === b.x && a.y === b.y,
  });
}

/** What a member drag needs; see `memberDrag`. */
export interface MemberDragOptions {
  /** The order of the group's members that a drop at drawing ordinate `y` gives. */
  readonly order: (y: number) => readonly string[];
  /** Show the members in `order`; `null` shows them in their stored order. */
  readonly preview: (order: readonly string[] | null) => void;
  /** The command that stores `order`; `null` when it is the stored order. */
  readonly command: (order: readonly string[]) => Command | null;
  readonly dispatch: (command: Command) => void;
}

/**
 * Reorder a group's member cards by dragging one of them. The pointer's
 * screen point becomes a drawing point through the drawing's screen CTM at
 * every move, so the order follows the pointer wherever the drawing is
 * shown, however far the dragged card itself slides; the preview is called
 * only when the order changes.
 */
export function memberDrag(options: MemberDragOptions): Attachment<SVGElement> {
  return orderDrag(options);
}

/** A drag whose value is an order read at the pointer's drawing ordinate: a member or band drag. */
function orderDrag(
  options: MemberDragOptions & Pick<DragOptions<readonly string[], null>, "takes">,
): Attachment<SVGElement> {
  return drag<readonly string[], null>({
    ...options,
    hold: () => null,
    at(_press, x, y, matrix) {
      const point = pointIn(matrix, x, y);
      return point === null ? null : options.order(point.y);
    },
    same: (a, b) => a.length === b.length && a.every((id, index) => id === b[index]),
  });
}

/** What a band drag needs; see `bandDrag`. */
export interface BandDragOptions {
  /**
   * Whether the press `event` at the drawing point `point` lies on a band
   * the drag moves; read once at every press, before anything else. A press
   * it refuses is the canvas's: a click, a pan or a marquee.
   */
  readonly takes: (event: PointerEvent, point: Point) => boolean;
  /** The band order a drop at drawing ordinate `y` shows. */
  readonly order: (y: number) => readonly string[];
  /** Show the timeline with the band order `order`; `null` shows it as stored. */
  readonly preview: (order: readonly string[] | null) => void;
  /** The command that stores `order`; `null` when it changes nothing. */
  readonly command: (order: readonly string[]) => Command | null;
  readonly dispatch: (command: Command) => void;
}

/**
 * Move a band of a timeline by dragging it, on the `<svg>` of the drawing:
 * a band draws nothing of its own to attach to. Only a press the options
 * take starts it, and the `<svg>` is marked `nodrag nopan` only while that
 * press is held. The order follows the pointer as a member reorder's does,
 * through the drawing's screen CTM at every move; the preview is called only
 * when the order changes.
 */
export function bandDrag(options: BandDragOptions): Attachment<SVGElement> {
  return orderDrag(options);
}

/** A box of a block's drawing that a resize acts on: a group's frame, an ungrouped root's card or a member's card. */
export interface ResizedItem {
  readonly kind: Exclude<ResizedKind, "block">;
  /** Its key in the block's `places`: the group's id, the ungrouped root's id, the member's id. */
  readonly key: string;
  /** The item of the drawing holding the box: its own key, or a member card's group. */
  readonly item: string;
}

const MODES: readonly ResizeMode[] = ["scale", "box", "stretch"];

/**
 * The resize modes the toolbar offers for a box of `kind` at `level`, in the
 * toolbar's order: all three wherever that kind resizes (`RESIZING`), none
 * elsewhere.
 */
export function resizeModes(level: Level, kind: ResizedKind): readonly ResizeMode[] {
  return RESIZING[kind].levels[level] === undefined ? [] : MODES;
}
