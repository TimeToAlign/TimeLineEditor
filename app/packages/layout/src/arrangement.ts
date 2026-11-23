/**
 * Packing (`docs/drawing.md` in TimeToShare, section 8.6, Arrangements): the
 * contents of a container placed in an order instead of at free places, one
 * function for every level that arranges its contents, the blocks of a
 * canvas, the items of a block and the cards of a frame.
 */

/** The size of one content, in the coordinates its offset is given in. */
export interface PackedSize {
  readonly width: number;
  readonly height: number;
}

/** The top left corner of one content. */
export interface PackedOffset {
  readonly x: number;
  readonly y: number;
}

/** How contents are packed: one under another, side by side, or in the cells of a matrix. */
export type PackedDirection = "vertical" | "horizontal" | "matrix";

/** How `packed` places its contents. */
export interface Packing {
  readonly direction: PackedDirection;
  /** The gap between two contents next to each other, and between two rows or columns. */
  readonly gap: number;
  /** The top left corner of the first content. */
  readonly start: PackedOffset;
  /** The number of columns of a matrix, a positive integer; read by `matrix` alone. */
  readonly columns?: number;
}

/**
 * The top left corners of contents of the sizes `sizes`, in their order:
 * `vertical` left-aligned at `start.x`, each `gap` below the previous one's
 * bottom (its `y` plus its height, plus `gap`, summed in that order);
 * `horizontal` top-aligned at `start.y`, each `gap` right of the previous
 * one's right edge; `matrix` row by row in `columns` columns, each column
 * as wide as its widest content and each row as tall as its tallest, the
 * columns and rows `gap` apart, every content at its cell's top left. Pure,
 * in binary64.
 */
export function packed(sizes: readonly PackedSize[], packing: Packing): PackedOffset[] {
  const { direction, gap, start } = packing;
  if (direction === "matrix") {
    const columns = packing.columns ?? 1;
    if (!Number.isInteger(columns) || columns < 1) {
      throw new RangeError(`a matrix has a positive whole number of columns, not ${columns}`);
    }
    const widths: number[] = [];
    const heights: number[] = [];
    sizes.forEach(({ width, height }, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      widths[column] = Math.max(widths[column] ?? 0, width);
      heights[row] = Math.max(heights[row] ?? 0, height);
    });
    const lefts = edges(start.x, widths, gap);
    const tops = edges(start.y, heights, gap);
    return sizes.map((_, index) => ({
      x: lefts[index % columns] ?? start.x,
      y: tops[Math.floor(index / columns)] ?? start.y,
    }));
  }
  const along = edges(
    direction === "vertical" ? start.y : start.x,
    sizes.map((size) => (direction === "vertical" ? size.height : size.width)),
    gap,
  );
  return along.map((at) =>
    direction === "vertical" ? { x: start.x, y: at } : { x: at, y: start.y },
  );
}

/** The starts of extents `extents` laid from `from`, each the previous start plus its extent plus `gap`. */
function edges(from: number, extents: readonly number[], gap: number): number[] {
  const starts: number[] = [];
  let at = from;
  for (const extent of extents) {
    starts.push(at);
    at = at + extent + gap;
  }
  return starts;
}
