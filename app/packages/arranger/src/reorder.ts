/**
 * Reordering a group's member cards: where a dragged card drops, the
 * manifest drawn with the order a drop would give, and the `set` storing it.
 * Only the display order changes; members are never placed (`docs/drawing.md`
 * in timeskeleton, sections 8.1 and 8.6).
 */

import type { Block, Manifest, SetCommand } from "@timetoalign/tilie-core";
import type { Drawing, RectElement } from "@timetoalign/tilie-layout";

/**
 * The member cards of `group`'s frame in drawing order, the group's display
 * order: the cards drawn after the frame and before the next item, another
 * frame or an ungrouped root's card (section 8.5). Items may overlap, so
 * the frame's rectangle does not decide.
 */
function memberCards(drawing: Drawing, group: string): RectElement[] {
  const start = drawing.elements.findIndex(
    (element) => element.type === "group" && element.address === group,
  );
  if (start < 0) throw new RangeError(`${group} is no frame of the drawing`);
  const items = new Set(drawing.items.map((item) => item.address));
  const cards: RectElement[] = [];
  for (const element of drawing.elements.slice(start + 1)) {
    if (element.address !== null && items.has(element.address)) break;
    if (element.type === "card") cards.push(element);
  }
  return cards;
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
    .map((card) => ({
      id: card.address.slice(0, -"/card".length),
      middle: card.y + card.height / 2,
    }))
    .filter((card) => card.id !== dragged);
  const at = others.findIndex((card) => card.middle > y);
  const order = others.map((card) => card.id);
  order.splice(at < 0 ? order.length : at, 0, dragged);
  return order;
}

/** The display order of `group` in `manifest`: its `graphical.order` entry, else its members. */
function displayOrder(manifest: Manifest, group: string): readonly string[] {
  const stated = manifest.graphical?.order?.[group];
  if (stated !== undefined) return stated;
  const found = manifest.groups.find((candidate) => candidate.id === group);
  if (found === undefined) throw new RangeError(`${group} is no group of the manifest`);
  return found.members;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

/**
 * `manifest` with `order` as the display order of `group`, as the preview of
 * a drop draws it; every other member of the manifest is kept.
 */
export function withMemberOrder(
  manifest: Manifest,
  group: string,
  order: readonly string[],
): Manifest {
  const graphical = manifest.graphical ?? {};
  return {
    ...manifest,
    graphical: { ...graphical, order: { ...graphical.order, [group]: [...order] } },
  };
}

/**
 * The `set` giving `group` of `block` the display order `order`, `null` when
 * it is the order already displayed. An order equal to the group's
 * `members` deletes the group's entry (`order: null`) instead of repeating
 * them.
 */
export function reorderCommand(
  block: Block,
  group: string,
  order: readonly string[],
): SetCommand | null {
  if (sameOrder(displayOrder(block.manifest, group), order)) return null;
  const members = block.manifest.groups.find((candidate) => candidate.id === group)?.members ?? [];
  const value = sameOrder(members, order) ? null : [...order];
  return { type: "set", changes: [{ target: `${block.id}/${group}`, values: { order: value } }] };
}
