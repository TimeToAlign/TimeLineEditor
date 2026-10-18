/**
 * Resizing a block in three modes: scale the whole drawing, size the box
 * around the content, or stretch the content's lengths and distances.
 */

import type { Block, Change, Place, SetCommand, WorkspaceSettings } from "@timetoalign/tilie-core";
import { PLACE_MEMBERS } from "@timetoalign/tilie-core";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import { drawingOf } from "./drawing.ts";
import { GRID_FREE, MIN_LENGTH, MIN_SCALE, MIN_SPACING, quantize } from "./numbers.ts";
import { nodePosition } from "./project.ts";

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
export const SIDES: { readonly [handle in Handle]: readonly [-1 | 0 | 1, -1 | 0 | 1] } = {
  "top-left": [-1, -1],
  top: [0, -1],
  "top-right": [1, -1],
  right: [1, 0],
  "bottom-right": [1, 1],
  bottom: [0, 1],
  "bottom-left": [-1, 1],
  left: [-1, 0],
};

export const ALL_HANDLES = Object.keys(SIDES) as readonly Handle[];
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
export function solve(
  f: (x: number) => number,
  start: number,
  target: number,
  floor: number,
): number {
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
 * The box request after a stretch that took the content from `content` to
 * `stretched` on one axis: a request larger than the content keeps its
 * proportion to the content, `request × stretched ÷ content` (multiplied
 * first), so every margin it adds stretches with the content; one at or
 * below the content draws nothing and becomes `null`.
 */
export function kept(request: number | null, content: number, stretched: number): number | null {
  if (request === null || request <= content) return null;
  return quantize((request * stretched) / content, GRID_FREE);
}

/**
 * The placement values that resize `block` by dragging `handle` by `delta`:
 * the dragged edge of its node ends under the pointer and the opposite edge
 * stays put. Every number is quantized to `GRID_FREE`, never to the grid:
 * for a left or top handle the node's new left or top edge is the opposite
 * edge less the achieved size, and the stored `x` or `y` is that edge's
 * place origin (`nodePosition` inverted, with the resized drawing's origin).
 *
 * - `scale` (corners only) sets `scale` to the larger of the two axis
 *   ratios, floored at `MIN_SCALE`.
 * - `box` sets `width` and `height`; a request at or below the content's
 *   own extent stores `null`, the content's size.
 * - `stretch` sets `length` from a left or right handle and `spacing` from a
 *   top or bottom one: the largest value whose box does not pass the
 *   pointer, floored at `MIN_LENGTH` and `MIN_SPACING`; a shrink past a
 *   flat piece stops at its knee. The box follows the content on each axis
 *   (`kept`): a `width` or `height` larger than the content keeps its
 *   proportion to it, one at or below the content becomes `null`, and
 *   `null` stays. So the edge ends under the pointer with or without a box
 *   request, and a pointer moved back always finds a smaller value. The
 *   stated places stretch with the content (`blockStretchPlaces`), so the
 *   items keep their arrangement; `places` is set when they change.
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
  const node = nodePosition(block, drawing);
  const right = node.x + drawing.width * z;
  const bottom = node.y + drawing.height * z;
  const left = sx < 0 ? quantize(node.x + delta.dx, GRID_FREE) : node.x;
  const top = sy < 0 ? quantize(node.y + delta.dy, GRID_FREE) : node.y;
  const targetWidth = (sx > 0 ? right + delta.dx : right) - left;
  const targetHeight = (sy > 0 ? bottom + delta.dy : bottom) - top;
  const values: Values = {};
  let size = { width: drawing.width, height: drawing.height, scale: z };
  let { origin } = drawing;

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
      const stretch = (lengthTo: number, spacingTo: number) =>
        drawingOf(block, settings, metrics, {
          ...free,
          length: lengthTo,
          spacing: spacingTo,
          places: blockStretchPlaces(block, lengthTo, spacingTo),
        });
      /** The box's extent at a content extent: the larger of it and the request following it. */
      const boxed = (request: number | null, before: number, extent: number) =>
        Math.max(extent, kept(request, before, extent) ?? 0);
      if (sx !== 0) {
        const width = (value: number) =>
          boxed(block.width, content.width, stretch(value, spacing).width);
        length = solve(width, length, targetWidth / z, MIN_LENGTH);
        values.length = length;
      }
      if (sy !== 0) {
        const height = (value: number) =>
          boxed(block.height, content.height, stretch(length, value).height);
        spacing = solve(height, spacing, targetHeight / z, MIN_SPACING);
        values.spacing = spacing;
      }
      const stretched = stretch(length, spacing);
      const places = blockStretchPlaces(block, length, spacing);
      if (places !== block.places) values.places = places;
      origin = stretched.origin;
      const width = kept(block.width, content.width, stretched.width);
      const height = kept(block.height, content.height, stretched.height);
      if (width !== block.width) values.width = width;
      if (height !== block.height) values.height = height;
      size = {
        ...size,
        width: Math.max(stretched.width, width ?? 0),
        height: Math.max(stretched.height, height ?? 0),
      };
    }
  }
  if (sx < 0) {
    values.x = quantize(right - (size.width - origin.x) * size.scale, GRID_FREE);
  }
  if (sy < 0) {
    values.y = quantize(bottom - (size.height - origin.y) * size.scale, GRID_FREE);
  }
  return { values };
}

/**
 * The places of `block` stretched to `length` and `spacing`: every stated
 * `x`, `length` and `width` scaled by the ratio of the lengths, every stated
 * `y` and `height` by the ratio of the spacings, quantized to `GRID_FREE`,
 * and every stated `scale` and `spacing` kept (an item's `spacing` is a
 * factor of the block's), so a stretch scales the items' and cards' sizes
 * and distances and keeps their arrangement. The block's own `places`
 * object when nothing changes.
 */
export function blockStretchPlaces(
  block: Pick<Block, "length" | "spacing" | "places">,
  length: number,
  spacing: number,
): Block["places"] {
  const horizontal = length / block.length;
  const vertical = spacing / block.spacing;
  const ratios = {
    x: horizontal,
    length: horizontal,
    width: horizontal,
    y: vertical,
    height: vertical,
    scale: 1,
    spacing: 1,
  };
  let changed = false;
  const places: { [key: string]: Place } = {};
  for (const [key, place] of Object.entries(block.places)) {
    const scaled: { -readonly [member in keyof Place]: number } = {};
    for (const member of PLACE_MEMBERS) {
      const value = place[member];
      if (value === undefined) continue;
      scaled[member] = quantize(value * ratios[member], GRID_FREE);
      if (scaled[member] !== value) changed = true;
    }
    places[key] = scaled;
  }
  return changed ? places : block.places;
}

/**
 * The `set` storing a resize's values on its block: the block's own members
 * in one change, then the place of every item in `values.places` in one
 * change each, aimed at the item. `null` when every value is the block's own
 * (`places` its own object, as `blockStretchPlaces` keeps it): a resize that
 * changes no stored value is no command, like a drag that ends where it began.
 */
export function resizeCommand(block: Block, values: Partial<Block>): SetCommand | null {
  const changed = Object.entries(values).some(
    ([member, value]) => block[member as keyof Block] !== value,
  );
  if (!changed) return null;
  const { places, ...own } = values;
  const changes: Change[] = [{ target: block.id, values: own }];
  for (const [key, place] of Object.entries(places ?? {})) {
    changes.push({ target: `${block.id}/${key}`, values: { place } });
  }
  return { type: "set", changes };
}
