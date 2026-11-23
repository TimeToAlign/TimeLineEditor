/**
 * Moving an item (a group's frame or an ungrouped root's card) inside its
 * block, in the bundle editor of its block: freely, or to another place of
 * the block's arrangement where its items are arranged.
 */

import type { PlaceKey, View } from "@timetoalign/tilie-core";
import { inBlock } from "@timetoalign/tilie-core";
import { itemOf } from "../boxes.ts";
import type { GestureStrategy, Point } from "../gesture.ts";
import { itemMoveCommand, itemsMovedWith } from "../items.ts";
import { GRID_FREE, quantize } from "../numbers.ts";
import type { ArrangedPress, ArrangedValue } from "./arranged.ts";
import { arrangedGesture } from "./arranged.ts";
import type { NodeHost } from "./host.ts";
import { previewCommand } from "./host.ts";

/** What an item press holds. */
export interface ItemPress {
  /** The view as stored at the press, which the command is built on. */
  readonly view: View;
  /** The item's place `{x, y}` as drawn at the press. */
  readonly place: Point;
  /** The canvas zoom and the block's scale at the press. */
  readonly zoom: number;
  readonly scale: number;
  /** The pointer's client point at the press. */
  readonly screen: Point;
  /** The other items the drag moves with it, read from the selection as it starts. */
  together: readonly PlaceKey[];
}

/**
 * The item drag of the item `key`. A press is taken while the canvas moves
 * items (`rulesOf(...).move`). When the press becomes a drag, an item in the
 * selection moves with every other item in it by the same travel and leaves
 * the selection as it is (`itemsMovedWith`); an item outside it moves alone
 * and is selected.
 *
 * The item's place moves by the pointer's screen travel since the press,
 * divided by the canvas zoom into canvas units and by the block's scale into
 * drawing units, both as they were at the press, and quantized to
 * `GRID_FREE`. The drawing's screen CTM is not read: an engine lays the
 * `<svg>` out at its own layout unit, so the CTM's scale differs from the
 * zoom times the scale in the last digits, and a whole-pixel travel would
 * not come out as a whole number of units.
 */
export function itemGesture(host: NodeHost, key: PlaceKey): GestureStrategy<ItemPress, Point> {
  const { actions } = host;
  const command = (press: ItemPress, place: Point) =>
    itemMoveCommand(
      press.view,
      host.data().block.id,
      key,
      place.x,
      place.y,
      actions.metrics,
      press.together,
      actions.pane(),
    );
  return {
    moves: true,
    takes(_event, at) {
      if (!actions.rules().move) return null;
      const { block, drawing } = host.data();
      const { x, y } = itemOf(drawing, key).item.place;
      return {
        view: actions.view(),
        place: { x, y },
        zoom: actions.zoom(),
        scale: block.scale,
        screen: at.screen,
        together: [],
      };
    },
    start(press) {
      const { block, drawing, selectedElements } = host.data();
      const moved = itemsMovedWith(block.manifest, drawing, selectedElements, key);
      press.together = moved ?? [];
      if (moved === null) actions.select(inBlock(block.id, itemOf(drawing, key).address));
    },
    value(press, at) {
      const { place, zoom, scale, screen } = press;
      return {
        x: quantize(place.x + (at.screen.x - screen.x) / zoom / scale, GRID_FREE),
        y: quantize(place.y + (at.screen.y - screen.y) / zoom / scale, GRID_FREE),
      };
    },
    preview(press, place) {
      const block = host.data().block.id;
      if (place === null) actions.preview(block, null);
      else previewCommand(actions, block, press.view, command(press, place));
    },
    command,
  };
}

/** A press on an item: a free one's or an arranged one's, each with its strategy's press. */
export type MovedPress =
  | { readonly arranged: false; readonly press: ItemPress }
  | { readonly arranged: true; readonly press: ArrangedPress };

/** Where a pressed item goes: a free place, or a place of the arrangement. */
export type MovedValue =
  | { readonly arranged: false; readonly value: Point }
  | { readonly arranged: true; readonly value: ArrangedValue };

/**
 * The drag of the item `key`, whichever way its block's items lie: the
 * press is the arranged drag's (`arrangedGesture`) while the level's
 * contents are arranged (`rulesOf(...).arranged`), else the free drag's
 * (`itemGesture`), decided at each press, so one attachment serves the
 * item through every change of its block's arrangement.
 */
export function movedItemGesture(
  host: NodeHost,
  key: PlaceKey,
): GestureStrategy<MovedPress, MovedValue> {
  const free = itemGesture(host, key);
  const arranged = arrangedGesture(host, key);
  return {
    moves: true,
    takes(event, at) {
      if (host.actions.rules().arranged !== undefined) {
        const press = arranged.takes(event, at);
        return press === null ? null : { arranged: true, press };
      }
      const press = free.takes(event, at);
      return press === null ? null : { arranged: false, press };
    },
    start(held) {
      if (held.arranged) arranged.start?.(held.press);
      else free.start?.(held.press);
    },
    value(held, at) {
      if (held.arranged) {
        const value = arranged.value(held.press, at);
        return value === null ? null : { arranged: true, value };
      }
      const value = free.value(held.press, at);
      return value === null ? null : { arranged: false, value };
    },
    preview(held, moved) {
      if (held.arranged) {
        arranged.preview(held.press, moved?.arranged === true ? moved.value : null);
      } else {
        free.preview(held.press, moved?.arranged === false ? moved.value : null);
      }
    },
    command(held, moved) {
      if (held.arranged) return moved.arranged ? arranged.command(held.press, moved.value) : null;
      return moved.arranged ? null : free.command(held.press, moved.value);
    },
  };
}
