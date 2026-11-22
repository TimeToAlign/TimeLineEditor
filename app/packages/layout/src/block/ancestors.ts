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
  type OwnerAddress,
  placeKeyText,
  type Real,
  sameAddress,
} from "@timetoalign/tilie-core";
import { type AncestorCard, BLOCK_KEY, elementKey, reachOf } from "@timetoalign/tilie-core/drawing";
import type { DrawnAxis, ElisionExposure } from "../boxes.ts";
import { placedAt, placedAxis } from "../canvas.ts";
import type { Style } from "../cascade.ts";
import { CARD_SPACING, G, K, SHADOW_OFFSET } from "../constants.ts";
import { DEFAULT_VIEW, type DrawnElement } from "../elements.ts";
import {
  ancestorElisions,
  ancestorProportion,
  carriedGaps,
  exposedGap,
  type Stretch,
} from "../elisions.ts";
import { layoutMember, layoutScope, type MemberLayout } from "../member.ts";
import type { TextMeasure } from "../metrics.ts";
import { add, coordinateValue, lengthValue, negate, proportion } from "../numbers.ts";
import { type Context, type Holder, shown, withAxis } from "../traversal.ts";
import { axesOf } from "./axes.ts";
import {
  type Columns,
  columnsOf,
  contentRight,
  type Horizontal,
  horizontalOf,
} from "./horizontal.ts";
import type { ItemDrawing, LaidItem } from "./items.ts";
import type { AlignedRows, Card, Item } from "./places.ts";

/**
 * A displayed ancestor card laid out behind its frame, in that frame's item
 * coordinates: its own rectangle first, then its root's member drawing, and
 * the axes of the lines that drawing draws.
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
  /**
   * The axes of its root's member drawing, in item coordinates and in the order of their
   * elements, each marked with `ancestor` as the card's record is.
   */
  readonly axes: readonly DrawnAxis[];
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
  /** What it decides of its elisions (section 8.9), in its frame's item coordinates. */
  readonly exposure: ElisionExposure;
}

/** The ordinate of the first line element at `address` of `type` among `elements`. */
function lineAt(
  elements: readonly DrawnElement[],
  type: "timeline" | "child" | "ancestor",
  address: OwnerAddress,
): number | undefined {
  for (const element of elements) {
    if (element.type === type && sameAddress(element.address, address)) return element.y;
  }
  return undefined;
}

/** Where an ancestor card lies behind its frame, before its root is laid out (section 8.8). */
interface Behind {
  readonly ancestor: AncestorCard;
  readonly ref: ContainerRef;
  /** Its style, displayed. */
  readonly style: Style;
  /** The frame's item, and the index of the card of the member it is aligned to. */
  readonly item: Item;
  readonly frameAt: number;
  readonly cardAt: number;
  /** `ts` (negated: the offsets from the root down to the member), `λ`, `te`, `xs`, `LA`. */
  readonly below: Real;
  readonly ts: Real;
  readonly lambda: Real;
  readonly te: Real;
  readonly xs: number;
  readonly LA: number;
  /** Its key, `{item: G, member: R}`. */
  readonly key: { readonly item: string; readonly member: string };
}

/**
 * The displayed ancestor cards of the block in the order of section 8.8, at
 * the start `s0` of the block's member drawings: for the ancestor card of the
 * root `R` aligned to the member `M` in the frame `G`, `ts` the start of `R`
 * on `M`'s axis (the offsets from `R` down to `M`, summed and negated), `λ`
 * `M`'s length or reach, `te = ts + λR` (`R`'s length or reach), the
 * proportions `us = ts / λ` and `ue = te / λ`, `xs = s0 + L × us`, `xe = s0 +
 * L × ue` with `L` the frame's length, and `LA = xe − xs`.
 */
function behind(context: Context, block: Holder, items: readonly Item[], s0: number): Behind[] {
  const { manifest, cascade } = context;
  return indexOf(manifest).containers.ancestorCards.flatMap(({ ref, card: ancestor }) => {
    const { group, member, root } = ancestor;
    const R = root.timeline;
    const M = member.timeline;
    const style = cascade.resolve(
      elementKey("ancestor_card", cardAddress(R.id), R, BLOCK_KEY),
      block.style,
    );
    const frameAt = items.findIndex((item) => item.frame !== null && item.key.item === group.id);
    const item = items[frameAt];
    const cardAt = item?.cards.findIndex((card) => card.member.timeline.id === M.id) ?? -1;
    if (item === undefined || cardAt === -1 || !shown(style)) return [];
    let below: Real | undefined;
    for (const each of member.ancestors) {
      const offset = coordinateValue(each.offset, each.timeline.number_type);
      below = below === undefined ? offset : add(below, offset);
    }
    if (below === undefined) return [];
    const ts = negate(below);
    const lambda = lengthValue(M) ?? reachOf(M, manifest);
    const te = add(ts, lengthValue(R) ?? reachOf(R, manifest));
    const L = item.length;
    const xs = s0 + L * proportion(ts, lambda);
    const xe = s0 + L * proportion(te, lambda);
    const key = { item: group.id, member: R.id };
    return [
      { ancestor, ref, style, item, frameAt, cardAt, below, ts, lambda, te, xs, LA: xe - xs, key },
    ];
  });
}

