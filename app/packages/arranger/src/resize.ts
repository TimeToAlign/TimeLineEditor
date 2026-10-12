/**
 * Resizing a block in three modes: scale the whole drawing, size the box
 * around the content, or stretch the content's lengths and distances.
 */

import type { Block, SetCommand, WorkspaceSettings } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import { drawingOf } from "./drawing.ts";
import { GRID_FREE, MIN_LENGTH, MIN_SCALE, MIN_SPACING, quantize } from "./numbers.ts";

export type ResizeMode = "scale" | "box" | "stretch";

export type Handle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

/** Each handle's horizontal and vertical side: −1 left or top, 1 right or bottom, 0 neither. */
const SIDES: { readonly [handle in Handle]: readonly [-1 | 0 | 1, -1 | 0 | 1] } = {
  "top-left": [-1, -1],
  top: [0, -1],
  "top-right": [1, -1],
  right: [1, 0],
  "bottom-right": [1, 1],
  bottom: [0, 1],
  "bottom-left": [-1, 1],
  left: [-1, 0],
};

const ALL_HANDLES = Object.keys(SIDES) as readonly Handle[];
const CORNERS: readonly Handle[] = ["top-left", "top-right", "bottom-right", "bottom-left"];

/** The handles a mode offers: the corners to scale, all eight to size or stretch. */
export function handlesFor(mode: ResizeMode): readonly Handle[] {
  return mode === "scale" ? CORNERS : ALL_HANDLES;
}

/** A pointer's travel in canvas units. */
export interface Delta {
  readonly dx: number;
  readonly dy: number;
}

type Values = { -readonly [member in keyof Block]?: Block[member] };

/** Binary noise below which an extent counts as reaching its target. */
const NOISE = 2 ** -30;
/** Beyond this many canvas units, an extent that has not grown never will. */
const REACH = 2 ** 20;

/**
 * The largest multiple of `GRID_FREE`, at least `floor`, at which the
 * non-decreasing extent `f` is at most `target`. A target below the
 * smallest extent `f(floor)` is raised to it, so a shrink beyond a flat
 * piece stops at the knee where the extent starts to grow, never at the
 * floor. An extent that never grows past the target leaves `start`.
 *
 * Search over the lattice: a Newton guess from `start` (the slope over one
 * step) and its neighbour, which settle an affine piece in four drawings,
 * then bisection between the largest value known to fit and the smallest
 * known not to.
 */
function solve(f: (x: number) => number, start: number, target: number, floor: number): number {
  const at = (k: number) => f(k * GRID_FREE);
  const first = Math.ceil(floor / GRID_FREE);
  const goal = Math.max(target, at(first)) + NOISE;
  // Invariant: at(lo) ≤ goal < at(hi).
  let lo = first;
  let hi = Number.POSITIVE_INFINITY;
  const probe = (k: number) => {
    if (k <= lo || k >= hi) return;
    if (at(k) <= goal) lo = k;
    else hi = k;
  };
  const begin = Math.max(first, Math.round(start / GRID_FREE));
  probe(begin);
  const slope = at(begin + 1) - at(begin);
  if (slope > 0) {
    const guess = Math.max(first, begin + Math.floor((goal - at(begin)) / slope));
    probe(guess);
    probe(guess + 1);
  }
  if (hi === Number.POSITIVE_INFINITY) {
    const far = lo + REACH / GRID_FREE;
    if (at(far) <= goal) return start;
    hi = far;
  }
  while (hi - lo > 1) probe(Math.floor((lo + hi) / 2));
  return lo * GRID_FREE;
}

/**
 * The placement values that resize `block` by dragging `handle` by `delta`:
 * the dragged edge ends under the pointer and the opposite edge stays put.
 * Every number is quantized to `GRID_FREE`, never to the grid: for a left or
 * top handle the stored `x` or `y` is the opposite edge less the achieved
 * size.
 *
 * - `scale` (corners only) sets `scale` to the larger of the two axis
 *   ratios, floored at `MIN_SCALE`.
 * - `box` sets `width` and `height`; a request at or below the content's
 *   own extent stores `null`, the content's size.
 * - `stretch` sets `length` from a left or right handle and `spacing` from a
 *   top or bottom one: the largest value whose content extent does not pass
 *   the pointer. The content moves by the pointer's travel, so with no box
 *   request its edge ends under the pointer. Floored at `MIN_LENGTH` and
 *   `MIN_SPACING`, and a shrink past a flat piece stops at its knee.
 */
export function resize(
  block: Block,
  settings: WorkspaceSettings,
  metrics: FontMetrics,
  mode: ResizeMode,
  handle: Handle,
  delta: Delta,
): { values: Partial<Block> } {
  const [sx, sy] = SIDES[handle];
  if (mode === "scale" && (sx === 0 || sy === 0)) {
    throw new RangeError(`a block scales from its corners, not from ${handle}`);
  }
  const drawing = drawingOf(block, settings, metrics);
  const z = block.scale;
  const right = block.x + drawing.width * z;
  const bottom = block.y + drawing.height * z;
  const left = sx < 0 ? quantize(block.x + delta.dx, GRID_FREE) : block.x;
  const top = sy < 0 ? quantize(block.y + delta.dy, GRID_FREE) : block.y;
  const targetWidth = (sx > 0 ? right + delta.dx : right) - left;
  const targetHeight = (sy > 0 ? bottom + delta.dy : bottom) - top;
  const values: Values = {};
  let size = { width: drawing.width, height: drawing.height, scale: z };

  if (mode === "scale") {
    const ratio = Math.max(targetWidth / drawing.width, targetHeight / drawing.height);
    const scale = Math.max(MIN_SCALE, quantize(ratio, GRID_FREE));
    values.scale = scale;
    size = { ...size, scale };
  } else {
    const free = { width: null, height: null };
    const content = drawingOf(block, settings, metrics, free);
    if (mode === "box") {
      if (sx !== 0) {
        const width = quantize(targetWidth / z, GRID_FREE);
        values.width = width > content.width ? width : null;
        size = { ...size, width: values.width ?? content.width };
      }
      if (sy !== 0) {
        const height = quantize(targetHeight / z, GRID_FREE);
        values.height = height > content.height ? height : null;
        size = { ...size, height: values.height ?? content.height };
      }
    } else {
      let { length, spacing } = block;
      if (sx !== 0) {
        const wanted = targetWidth / z - (drawing.width - content.width);
        const width = (value: number) =>
          drawingOf(block, settings, metrics, { ...free, length: value }).width;
        length = solve(width, length, wanted, MIN_LENGTH);
        values.length = length;
      }
      if (sy !== 0) {
        const wanted = targetHeight / z - (drawing.height - content.height);
        const height = (value: number) =>
          drawingOf(block, settings, metrics, { ...free, length, spacing: value }).height;
        spacing = solve(height, spacing, wanted, MIN_SPACING);
        values.spacing = spacing;
      }
      const stretched = drawingOf(block, settings, metrics, { length, spacing });
      size = { ...size, width: stretched.width, height: stretched.height };
    }
  }
  if (sx < 0) values.x = quantize(right - size.width * size.scale, GRID_FREE);
  if (sy < 0) values.y = quantize(bottom - size.height * size.scale, GRID_FREE);
  return { values };
}

/** The `set` storing a resize's values on its block. */
export function resizeCommand(block: Block, values: Partial<Block>): SetCommand {
  return { type: "set", changes: [{ target: block.id, values }] };
}
