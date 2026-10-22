/**
 * The items of a block, its groups' frames and its ungrouped roots'
 * cards, and the cards its frames hold (`docs/drawing.md` in TimeToShare,
 * section 8.6), moved and resized by stating their places. Every gesture is
 * one `set` of the `place` of each item or card it touches. Whatever a
 * gesture measures before it is stored is measured on the view its command
 * would leave (core's `preview`), so it can never differ from what the
 * release stores.
 */

import type {
  Address,
  Block,
  BlockId,
  Change,
  CommandError,
  ElementAddress,
  ItemPlace,
  Manifest,
  PlaceKey,
  SetCommand,
  View,
} from "@timetoalign/tilie-core";
import {
  addressKey,
  contains,
  ErrorCode,
  ITEM_PLACE_MEMBERS,
  inBlock,
  isCommandError,
  placeAt,
  placeKeyText,
  preview,
  samePlaceKey,
} from "@timetoalign/tilie-core";
import type { Drawing, DrawnBox } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timetoshare";
import type { CardBox, ItemBox } from "./boxes.ts";
import {
  boxKey,
  isHeld,
  isItem,
  itemHolding,
  itemOf,
  keyedBox,
  verticalStretchOf,
} from "./boxes.ts";
import type { Level, PlaceProperty, Resizing } from "./containers.ts";
import { LEVELS, levelOf, RESIZED_BY, resizingOf, resolveSelection } from "./containers.ts";
import { drawingOf } from "./drawing.ts";
import type { Editing } from "./editing.ts";
import { placeChange } from "./editing.ts";
import { GRID_FREE, MIN_LENGTH, MIN_SCALE, quantize } from "./numbers.ts";
import type { Delta, Handle, ResizeMode } from "./resize.ts";
import { ALL_HANDLES, handlesFor, kept, SIDES, solve } from "./resize.ts";
import type { Selection } from "./selection.ts";

/** Members of a place to set: a number states the member, `null` unstates it. */
export type PlaceValues = { -readonly [member in keyof ItemPlace]?: number | null };

/** The values a gesture sets on the place under `key`. */
export interface PlacedValues {
  readonly key: PlaceKey;
  readonly values: PlaceValues;
}

/** The places a gesture sets, each with its values, in order, by `placeKeyText`. */
export type PlaceChanges = ReadonlyMap<string, PlacedValues>;

/** The place changes `entries` gives, each place once, its values merged in order. */
export function placeChanges(
  entries: Iterable<readonly [PlaceKey, PlaceValues]>,
): Map<string, PlacedValues> {
  const changes = new Map<string, PlacedValues>();
  for (const [key, values] of entries) setValues(changes, key, values);
  return changes;
}

/** `values` merged into the values `changes` sets on the place under `key`. */
function setValues(changes: Map<string, PlacedValues>, key: PlaceKey, values: PlaceValues): void {
  const text = placeKeyText(key);
  changes.set(text, { key, values: { ...changes.get(text)?.values, ...values } });
}

const BELOW_RIGHT: readonly Handle[] = ["right", "bottom-right", "bottom"];
const HELD_HANDLES: { readonly [mode in ResizeMode]: readonly Handle[] } = {
  scale: ["bottom-right"],
  box: BELOW_RIGHT,
  stretch: BELOW_RIGHT,
};
/** Every handle but the left edge and the left corners. */
const NOT_LEFT: readonly Handle[] = ALL_HANDLES.filter((handle) => SIDES[handle][0] >= 0);

const identity = (value: number): number => value;

function blockIn(view: View, id: BlockId) {
  const block = view.blocks[id];
  if (block === undefined) throw new RangeError(`${id} is no block of the view`);
  return block;
}

/** The frame or card of `drawing` with the place key of `box`, which may come from another drawing of its block. */
function resizedIn(drawing: Drawing, box: DrawnBox): ItemBox | CardBox {
  const found = box.key === null ? undefined : keyedBox(drawing, box.key);
  if (found === undefined || !(isItem(found) || isHeld(found))) {
    throw new RangeError(`${addressKey(box.address)} is no frame or card of the drawing`);
  }
  return found;
}