/** `R` laid out alone (section 8.8, step 1): the one ungrouped root of a block of nothing else, at `LA`. */
function alone(context: Context, block: Holder, at: Behind): MemberLayout {
  const laid: Context = { ...context, placement: { ...context.placement, length: at.LA } };
  return layoutMember(laid, at.ancestor.root, block, at.key, CARD_SPACING, 0, null);
}

/** The ordinates of the lines of `R`'s timelines in its drawing alone, by timeline ID (section 8.8, step 1). */
function ordinatesOf(layout: MemberLayout): Map<string, number> {
  const ordinates = new Map<string, number>();
  for (const element of layout.drawAt(0, 0, 0, layout.height).elements) {
    const { id } = element.address;
    if ((element.type === "timeline" || element.type === "child") && id !== undefined) {
      if (!ordinates.has(id)) ordinates.set(id, element.y);
    }
  }
  return ordinates;
}

/**
 * The rows the member cards of the block align on their roots' drawings
 * alone (section 8.3): for every displayed ancestor card whose root's line
 * is drawn and whose target line is drawn in its member's card, at the
 * block's columns `columns`, the ordinates of its root's timelines in its
 * drawing alone, for each member card of that frame below that root; and
 * those drawings alone, by the ancestor card's place key, which
 * `ancestorCards` reads again.
 */
export function alignedRows(
  context: Context,
  block: Holder,
  items: readonly Item[],
  columns: Columns,
): { readonly aligned: AlignedRows; readonly alone: ReadonlyMap<string, MemberLayout> } {
  const aligned = new Map<string, ReadonlyMap<string, number>>();
  const layouts = new Map<string, MemberLayout>();
  for (const at of behind(context, block, items, columns.s0)) {
    const card = at.item.cards[at.cardAt];
    if (card === undefined) continue;
    const R = at.ancestor.root.timeline;
    const drawn = card.layout.drawAt(columns.s0, columns.n, card.top, card.top + card.height);
    const target =
      lineAt(drawn.elements, "ancestor", idAddress(R.id)) ??
      lineAt(drawn.elements, "timeline", idAddress(card.member.timeline.id));
    const layout = alone(context, block, at);
    layouts.set(placeKeyText(at.key), layout);
    if (target === undefined || !layout.scope.rootEntry.drawn) continue;
    const ordinates = ordinatesOf(layout);
    for (const each of at.item.cards) {
      const below = each.member.ancestors[0]?.timeline.id === R.id;
      if (below && each.ref.key !== null) aligned.set(placeKeyText(each.ref.key), ordinates);
    }
  }
  return { aligned, alone: layouts };
}

/**
 * Every displayed ancestor card of the block (section 8.8), frame by frame and
 * by its members' display order, `block` the holder of the block's own
 * elements, `items` the block's items and `drawings` their member drawings at
 * the block's start `s0`, `laidItems` the items laid out. `R` is laid out as
 * the one ungrouped root of a block holding nothing else, at the length `LA`,
 * spacing 4 and margin 0, with the name column `K` and its own start `s0'`,
 * on its elided axis (section 8.9): the gaps carried from its frame, and as
 * its mode chooses its stored card elisions or the elisions it derives at
 * its proportion `r`, which reads the frame as drawn, `L' = L − DG`; its card
 * ends at `Ri + K`. It is moved so that its line starts at `xs + DL`, `DL` the
 * shrinks of the gaps left of `M`'s span, and lies at the ordinate of `R`'s
 * ancestor line in `M`'s card, on whichever side of `M`'s line `R`'s band
 * order puts it (section 8.3), or of `M`'s line where that ancestor line is
 * not displayed. An ancestor card whose style does not display it, or whose
 * line or target ordinate is not drawn, is not drawn. Its lines have axes
 * as any card's (`axesOf` over `R`'s drawing at `s0'` and `LA`), moved with
 * it. `layouts` holds `R` laid out alone, by the card's place key, where it is
 * known.
 */
