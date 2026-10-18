/**
 * The items of a block's box, its groups' frames and its ungrouped roots'
 * cards, and its members' cards (`docs/drawing.md` in timeskeleton, section
 * 8.6), moved and resized by stating their places. Every gesture is one `set`
 * of the `place` of each item or card it touches.
 */

import type {
  Block,
  BlockId,
  Change,
  Place,
  SetCommand,
  View,
  WorkspaceSettings,
} from "@timetoalign/tilie-core";
import { PLACE_MEMBERS } from "@timetoalign/tilie-core";
import type { Drawing, DrawnCard, DrawnItem, RectElement } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import { drawingOf } from "./drawing.ts";
import type { Level } from "./editors.ts";
import { RESIZING } from "./editors.ts";
import type { ResizedItem } from "./gestures.svelte.ts";
import { GRID_FREE, MIN_LENGTH, MIN_SCALE, quantize } from "./numbers.ts";
import type { Delta, Handle, ResizeMode } from "./resize.ts";
import { handlesFor, kept, SIDES, solve } from "./resize.ts";

/** Members of a place to set: a number states the member, `null` unstates it. */
export type PlaceValues = { -readonly [member in keyof Place]?: number | null };

const STRETCH_HANDLES: readonly Handle[] = ["right", "left"];
const RIGHT: readonly Handle[] = ["right"];
const MEMBER_HANDLES: { readonly [mode in ResizeMode]: readonly Handle[] } = {
  scale: ["bottom-right"],
  box: ["right", "bottom-right", "bottom"],
  stretch: RIGHT,
};

/**
 * The handles a box of kind `kind` offers in `mode` at `level`. A frame or
 * an ungrouped card offers a block's: the corners to scale, all eight to size
 * its box, and its left and right edges to stretch, its right edge alone in
 * the group editor, where the frame stays where it is. A member's card never
 * moves its top left corner, which its frame decides: it scales from its
 * bottom right corner, sizes its box from its right and bottom edges, and
 * stretches from its right edge.
 */
export function itemHandlesFor(
  mode: ResizeMode,
  kind: ResizedItem["kind"],
  level: Level,
): readonly Handle[] {
  if (kind === "member") return MEMBER_HANDLES[mode];
  if (mode !== "stretch") return handlesFor(mode);
  return level === "group" ? RIGHT : STRETCH_HANDLES;
}

/**
 * The box of the drawing at element address `element` that a resize acts
 * on: a group's frame (`G`), an ungrouped root's card (`U/card`) or a member's
 * card (`M/card`, in the first frame drawing it); `undefined` for any other
 * address.
 */
export function resizedItemOf(drawing: Drawing, element: string): ResizedItem | undefined {
  const item = drawing.items.find((drawn) => drawn.address === element);
  if (item !== undefined) {
    return { kind: item.kind === "group" ? "frame" : "card", key: item.key, item: item.key };
  }
  const card = drawing.cards.find((drawn) => drawn.address === element);
  return card === undefined ? undefined : { kind: "member", key: card.key, item: card.group };
}

/** The key of `places` a resize of `resized` in `mode` sets: the item's, or the member card's own. */
export function placeKeyOf(resized: ResizedItem, mode: ResizeMode): string {
  return RESIZING[resized.kind].writes[mode] === "card" ? resized.key : resized.item;
}

/** The drawn item `key` of `drawing`. */
export function itemOf(drawing: Drawing, key: string): DrawnItem {
  const item = drawing.items.find((drawn) => drawn.key === key);
  if (item === undefined) throw new RangeError(`${key} is no item of the drawing`);
  return item;
}

