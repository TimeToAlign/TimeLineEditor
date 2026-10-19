/**
 * Reordering the cards a frame holds: a group's member cards, dragged in
 * the group editor of that group.
 */

import type { View } from "@timetoalign/tilie-core";
import { cardAddress, qualify } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { boxOf } from "../boxes.ts";
import type { GestureStrategy, Point } from "../gesture.ts";
import { sameSequence } from "../numbers.ts";
import { memberOrderAt, reorderCommand } from "../reorder.ts";
import type { NodeHost } from "./host.ts";
import { previewCommand } from "./host.ts";

/** What a press on a held card holds. */
export interface HeldPress {
  /** The view as stored at the press, which the command is built on. */
  readonly view: View;
  /** The drawing at the press, which every drop is read against, never a preview's. */
  readonly drawing: Drawing;
  /** The card's drawing, which the ghost copies. */
  readonly ghost: readonly Descriptor[];
  /** The pointer's drawing point at the press. */
  readonly at: Point;
  /** The order last previewed; `null` before the first. */
  shown: readonly string[] | null;
}

/** Where a held card drops (the display order of its group) and how far the pointer has travelled. */
export interface HeldValue {
  readonly order: readonly string[];
  readonly offset: Point;
}

/**
 * The descriptors drawing a card and everything drawn on it: those whose
 * source element lies in the card's range of the drawing, its shadow (a
 * second descriptor of the card's own rectangle) included.
 */
export function cardDrawing(
  drawing: Drawing,
  descriptors: readonly Descriptor[],
  card: string,
): readonly Descriptor[] {
  const box = boxOf(drawing, card);
  if (box === undefined) return [];
  const { start, end } = box.range;
  return descriptors.filter(({ source }) => source.element >= start && source.element < end);
}

/**
 * The drag of the card of `member` held by the frame of `group`. A press is
 * taken while the canvas reorders cards (`rulesOf(...).reorder`); the press
 * that becomes a drag selects the card. The order follows the pointer's
 * drawing point through the drawing as stored at the press
 * (`memberOrderAt`); the other cards slide apart in the preview while a copy
 * of the dragged card's drawing follows the pointer, the card itself left
 * hidden where it would drop. The release stores the order in one `set`
 * (`reorderCommand`), nothing for a release in place.
 */
export function heldGesture(
  host: NodeHost,
  group: string,
  member: string,
): GestureStrategy<HeldPress, HeldValue> {
  const { actions } = host;
  const card = cardAddress(member);
  const blockOf = (press: HeldPress) => {
    const block = press.view.blocks[host.data().block.id];
    if (block === undefined)
      throw new RangeError(`${host.data().block.id} is no block of the view`);
    return block;
  };
  return {
    takes(_event, at) {
      if (!actions.rules().reorder) return null;
      const { drawing, descriptors } = host.data();
      return {
        view: actions.view(),
        drawing,
        ghost: cardDrawing(drawing, descriptors, card),
        at: at.drawing,
        shown: null,
      };
    },
    start() {
      actions.select(qualify(host.data().block.id, card));
    },
    value(press, at) {
      return {
        order: memberOrderAt(press.drawing, group, member, at.drawing.y),
        offset: { x: at.drawing.x - press.at.x, y: at.drawing.y - press.at.y },
      };
    },
    preview(press, value) {
      const block = host.data().block.id;
      if (value === null) {
        press.shown = null;
        host.ghost(null);
        actions.preview(block, null);
        host.slide(false);
        return;
      }
      host.ghost({ card, descriptors: press.ghost, offset: value.offset });
      if (press.shown !== null && sameSequence(press.shown, value.order)) return;
      press.shown = value.order;
      host.slide(true);
      previewCommand(
        actions,
        block,
        press.view,
        reorderCommand(blockOf(press), group, value.order),
      );
    },
    command: (press, value) => reorderCommand(blockOf(press), group, value.order),
  };
}
