/**
 * Reordering: where a dragged content drops among the contents of its
 * container, and the `set` storing the new order. One rule for every level
 * (`orderAt`): a group's member cards (its display order; members are never
 * placed, `docs/drawing.md` in TimeToShare, sections 8.1 and 8.6), the items
 * of an arranged block (its arrangement's order) and the blocks of an
 * arranged canvas (their `index`). A drop's preview is its `set` applied
 * (core's `preview`).
 */

import type {
  Block,
  BlockId,
  CanvasArrangement,
  CanvasDirection,
  ItemArrangement,
  Manifest,
  SetCommand,
  View,
} from "@timetoalign/tilie-core";
import {
  displayOrder,
  idAddress,
  inBlock,
  indexBetween,
  placedElement,
  placeKeyText,
  samePlaceKey,
  WORKSPACE,
} from "@timetoalign/tilie-core";
import { anchorsOf, itemOrder, rowOf } from "@timetoalign/tilie-core/drawing";
import { compareReal } from "@timetoalign/tilie-core/numbers";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { CardBox } from "./boxes.ts";
import { isDisplayed, isHeld, keyedBox } from "./boxes.ts";
import { sameSequence } from "./numbers.ts";

/** A content of a container where it is drawn: its ID and its rectangle. */
export interface OrderEntry {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The order `entries` (every content of a container, in their order, each
 * where it is drawn in that order) take when `dragged` is dropped at
 * `point`: `dragged` before the first other content that does not precede
 * the point, or last. Along `vertical` a content precedes the point when its
 * middle lies at or above it; along `horizontal` at or left of it; in a
 * `matrix`, read row by row, when its row (the contents sharing its top)
 * lies above the point's (the last row whose top lies at or above the
 * point, the first where none does), or it lies in the point's row with its
 * middle at or left of it. The contents do not move under the pointer while
 * it searches: `entries` are where they lie before the drop.
 */
export function orderAt(
  entries: readonly OrderEntry[],
  dragged: string,
  point: { readonly x: number; readonly y: number },
  direction: CanvasDirection,
): string[] {
  const others = entries.filter((entry) => entry.id !== dragged);
  const middleX = (entry: OrderEntry) => entry.x + entry.width / 2;
  const middleY = (entry: OrderEntry) => entry.y + entry.height / 2;
  let precedes: (entry: OrderEntry) => boolean;
  if (direction === "vertical") precedes = (entry) => middleY(entry) <= point.y;
  else if (direction === "horizontal") precedes = (entry) => middleX(entry) <= point.x;
  else {
    const tops = [...new Set(others.map((entry) => entry.y))].sort((a, b) => a - b);
    const rowOf = (y: number) => Math.max(0, tops.filter((top) => top <= y).length - 1);
    const row = rowOf(point.y);
    precedes = (entry) => {
      const own = rowOf(entry.y);
      return own < row || (own === row && middleX(entry) <= point.x);
    };
  }
  const at = others.findIndex((entry) => !precedes(entry));
  const order = others.map((entry) => entry.id);
  order.splice(at < 0 ? order.length : at, 0, dragged);
  return order;
}

/** `order` with `moved` taken out and put back `step` places further (`null` where that lies outside). */
export function steppedOrder(
  order: readonly string[],
  moved: string,
  step: number,
): string[] | null {
  const from = order.indexOf(moved);
  const to = from + step;
  if (from < 0 || step === 0 || to < 0 || to >= order.length) return null;
  const next = order.filter((id) => id !== moved);
  next.splice(to, 0, moved);
  return next;
}

/**
 * The displayed member cards of `group`'s frame in drawing order, the
 * group's display order: the cards the frame holds. Neither the frame's
 * rectangle nor where the cards lie decides, so a hidden frame and
 * overlapping items change nothing (section 8.5); a hidden card is left
 * out.
 */
function memberCards(drawing: Drawing, group: string): CardBox[] {
  if (keyedBox(drawing, { item: group })?.kind !== "frame") {
    throw new RangeError(`${group} is no group of the drawing`);
  }
  return drawing.boxes.filter(
    (box): box is CardBox =>
      isHeld(box) &&
      box.holder !== null &&
      samePlaceKey(box.holder, { item: group }) &&
      isDisplayed(box),
  );
}

/** The member a card of `manifest`'s drawing holds: the timeline its place key stands for. */
function memberOf(manifest: Manifest, card: CardBox): string {
  const member = placedElement(manifest, card.key);
  if (member === undefined) {
    throw new RangeError(`${placeKeyText(card.key)} is no card of the manifest`);
  }
  return member;
}

/**
 * The display order of `group` that dropping its member `dragged` at the
 * drawing's ordinate `y` gives: `dragged` before the first other member
 * whose card's middle lies below `y`, or last when none does. `drawing` is
 * the drawing of `manifest` in the stored order, so the cards do not move
 * under the pointer while it searches; each card stands for its timeline
 * (core's `placedElement`). The vertical call of `orderAt`.
 */
export function memberOrderAt(
  manifest: Manifest,
  drawing: Drawing,
  group: string,
  dragged: string,
  y: number,
): string[] {
  const cards = memberCards(drawing, group).map((card) => ({
    ...card,
    id: memberOf(manifest, card),
  }));
  return orderAt(cards, dragged, { x: 0, y }, "vertical");
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
  return {
    type: "set",
    changes: [{ target: inBlock(block.id, idAddress(group)), values: { order: value } }],
  };
}

