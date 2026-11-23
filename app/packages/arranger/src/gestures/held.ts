/**
 * Reordering the cards a frame holds: a group's member cards, dragged in
 * the group editor of that group.
 */

import type { Manifest, PlaceKey, View } from "@timetoalign/tilie-core";
import { cardAddress, inBlock } from "@timetoalign/tilie-core";
import { anchorChange, anchorsOf } from "@timetoalign/tilie-core/drawing";
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

/**
 * Where a held card drops (the display order of its group), how far the
 * pointer has travelled, and why the drop is refused (`heldRefusal`), else
 * `null`.
 */
export interface HeldValue {
  readonly order: readonly string[];
  readonly offset: Point;
  readonly refused: string | null;
}

/** Whether `drawing` draws its block's items side by side, its roots drawn once behind the row. */
function sideBySide(drawing: Drawing): boolean {
  const { arrangement } = drawing;
  return arrangement?.direction === "horizontal" && arrangement.refused === undefined;
}

/**
 * Whether the card of `member` in `group`'s frame is pinned where `drawing`
 * draws the block's items side by side: the member anchors its group on a
 * root drawn once behind the row (core's `anchorsOf`), so the roots' order
 * stays the groups' (the drawing specification's "Drawn once"). A press on
 * it is not taken.
 */
export function isPinned(
  manifest: Manifest,
  drawing: Drawing,
  group: string,
  member: string,
): boolean {
  return (
    sideBySide(drawing) &&
    anchorsOf(manifest).some((anchor) => anchor.group === group && anchor.member === member)
  );
}

/**
 * Why `group` may not take the display order `order` where `drawing` draws
 * the block's items side by side: the order would change one of its anchors
 * (core's `anchorChange`); `null` where it may, and wherever the items are
 * not side by side.
 */
export function heldRefusal(
  manifest: Manifest,
  drawing: Drawing,
  group: string,
  order: readonly string[],
): string | null {
  return sideBySide(drawing) ? anchorChange(manifest, group, order) : null;
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

/** What a reorder's copy needs once its gesture has ended. */
export interface Dropped {
  /** The view as stored at the press. */
  readonly view: View;
  /** The drawing at the press. */
  readonly drawing: Drawing;
  /** The copy's descriptors. */
  readonly ghost: readonly Descriptor[];
  /** The copy's travel at the drop; `null` where it never moved. */
  readonly offset: Point | null;
}

/**
 * The end of a reorder of the content `key` (a held card, an arranged item)
 * of the node `host`: the preview withdrawn, and the copy moving from where
 * it was dropped to where the drawing stored after the gesture draws its
 * content (`releaseMotion`), at once under reduced motion; the slide ends.
 */
export function endReorder(host: NodeHost, key: PlaceKey, dropped: Dropped): void {
  const { actions } = host;
  const block = host.data().block.id;
  actions.preview(block, null);
  const view = actions.view();
  const stored = view.blocks[block];
  const motion =
    dropped.offset === null || stored === undefined || actions.reducedMotion()
      ? null
      : releaseMotion(
          dropped.drawing,
          drawingOf(stored, view.graphical, actions.metrics, undefined, actions.pane()),
          key,
          dropped.offset,
        );
  host.ghost(
    motion === null
      ? null
      : { card: key, descriptors: dropped.ghost, offset: motion.from, to: motion.to },
  );
  host.slide(false);
}

/**
 * The drag of the card of `member` held by the frame of `group`. A press is
 * taken while the canvas reorders cards (`rulesOf(...).reorder`), except on
 * a pinned card (`isPinned`); the press that becomes a drag selects the
 * card. A drop the arrangement refuses (`heldRefusal`) previews the stored
 * order, stores nothing and shows its reason (`NodeActions.refuse`). The order follows the pointer's
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
      const { block, drawing, descriptors } = host.data();
      if (isPinned(block.manifest, drawing, group, member)) return null;
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
      const { manifest } = blockOf(press);
      const order = memberOrderAt(manifest, press.drawing, group, member, at.drawing.y);
      return {
        order,
        offset: { x: at.drawing.x - press.at.x, y: at.drawing.y - press.at.y },
        refused: heldRefusal(manifest, press.drawing, group, order),
      };
    },
    preview(press, value) {
      const block = host.data().block.id;
      if (value === null) {
        const offset = press.offset;
        press.shown = null;
        press.offset = null;
        endReorder(host, card, { ...press, offset });
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
        value.refused === null ? reorderCommand(blockOf(press), group, value.order) : null,
      );
    },
    command(press, value) {
      if (value.refused === null) return reorderCommand(blockOf(press), group, value.order);
      actions.refuse?.(value.refused);
      return null;
    },
  };
}
