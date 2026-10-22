/**
 * Reordering the cards a frame holds: a group's member cards, dragged in
 * the group editor of that group.
 */

import type { PlaceKey, View } from "@timetoalign/tilie-core";
import { cardAddress, inBlock } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { keyedBox } from "../boxes.ts";
import { drawingOf } from "../drawing.ts";
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
  /** The pointer's travel last shown, where the copy of the card lies; `null` before the first. */
  offset: Point | null;
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
  card: PlaceKey,
): readonly Descriptor[] {
  const box = keyedBox(drawing, card);
  if (box === undefined) return [];
  const { start, end } = box.range;
  return descriptors.filter(({ source }) => source.element >= start && source.element < end);
}

/** The motion of a released card's copy, in the drawing's units: from its travel at the drop to its card's place. */
export interface ReleaseMotion {
  /** Where the copy lies when the gesture ends: the pointer's travel since the press. */
  readonly from: Point;
  /** Where its card is drawn once the gesture has ended, as a travel from the card's place at the press. */
  readonly to: Point;
}

/**
 * How the copy of `card`, dragged by `offset` from where `pressed` (the
 * drawing at the press) draws it, moves once the gesture ends: from that
 * travel to the card's place in `shown`, the drawing shown after it (its
 * new place after a reorder stored, its old one after Escape, a release in
 * place or a refusal). `null` where `shown` draws no such card, or the copy
 * already lies there.
 */
export function releaseMotion(
  pressed: Drawing,
  shown: Drawing,
  card: PlaceKey,
  offset: Point,
): ReleaseMotion | null {
  const before = keyedBox(pressed, card);
  const after = keyedBox(shown, card);
  if (before === undefined || after === undefined) return null;
  const to = { x: after.x - before.x, y: after.y - before.y };
  return to.x === offset.x && to.y === offset.y ? null : { from: offset, to };
}

/**
 * The drag of the card of `member` held by the frame of `group`. A press is
 * taken while the canvas reorders cards (`rulesOf(...).reorder`); the press
 * that becomes a drag selects the card. The order follows the pointer's
 * drawing point through the drawing as stored at the press
 * (`memberOrderAt`); the other cards slide apart in the preview while a copy
 * of the dragged card's drawing follows the pointer, the card itself left
 * hidden where it would drop. The release stores the order in one `set`
 * (`reorderCommand`), nothing for a release in place. However the gesture
 * ends, the copy then moves from where it was dropped to where its card is
 * drawn (`releaseMotion`), the card hidden until it arrives; at once under
 * reduced motion.
 */
export function heldGesture(
  host: NodeHost,
  group: string,
  member: string,
): GestureStrategy<HeldPress, HeldValue> {
  const { actions } = host;
  const card: PlaceKey = { item: group, member };
  const blockOf = (press: HeldPress) => {
    const block = press.view.blocks[host.data().block.id];
    if (block === undefined)
      throw new RangeError(`${host.data().block.id} is no block of the view`);
    return block;
  };
  return {
    moves: true,
    takes(_event, at) {
      if (!actions.rules().reorder) return null;
      const { drawing, descriptors } = host.data();
      return {
        view: actions.view(),
        drawing,
        ghost: cardDrawing(drawing, descriptors, card),
        at: at.drawing,
        shown: null,
        offset: null,
      };
    },
    start() {
      actions.select(inBlock(host.data().block.id, cardAddress(member)));
    },
    value(press, at) {
      return {
        order: memberOrderAt(blockOf(press).manifest, press.drawing, group, member, at.drawing.y),
        offset: { x: at.drawing.x - press.at.x, y: at.drawing.y - press.at.y },
      };
    },
    preview(press, value) {
      const block = host.data().block.id;
      if (value === null) {
        const dropped = press.offset;
        press.shown = null;
        press.offset = null;
        actions.preview(block, null);
        const view = actions.view();
        const stored = view.blocks[block];
        const motion =
          dropped === null || stored === undefined || actions.reducedMotion()
            ? null
            : releaseMotion(
                press.drawing,
                drawingOf(stored, view.settings, actions.metrics),
                card,
                dropped,
              );
        host.ghost(
          motion === null
            ? null
            : { card, descriptors: press.ghost, offset: motion.from, to: motion.to },
        );
        host.slide(false);
        return;
      }
      press.offset = value.offset;
      host.ghost({ card, descriptors: press.ghost, offset: value.offset, to: null });
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