export function ancestorCards(
  context: Context,
  block: Holder,
  items: readonly Item[],
  drawings: readonly ItemDrawing[],
  laidItems: readonly LaidItem[],
  horizontal: Horizontal,
  measure: TextMeasure,
  layouts: ReadonlyMap<string, MemberLayout>,
): LaidAncestorCard[] {
  const { manifest, placement } = context;
  return behind(context, block, items, horizontal.s0).flatMap((at): LaidAncestorCard[] => {
    const { ancestor, ref, style, item, frameAt, cardAt, below, ts, lambda, te, xs, LA, key } = at;
    const { group, member, root } = ancestor;
    const R = root.timeline;
    const M = member.timeline;
    const address = cardAddress(R.id);
    const drawn = drawings[frameAt]?.drawn[cardAt];
    if (drawn === undefined) return [];
    const target =
      lineAt(drawn.elements, "ancestor", idAddress(R.id)) ??
      lineAt(drawn.elements, "timeline", idAddress(M.id));
    if (target === undefined) return [];
    const first = layouts.get(placeKeyText(key)) ?? alone(context, block, at);
    const frame = laidItems[frameAt]?.boxes.find((box) => box.kind === "frame");
    if (frame === undefined) return [];

    // Its elisions (section 8.9): the gaps carried from its frame, then by its mode its stored card
    // elisions or the derived ones, none in `M`'s span, the protected span.
    const L = item.length;
    const protect: Stretch = [below, add(below, lambda)];
    const chain = member.ancestors.map((each) => each.timeline.id);
    const elisions = ancestorElisions(
      first.scope,
      style,
      protect,
      chain,
      carriedGaps(item.elisions, ts, lambda),
      () => {
        const widest = first.names.length === 0 ? 0 : Math.max(...first.names);
        return ancestorProportion({
          view: placement.view ?? DEFAULT_VIEW,
          scale: item.scale,
          L,
          drawnLength: L - item.DG,
          x0: horizontal.s0,
          width: frame.width,
          height: frame.height,
          sigma: K + widest + (first.names.length === 0 ? 0 : G),
          lambda,
          EL: below,
          ER: add(te, negate(lambda)),
        });
      },
    );
    const elided = elisions.axis;
    const layout =
      elided === undefined ? first : layoutScope(withAxis(first.scope, elided), key, undefined);
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
      mode: elisions.mode,
    };
    const aloneItem: Item = {
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
      content: layout.height,
      elisions: undefined,
      DG: 0,
    };
    const columns = columnsOf([aloneItem]);
    const own = layout.drawAt(columns.s0, columns.n, 0, layout.height);
    const right =
      contentRight(
        horizontalOf(columns, [aloneItem], [{ elements: own.elements, L: LA }], measure),
        LA,
      ) + K;
    const line = lineAt(own.elements, "timeline", idAddress(R.id));
    if (line === undefined) return [];
    // `R`'s line starts at `xs` plus the shrinks of the gaps left of `M`'s span.
    const DL = elided === undefined ? 0 : elided.shrinkBefore(below);
    const dx = xs + DL - columns.s0;
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
    const marked = { group: group.id, member: M.id };
    const axes = axesOf(manifest, root, key, own, columns.s0, LA, elided).map(
      (axis): DrawnAxis => ({ ...placedAxis(axis, dx, dy), ancestor: marked }),
    );
    const x0 = dx + columns.s0;
    return [
      {
        ref,
        group: group.id,
        member: M.id,
        item,
        elements: [rectangle, ...own.elements.map((element) => placedAt(element, dx, dy))],
        axes,
        x: dx,
        y: dy,
        width: right,
        height: layout.height,
        contentCount: layout.contentCount,
        rights: [dx + right + shadow],
        bottoms: [dy + layout.height + shadow],
        exposure: {
          kind: "ancestor_card",
          key,
          address,
          mode: style["elision-mode"],
          drawn: elisions.mode,
          proportion: elisions.proportion,
          automatic: elisions.automatic,
          chain,
          depths: elisions.depths,
          display: elisions.display,
          gaps: (elided?.gaps ?? []).map((gap) =>
            exposedGap(gap, x0 + gap.left, x0 + gap.right, []),
          ),
          runs: elided?.runs ?? [{ u0: 0, u1: 1, L: LA, D: 0 }],
          x0,
          place: { x: item.x, y: item.y, scale: item.scale },
        },
      },
    ];
  });
}
