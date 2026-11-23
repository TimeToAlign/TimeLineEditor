/**
 * A raised ancestor card unfolding out of the member card it is aligned
 * to (decision record 0034): the canvas's reading of layout's records into
 * the pure motion of `unfold.ts`.
 */

import type { Manifest } from "@timetoalign/tilie-core";
import { indexOf, samePlaceKey } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox, TextMeasure } from "@timetoalign/tilie-layout";
import { boundsOf, lineAxes } from "@timetoalign/tilie-layout";
import { keyedBox } from "../boxes.ts";
import { pairRows, type Rect, type Row, type RowMotion } from "./unfold.ts";

/**
 * How one raised ancestor card unfolds: its clip opens from `from` to `to`,
 * and the element at an index of `drawing.elements` in the card's range
 * moves by `motionOf(index)`.
 */
export interface CardUnfold {
  readonly from: Rect;
  readonly to: Rect;
  /** The motion of the row an element of the card belongs to; `null` for its own rectangle and shadow, its gaps and their ellipses, or an element of no drawn row. */
  readonly motionOf: (element: number) => RowMotion | null;
}

/** A box's rectangle. */
const rectOf = ({ x, y, width, height }: DrawnBox): Rect => ({ x, y, width, height });

/**
 * How the ancestor card `card` of `drawing` (a box with `ancestor`) unfolds
 * out of the member card it is aligned to, the card of `card.ancestor.member`
 * in the frame of `card.ancestor.group`. The rows: every line layout's
 * `lineAxes` records in each card, keyed by its timeline, the member card's
 * own lines and ancestor lines against the ancestor card's lines
 * (`pairRows`). The clip: from the member card's rectangle to the bounds of
 * everything the ancestor card draws (layout's `boundsOf`), its rectangle
 * moved by its shadow included; from that bound too where the member card
 * is not drawn. An element belongs to the row of the timeline it belongs
 * to (core's `indexOf(…).owners` of its address's ID: the timeline itself,
 * the timeline holding an entry or carrying a named timestamp); the card's
 * own rectangle and its gaps (its elisions, which run from its top to its
 * bottom as the rectangle does) with their ellipses belong to none, while a gap's labels
 * travel with the row of the timeline the elision lies on.
 */
export function raiseUnfold(
  manifest: Manifest,
  drawing: Drawing,
  card: DrawnBox,
  measure: TextMeasure,
): CardUnfold {
  const { ancestor } = card;
  const memberKey =
    ancestor === undefined ? undefined : { item: ancestor.group, member: ancestor.member };
  const from: Row[] = [];
  const to: Row[] = [];
  for (const axis of lineAxes(drawing).values()) {
    const row = { key: axis.timeline, y: axis.y };
    if (axis.ancestor !== undefined && card.key !== null && samePlaceKey(axis.card, card.key)) {
      to.push(row);
    } else if (memberKey !== undefined && axis.ancestor === undefined) {
      if (samePlaceKey(axis.card, memberKey)) from.push(row);
    }
  }
  const motions = pairRows(from, to);
  const { owners } = indexOf(manifest);

  let left = card.x;
  let top = card.y;
  let right = card.x + card.width;
  let bottom = card.y + card.height;
  for (let index = card.range.start; index < card.range.end; index += 1) {
    const element = drawing.elements[index];
    if (element === undefined) continue;
    const bounds = boundsOf(element, measure);
    const shadow =
      element.type === "ancestor_card" && element.style.shadow !== "none"
        ? element.shadowOffset
        : 0;
    left = Math.min(left, bounds.left);
    top = Math.min(top, bounds.top);
    right = Math.max(right, bounds.right + shadow);
    bottom = Math.max(bottom, bounds.bottom + shadow);
  }
  const whole: Rect = { x: left, y: top, width: right - left, height: bottom - top };
  const member = memberKey === undefined ? undefined : keyedBox(drawing, memberKey);

  return {
    from: member === undefined ? whole : rectOf(member),
    to: whole,
    motionOf(index) {
      const element = drawing.elements[index];
      if (
        element === undefined ||
        element.type === "ancestor_card" ||
        element.type === "elision" ||
        element.type === "ellipsis"
      ) {
        return null;
      }
      const id = element.address.id;
      const timeline = id === undefined ? undefined : owners.get(id);
      return timeline === undefined ? null : (motions.get(timeline) ?? null);
    },
  };
}
