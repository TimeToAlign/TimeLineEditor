/** Blocks: the entries of a workspace's canvas, each placing one manifest. */

import { timelineAncestry } from "../manifest/elements.ts";
import { memberDrawings } from "../manifest/files.ts";
import type { Manifest } from "../manifest/types.ts";

/** A block id: ten characters of base 36, unique within the workspace. */
export type BlockId = string;
export const BLOCK_ID = /^[0-9a-z]{10}$/;

/** A group of bands, laid outwards from the root in a block's `order`. */
export type BandGroup = "children" | "regions" | "flow";
export const BAND_GROUPS: readonly BandGroup[] = ["children", "regions", "flow"];

/** A band order: a permutation of the three groups, laid outwards from the root. */
export type BandOrder = readonly [BandGroup, BandGroup, BandGroup];

/**
 * A stated place of an item, or the stated size and vertical stretch of a
 * member's card (drawing.md §8.6); a member left out takes its default.
 */
export interface Place {
  /** Finite. */
  readonly x?: number;
  /** Finite. */
  readonly y?: number;
  /** Positive. */
  readonly length?: number;
  /** Positive. */
  readonly scale?: number;
  /** The vertical stretch, a factor on the placement's; positive. */
  readonly spacing?: number;
  /** Positive. */
  readonly width?: number;
  /** Positive. */
  readonly height?: number;
}

/** The members of a place, in the order a place is written. */
export const PLACE_MEMBERS = [
  "x",
  "y",
  "length",
  "scale",
  "spacing",
  "width",
  "height",
] as const satisfies readonly (keyof Place)[];

/** The members of a place a member's card takes: its size and its vertical stretch. */
export const CARD_MEMBERS = [
  "width",
  "height",
  "spacing",
] as const satisfies readonly (keyof Place)[];

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
  readonly order: BandOrder;
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
   * The stated places of the manifest's items, by group id or ungrouped root
   * id, and the stated sizes and vertical stretches of its members' cards, by
   * member id.
   */
  readonly places: { readonly [key: string]: Place };
  /** The band orders overriding `order`, by group id or timeline id at any depth. */
  readonly bands: { readonly [key: string]: BandOrder };
  readonly manifest: Manifest;
}

/** The members of a block, in the order a block is built. */
export const BLOCK_MEMBERS = [
  "id",
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
  "places",
  "bands",
  "manifest",
] as const satisfies readonly (keyof Block)[];

/**
 * The items of a manifest's box (drawing.md §8.1), the keys `places` may
 * hold: its group ids and its ungrouped roots, the roots no group names as a
 * member and that contain no member.
 */
export function itemKeys(manifest: Manifest): ReadonlySet<string> {
  const { frames, ungrouped } = memberDrawings(manifest);
  return new Set([
    ...frames.map((frame) => frame.group.id),
    ...ungrouped.map((member) => member.timeline.id),
  ]);
}

/**
 * The cards of a manifest's frames, the other keys `places` may hold: the ids
 * of every group member, a root or a child timeline. Their places state only
 * `CARD_MEMBERS`.
 */
export function cardKeys(manifest: Manifest): ReadonlySet<string> {
  return new Set(manifest.groups.flatMap((group) => group.members));
}

/** The keys `bands` may hold: the manifest's group ids and its timeline ids at any depth. */
export function bandKeys(manifest: Manifest): ReadonlySet<string> {
  return new Set([
    ...manifest.groups.map((group) => group.id),
    ...timelineAncestry(manifest).keys(),
  ]);
}
