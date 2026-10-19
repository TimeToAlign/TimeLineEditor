/**
 * What the strategies of a block node's gestures read from the node, and
 * the one way every gesture previews: the command it would store, applied.
 */

import type { BlockId, Command, View } from "@timetoalign/tilie-core";
import { isCommandError, preview } from "@timetoalign/tilie-core";
import type { Descriptor } from "@timetoalign/tilie-writers";
import type { Point } from "../gesture.ts";
import type { NodeActions } from "../nodeActions.ts";
import type { BlockNodeData } from "../project.ts";

/** A copy of a held card's drawing that follows the pointer while the card is reordered. */
export interface Ghost {
  /** The card's element address, `M/card`: its drawing is hidden where the preview drops it. */
  readonly card: string;
  /** The descriptors of the card and everything drawn on it, as the press found them. */
  readonly descriptors: readonly Descriptor[];
  /**
   * Where the copy lies: the pointer's travel since the press, in the
   * drawing's units; once the gesture has ended, the travel at the drop.
   */
  readonly offset: Point;
  /**
   * While the copy settles after the gesture has ended, the travel it moves
   * to from `offset`, its card's place, and is then removed; `null` while
   * it follows the pointer.
   */
  readonly to: Point | null;
}

/** A block node's side of a gesture inside its drawing. */
export interface NodeHost {
  readonly actions: NodeActions;
  /** The node's data now: its block as shown, drawing, descriptors, selection and editor. */
  data(): BlockNodeData;
  /** Whether the next redraws slide the drawing's elements to their new places (a reorder). */
  slide(on: boolean): void;
  /** Show a held card's copy at the pointer; `null` removes it. */
  ghost(ghost: Ghost | null): void;
}

/**
 * Show block `block` as `command` would leave `view`, through core's
 * `preview`: the reducer without the schema check and the invariants, so a
 * preview never differs from what the release stores. No command (the
 * pointer back where it started) and a command the reducer refuses show the
 * block as `view` holds it; the release of a refused command shows the
 * refusal.
 */
export function previewCommand(
  actions: NodeActions,
  block: BlockId,
  view: View,
  command: Command | null,
): void {
  const shown = command === null ? view : preview(view, command);
  actions.preview(block, { view: isCommandError(shown) ? view : shown });
}
