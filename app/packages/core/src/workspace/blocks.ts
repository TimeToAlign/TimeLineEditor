/** Blocks: the entries of a workspace's canvas, each placing one manifest. */

import type { Manifest } from "../manifest/types.ts";

/** A block id: ten characters of base 36, unique within the workspace. */
export type BlockId = string;
export const BLOCK_ID = /^[0-9a-z]{10}$/;

/** Which object a block's manifest describes: its manifest's top-level member. */
export type BlockKind = "timeline";

/** A group of bands, laid outwards from the root in a block's `order`. */
export type BandGroup = "children" | "regions" | "flow";
export const BAND_GROUPS: readonly BandGroup[] = ["children", "regions", "flow"];

/** The inputs of a block's drawing besides its manifest and the style layers. */
export interface BlockPlacement {
  /** The uniform scale of the drawing on the canvas, positive. */
  readonly scale: number;
  /** The graphical length of the root, positive. */
  readonly length: number;
  /** The vertical stretch, positive. */
  readonly spacing: number;
  /** The requested box size, positive, or null for the content's own size. */
  readonly width: number | null;
  readonly height: number | null;
  /** The band order, a permutation of the three groups. */
  readonly order: readonly [BandGroup, BandGroup, BandGroup];
}

/**
 * One block: its placement on the canvas and its own manifest, which carries
 * the block's styling in its `graphical` member.
 */
export interface Block extends BlockPlacement {
  readonly id: BlockId;
  readonly blockKind: BlockKind;
  /** The canvas group holding the block; `null` in this version. */
  readonly parent: BlockId | null;
  /** The fractional index among the blocks of the same `parent`. */
  readonly index: string;
  readonly x: number;
  readonly y: number;
  readonly manifest: Manifest;
}

/** The members of a block, in the order a block is built. */
export const BLOCK_MEMBERS = [
  "id",
  "blockKind",
  "parent",
  "index",
  "x",
  "y",
  "scale",
  "length",
  "spacing",
  "width",
  "height",
  "order",
  "manifest",
] as const satisfies readonly (keyof Block)[];