/** The card of `key` held by a frame of `drawing`. */
function heldCard(drawing: Drawing, key: PlaceKey): CardBox {
  const card = keyedBox(drawing, key);
  if (card === undefined || !isHeld(card)) {
    throw new RangeError(`${placeKeyText(key)} has no held card`);
  }
  return card;
}

/**
 * The handles `box`, a frame or a card, offers in `mode` at `level`. A frame
 * or a block-held card offers a block's: the corners to scale, all eight to
 * size or stretch its box; where the level pins the frame's width
 * (`frameWidthPinned`), its stretch leaves out the left edge and the left
 * corners. A held card never moves its top left corner, which its frame
 * decides: it scales from its bottom right corner, and sizes and stretches
 * its box from its right and bottom edges.
 */
export function itemHandlesFor(mode: ResizeMode, box: DrawnBox, level: Level): readonly Handle[] {
  if (isHeld(box)) return HELD_HANDLES[mode];
  if (mode === "stretch" && LEVELS[level].frameWidthPinned) return NOT_LEFT;
  return handlesFor(mode);
}

/** The place a change of `box` (held by `item`) written as `written` (`resizingOf`) sets. */
function keyOf(box: ItemBox | CardBox, item: ItemBox, written: keyof Resizing["writes"]): PlaceKey {
  return resizingOf(box).writes[written] === "own" ? box.key : item.key;
}

/** `changes` with `more` merged in, place by place, in order. */
function merged(changes: PlaceChanges, more: PlaceChanges): Map<string, PlacedValues> {
  const all = new Map(changes);
  for (const { key, values } of more.values()) setValues(all, key, values);
  return all;
}

/**
 * `view` after a `set` of `changes` on the places of `block`, as core's
 * `preview` applies it (a `set` changing nothing gives `view` back), so
 * whatever is measured on it is what the release stores.
 */
function withPlaces(view: View, block: BlockId, changes: PlaceChanges): View {
  if (changes.size === 0) return view;
  const found = blockIn(view, block);
  const command: SetCommand = {
    type: "set",
    changes: [...changes.values()].map(({ key, values }) => placeChange(found, key, values)),
  };
  const next = preview(view, command);
  if (isCommandError(next)) throw new RangeError(`a place change is refused: ${next.message}`);
  return next;
}

/** The drawing of `block` in `view` after `changes` (`withPlaces`). */
function drawnWith(
  view: View,
  block: BlockId,
  changes: PlaceChanges,
  metrics: FontMetrics,
): Drawing {
  const next = withPlaces(view, block, changes);
  return drawingOf(blockIn(next, block), next.settings, metrics);
}

/**
 * One `set` of `places`, the values of each key's place in their order, and
 * with `others`, the drawn `x` and `y` of every other item of `drawing` that
 * does not state them, each stated once, so that no other item moves when the
 * defaults would place it anew (an item below another follows its bottom
 * edge unless it states its `y`). The frame holding an edited held card is
 * no other item: a card's size never moves its frame's top left corner.
 */
export function placeCommand(
  block: Block,
  drawing: Drawing,
  places: PlaceChanges,
  others: boolean,
): SetCommand {
  const changes: Change[] = [...places.values()].map(({ key, values }) =>
    placeChange(block, key, values),
  );
  if (others) {
    const edited = new Set(places.keys());
    for (const { key } of places.values()) {
      const box = keyedBox(drawing, key);
      if (box !== undefined && isHeld(box)) edited.add(placeKeyText(itemHolding(drawing, box).key));
    }
    for (const box of drawing.boxes) {
      if (!isItem(box) || edited.has(placeKeyText(box.key))) continue;
      const place: PlaceValues = {};
      if (box.item.stated.x === undefined) place.x = box.item.place.x;
      if (box.item.stated.y === undefined) place.y = box.item.place.y;
      if (Object.keys(place).length > 0) {
        changes.push(placeChange(block, box.key, place));
      }
    }
  }
  return { type: "set", changes };
}

