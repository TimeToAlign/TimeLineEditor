/**
 * The test hook: `window.__tilie`, through which the end-to-end tests open
 * workspaces and read the editor's state. It exists only in development
 * builds and in builds made with `VITE_TILIE_TEST_HOOK=1`; a production build
 * contains none of it.
 */

import type { ResizeMode } from "@timetoalign/tilie-arranger";
import { drawingOf } from "@timetoalign/tilie-arranger";
import type {
  Address,
  BandKind,
  BlockId,
  CommandError,
  OpenEditor,
  Problem,
  Store,
  View,
} from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import { fontMetrics } from "@timetoalign/timeskeleton";

/** The body of `GET /api/health`. */
export interface Health {
  readonly name: string;
  readonly version: string;
  readonly timetoalign: string;
}

export interface ViewportValue {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** A rectangle in client pixels, left and top as `getBoundingClientRect` gives them. */
export interface ClientRectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A band of a block's drawing (`Drawing.bands`), as the hook's `bands` reports it. */
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
  /** The displayed elements it holds directly (`DrawnBand.elements`). */
  readonly elements: number;
  /** Where its rectangle lies on the screen. */
  readonly rect: ClientRectangle;
}

export interface TestHook {
  /** Open the workspace file `text` in place of the current workspace; throws when it is refused. */
  load(text: string): void;
  store(): Store;
  /** The selected addresses. */
  selection(): string[];
  select(addresses: string[]): void;
  viewport(): ViewportValue;
  setViewport(viewport: ViewportValue): void;
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
  /** The drawn bands of block `block`, in `Drawing.bands` order, placed on the screen (`bandsOf`). */
  bands(block: BlockId): HookBand[];
}

declare global {
  interface Window {
    __tilie?: TestHook;
  }
}

/** A workspace file `load` refused, with the reader's problems. */
export class WorkspaceRefusedError extends Error {
  readonly problems: readonly Problem[];

  constructor(problems: readonly Problem[]) {
    const lines = problems.map(
      ({ code, message, path }) => `${code} at /${path.join("/")}: ${message}`,
    );
    super(`the workspace file is refused:\n${lines.join("\n")}`);
    this.name = "WorkspaceRefusedError";
    this.problems = problems;
  }
}

/** A screen rectangle, as `getBoundingClientRect` gives one. */
export type ClientBox = Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">;

/**
 * The bands of `drawing`, shown in the client rectangle `box` (its `<svg>`'s):
 * each record's line ordinate and rectangle mapped from the drawing's units
 * into client pixels as the canvas maps a pointer into the drawing
 * (arranger's `drawingPointAt`), the other way round. Nothing is clipped: a
 * drawing off screen gives what this computes.
 */
export function hookBands(drawing: Drawing, box: ClientBox): HookBand[] {
  const sx = box.width / drawing.width;
  const sy = box.height / drawing.height;
  return drawing.bands.map(({ address, timeline, kind, level, line, elements, ...rect }) => ({
    address,
    timeline,
    kind,
    level,
    line: box.top + line * sy,
    elements,
    rect: {
      x: box.left + rect.x * sx,
      y: box.top + rect.y * sy,
      width: rect.width * sx,
      height: rect.height * sy,
    },
  }));
}

/**
 * The drawn bands of block `block` of `view`, in `Drawing.bands` order: the
 * drawing the canvas shows for that block (arranger's `drawingOf`), placed
 * through the block's drawing `<svg>` on the page (`hookBands`). Throws a
 * `RangeError` for a block `view` does not hold, and an `Error` while the
 * block's drawing is not on the page, since nothing places it then.
 */
export function bandsOf(view: View, block: BlockId): HookBand[] {
  const found = view.blocks[block];
  if (found === undefined) throw new RangeError(`${block} is no block of the open workspace`);
  const node = [...document.querySelectorAll(".svelte-flow__node[data-id]")].find(
    (element) => element.getAttribute("data-id") === block,
  );
  const svg = node?.querySelector(".tilie-block > svg");
  if (svg === null || svg === undefined) {
    throw new Error(`the drawing of block ${block} is not on the page`);
  }
  return hookBands(drawingOf(found, view.settings, fontMetrics), svg.getBoundingClientRect());
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
