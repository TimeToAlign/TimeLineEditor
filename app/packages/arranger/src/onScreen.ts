/** A flag kept on screen: shifted from where it starts by exactly what keeps it inside the canvas. */

import type { FlagPlace } from "./coordinates.ts";

/** A width and a height in pixels; 0 where nothing is measured yet. */
export interface Extent {
  readonly width: number;
  readonly height: number;
}

/**
 * The flag at `place` (`flagPlace`: right of the wedge it marks), `size`
 * wide and high, shifted by exactly the amount that keeps it inside the
 * canvas `screen` (its visible area, from its top-left corner): a flag
 * past the right or bottom border moves left or up until its right or
 * bottom edge lies on that border, one past the left or top border moves
 * right or down until its left or top edge lies on it, and a flag inside
 * stays where it starts. A flag larger than the canvas along an axis keeps
 * its left or top edge on the border, so its beginning stays readable.
 * Along an axis where the canvas or the flag measures 0 (not laid out
 * yet) nothing is shifted. The pole is not moved: it stands at the
 * abscissa it marks.
 */
export function onScreen(place: FlagPlace, size: Extent, screen: Extent): FlagPlace {
  const left = keptWithin(place.left, size.width, screen.width);
  const top = keptWithin(place.top, size.height, screen.height);
  return left === place.left && top === place.top ? place : { ...place, left, top };
}

/** `start` moved by the least amount that keeps `[start, start + length]` inside `[0, bound]`, the start first. */
function keptWithin(start: number, length: number, bound: number): number {
  if (length <= 0 || bound <= 0) return start;
  return Math.max(0, Math.min(start, bound - length));
}