/**
 * The other items of `drawing`, the drawing of `manifest`, that a drag of
 * the item `key` moves with it: every other item in the selection
 * `selected` (the block's selected element addresses, by their keys), in
 * the drawing's order and possibly none, when `key` is in it; `null` when it
 * is not. A selected frame puts in the selection only itself, a selected
 * card every item drawing it (the card itself, a held card's frame, each
 * frame of a member of several groups); any other selected address puts
 * there every item containing it by core's `contains`, its key naming the
 * group or the ungrouped root, wherever the address is drawn.
 */
export function itemsMovedWith(
  manifest: Manifest,
  drawing: Drawing,
  selected: ReadonlyMap<string, ElementAddress>,
  key: PlaceKey,
): PlaceKey[] | null {
  const drawnBy = new Map<string, PlaceKey[]>();
  for (const box of drawing.boxes) {
    const address = addressKey(box.address);
    if (isItem(box)) drawnBy.set(address, [...(drawnBy.get(address) ?? []), box.key]);
    else if (isHeld(box)) {
      drawnBy.set(address, [...(drawnBy.get(address) ?? []), itemHolding(drawing, box).key]);
    }
  }
  const keys = drawing.boxes
    .filter(isItem)
    .filter((item) =>
      [...selected].some(([text, address]) => {
        const drawers = drawnBy.get(text);
        return drawers === undefined
          ? contains(manifest, item.key.item, address)
          : drawers.some((drawer) => samePlaceKey(drawer, item.key));
      }),
    )
    .map((item) => item.key);
  return keys.some((other) => samePlaceKey(other, key))
    ? keys.filter((other) => !samePlaceKey(other, key))
    : null;
}

/**
 * The `set` that moves the item `key` of block `block` to the place
 * position `x`, `y` (in the drawing's units, measured from the place origin,
 * quantized to `GRID_FREE`) and every item of `together` by the same travel,
 * so that each keeps its offset to `key`, stating the drawn position of
 * every other item that states none (the bundle editor's rule,
 * `placeCommand`). `null` when the item would stay where it is drawn.
 */
export function itemMoveCommand(
  view: View,
  block: BlockId,
  key: PlaceKey,
  x: number,
  y: number,
  metrics: FontMetrics,
  together: readonly PlaceKey[] = [],
): SetCommand | null {
  const found = blockIn(view, block);
  const drawing = drawingOf(found, view.settings, metrics);
  const { place } = itemOf(drawing, key).item;
  const to = { x: quantize(x, GRID_FREE), y: quantize(y, GRID_FREE) };
  if (to.x === place.x && to.y === place.y) return null;
  const places = placeChanges([[key, to]]);
  for (const other of together) {
    const at = itemOf(drawing, other).item.place;
    setValues(places, other, { x: to.x + (at.x - place.x), y: to.y + (at.y - place.y) });
  }
  return placeCommand(found, drawing, places, true);
}

/**
 * The `set` storing a resize's places (`itemResizeValues`), made at
 * `level`, stating the drawn position of every other item that states none
 * where the level's items lie freely (`itemsFree`, `placeCommand`). `null`
 * when every value is the one its place states already.
 */
export function itemResizeCommand(
  view: View,
  block: BlockId,
  places: PlaceChanges,
  level: Level,
  metrics: FontMetrics,
): SetCommand | null {
  const found = blockIn(view, block);
  const changes = [...places.values()].some(({ key, values }) => {
    const stated: ItemPlace = placeAt(found.places, key) ?? {};
    return ITEM_PLACE_MEMBERS.some(
      (member) => values[member] !== undefined && values[member] !== (stated[member] ?? null),
    );
  });
  if (!changes) return null;
  const drawing = drawingOf(found, view.settings, metrics);
  return placeCommand(found, drawing, places, LEVELS[level].itemsFree);
}

/** A stretch's factor, the member of a place it sets: `length` along time, `spacing` or `margin` vertically. */
type Factor = "length" | "spacing" | "margin";

/** The size that follows the content of a stretch by each factor. */
const SIZES = { length: "width", spacing: "height", margin: "height" } as const;

