/** Blocks: the entries of a workspace's canvas, each placing one manifest. */

import type { Places } from "../manifest/containers.ts";
import type { Manifest } from "../manifest/types.ts";

/** A block id: ten characters of base 36, unique within the workspace. */
export type BlockId = string;
export const BLOCK_ID = /^[0-9a-z]{10}$/;

/** The inputs of a block's drawing besides its manifest and the style layers. */
export interface BlockPlacement {
  /** The uniform scale of the drawing on the canvas, positive. */
  readonly scale: number;
  /** The graphical length of the root, positive. */
  readonly length: number;
  /** The block's spacing, the gap between its items at their default `y`: finite, at least 0. */
  readonly spacing: number;
  /** The block's margin, empty space drawn above its first item and below its last: finite, at least 0. */
  readonly margin: number;
  /** The requested block size, positive, or null for the content's own size. */
  readonly width: number | null;
  readonly height: number | null;
}

/** The directions a block's items may be arranged in. */
export const ITEM_DIRECTIONS = ["vertical", "horizontal"] as const;

/** A direction a block's items may be arranged in. */
export type ItemDirection = (typeof ITEM_DIRECTIONS)[number];

/**
 * How a block's items, its groups and ungrouped roots, are arranged instead
 * of standing at their places: packed one under another (`vertical`) or side
 * by side (`horizontal`, every root the groups hang on drawn once behind the
 * row), in the order `order` gives (`itemOrder`: IDs naming no item are
 * passed over, items it leaves out follow in drawing order).
 */
export interface ItemArrangement {
  readonly direction: ItemDirection;
  /** Item IDs, each once. */
  readonly order: readonly string[];
}

/**
 * One block: its placement on the canvas and its own manifest, which carries
 * the block's styling in its `graphical` member.
 */
export interface Block extends BlockPlacement {
  readonly id: BlockId;
  /** The canvas group holding the block; `null` in this version. */
  readonly parent: BlockId | null;
  /** The fractional index among the blocks of the same `parent`. */
  readonly index: string;
  readonly x: number;
  readonly y: number;
  /**
   * The stated places of the containers of its manifest's drawing: an item's
   * place by its group's or ungrouped root's ID, and in a group's entry the
   * size, spacing and margin of each member's card in its frame by member ID
   * (`places[G].cards[T]`).
   */
  readonly places: Places;
  /**
   * How its items are arranged; absent where they stand at their places, as
   * a block without the member in its file and a `set` of `null` leave it.
   * Its items' stated places are kept and not used while it is present.
   */
  readonly arrangement?: ItemArrangement;
  readonly manifest: Manifest;
}

/** The members every block states, in the order a block is built; `arrangement` follows `places` where present. */
export const BLOCK_MEMBERS = [
  "id",
  "parent",
  "index",
  "x",
  "y",
  "scale",
  "length",
  "spacing",
  "margin",
  "width",
  "height",
  "places",
  "manifest",
] as const satisfies readonly (keyof Block)[];
