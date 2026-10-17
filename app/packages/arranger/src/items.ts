/**
 * The items of a block's box, its groups' frames and its ungrouped roots'
 * cards (`docs/drawing.md` in timeskeleton, section 8.6), moved and resized
 * by stating their places. Every gesture is one `set` of the `place` of each
 * item it touches.
 */

import type {
  Block,
  BlockId,
  Change,
  EditorKind,
  Place,
  SetCommand,
  View,
  WorkspaceSettings,
} from "@timetoalign/tilie-core";
import { PLACE_MEMBERS } from "@timetoalign/tilie-core";
import type { Drawing, DrawnItem } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import { drawingOf } from "./drawing.ts";
import { GRID_FREE, MIN_LENGTH, quantize } from "./numbers.ts";
import type { Delta, Handle } from "./resize.ts";
import { ALL_HANDLES, kept, SIDES, solve } from "./resize.ts";

/** The ways an item is resized: its box (`width`, `height`) or its stretch (`length`). */
export type ItemResizeMode = "box" | "stretch";

/** Members of a place to set: a number states the member, `null` unstates it. */
export type PlaceValues = { -readonly [member in keyof Place]?: number | null };

const STRETCH_HANDLES: readonly Handle[] = ["right", "left"];
const MEMBERS_HANDLES: readonly Handle[] = ["right"];

/**
 * The handles an item offers in `mode` in the editor `editor`: all eight to
 * size its box; to stretch, its left and right edges, and in the group
 * editor, whose frame stays where it is, its right edge alone.
 */
export function itemHandlesFor(mode: ItemResizeMode, editor: EditorKind): readonly Handle[] {
  if (mode === "box") return ALL_HANDLES;
  return editor === "group" ? MEMBERS_HANDLES : STRETCH_HANDLES;
}

/** The drawn item `key` of `drawing`. */
export function itemOf(drawing: Drawing, key: string): DrawnItem {
  const item = drawing.items.find((drawn) => drawn.key === key);
  if (item === undefined) throw new RangeError(`${key} is no item of the drawing`);
  return item;
}

/** `places` with `values` merged into the place of `key`: a number states, `null` unstates. */
export function placesWith(
  places: Block["places"],
  key: string,
  values: PlaceValues,
): Block["places"] {
  const place: { -readonly [member in keyof Place]?: number } = { ...places[key] };
  for (const member of PLACE_MEMBERS) {
    const value = values[member];
    if (value === null) delete place[member];
    else if (value !== undefined) place[member] = value;
  }
  const { [key]: _, ...others } = places;
  return Object.keys(place).length === 0 ? others : { ...others, [key]: place };
}

/**
 * The places of `block` after `command`, a `set` of item places as the
 * functions below build it: the preview of a gesture, drawn exactly as
 * applying the command would draw it.
 */
export function placesAfter(block: Block, command: SetCommand): Block["places"] {
  let places = block.places;
  for (const { target, values } of command.changes) {
    if (!target.startsWith(`${block.id}/`) || values.place === undefined) continue;
    places = placesWith(places, target.slice(block.id.length + 1), values.place as PlaceValues);
  }
  return places;
}

/**
 * One `set` of the place of `key`, and in the bundle editor, where items lie
 * freely, the drawn `x` and `y` of every other item that does not state
 * them, so that no other item moves when the defaults would place it anew
 * (an item below another follows its bottom edge unless it states its `y`).
 */
function placeCommand(
  block: BlockId,
  drawing: Drawing,
  key: string,
  values: PlaceValues,
  editor: EditorKind,
): SetCommand {
  const changes: Change[] = [{ target: `${block}/${key}`, values: { place: values } }];
  if (editor === "bundle") {
    for (const item of drawing.items) {
      if (item.key === key) continue;
      const place: PlaceValues = {};
      if (item.stated.x === undefined) place.x = item.place.x;
      if (item.stated.y === undefined) place.y = item.place.y;
      if (Object.keys(place).length > 0) {
        changes.push({ target: `${block}/${item.key}`, values: { place } });
      }
    }
  }
  return { type: "set", changes };
}

function blockIn(view: View, id: BlockId): Block {
  const block = view.blocks[id];
  if (block === undefined) throw new RangeError(`${id} is no block of the view`);
  return block;
}

/**
 * The `set` that moves the item `key` of block `block` to the place
 * position `x`, `y` (in the drawing's units, measured from the place origin,
 * quantized to `GRID_FREE`), stating the drawn position of every other item
 * that states none (the bundle editor's rule, `placeCommand`). `null` when
 * the item would stay where it is drawn.
 */