/** A group or a timeline in a reason: its name, else its ID, in double quotes. */
function quoted(manifest: Manifest, id: string): string {
  const element =
    manifest.groups.find((group) => group.id === id) ??
    manifest.timelines.find((timeline) => timeline.id === id);
  return `"${element?.name ?? id}"`;
}

/**
 * Why the items of `manifest` cannot stand side by side in the order
 * `order` that moving the item `moved` gives (core's `itemOrder` of it),
 * where the item would leave its place among the stretches of the roots it
 * hangs on (the drawing specification's "Drawn once": along every root the
 * stretches follow the row from left to right): for each root of `moved`,
 * in its group's display order, `"G" stays right of "A", "B" and left of
 * "C" on "R"`, naming in the order's order the groups whose stretches lie
 * wholly before its own (it stays right of them) and wholly after (left),
 * where the order puts them on the wrong side; clauses joined by `; `.
 * `null` where `moved` keeps every such place: an ungrouped root, or a
 * group hanging on nothing, is never refused.
 */
export function rowRefusal(
  manifest: Manifest,
  order: readonly string[],
  moved: string,
): string | null {
  const place = new Map(itemOrder(manifest, order).map((id, index) => [id, index]));
  const at = place.get(moved) ?? 0;
  const anchors = anchorsOf(manifest);
  const byPlace = (a: string, b: string) => (place.get(a) ?? 0) - (place.get(b) ?? 0);
  const clauses = anchors
    .filter((anchor) => anchor.group === moved)
    .flatMap((anchor) => {
      const right: string[] = [];
      const left: string[] = [];
      for (const other of anchors) {
        if (other.root !== anchor.root || other.group === moved) continue;
        const before = compareReal(other.end, anchor.start) <= 0;
        const after = compareReal(anchor.end, other.start) <= 0;
        const there = place.get(other.group) ?? 0;
        if (before && !after && there > at) right.push(other.group);
        else if (after && !before && there < at) left.push(other.group);
      }
      const names = (ids: string[]) =>
        ids
          .sort(byPlace)
          .map((id) => quoted(manifest, id))
          .join(", ");
      const sides = [
        ...(right.length === 0 ? [] : [`right of ${names(right)}`]),
        ...(left.length === 0 ? [] : [`left of ${names(left)}`]),
      ];
      return sides.length === 0
        ? []
        : [
            `${quoted(manifest, moved)} stays ${sides.join(" and ")} on ${quoted(manifest, anchor.root)}`,
          ];
    });
  return clauses.length === 0 ? null : clauses.join("; ");
}

/**
 * The order of `block`'s items as it draws them arranged: for `horizontal`
 * the row core's rules give (`rowOf`; where they refuse it, the item order,
 * as the block is then drawn one item under another), else the item order
 * (`itemOrder`) of the stored order.
 */
export function shownItemOrder(block: Block): readonly string[] {
  const order = block.arrangement?.order ?? [];
  if (block.arrangement?.direction === "horizontal") {
    const row = rowOf(block.manifest, order);
    if ("row" in row) return row.row;
  }
  return itemOrder(block.manifest, order);
}

/**
 * The `set` giving `block` the arrangement `arrangement` (`null` places its
 * items at their places again), `null` when it holds it already. Core stores
 * a horizontal arrangement as the row its rules give, and refuses one they
 * refuse (`arrangement_conflict`).
 */
export function itemArrangementCommand(
  block: Block,
  arrangement: ItemArrangement | null,
): SetCommand | null {
  const was = block.arrangement ?? null;
  if (
    was === arrangement ||
    (was !== null &&
      arrangement !== null &&
      was.direction === arrangement.direction &&
      sameSequence(was.order, arrangement.order))
  ) {
    return null;
  }
  return { type: "set", changes: [{ target: { block: block.id }, values: { arrangement } }] };
}

/** The `set` giving the workspace the arrangement `arrangement` of its blocks, `null` when it holds it. */
export function canvasArrangementCommand(
  view: View,
  arrangement: CanvasArrangement | null,
): SetCommand | null {
  const was = view.arrangement ?? null;
  if (
    was === arrangement ||
    (was !== null &&
      arrangement !== null &&
      was.direction === arrangement.direction &&
      was.columns === arrangement.columns)
  ) {
    return null;
  }
  return { type: "set", changes: [{ target: WORKSPACE, values: { arrangement } }] };
}

/**
 * The `set` putting the block `moved` where `order` (every block of `view`
 * in their order, `moved` at its new place) has it: one new `index` between
 * those of its neighbours there (core's `indexBetween`), the other blocks
 * keeping theirs; `null` when `moved` keeps its place.
 */
export function blockIndexCommand(
  view: View,
  order: readonly BlockId[],
  moved: BlockId,
): SetCommand | null {
  const at = order.indexOf(moved);
  if (at < 0) return null;
  const indexOf = (id: BlockId | undefined) =>
    id === undefined ? null : (view.blocks[id]?.index ?? null);
  const before = indexOf(order[at - 1]);
  const after = indexOf(order[at + 1]);
  const own = view.blocks[moved]?.index;
  if (own === undefined) return null;
  if ((before === null || before < own) && (after === null || own < after)) return null;
  return {
    type: "set",
    changes: [{ target: { block: moved }, values: { index: indexBetween(before, after) } }],
  };
}
