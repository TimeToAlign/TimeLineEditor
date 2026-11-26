/**
 * What a handle dragged along a block's axis reads of the pointer: its
 * travel since the press in the block's drawing units, and how many of
 * those units one screen pixel spans. Shared by the handles of a stored
 * elision's gap (`gap.ts`) and of a region's brace (`region.ts`).
 */

import type { Viewport } from "../focus.ts";
import type { Point } from "../gesture.ts";
import type { BlockNode } from "../node.ts";

/** What a press on a handle holds of the pointer: its client point and the viewport's pan then. */
export interface HandlePress {
  readonly node: BlockNode;
  readonly screen: Point;
  readonly pan: Point;
}

/**
 * The pointer's horizontal travel since `press` in the block's drawing
 * units: its screen travel less the viewport's pan since the press, over
 * the zoom and the block's scale.
 */
export function travelOf(press: HandlePress, viewport: Viewport, screen: Point): number {
  const { x, zoom } = viewport;
  return (screen.x - press.screen.x - (x - press.pan.x)) / zoom / press.node.data.block.scale;
}

/** Block-local units per screen pixel. */
export function pixelOf(press: HandlePress, viewport: Viewport): number {
  return 1 / (viewport.zoom * press.node.data.block.scale);
}
