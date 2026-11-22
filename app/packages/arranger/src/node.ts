/**
 * The types of the canvas's nodes: what a block node renders, a block's
 * placement during a gesture and a command shown without being stored.
 * Pure types, so every module may import them.
 */

import type { Block, BlockId, Command, ElementAddress } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import type { Node } from "@xyflow/svelte";
import type { Editing } from "./editing.ts";

/** What a block node renders. */
export type BlockNodeData = {
  readonly block: Block;
  readonly drawing: Drawing;
  readonly descriptors: readonly Descriptor[];
  /** The block's selected element addresses, by their keys (`addressKey`). */
  readonly selectedElements: ReadonlyMap<string, ElementAddress>;
  /**
   * The keys of the addresses that removing the selected elements would also remove,
   * highlighted with them.
   */
  readonly affectedElements: ReadonlySet<string>;
  /** The innermost open editor, the same on every node; `null` on the arranger. */
  readonly editing: Editing | null;
  /**
   * The keys of the drawn element addresses that lie inside the edited
   * element, the only ones that are hovered and selected: every drawn
   * address on the arranger and in this block's bundle editor, those the
   * edited group or timeline contains in its editor, none in another block
   * while an editor is open. A named timestamp the drawing draws nothing of
   * counts as drawn where the canvas shows it (`affordancesOf`).
   */
  readonly inside: ReadonlySet<string>;
};

export type BlockNode = Node<BlockNodeData, "block">;

/**
 * A block's placement as the canvas shows it during a gesture, before
 * anything is stored, and the drawing its node shows then, its items and
 * cards where the gesture puts them.
 */
export type LivePlacement = Pick<
  Block,
  "id" | "x" | "y" | "scale" | "length" | "spacing" | "margin" | "width" | "height"
> & { readonly drawing: Drawing };

/**
 * A command the canvas shows applied to its block and never stores, while
 * its host holds it: a control's value before it is committed (the wedge
 * rotation's slider while dragged). Only that block's node is drawn again;
 * a command the reducer refuses shows the block as stored.
 */
export interface TransientCommand {
  readonly block: BlockId;
  readonly command: Command;
}
