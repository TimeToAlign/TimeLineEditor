/**
 * The test hook: `window.__tilie`, through which the end-to-end tests open
 * workspaces and read the editor's state. It exists only in development
 * builds and in builds made with `VITE_TILIE_TEST_HOOK=1`; a production build
 * contains none of it.
 */

import type { ResizeMode, Viewport } from "@timetoalign/tilie-arranger";
import { drawingOf } from "@timetoalign/tilie-arranger";
import type { Health } from "@timetoalign/tilie-client";
import type {
  Address,
  BandKind,
  BlockId,
  CommandError,
  ContainerKind,
  OpenEditor,
  Store,
  View,
} from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timetoshare";

/** A rectangle in client pixels, left and top as `getBoundingClientRect` gives them. */
export interface ClientRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A band of a block's drawing (a band of `Drawing.boxes`), as the hook's `bands` reports it. */
export interface HookBand {
  /** `T/<kind>_1`. */
  readonly address: string;
  /** The id of its timeline. */
  readonly timeline: string;
  readonly kind: BandKind;
  /** Signed and never 0: 1, 2, … above its timeline's line, −1, −2, … below. */
  readonly level: number;
  /**
   * The ordinate of its timeline's line on the screen, in client pixels; it tells apart the
   * records of a timeline drawn with two lines in one drawing.
   */
  readonly line: number;
  /** The displayed elements it holds directly. */
  readonly elements: number;
  /** Where its rectangle lies on the screen. */
  readonly rect: ClientRectangle;
}

/** A container of a block's drawing (a record of `Drawing.boxes`), as the hook's `boxes` reports it. */
export interface HookBox {
  readonly kind: ContainerKind;
  /** Its element address; `null` for the block's own box. */
  readonly address: string | null;
  /** The address of the frame or card holding it; `null` for the box and what the box holds. */
  readonly holder: string | null;
  /** Whether its own rectangle is drawn. */
  readonly displayed: boolean;
}

export interface TestHook {
  /** Open the workspace file `text` in place of the current workspace; throws when it is refused. */
  load(text: string): void;
  store(): Store;
  /** The selected addresses. */
  selection(): string[];
  select(addresses: string[]): void;
  viewport(): Viewport;
  setViewport(viewport: Viewport): void;
  locked(): boolean;
  mode(): ResizeMode;
  /** The server's health response, or `null` until one arrives or when the check failed. */
  health(): Health | null;
  /** The open workspace as Save writes it: `writeWorkspace` of the store's snapshot, every open editor folded. */
  text(): string;
  /** The editing path: a copy of the store's open editors, outermost first. */
  editing(): OpenEditor[];
  /** Open the editor of `address` inside the innermost open one; the refusal, or `null` when it opened. */
  open(address: Address): CommandError | null;
  /** Close the innermost editor, keeping its changes. */
  done(): void;
  /** Close the innermost editor, discarding its changes, without the editing bar's question. */
  cancel(): void;
  /** The drawn bands of block `block`, in the drawing's box order, placed on the screen (`bandsOf`). */
  bands(block: BlockId): HookBand[];
  /** The containers of block `block`'s drawing, in its box order (`boxesOf`). */
  boxes(block: BlockId): HookBox[];
}

declare global {
  interface Window {
    __tilie?: TestHook;
  }
}

/** A screen rectangle, as `getBoundingClientRect` gives one. */
export type ClientBox = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;

/**
 * The bands of `drawing`, in its box order, shown in the client rectangle
 * `box` (its `<svg>`'s): each band's line ordinate and rectangle mapped from
 * the drawing's units into client pixels by the scale of the rectangle to the
 * drawing, the inverse of the `<svg>`'s screen transform the canvas reads a
 * pointer through while the drawing is shown unrotated. Nothing is clipped: a
 * drawing off screen gives what this computes.
 */
export function hookBands(drawing: Drawing, box: ClientBox): HookBand[] {
  const sx = box.width / drawing.width;
  const sy = box.height / drawing.height;
  return drawing.boxes.flatMap(({ address, band, x, y, width, height }) =>
    band === undefined || address === null
      ? []
      : [
          {
            address,
            timeline: band.timeline,
            kind: band.kind,
            level: band.level,
            line: box.top + band.line * sy,
            elements: band.elements,
            rect: {
              x: box.left + x * sx,
              y: box.top + y * sy,
              width: width * sx,
              height: height * sy,
            },
          },
        ],
  );
}

/** The drawing the canvas shows for block `block` of `view`; a `RangeError` for a block it does not hold. */
function drawingIn(view: View, block: BlockId): Drawing {
  const found = view.blocks[block];
  if (found === undefined) throw new RangeError(`${block} is no block of the open workspace`);
  return drawingOf(found, view.settings, fontMetrics);
}

/**
 * The containers of block `block` of `view`, in the drawing's box order: the
 * drawing the canvas shows for that block (arranger's `drawingOf`), so what a
 * drawn address names is read from the drawing's own records. Throws a
 * `RangeError` for a block `view` does not hold.
 */
export function boxesOf(view: View, block: BlockId): HookBox[] {
  return drawingIn(view, block).boxes.map(({ kind, address, holder, displayed }) => ({
    kind,
    address,
    holder,
    displayed,
  }));
}

/**
 * The drawn bands of block `block` of `view`, in the drawing's box order: the
 * drawing the canvas shows for that block (arranger's `drawingOf`), placed
 * through the block's drawing `<svg>` on the page (`hookBands`). Throws a
 * `RangeError` for a block `view` does not hold, and an `Error` while the
 * block's drawing is not on the page, since nothing places it then.
 */
export function bandsOf(view: View, block: BlockId): HookBand[] {
  const drawing = drawingIn(view, block);
  const node = [...document.querySelectorAll(".svelte-flow__node[data-id]")].find(
    (element) => element.getAttribute("data-id") === block,
  );
  const svg = node?.querySelector(".tilie-block > svg");
  if (svg === null || svg === undefined) {
    throw new Error(`the drawing of block ${block} is not on the page`);
  }
  return hookBands(drawing, svg.getBoundingClientRect());
}

/** Whether this build carries the test hook. */
export const TEST_HOOK = import.meta.env.DEV || import.meta.env.VITE_TILIE_TEST_HOOK === "1";

/** Install `hook` as `window.__tilie`; returns its removal. */
export function installTestHook(hook: TestHook): () => void {
  window.__tilie = hook;
  return () => {
    if (window.__tilie === hook) delete window.__tilie;
  };
}
