/**
 * Dragging in the flow subeditor: an element of the edited card, an entry
 * or a whole row of the pane, carried by a translucent twin to the new
 * FlowMap's row, within it, or (a row) out onto the canvas. The pointer is
 * followed on the window from the press to the release, so the drag
 * crosses the card, the pane and the canvas alike; a press released within
 * the click distance stays a click, and the click a browser fires after a
 * drag is swallowed. Escape (the canvas's `GestureSlot`) and a cancelled
 * pointer end a drag without a drop.
 */

import type { GestureSlot, Point } from "../gesture.ts";
import { CLICK_DISTANCE, listen } from "../gesture.ts";

/** How far inside the editor's border, in screen pixels, the twin fades to its faintest. */
export const FADE_DISTANCE = 96;

/** The twin's opacity deep inside the editor. */
export const MIN_TWIN_OPACITY = 0.2;

/** How long, in milliseconds, a twin released inside the editor flies back to where it was lifted. */
export const FLY_DURATION = 200;

/** A rectangle in screen pixels. */
export interface ScreenRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The smallest rectangle holding both. */
export function unionRect(left: ScreenRect, right: ScreenRect): ScreenRect {
  return {
    left: Math.min(left.left, right.left),
    top: Math.min(left.top, right.top),
    right: Math.max(left.right, right.right),
    bottom: Math.max(left.bottom, right.bottom),
  };
}

/**
 * How far `point` lies inside `rect`, from its nearest edge: positive
 * inside, 0 on the border, negative outside (the distance to the nearest
 * edge it lies beyond, taken as the largest of the overshoots).
 */
export function insideDistance(rect: ScreenRect, point: Point): number {
  return Math.min(
    point.x - rect.left,
    rect.right - point.x,
    point.y - rect.top,
    rect.bottom - point.y,
  );
}

/**
 * The twin's opacity with the pointer `distance` screen pixels inside the
 * editor's border (`insideDistance`): 1 on and beyond the border, so a row
 * carried out is shown as the card it will become; inside, it fades
 * linearly with the distance to `MIN_TWIN_OPACITY` at `FADE_DISTANCE` and
 * stays there deeper in: `MIN + (1 − MIN) × max(0, 1 − d / FADE)`.
 */
export function twinOpacity(distance: number): number {
  if (distance <= 0) return 1;
  return MIN_TWIN_OPACITY + (1 - MIN_TWIN_OPACITY) * Math.max(0, 1 - distance / FADE_DISTANCE);
}

/**
 * Where on a row the pointer at abscissa `x` inserts, `spans` its drawn
 * entries in order (each `index` to `last` drawn once) and `count` its
 * entries: before the first drawn entry whose middle lies right of `x`,
 * else at the end.
 */
export function dropIndex(
  spans: readonly { readonly index: number; readonly x1: number; readonly x2: number }[],
  x: number,
  count: number,
): number {
  for (const span of spans) if (x < (span.x1 + span.x2) / 2) return span.index;
  return count;
}

/** Whether `point` lies in `rect`, its edges included. */
export function holds(rect: ScreenRect, point: Point): boolean {
  return insideDistance(rect, point) >= 0;
}

/**
 * Where a drag released at `point` lands: on the new FlowMap's row
 * (`draft`, when one is open) it inserts; inside the editor (`editor`, the
 * card and the pane) the twin flies back and nothing is stored; beyond the
 * editor's border a row becomes a card, anything else flies back.
 */
export function dropAt(
  point: Point,
  editor: ScreenRect,
  draft: ScreenRect | null,
  row: boolean,
): "draft" | "back" | "canvas" {
  if (draft !== null && holds(draft, point)) return "draft";
  if (holds(editor, point) || !row) return "back";
  return "canvas";
}

/** What a drag does from the press it was started with. */
export interface FlowDragHandlers {
  /** The press has become a drag: past the click distance, once. */
  start(at: Point): void;
  /** The pointer is at `at` (client pixels). */
  move(at: Point): void;
  /** Released at `at`, with Alt held (`alt`: a copy) or not. */
  drop(at: Point, alt: boolean): void;
  /** Ended without a drop: Escape or a cancelled pointer. */
  abort(): void;
}

const CAPTURE = { capture: true } as const;

/**
 * Follow the press `event` on its window until its release: the handlers
 * hear the start past the click distance, every move, and the drop or the
 * abort. The drag is held in `slot` while under way, so Escape ends it.
 */
export function followDrag(
  event: PointerEvent,
  handlers: FlowDragHandlers,
  slot?: GestureSlot,
): void {
  const view = event.view ?? window;
  const origin = { x: event.clientX, y: event.clientY };
  const pointer = event.pointerId;
  let started = false;
  let stops: (() => void)[] = [];
  const unlisten = () => {
    for (const stop of stops) stop();
    stops = [];
  };
  const swallowClick = () => {
    const done = [
      listen(
        view,
        "click",
        (click: MouseEvent) => {
          if (click.detail === 0) return;
          click.stopPropagation();
          click.preventDefault();
          for (const stop of done) stop();
        },
        CAPTURE,
      ),
    ];
    view.setTimeout(() => {
      for (const stop of done) stop();
    }, 0);
  };
  const abort = () => {
    unlisten();
    slot?.release(abort);
    if (started) handlers.abort();
  };
  const at = (moved: PointerEvent): Point => ({ x: moved.clientX, y: moved.clientY });
  stops = [
    listen(
      view,
      "pointermove",
      (moved: PointerEvent) => {
        if (moved.pointerId !== pointer) return;
        if (!started) {
          if (Math.hypot(moved.clientX - origin.x, moved.clientY - origin.y) <= CLICK_DISTANCE)
            return;
          started = true;
          slot?.hold(abort);
          handlers.start(origin);
        }
        handlers.move(at(moved));
      },
      CAPTURE,
    ),
    listen(
      view,
      "pointerup",
      (released: PointerEvent) => {
        if (released.pointerId !== pointer) return;
        unlisten();
        slot?.release(abort);
        if (!started) return;
        swallowClick();
        handlers.drop(at(released), released.altKey);
      },
      CAPTURE,
    ),
    listen(
      view,
      "pointercancel",
      (cancelled: PointerEvent) => {
        if (cancelled.pointerId === pointer) abort();
      },
      CAPTURE,
    ),
    listen(
      view,
      "keydown",
      (key: KeyboardEvent) => {
        if (key.key !== "Escape" || !started) return;
        // An Escape the canvas left alone: the drag takes it, so nothing later closes an editor.
        key.preventDefault();
        key.stopPropagation();
        abort();
      },
      CAPTURE,
    ),
  ];
}
