/**
 * The ancestor cards of a block (`docs/drawing.md` in TimeToShare, section
 * 8.8): the root of a member that is a child timeline, drawn whole behind
 * the frame of that member's group at the proportions of its own axis, its
 * line continuing the member's ancestor line of it. An ancestor card takes
 * no room: no item moves for it and the block's one horizontal layout does
 * not count it.
 */

import {
  type ContainerRef,
  cardAddress,
  idAddress,
  indexOf,
  type Real,
  sameAddress,
} from "@timetoalign/tilie-core";
import { BLOCK_KEY, elementKey, memberDrawings } from "@timetoalign/tilie-core/drawing";
import { placedAt } from "../canvas.ts";
import { CARD_SPACING, K, SHADOW_OFFSET } from "../constants.ts";
import type { DrawnElement } from "../elements.ts";
import { layoutMember } from "../member.ts";
import type { TextMeasure } from "../metrics.ts";
import { add, coordinateValue, lengthValue, negate, proportion, reachOf } from "../numbers.ts";
import { type Context, type Holder, shown } from "../traversal.ts";
import { columnsOf, contentRight, type Horizontal, horizontalOf } from "./horizontal.ts";
import type { ItemDrawing } from "./items.ts";
import type { Card, Item } from "./places.ts";

/**
 * A displayed ancestor card laid out behind its frame, in that frame's item
 * coordinates: its own rectangle first, then its root's member drawing.
 */
export interface LaidAncestorCard {
  /** Its container as core lists it. */
  readonly ref: ContainerRef;
  /** The group whose frame it lies behind and the member it is aligned to. */
  readonly group: string;
  readonly member: string;
  /** The frame it lies behind, whose place and scale it is drawn at. */
  readonly item: Item;
  readonly elements: readonly DrawnElement[];
  /** Its rectangle in item coordinates. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The number of its contents: its root's row and its root's present bands. */
  readonly contentCount: number;
  /** The right and bottom edges it draws, its shadow included, for the block's size. */
  readonly rights: readonly number[];
  readonly bottoms: readonly number[];
}

/** The ordinate of the first line element at `address` of `type` among `elements`. */
function lineAt(
  elements: readonly DrawnElement[],
  type: "timeline" | "ancestor",
  address: ReturnType<typeof idAddress>,
): number | undefined {
  for (const element of elements) {
    if (element.type === type && sameAddress(element.address, address)) return element.y;
  }
  return undefined;
}

/**
 * Every displayed ancestor card of the block (section 8.8), frame by frame and
 * by its members' display order, `block` the holder of the block's own
 * elements, `items` the block's items and `drawings` their member drawings at
 * the block's start `s0`. For the ancestor card of the root `R` aligned to
 * the member `M` in the frame `G`: `ts` the start of `R` on `M`'s axis (the
 * offsets from `R` down to `M`, summed and negated), `λ` `M`'s length or
 * reach, `te = ts + λR` (`R`'s length or reach), the proportions `us = ts /
 * λ` and `ue = te / λ`, `xs = s0 + L × us`, `xe = s0 + L × ue` with `L` the
 * frame's length. `R` is laid out as the one ungrouped root of a block
 * holding nothing else, at the length `LA = xe − xs`, spacing 4 and margin
 * 0, with the name column `K` and its own start `s0'`; its card ends at
 * `Ri + K`. It is moved so that its line starts at `xs` and lies at the
 * ordinate of `R`'s ancestor line in `M`'s card, or of `M`'s line where that
 * ancestor line is not displayed. An ancestor card whose style does not
 * display it, or whose line or target ordinate is not drawn, is not drawn.
 */
export function ancestorCards(
  context: Context,
  block: Holder,
  items: readonly Item[],
  drawings: readonly ItemDrawing[],
  horizontal: Horizontal,
  measure: TextMeasure,
): LaidAncestorCard[] {
  const { manifest, placement, cascade } = context;
  const refs = indexOf(manifest).containers.ancestorCards;
  return memberDrawings(manifest).ancestorCards.flatMap(({ group, member, root }, index) => {
    const ref = refs[index];
    const R = root.timeline;
    const M = member.timeline;
    const address = cardAddress(R.id);
    const style = cascade.resolve(elementKey("ancestor_card", address, R, BLOCK_KEY), block.style);
    const frameAt = items.findIndex((item) => item.frame !== null && item.key.item === group.id);
    const item = items[frameAt];
    const cardAt = item?.cards.findIndex((card) => card.member.timeline.id === M.id) ?? -1;
    const drawn = drawings[frameAt]?.drawn[cardAt];
    if (ref === undefined || item === undefined || drawn === undefined || !shown(style)) return [];
    const target =
      lineAt(drawn.elements, "ancestor", idAddress(R.id)) ??
      lineAt(drawn.elements, "timeline", idAddress(M.id));
    if (target === undefined) return [];

    // The span of `R` on `M`'s axis and its abscissas in the frame (sections 3.2 and 8.3).
    let below: Real | undefined;
    for (const ancestor of member.ancestors) {
      const offset = coordinateValue(ancestor.offset, ancestor.timeline.number_type);
      below = below === undefined ? offset : add(below, offset);
    }
    if (below === undefined) return [];
    const ts = negate(below);
    const lambda = lengthValue(M) ?? reachOf(M, manifest);
    const te = add(ts, lengthValue(R) ?? reachOf(R, manifest));
    const L = item.length;
    const xs = horizontal.s0 + L * proportion(ts, lambda);
    const xe = horizontal.s0 + L * proportion(te, lambda);
    const LA = xe - xs;

    // `R` alone, as a block's one ungrouped root (sections 3 to 6, 8.2 and 8.4).
    const laid: Context = { ...context, placement: { ...placement, length: LA } };
    const key = ref.key ?? { item: group.id, member: R.id };
    const layout = layoutMember(laid, root, block, key, CARD_SPACING, 0);
    const card: Card = {
      member: root,
      ref,
      address,
      style,
      stated: {},
      spacing: CARD_SPACING,
      margin: 0,
      top: 0,
      height: layout.height,
      layout,
    };
    const alone: Item = {
      key,
      frame: null,
      stated: {},
      x: 0,
      y: 0,
      length: LA,
      scale: 1,
      spacing: CARD_SPACING,
      margin: 0,
      height: layout.height,
      cards: [card],
    };
    const columns = columnsOf([alone]);
    const own = layout.drawAt(columns.s0, columns.n, 0);
    const right =
      contentRight(
        horizontalOf(columns, [alone], [{ elements: own.elements, L: LA }], measure),
        LA,
      ) + K;
    const line = lineAt(own.elements, "timeline", idAddress(R.id));
    if (line === undefined) return [];
    const dx = xs - columns.s0;
    const dy = target - line;
    const rectangle: DrawnElement = {
      type: "ancestor_card",
      address,
      style,
      x: dx,
      y: dy,
      width: right,
      height: layout.height,
      shadowOffset: SHADOW_OFFSET,
    };
    const shadow = style.shadow === "none" ? 0 : SHADOW_OFFSET;
    return [
      {
        ref,
        group: group.id,
        member: M.id,
        item,
        elements: [rectangle, ...own.elements.map((element) => placedAt(element, dx, dy))],
        x: dx,
        y: dy,
        width: right,
        height: layout.height,
        contentCount: layout.contentCount,
        rights: [dx + right + shadow],
        bottoms: [dy + layout.height + shadow],
      },
    ];
  });
}
