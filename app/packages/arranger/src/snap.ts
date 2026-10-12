/** Snapping a moving block to the grid and to other blocks' left edges and plot origins. */

import type { WorkspaceSettings } from "@timetoalign/tilie-core";
import { GRID_FREE, positionStep, quantize } from "./numbers.ts";

/** A block's box on the canvas. */
export interface Box {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The canvas x of the start of the root's line. */
  readonly origin: number;
}

/** A line drawn while a block is aligned to it. */
export interface Guide {
  readonly axis: "x";
  readonly at: number;
}

/**
 * Where `moving` lands: its position quantized to the grid (or to
 * `GRID_FREE` when it does not snap), then, horizontally, its left edge or
 * its origin moved onto the nearest left edge or origin of `others` lying
 * within `tolerance` canvas units, with a guide there. On a tie the first
 * wins: in the order of `others`, a left edge before an origin, the moving
 * left edge before its origin. An aligned `x` is quantized to `GRID_FREE`.
 */
export function snap(
  moving: Box,
  others: readonly Box[],
  grid: WorkspaceSettings["grid"],
  tolerance: number,
): { x: number; y: number; guides: readonly Guide[] } {
  const step = positionStep(grid);
  const x = quantize(moving.x, step);
  const y = quantize(moving.y, step);
  const anchors = [0, moving.origin - moving.x];
  let best: { distance: number; at: number; anchor: number } | undefined;
  for (const other of others) {
    if (other.id === moving.id) continue;
    for (const at of [other.x, other.origin]) {
      for (const anchor of anchors) {
        const distance = Math.abs(x + anchor - at);
        if (distance <= tolerance && (best === undefined || distance < best.distance)) {
          best = { distance, at, anchor };
        }
      }
    }
  }
  if (best === undefined) return { x, y, guides: [] };
  return { x: quantize(best.at - best.anchor, GRID_FREE), y, guides: [{ axis: "x", at: best.at }] };
}