export function itemMoveCommand(
  view: View,
  block: BlockId,
  key: string,
  x: number,
  y: number,
  metrics: FontMetrics,
): SetCommand | null {
  const found = blockIn(view, block);
  const drawing = drawingOf(found, view.settings, metrics);
  const { place } = itemOf(drawing, key);
  const to = { x: quantize(x, GRID_FREE), y: quantize(y, GRID_FREE) };
  if (to.x === place.x && to.y === place.y) return null;
  return placeCommand(block, drawing, key, to, "bundle");
}

/**
 * The `set` storing an item resize's `values` (`itemResizeValues`) made in
 * the editor `editor`; in the bundle editor it also states the drawn
 * position of every other item that states none (`placeCommand`). `null`
 * when every value is the one the item states already.
 */
export function itemResizeCommand(
  view: View,
  block: BlockId,
  key: string,
  values: PlaceValues,
  editor: EditorKind,
  metrics: FontMetrics,
): SetCommand | null {
  const found = blockIn(view, block);
  const stated = found.places[key] ?? {};
  const changes = PLACE_MEMBERS.some(
    (member) => values[member] !== undefined && values[member] !== (stated[member] ?? null),
  );
  if (!changes) return null;
  const drawing = drawingOf(found, view.settings, metrics);
  return placeCommand(block, drawing, key, values, editor);
}

/**
 * The place values that resize the item `key` of `block` by dragging
 * `handle` by `delta` (canvas units, as for a block) in the editor
 * `editor`: the dragged edge ends under the pointer and the opposite edge
 * stays exactly where it is drawn. Every number is in the drawing's units,
 * measured from the place origin, and quantized to `GRID_FREE`; for a left
 * or top handle the stated `x` or `y` is the opposite edge less the achieved
 * size.
 *
 * - `box` sets `width` and `height`; a request at or below the item's own
 *   extent stores `null`, its content's size.
 * - `stretch` (left and right only) sets `length`: the largest value whose
 *   content does not pass the pointer, floored at `MIN_LENGTH`, the width
 *   following the content as a block's does (a request larger than the
 *   content keeps the space it adds, one at or below it becomes `null`).
 * - In the group editor the frame does not adapt: a stretch (right only)
 *   sets `length` and pins `width` at the frame's drawn width, the length
 *   capped where the cards would pass the frame.
 */
export function itemResizeValues(
  block: Block,
  settings: WorkspaceSettings,
  metrics: FontMetrics,
  editor: EditorKind,
  key: string,
  mode: ItemResizeMode,
  handle: Handle,
  delta: Delta,
): PlaceValues {
  const [sx, sy] = SIDES[handle];
  if (!itemHandlesFor(mode, editor).includes(handle)) {
    throw new RangeError(`an item does not ${mode} from ${handle} in the ${editor} editor`);
  }
  const item = itemOf(drawingOf(block, settings, metrics), key);
  const { x, y, width, height } = item.place;
  const dx = delta.dx / block.scale;
  const dy = delta.dy / block.scale;
  const right = x + width;
  const bottom = y + height;
  const left = sx < 0 ? quantize(x + dx, GRID_FREE) : x;
  const top = sy < 0 ? quantize(y + dy, GRID_FREE) : y;
  const free = (length: number) => {
    const values = { length, width: null, height: null };
    const places = placesWith(block.places, key, values);
    return itemOf(drawingOf(block, settings, metrics, { places }), key).place;
  };
  const content = free(item.place.length);
  const values: PlaceValues = {};
  if (mode === "box") {
    let achieved = { width, height };
    if (sx !== 0) {
      const request = quantize((sx > 0 ? right + dx : right) - left, GRID_FREE);
      values.width = request > content.width ? request : null;
      achieved = { ...achieved, width: values.width ?? content.width };
    }
    if (sy !== 0) {
      const request = quantize((sy > 0 ? bottom + dy : bottom) - top, GRID_FREE);
      values.height = request > content.height ? request : null;
      achieved = { ...achieved, height: values.height ?? content.height };
    }
    if (sx < 0) values.x = quantize(right - achieved.width, GRID_FREE);
    if (sy < 0) values.y = quantize(bottom - achieved.height, GRID_FREE);
    return values;
  }
  const widthAt = (length: number) => free(length).width;
  if (editor === "group") {
    const pinned = quantize(width, GRID_FREE);
    const wanted = Math.min(content.width + dx, pinned);
    values.length = solve(widthAt, item.place.length, wanted, MIN_LENGTH);
    values.width = pinned;
    return values;
  }
  const wanted = (sx > 0 ? right + dx : right) - left - (width - content.width);
  const length = solve(widthAt, item.place.length, wanted, MIN_LENGTH);
  values.length = length;
  const stretched = widthAt(length);
  const stated = item.stated.width ?? null;
  const request = kept(stated, content.width, stretched);
  if (request !== stated) values.width = request;
  if (sx < 0) values.x = quantize(right - Math.max(stretched, request ?? 0), GRID_FREE);
  return values;
}
