/**
 * Reordering a group's member cards: where a dragged card drops and the
 * `set` storing it. Only the display order changes; members are never
 * placed (`docs/drawing.md` in timeskeleton, sections 8.1 and 8.6). A drop's
 * preview is that `set` applied (core's `preview`).
 */

import type { Block, SetCommand } from "@timetoalign/tilie-core";
import { displayOrder, qualify } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { CardBox } from "./boxes.ts";
import { boxOf, isDisplayed, isHeld } from "./boxes.ts";
import { sameSequence } from "./numbers.ts";

/**
 * The displayed member cards of `group`'s frame in drawing order, the
 * group's display order: the cards the frame holds. Neither the frame's
 * rectangle nor where the cards lie decides, so a hidden frame and
 * overlapping items change nothing (section 8.5); a hidden card is left
 * out.
 */
function memberCards(drawing: Drawing, group: string): CardBox[] {
  if (boxOf(drawing, group)?.kind !== "frame") {
    throw new RangeError(`${group} is no group of the drawing`);
  }
  return drawing.boxes.filter(
    (box): box is CardBox => isHeld(box) && box.holder === group && isDisplayed(box),
  );
}

/**
 * The display order of `group` that dropping its member `dragged` at the
 * drawing's ordinate `y` gives: `dragged` before the first other member
 * whose card's middle lies below `y`, or last when none does. `drawing` is
 * the drawing of the stored order, so the cards do not move under the
 * pointer while it searches.
 */
export function memberOrderAt(
  drawing: Drawing,
  group: string,
  dragged: string,
  y: number,
): string[] {
  const others = memberCards(drawing, group)
    .map((card) => ({ id: card.key, middle: card.y + card.height / 2 }))
    .filter((card) => card.id !== dragged);
  const at = others.findIndex((card) => card.middle > y);
  const order = others.map((card) => card.id);
  order.splice(at < 0 ? order.length : at, 0, dragged);
  return order;
}

/**
 * The `set` giving `group` of `block` the display order `order`, `null` when
 * it is the order already displayed (core's `displayOrder`). An order equal
 * to the group's `members` deletes the group's entry (`order: null`)
 * instead of repeating them.
 */
export function reorderCommand(
  block: Block,
  group: string,
  order: readonly string[],
): SetCommand | null {
  if (sameSequence(displayOrder(block.manifest, group), order)) return null;
  const members = block.manifest.groups.find((candidate) => candidate.id === group)?.members ?? [];
  const value = sameSequence(members, order) ? null : [...order];
  return { type: "set", changes: [{ target: qualify(block.id, group), values: { order: value } }] };
}