/** The entry of `Resizing.writes` a stretch by `factor` is written by: its axis's. */
const writtenBy = (factor: Factor): "length" | "spacing" =>
  factor === "length" ? "length" : "spacing";

/** The stretch at one value of its factor. */
interface Stretched {
  readonly changes: PlaceChanges;
  /** The holding item's content, its own stated size left out, on the axis. */
  readonly content: number;
  /** The stretched box's drawn size on the axis. */
  readonly drawn: number;
}

/**
 * A stretch of one frame or card of a block on one axis, as a function of
 * the factor's value (`length` along time, `spacing` or `margin`
 * vertically), built from one drawing of the block before the stretch and
 * memoized per value, so a search and the changes it settles on draw each
 * value once.
 *
 * At a value, the factor is stated on its key (a held card stretches its
 * group's `length` and its own `spacing` or `margin`, `resizingOf`), and every stated
 * size of the boxes stretched follows its own content by `kept`, keeping its
 * proportion to it: along time the widths of the item and of the cards its
 * frame holds, so the members' lines keep one length and every margin
 * stretches with them; vertically the heights of a frame and its cards, or
 * of a held card and its frame; the cards first, since the item's content
 * holds them. Where the level pins the frame's width
 * (`frameWidthPinned`), a stretch along time keeps the frame at its drawn
 * width while the content, the cards' widths following, fits in it (its
 * `width` stated at that width), and lets the frame follow the content once
 * the content is wider (its `width` unstated), so a stretch shrinks the
 * members inside the frame and grows the frame with them. Sizes are in item
 * coordinates.
 */
export class Stretch {
  /** The factor's value before the stretch. */
  readonly start: number;
  /** The frame's width kept along time while the content fits in it; `null` where it adapts. */
  readonly pinned: number | null;
  readonly #view: View;
  readonly #block: BlockId;
  readonly #metrics: FontMetrics;
  readonly #factor: Factor;
  readonly #size: "width" | "height";
  /** The place the factor is stated on. */
  readonly #key: PlaceKey;
  /** The item holding the stretched boxes. */
  readonly #item: PlaceKey;
  /** The place key of the box whose drawn size the stretch reports. */
  readonly #dragged: PlaceKey;
  /** The places whose stated size follows their content, each with that content before. */
  readonly #requests: readonly (readonly [PlaceKey, number])[];
  /** The item's stated size and its content before, where it follows its content. */
  readonly #itemRequest: { readonly stated: number; readonly content: number } | null;
  readonly #at = new Map<number, Stretched>();

