/**
 * Moving an item (a group's frame or an ungrouped root's card) to another
 * place of its block's arrangement, in the bundle editor of an arranged
 * block: the items keep no free place, so a drag reorders them as a held
 * card reorders its frame's cards.
 */

import type { PlaceKey, View } from "@timetoalign/tilie-core";
import { inBlock } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { isItem, itemOf, keyedBox } from "../boxes.ts";
import type { GestureStrategy, Point } from "../gesture.ts";
import { sameSequence } from "../numbers.ts";
import type { OrderEntry } from "../reorder.ts";
import { itemArrangementCommand, orderAt, rowRefusal, shownItemOrder } from "../reorder.ts";
import { cardDrawing, endReorder } from "./held.ts";
import type { NodeHost } from "./host.ts";
import { previewCommand } from "./host.ts";

/** What a press on an arranged item holds. */
export interface ArrangedPress {
  /** The view as stored at the press, which the command is built on. */
  readonly view: View;
  /** The drawing at the press, which every drop is read against, never a preview's. */
  readonly drawing: Drawing;
  /** The item's drawing, which the copy shows. */
  readonly ghost: readonly Descriptor[];
  /** The pointer's drawing point at the press. */
  readonly at: Point;
  /** The order last previewed; `null` before the first. */
  shown: readonly string[] | null;
  /** The pointer's travel last shown, where the copy lies; `null` before the first. */
  offset: Point | null;
}

/** Where an arranged item drops, how far the pointer has travelled, and why the drop is refused. */
export interface ArrangedValue {
  readonly order: readonly string[];
  readonly offset: Point;
  readonly refused: string | null;
}

/**
 * The items of `drawing` in `order`, each where the drawing draws its box:
 * the entries `orderAt` reads.
 */
export function itemEntries(drawing: Drawing, order: readonly string[]): OrderEntry[] {
  return order.flatMap((id) => {
    const box = keyedBox(drawing, { item: id });
    return box === undefined || !isItem(box)
      ? []
      : [{ id, x: box.x, y: box.y, width: box.width, height: box.height }];
  });
}

/**
 * The drag of the item `key` of an arranged block. A press is taken while
 * the level's contents are arranged (`rulesOf(...).arranged`); the press
 * that becomes a drag selects the item. A copy of the item's drawing follows
 * the pointer while the others slide to the places the order at the
 * pointer's drawing point gives (`orderAt` along the drawn direction,
 * through the drawing at the press), the item itself hidden where it would
 * drop. Side by side, an order the stretches refuse (`rowRefusal`) previews
 * the stored order. The release stores the order in one `set` of the
 * block's arrangement (`itemArrangementCommand`), nothing for a release in
 * place, and shows a refusal's reason (`NodeActions.refuse`); the copy
 * then moves to where its item is drawn (`endReorder`).
 */
export function arrangedGesture(
  host: NodeHost,
  key: PlaceKey,
): GestureStrategy<ArrangedPress, ArrangedValue> {
  const { actions } = host;
  const item = key.item;
  const blockOf = (press: ArrangedPress) => {
    const block = press.view.blocks[host.data().block.id];
    if (block === undefined)
      throw new RangeError(`${host.data().block.id} is no block of the view`);
    return block;
  };
  const commandOf = (press: ArrangedPress, order: readonly string[]) => {
    const block = blockOf(press);
    const direction = block.arrangement?.direction;
    return direction === undefined
      ? null
      : itemArrangementCommand(block, { direction, order: [...order] });
  };
  return {
    moves: true,
    takes(_event, at) {
      if (actions.rules().arranged === undefined) return null;
      const { drawing, descriptors } = host.data();
      return {
        view: actions.view(),
        drawing,
        ghost: cardDrawing(drawing, descriptors, key),
        at: at.drawing,
        shown: null,
        offset: null,
      };
    },
    start() {
      const { block, drawing } = host.data();
      actions.select(inBlock(block.id, itemOf(drawing, key).address));
    },
    value(press, at) {
      const block = blockOf(press);
      const direction = actions.rules().arranged?.direction ?? "vertical";
      const entries = itemEntries(press.drawing, shownItemOrder(block));
      const order = orderAt(entries, item, at.drawing, direction);
      return {
        order,
        offset: { x: at.drawing.x - press.at.x, y: at.drawing.y - press.at.y },
        refused: direction === "horizontal" ? rowRefusal(block.manifest, order, item) : null,
      };
    },
    preview(press, value) {
      const block = host.data().block.id;
      if (value === null) {
        const offset = press.offset;
        press.shown = null;
        press.offset = null;
        endReorder(host, key, { ...press, offset });
        return;
      }
      press.offset = value.offset;
      host.ghost({ card: key, descriptors: press.ghost, offset: value.offset, to: null });
      if (press.shown !== null && sameSequence(press.shown, value.order)) return;
      press.shown = value.order;
      host.slide(true);
      previewCommand(
        actions,
        block,
        press.view,
        value.refused === null ? commandOf(press, value.order) : null,
      );
    },
    command(press, value) {
      if (value.refused === null) return commandOf(press, value.order);
      actions.refuse?.(value.refused);
      return null;
    },
  };
}
