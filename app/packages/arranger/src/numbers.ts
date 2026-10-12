/** Canvas numbers: the quantization every stored position and size goes through. */

/** The step of a canvas number when the grid does not snap: 1/2048 unit, the font's
 * units per em, so text-derived edges at scale 1 are stored exactly. */
export const GRID_FREE = 1 / 2048;
/** The smallest scale a resize gives a block. */
export const MIN_SCALE = 1 / 8;
/** The smallest graphical length a resize gives a block's root. */
export const MIN_LENGTH = 8;
/** The smallest vertical stretch a resize gives a block. */
export const MIN_SPACING = 1 / 4;

/**
 * `value` rounded to the nearest multiple of `step`, halves towards +∞ and
 * never −0, so a stored canvas number carries no binary noise.
 */
export function quantize(value: number, step: number): number {
  return Math.round(value / step) * step + 0;
}

/** The step of positions under a grid: its size when it snaps, otherwise `GRID_FREE`. */
export function positionStep(grid: { readonly size: number; readonly snap: boolean }): number {
  return grid.snap ? grid.size : GRID_FREE;
}