  constructor(
    view: View,
    block: BlockId,
    box: DrawnBox,
    level: Level,
    factor: Factor,
    metrics: FontMetrics,
  ) {
    this.#view = view;
    this.#block = block;
    this.#metrics = metrics;
    this.#factor = factor;
    this.#size = SIZES[factor];
    const stored = blockIn(view, block);
    const drawing = drawingOf(stored, view.settings, metrics);
    const resized = resizedIn(drawing, box);
    const item = itemHolding(drawing, resized);
    const held = isHeld(resized);
    this.#key = keyOf(resized, item, writtenBy(factor));
    this.#item = item.key;
    this.#dragged = held ? resized.key : item.key;
    this.pinned =
      factor === "length" && LEVELS[level].frameWidthPinned
        ? quantize(item.item.place.width, GRID_FREE)
        : null;
    // The factor as drawn: stated, else the container's default (a frame's spacing 8, a card's
    // 4, a margin 0).
    this.start =
      factor === "length"
        ? item.item.place.length
        : held
          ? resized.card[factor]
          : item.item.place[factor];
    const cards =
      held && factor !== "length"
        ? [this.#key]
        : drawing.boxes
            .filter(
              (card): card is CardBox =>
                isHeld(card) && card.holder !== null && samePlaceKey(card.holder, item.key),
            )
            .map((card) => card.key);
    const stated = (key: PlaceKey) => placeAt(stored.places, key)?.[this.#size] ?? null;
    const requests = cards.filter((key) => stated(key) !== null);
    const itemStated = this.pinned === null ? stated(item.key) : null;
    // The cards' own contents: a frame's width would widen them.
    const before = this.#draw(this.#unstated(new Map(), [...requests, item.key]));
    this.#requests = requests.map((key) => [key, this.#sizeOf(before, key)] as const);
    this.#itemRequest =
      itemStated === null
        ? null
        : {
            stated: itemStated,
            content: this.#sizeOf(this.#draw(this.#unstated(new Map(), [item.key])), item.key),
          };
  }

  /** The holding item's content on the axis at `value`, its own stated size left out. */
  content(value: number): number {
    return this.#evaluate(value).content;
  }

  /** The stretched box's drawn size on the axis at `value`. */
  drawn(value: number): number {
    return this.#evaluate(value).drawn;
  }

  /** The places a Stretch to `value` writes. */
  changes(value: number): PlaceChanges {
    return this.#evaluate(value).changes;
  }

  #draw(changes: PlaceChanges): Drawing {
    return drawnWith(this.#view, this.#block, changes, this.#metrics);
  }

  /** `changes` with the size of every place of `keys` unstated. */
  #unstated(changes: PlaceChanges, keys: readonly PlaceKey[]): Map<string, PlacedValues> {
    return merged(changes, placeChanges(keys.map((key) => [key, { [this.#size]: null }])));
  }

  /** The drawn size on the axis of the item or of a card it holds, by place key. */
  #sizeOf(drawing: Drawing, key: PlaceKey): number {
    return samePlaceKey(key, this.#item)
      ? itemOf(drawing, key).item.place[this.#size]
      : heldCard(drawing, key).card.size[this.#size];
  }

  #evaluate(value: number): Stretched {
    const found = this.#at.get(value);
    if (found !== undefined) return found;
    const size = this.#size;
    const stored = blockIn(this.#view, this.#block).places;
    const stated = (key: PlaceKey) => placeAt(stored, key)?.[size] ?? null;
    const changes = new Map<string, PlacedValues>();
    const set = (key: PlaceKey, values: PlaceValues) => setValues(changes, key, values);
    set(this.#key, { [this.#factor]: value });
    if (this.#requests.length > 0) {
      const keys = this.#requests.map(([key]) => key);
      const free = this.#draw(this.#unstated(changes, [...keys, this.#item]));
      for (const [key, content] of this.#requests) {
        const request = kept(stated(key), content, this.#sizeOf(free, key));
        if (request !== stated(key)) set(key, { [size]: request });
      }
    }
    const sized = this.#draw(this.#unstated(changes, [this.#item]));
    const content = this.#sizeOf(sized, this.#item);
    if (this.pinned !== null) {
      set(this.#item, { [size]: content <= this.pinned ? this.pinned : null });
    }
    if (this.#itemRequest !== null) {
      const request = kept(this.#itemRequest.stated, this.#itemRequest.content, content);
      if (request !== this.#itemRequest.stated) set(this.#item, { [size]: request });
    }
    // A frame's width widens its cards, so the dragged box is measured with every request.
    const bare = this.#requests.length === 0 && this.#itemRequest === null && this.pinned === null;
    const drawn = this.#sizeOf(bare ? sized : this.#draw(changes), this.#dragged);
    const stretched = { changes, content, drawn };
    this.#at.set(value, stretched);
    return stretched;
  }
}

/**
 * The places that resize `box`, a frame or a card of block `block`, by
 * dragging `handle` by `delta` (canvas units, as for a block) at `level`:
 * each key of `places` with its values, in order. Every position is in the
 * drawing's units, measured from the place origin; every size in the item's
 * own coordinates, before its scale, so the pointer's travel is divided by
 * the block's scale and the item's; every number is quantized to
 * `GRID_FREE`. The dragged edge or corner ends under the pointer and the
 * opposite one stays exactly where it is drawn: for a left or top handle the
 * stated `x` or `y` is the opposite edge less the achieved drawn size.
 *
 * - `scale` (corners only) sets the item's `scale` to its scale times the
 *   larger of the two axis ratios of the dragged corner's distance from the
 *   fixed corner after and before the drag, floored at `MIN_SCALE`; scale 1,
 *   the default, unstates it. On a held card the fixed corner is its frame's
 *   top left and the dragged corner the card's bottom right, and the scale
 *   is the group's.
 * - `box` sets `width` and `height`; a request at or below the box's own
 *   content stores `null`. On a held card they are the card's own.
 * - `stretch` sets `length` from a left or right handle and, from a top or
 *   bottom one, `spacing`, or `margin` for a container with exactly one
 *   content (`verticalStretchOf`), both from a corner: the largest value whose box
 *   does not pass the pointer, floored at `MIN_LENGTH` and at 0, the places
 *   being what a `Stretch` to it writes. Vertically a frame's `spacing` is
 *   the gap between its cards and a box-held card's the gap between its
 *   rows and bands, a margin the empty space above its one content and
 *   below it, and a value the search leaves where it was drawn is not
 *   stated; a held card stretches its group along time, the card's own box
 *   following the pointer, and only its own card's `spacing` or `margin`
 *   vertically. Where the frame keeps its
 *   width (`Stretch`), a stretch along time makes the frame's content
 *   follow the pointer, whichever box is dragged; vertically the frame
 *   adapts.
 */
export function itemResizeValues(
  view: View,
  block: BlockId,
  box: DrawnBox,
  level: Level,
  mode: ResizeMode,
  handle: Handle,
  delta: Delta,
  metrics: FontMetrics,
): PlaceChanges {
  const stored = blockIn(view, block);
  const drawing = drawingOf(stored, view.settings, metrics);
  const resized = resizedIn(drawing, box);
  const held = isHeld(resized);
  const [sx, sy] = SIDES[handle];
  if (!itemHandlesFor(mode, resized, level).includes(handle)) {
    const kind = held ? "held card" : resized.kind;
    throw new RangeError(`a ${kind} does not ${mode} from ${handle} at the ${level} level`);
  }
  const item = itemHolding(drawing, resized);
  const { x, y, scale, width, height } = item.item.place;
  const dx = delta.dx / stored.scale;
  const dy = delta.dy / stored.scale;
  const right = x + scale * width;
  const bottom = y + scale * height;
  const left = sx < 0 ? quantize(x + dx, GRID_FREE) : x;
  const top = sy < 0 ? quantize(y + dy, GRID_FREE) : y;
  /** The drawing of the block with `values` merged into the place of `key`. */
  const redrawn = (key: PlaceKey, values: PlaceValues) =>
    drawnWith(view, block, placeChanges([[key, values]]), metrics);
  const placed = (values: PlaceValues) => itemOf(redrawn(item.key, values), item.key).item.place;
  const values: PlaceValues = {};

  if (mode === "scale") {
    const { x: ox, y: oy } = drawing.origin;
    const corner = held
      ? { x: resized.x + resized.width - ox, y: resized.y + resized.height - oy }
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
    return placeChanges([[keyOf(resized, item, "scale"), values]]);
  }

  if (mode === "box" && held) {
    const card = resized.card.size;
    const content = heldCard(redrawn(resized.key, { width: null, height: null }), resized.key).card
      .size;
    if (sx !== 0) {
      const request = quantize(card.width + dx / scale, GRID_FREE);
      values.width = request > content.width ? request : null;
    }
    if (sy !== 0) {
      const request = quantize(card.height + dy / scale, GRID_FREE);
      values.height = request > content.height ? request : null;
    }
    return placeChanges([[keyOf(resized, item, "box"), values]]);
  }

  if (mode === "box") {
    const content = placed({ width: null, height: null });
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
    return placeChanges([[keyOf(resized, item, "box"), values]]);
  }

  /** The dragged box's drawn size on an axis in `of`, in item coordinates. */
  const sizeIn = (of: Drawing, size: "width" | "height") =>
    held ? heldCard(of, resized.key).card.size[size] : itemOf(of, item.key).item.place[size];
  let current = view;
  let changes: PlaceChanges = new Map();
  const stretchTo = (stretch: Stretch, value: number) => {
    const more = stretch.changes(value);
    changes = merged(changes, more);
    current = withPlaces(current, block, more);
  };

  if (sx !== 0) {
    const stretch = new Stretch(view, block, resized, level, "length", metrics);
    if (stretch.pinned === null) {
      const target = held
        ? sizeIn(drawing, "width") + dx / scale
        : ((sx > 0 ? right + dx : right) - left) / scale;
      const drawn = (value: number) => stretch.drawn(value);
      stretchTo(stretch, solve(drawn, identity, stretch.start, target, MIN_LENGTH).value);
    } else {
      // The frame keeps its width while the content fits, so the frame's content follows the
      // pointer, whichever box is dragged.
      const content = (value: number) => stretch.content(value);
      const target = content(stretch.start) + dx / scale;
      stretchTo(stretch, solve(content, identity, stretch.start, target, MIN_LENGTH).value);
    }
  }

  if (sy !== 0) {
    const factor = verticalStretchOf(resized);
    const stretch = new Stretch(current, block, resized, level, factor, metrics);
    const target = held
      ? sizeIn(drawing, "height") + dy / scale
      : ((sy > 0 ? bottom + dy : bottom) - top) / scale;
    const drawn = (value: number) => stretch.drawn(value);
    const value = solve(drawn, identity, stretch.start, target, 0).value;
    // A value drawn alike as the one it started from states nothing.
    if (value !== stretch.start) stretchTo(stretch, value);
  }

  if (sx >= 0 && sy >= 0) return changes;
  const after = drawingOf(blockIn(current, block), current.settings, metrics);
  const own: PlaceValues = {};
  if (sx < 0) own.x = quantize(right - scale * sizeIn(after, "width"), GRID_FREE);
  if (sy < 0) own.y = quantize(bottom - scale * sizeIn(after, "height"), GRID_FREE);
  return merged(changes, placeChanges([[item.key, own]]));
}

/** The value of each place member a frame or a card shows. */
export type ShownValues = { readonly [property in PlaceProperty]?: number };

/**
 * What `box` of `drawing` shows for each of its place members: stated, else
 * drawn. An item shows every member of its place; a card a frame holds its
 * own spacing, margin and size, and the scale and length of its frame,
 * which its group's members share.
 */
export function shownValues(drawing: Drawing, box: ItemBox | CardBox): ShownValues {
  const placeValue = ({ item }: ItemBox, property: PlaceProperty) =>
    item.stated[property] ?? item.place[property];
  if (isItem(box)) {
    return Object.fromEntries(
      ITEM_PLACE_MEMBERS.map((property) => [property, placeValue(box, property)]),
    );
  }
  const frame = itemHolding(drawing, box);
  const { size, spacing, margin, stated } = box.card;
  return {
    length: placeValue(frame, "length"),
    scale: placeValue(frame, "scale"),
    spacing,
    margin,
    width: stated.width ?? size.width,
    height: stated.height ?? size.height,
  };
}

function refused(
  code: CommandError["code"],
  message: string,
  path: readonly string[],
): CommandError {
  return { code, message, path };
}

/**
 * The one `set` the inspector dispatches for a typed or stepped property:
 * `property` of every block, frame or card the selection names (core's
 * resolver, `resolveSelection` where `editing`, the innermost open editor,
 * works: a part of a group or of a timeline drawn in a card names that
 * frame or card; bands are left out) given `value`, or
 * `value(current)`, `current` being the element's shown value (stated, else
 * drawn). A block sets its own member; a frame or a card a member of the
 * place its resizing writes (`resizingOf`: a held card's scale and length
 * are its group's), each place once, with the first element's value. A
 * `length`, `spacing` or `margin` writes what a Stretch to it writes (`Stretch`),
 * each element's stretch starting from what the ones before it wrote; and
 * where the level's items lie freely (`itemsFree`), the same `set` states
 * the drawn position of every other item that states none
 * (`placeCommand`). `null` when every element stores that value already.
 *
 * Refused (`CommandError`): a selection naming no block, frame or card
 * (`unknown_target` when nothing resolves, `wrong_target_kind` for an
 * element with no geometry of its own, elements in several blocks, or
 * blocks mixed with frames or cards), a position of a held card
 * (`unknown_property`), and a value that is not finite or, except a
 * `width` or `height`, empty (`invalid_value`).
 */
export function placeEdit(
  view: View,
  selection: Selection,
  property: PlaceProperty,
  value: number | null | ((current: number | null) => number | null),
  editing: Editing | null,
  metrics: FontMetrics,
): SetCommand | null | CommandError {
  const level = levelOf(editing);
  const subjects = resolveSelection(view, selection, editing, metrics).filter(
    (subject) => subject.box?.kind !== "band",
  );
  const [first] = subjects;
  if (first === undefined) {
    return refused(ErrorCode.unknownTarget, "the selection names nothing to place", [property]);
  }
  const block = blockIn(view, first.block);
  if (subjects.some((subject) => subject.block !== block.id)) {
    return refused(ErrorCode.wrongTargetKind, "the selection lies in several blocks", [
      addressKey(first.address),
      property,
    ]);
  }
  const drawing = drawingOf(block, view.settings, metrics);
  const valueFor = (current: number | null) =>
    typeof value === "function" ? value(current) : value;
  const check = (target: Address, given: number | null): CommandError | null => {
    if (given === null) {
      return property === "width" || property === "height"
        ? null
        : refused(ErrorCode.invalidValue, `${property} needs a number`, [
            addressKey(target),
            property,
          ]);
    }
    return Number.isFinite(given)
      ? null
      : refused(ErrorCode.invalidValue, `${given} is not a number`, [addressKey(target), property]);
  };

  if (subjects.every((subject) => subject.box?.kind === "block")) {
    const given = valueFor(block[property]);
    const target: Address = { block: block.id };
    const error = check(target, given);
    if (error !== null) return error;
    if (block[property] === given) return null;
    return { type: "set", changes: [{ target, values: { [property]: given } }] };
  }

  const boxes = new Map<string, ItemBox | CardBox>();
  for (const subject of subjects) {
    const box = subject.box;
    if (box === null || !(isItem(box) || isHeld(box))) {
      return refused(
        ErrorCode.wrongTargetKind,
        `${addressKey(subject.address)} has no place to edit`,
        [addressKey(subject.address), property],
      );
    }
    const own = boxKey(box);
    if (own !== null && !boxes.has(own)) boxes.set(own, box);
  }
  const written = RESIZED_BY[property];
  const places = new Map<string, PlacedValues>();
  const keys = new Set<string>();
  const stored: { key: PlaceKey; given: number | null }[] = [];
  let edited = view;
  for (const box of boxes.values()) {
    const item = itemHolding(drawing, box);
    if (written === null && isHeld(box)) {
      return refused(ErrorCode.unknownProperty, `a held card has no ${property}`, [
        addressKey(inBlock(block.id, box.address)),
        property,
      ]);
    }
    const key = written === null ? item.key : keyOf(box, item, written);
    if (keys.has(placeKeyText(key))) continue;
    keys.add(placeKeyText(key));
    const given = valueFor(shownValues(drawing, box)[property] ?? null);
    const placed = samePlaceKey(key, box.key) ? box : item;
    const error = check(inBlock(block.id, placed.address), given);
    if (error !== null) return error;
    stored.push({ key, given });
    const changes =
      (property === "length" || property === "spacing" || property === "margin") && given !== null
        ? new Stretch(edited, block.id, box, level, property, metrics).changes(given)
        : placeChanges([[key, { [property]: given }]]);
    for (const { key: changed, values } of changes.values()) setValues(places, changed, values);
    edited = withPlaces(edited, block.id, changes);
  }
  const unchanged = stored.every(({ key, given }) => {
    const place: ItemPlace = placeAt(block.places, key) ?? {};
    return (place[property] ?? null) === given;
  });
  if (unchanged) return null;
  return placeCommand(block, drawing, places, LEVELS[level].itemsFree);
}