/** The card of member `key` that the frame of `group` holds in `drawing`. */
function cardOf(drawing: Drawing, key: string, group: string): DrawnCard {
  const card = drawing.cards.find((drawn) => drawn.key === key && drawn.group === group);
  if (card === undefined) throw new RangeError(`${key} has no card in ${group}`);
  return card;
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
 * Whether an edit of an item's or a card's place made at `level` also states
 * the drawn position of every other item that states none: on the arranger
 * and in the bundle editor, where items lie freely in their box, so nothing
 * else moves; not in the group and timeline editors, where an item below
 * follows the edited one down, its container adapting.
 */
export function keepsItems(level: Level): boolean {
  return level === "arranger" || level === "bundle";
}

/**
 * One `set` of `places`, the values of each key's place in their order, and
 * with `others`, the drawn `x` and `y` of every other item of `drawing` that
 * does not state them, each stated once, so that no other item moves when the
 * defaults would place it anew (an item below another follows its bottom
 * edge unless it states its `y`). The frame holding an edited member's card
 * is no other item: a card's size never moves its frame's top left corner.
 */
export function placeCommand(
  block: BlockId,
  drawing: Drawing,
  places: ReadonlyMap<string, PlaceValues>,
  others: boolean,
): SetCommand {
  const changes: Change[] = [...places].map(([key, values]) => ({
    target: `${block}/${key}`,
    values: { place: values },
  }));
  if (others) {
    const edited = new Set(places.keys());
    for (const card of drawing.cards) if (places.has(card.key)) edited.add(card.group);
    for (const item of drawing.items) {
      if (edited.has(item.key)) continue;
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
  return placeCommand(block, drawing, new Map([[key, to]]), true);
}

/**
 * The `set` storing a resize's `values` (`itemResizeValues`) on the place of
 * `key` (`placeKeyOf`), made at `level`, stating the drawn position of every
 * other item that states none where `keepsItems(level)` (`placeCommand`).
 * `null` when every value is the one the place states already.
 */
export function itemResizeCommand(
  view: View,
  block: BlockId,
  key: string,
  values: PlaceValues,
  level: Level,
  metrics: FontMetrics,
): SetCommand | null {
  const found = blockIn(view, block);
  const stated = found.places[key] ?? {};
  const changes = PLACE_MEMBERS.some(
    (member) => values[member] !== undefined && values[member] !== (stated[member] ?? null),
  );
  if (!changes) return null;
  const drawing = drawingOf(found, view.settings, metrics);
  return placeCommand(block, drawing, new Map([[key, values]]), keepsItems(level));
}

/** The drawn corner of member `key`'s card, bottom right, in place coordinates. */
function cardCorner(drawing: Drawing, key: string): { x: number; y: number } {
  const { x: ox, y: oy } = drawing.origin;
  const card = drawing.elements.find(
    (element): element is RectElement =>
      element.type === "card" && element.address === `${key}/card`,
  );
  if (card === undefined) throw new RangeError(`${key} has no card in the drawing`);
  return { x: card.x + card.width - ox, y: card.y + card.height - oy };
}

/** The content width of item `key` of `block` at each length: its place's size requests left out. */
function contentWidthAt(
  block: Block,
  settings: WorkspaceSettings,
  metrics: FontMetrics,
  key: string,
): (length: number) => number {
  return (length) => {
    const places = placesWith(block.places, key, { length, width: null, height: null });
    return itemOf(drawingOf(block, settings, metrics, { places }), key).place.width;
  };
}

/**
 * The group editor's values for the length `length` of the members of group
 * `key` of `block`, stretched or typed: the frame does not adapt, so `width`
 * is pinned at the frame's drawn width and the length capped at the largest
 * whose cards do not pass the frame.
 */
export function cappedLength(
  block: Block,
  settings: WorkspaceSettings,
  metrics: FontMetrics,
  key: string,
  length: number,
): PlaceValues {
  const { place } = itemOf(drawingOf(block, settings, metrics), key);
  const pinned = quantize(place.width, GRID_FREE);
  const widthAt = contentWidthAt(block, settings, metrics, key);
  if (widthAt(length) <= pinned) return { length, width: pinned };
  const cap = solve(widthAt, place.length, pinned, MIN_LENGTH);
  return { length: Math.min(length, cap), width: pinned };
}

/**
 * The place values that resize the box `resized` of `block` by dragging
 * `handle` by `delta` (canvas units, as for a block) at `level`, for the
 * place of `placeKeyOf(resized, mode)`. Every position is in the drawing's
 * units, measured from the place origin; every size in the item's own
 * coordinates, before its scale, so the pointer's travel is divided by the
 * block's scale and the item's; every number is quantized to `GRID_FREE`.
 * The dragged edge or corner ends under the pointer and the opposite one
 * stays exactly where it is drawn: for a left or top handle the stated `x`
 * or `y` is the opposite edge less the achieved drawn size.
 *
 * - `scale` (corners only) sets `scale` to the item's scale times the
 *   larger of the two axis ratios of the dragged corner's distance from the
 *   fixed corner after and before the drag, floored at `MIN_SCALE`; scale 1,
 *   the default, unstates it. On a member's card the fixed corner is its
 *   frame's top left and the dragged corner the card's bottom right, and the
 *   scale is the group's.
 * - `box` sets `width` and `height`; a request at or below the box's own
 *   content stores `null`. On a member's card they are the card's own.
 * - `stretch` (left and right only) sets `length`: the largest value whose
 *   content does not pass the pointer, floored at `MIN_LENGTH`, the width
 *   following the content as a block's does (a request larger than the
 *   content keeps the space it adds, one at or below it becomes `null`). On
 *   a member's card it is its group's length alone, stretched from the
 *   frame's right edge: a stated width, the frame's or the card's, stays,
 *   and the frame grows once its content passes it.
 * - In the group editor the frame does not adapt: a stretch (right only, of
 *   the frame or a member's card) gives `cappedLength`'s values, the group's
 *   `length` capped where the cards would pass the frame and its `width`
 *   pinned at the frame's drawn width.
 */
export function itemResizeValues(
  block: Block,
  settings: WorkspaceSettings,
  metrics: FontMetrics,
  level: Level,
  resized: ResizedItem,
  mode: ResizeMode,
  handle: Handle,
  delta: Delta,
): PlaceValues {
  const [sx, sy] = SIDES[handle];
  if (!itemHandlesFor(mode, resized.kind, level).includes(handle)) {
    throw new RangeError(`a ${resized.kind} does not ${mode} from ${handle} at the ${level} level`);
  }
  const drawing = drawingOf(block, settings, metrics);
  const item = itemOf(drawing, resized.item);
  const { x, y, scale, width, height } = item.place;
  const dx = delta.dx / block.scale;
  const dy = delta.dy / block.scale;
  const right = x + scale * width;
  const bottom = y + scale * height;
  const left = sx < 0 ? quantize(x + dx, GRID_FREE) : x;
  const top = sy < 0 ? quantize(y + dy, GRID_FREE) : y;
  /** The drawing of the block with `values` merged into the place of `key`. */
  const redrawn = (key: string, values: PlaceValues) =>
    drawingOf(block, settings, metrics, { places: placesWith(block.places, key, values) });
  const placed = (values: PlaceValues) => itemOf(redrawn(item.key, values), item.key).place;
  const values: PlaceValues = {};

  if (mode === "scale") {
    const corner =
      resized.kind === "member"
        ? cardCorner(drawing, resized.key)
        : { x: sx < 0 ? x : right, y: sy < 0 ? y : bottom };
    const fixed = { x: sx < 0 ? right : x, y: sy < 0 ? bottom : y };
    const target = { x: sx < 0 ? left : corner.x + dx, y: sy < 0 ? top : corner.y + dy };
    const ratio = Math.max(
      (target.x - fixed.x) / (corner.x - fixed.x),
      (target.y - fixed.y) / (corner.y - fixed.y),
    );
    const next = Math.max(MIN_SCALE, quantize(scale * ratio, GRID_FREE));
    values.scale = next === 1 ? null : next;
    if (sx < 0 || sy < 0) {
      const size = placed({ scale: next });
      if (sx < 0) values.x = quantize(right - next * size.width, GRID_FREE);
      if (sy < 0) values.y = quantize(bottom - next * size.height, GRID_FREE);
    }
    return values;
  }

  if (mode === "box" && resized.kind === "member") {
    const { key } = resized;
    const card = cardOf(drawing, key, item.key).size;
    const content = cardOf(redrawn(key, { width: null, height: null }), key, item.key).size;
    if (sx !== 0) {
      const request = quantize(card.width + dx / scale, GRID_FREE);
      values.width = request > content.width ? request : null;
    }
    if (sy !== 0) {
      const request = quantize(card.height + dy / scale, GRID_FREE);
      values.height = request > content.height ? request : null;
    }
    return values;
  }

  const content = placed({ width: null, height: null });
  if (mode === "box") {
    let achieved = { width, height };
    if (sx !== 0) {
      const request = quantize(((sx > 0 ? right + dx : right) - left) / scale, GRID_FREE);
      values.width = request > content.width ? request : null;
      achieved = { ...achieved, width: values.width ?? content.width };
    }
    if (sy !== 0) {
      const request = quantize(((sy > 0 ? bottom + dy : bottom) - top) / scale, GRID_FREE);
      values.height = request > content.height ? request : null;
      achieved = { ...achieved, height: values.height ?? content.height };
    }
    if (sx < 0) values.x = quantize(right - scale * achieved.width, GRID_FREE);
    if (sy < 0) values.y = quantize(bottom - scale * achieved.height, GRID_FREE);
    return values;
  }

  const widthAt = contentWidthAt(block, settings, metrics, item.key);
  if (level === "group") {
    const length = solve(widthAt, item.place.length, content.width + dx / scale, MIN_LENGTH);
    return cappedLength(block, settings, metrics, item.key, length);
  }
  const wanted = ((sx > 0 ? right + dx : right) - left) / scale - (width - content.width);
  const length = solve(widthAt, item.place.length, wanted, MIN_LENGTH);
  values.length = length;
  if (resized.kind === "member") return values;
  const stretched = widthAt(length);
  const stated = item.stated.width ?? null;
  const request = kept(stated, content.width, stretched);
  if (request !== stated) values.width = request;
  if (sx < 0) {
    values.x = quantize(right - scale * Math.max(stretched, request ?? 0), GRID_FREE);
  }
  return values;
}
