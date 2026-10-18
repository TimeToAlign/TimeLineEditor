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
import { GRID_FREE, MIN_LENGTH, MIN_SCALE, MIN_SPACING, quantize } from "./numbers.ts";
import type { Delta, Handle, ResizeMode } from "./resize.ts";
import { ALL_HANDLES, handlesFor, kept, SIDES, solve } from "./resize.ts";

/** Members of a place to set: a number states the member, `null` unstates it. */
export type PlaceValues = { -readonly [member in keyof Place]?: number | null };

/** The places a gesture sets: each key of `places` with its values, in order. */
export type PlaceChanges = ReadonlyMap<string, PlaceValues>;

const BELOW_RIGHT: readonly Handle[] = ["right", "bottom-right", "bottom"];
const MEMBER_HANDLES: { readonly [mode in ResizeMode]: readonly Handle[] } = {
  scale: ["bottom-right"],
  box: BELOW_RIGHT,
  stretch: BELOW_RIGHT,
};
/** Every handle but the left edge and the left corners. */
const NOT_LEFT: readonly Handle[] = ALL_HANDLES.filter((handle) => SIDES[handle][0] >= 0);

/**
 * The handles a box of kind `kind` offers in `mode` at `level`. A frame or
 * an ungrouped card offers a block's: the corners to scale, all eight to size
 * or stretch its box; in the group editor, where the frame does not grow
 * along time, its stretch leaves out the left edge and the left corners. A
 * member's card never moves its top left corner, which its frame decides: it
 * scales from its bottom right corner, and sizes and stretches its box from
 * its right and bottom edges.
 */
export function itemHandlesFor(
  mode: ResizeMode,
  kind: ResizedItem["kind"],
  level: Level,
): readonly Handle[] {
  if (kind === "member") return MEMBER_HANDLES[mode];
  if (mode === "stretch" && level === "group") return NOT_LEFT;
  return handlesFor(mode);
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

/** The key of `places` a change of `resized` written as `written` (`RESIZING`) sets. */
function keyOf(resized: ResizedItem, written: "scale" | "box" | "length" | "spacing"): string {
  return RESIZING[resized.kind].writes[written] === "card" ? resized.key : resized.item;
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
 * The `set` storing a resize's places (`itemResizeValues`), made at
 * `level`, stating the drawn position of every other item that states none
 * where `keepsItems(level)` (`placeCommand`). `null` when every value is the
 * one its place states already.
 */
export function itemResizeCommand(
  view: View,
  block: BlockId,
  places: PlaceChanges,
  level: Level,
  metrics: FontMetrics,
): SetCommand | null {
  const found = blockIn(view, block);
  const changes = [...places].some(([key, values]) => {
    const stated = found.places[key] ?? {};
    return PLACE_MEMBERS.some(
      (member) => values[member] !== undefined && values[member] !== (stated[member] ?? null),
    );
  });
  if (!changes) return null;
  const drawing = drawingOf(found, view.settings, metrics);
  return placeCommand(block, drawing, places, keepsItems(level));
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

/** A stretch's axis: the member of a place it sets and the size that follows the content. */
interface Axis {
  readonly factor: "length" | "spacing";
  readonly size: "width" | "height";
}

const HORIZONTAL: Axis = { factor: "length", size: "width" };
const VERTICAL: Axis = { factor: "spacing", size: "height" };

/** The boxes a stretch on one axis acts on. */
interface Scope {
  /** The key of `places` whose `length` or `spacing` the stretch sets. */
  readonly key: string;
  /** The item of the drawing holding the boxes. */
  readonly item: string;
  /** The members' cards whose stated size follows their content. */
  readonly cards: readonly string[];
  /** The box the pointer drags: the item's key, or a member's. */
  readonly dragged: string;
}

/** The stretch at one value of its factor. */
interface Stretched {
  readonly changes: Map<string, PlaceValues>;
  /** The places of the block with the changes merged. */
  readonly places: Block["places"];
  /** The item's content, its own stated size left out, on the axis. */
  readonly content: number;
  /** The dragged box's drawn size on the axis. */
  readonly drawn: number;
}

/**
 * The stretch of `scope` on `axis` within `block` as a function of the
 * factor's value: the factor stated on the scope's key, and every stated
 * size of the scope's cards, then of its item, following its own content
 * (`kept`), the cards first since the item's content holds them. A `pinned`
 * item size is stated as given instead (the group editor's frame). Sizes
 * are in item coordinates.
 */
function stretching(
  block: Block,
  settings: WorkspaceSettings,
  metrics: FontMetrics,
  axis: Axis,
  scope: Scope,
  pinned: number | null,
): (value: number) => Stretched {
  const { factor, size } = axis;
  const base = block.places;
  const draw = (places: Block["places"]) => drawingOf(block, settings, metrics, { places });
  const unstated = (places: Block["places"], keys: readonly string[]) =>
    keys.reduce((held, key) => placesWith(held, key, { [size]: null }), places);
  const sizeOf = (drawing: Drawing, key: string) =>
    key === scope.item
      ? itemOf(drawing, key).place[size]
      : cardOf(drawing, key, scope.item).size[size];
  const stated = (key: string) => base[key]?.[size] ?? null;
  const requests = scope.cards.filter((key) => stated(key) !== null);
  const itemRequest = pinned === null ? stated(scope.item) : null;
  // The cards' own contents: a frame's width would widen them.
  const own = [...requests, scope.item];
  const before = draw(unstated(base, own));
  const contents = new Map(requests.map((key) => [key, sizeOf(before, key)]));
  const itemContent =
    itemRequest === null ? 0 : sizeOf(draw(unstated(base, [scope.item])), scope.item);

  return (value) => {
    const changes = new Map<string, PlaceValues>();
    let places = base;
    const set = (key: string, values: PlaceValues) => {
      changes.set(key, { ...changes.get(key), ...values });
      places = placesWith(places, key, values);
    };
    set(scope.key, { [factor]: value });
    if (requests.length > 0) {
      const free = draw(unstated(places, own));
      for (const key of requests) {
        const request = kept(stated(key), contents.get(key) ?? 0, sizeOf(free, key));
        if (request !== stated(key)) set(key, { [size]: request });
      }
    }
    if (pinned !== null) set(scope.item, { [size]: pinned });
    const sized = draw(unstated(places, [scope.item]));
    const content = sizeOf(sized, scope.item);
    if (itemRequest !== null) {
      const request = kept(itemRequest, itemContent, content);
      if (request !== itemRequest) set(scope.item, { [size]: request });
    }
    // A frame's width widens its cards, so the dragged box is measured with every request.
    const bare = requests.length === 0 && itemRequest === null && pinned === null;
    const dragged = sizeOf(bare ? sized : draw(places), scope.dragged);
    return { changes, places, content, drawn: dragged };
  };
}

/** A stretch of one box on one axis. */
interface Stretch {
  /** The stretch at each value of its factor. */
  readonly at: (value: number) => Stretched;
  /** The factor's value before the stretch. */
  readonly start: number;
  /** The frame's width the group editor pins along time; else `null`. */
  readonly pinned: number | null;
}

/**
 * The stretch of the box `resized` of `block` on `axis` at `level`: its
 * factor on the key `RESIZING` names, and the stated sizes following their
 * content, along time those of the item and of every member's card it
 * holds; vertically the same for a frame or an ungrouped card, and for a
 * member's card those of the card and of its frame. In the group editor the
 * frame's width is pinned along time at its drawn width.
 */
function stretchOf(
  block: Block,
  settings: WorkspaceSettings,
  metrics: FontMetrics,
  level: Level,
  resized: ResizedItem,
  axis: Axis,
): Stretch {
  const drawing = drawingOf(block, settings, metrics);
  const item = itemOf(drawing, resized.item);
  const member = resized.kind === "member";
  const key = keyOf(resized, axis.factor);
  const cards =
    member && axis === VERTICAL
      ? [key]
      : drawing.cards.filter((card) => card.group === item.key).map((card) => card.key);
  const scope = { key, item: item.key, cards, dragged: member ? resized.key : item.key };
  const pinned =
    axis === HORIZONTAL && level === "group" ? quantize(item.place.width, GRID_FREE) : null;
  const start = axis === HORIZONTAL ? item.place.length : (block.places[key]?.spacing ?? 1);
  return { at: stretching(block, settings, metrics, axis, scope, pinned), start, pinned };
}

/**
 * The places a Stretch of the box `resized` of `block` at `level` writes
 * once its `factor`, `length` or `spacing`, is `value`: the factor on its
 * key (a member's card stretches its group's `length` and its own
 * `spacing`), then every stated size the stretch changes the content of
 * following that content in proportion (`kept`): along time the widths of
 * the item and of the members' cards it holds, so the members' lines keep
 * one length and every margin stretches with them; vertically the heights
 * of a frame and its members' cards, or of a member's card and its frame.
 * In the group editor the frame does not grow along time: its `width` is
 * pinned at its drawn width and the length capped at the largest whose
 * content, the cards' widths following, does not pass it. The Stretch
 * gesture and a typed length or spacing both write these places.
 */
export function stretchChanges(
  block: Block,
  settings: WorkspaceSettings,
  metrics: FontMetrics,
  level: Level,
  resized: ResizedItem,
  factor: "length" | "spacing",
  value: number,
): PlaceChanges {
  const axis = factor === "length" ? HORIZONTAL : VERTICAL;
  const { at, start, pinned } = stretchOf(block, settings, metrics, level, resized, axis);
  if (pinned === null) return at(value).changes;
  const content = (length: number) => at(length).content;
  const capped =
    content(value) > pinned ? Math.min(value, solve(content, start, pinned, MIN_LENGTH)) : value;
  return at(capped).changes;
}

/** `changes` with `more` merged in, key by key, in order. */
function merged(
  changes: ReadonlyMap<string, PlaceValues>,
  more: ReadonlyMap<string, PlaceValues>,
): Map<string, PlaceValues> {
  const all = new Map(changes);
  for (const [key, values] of more) all.set(key, { ...all.get(key), ...values });
  return all;
}

/**
 * The places that resize the box `resized` of `block` by dragging `handle`
 * by `delta` (canvas units, as for a block) at `level`: each key of
 * `places` with its values, in order. Every position is in the drawing's
 * units, measured from the place origin; every size in the item's own
 * coordinates, before its scale, so the pointer's travel is divided by the
 * block's scale and the item's; every number is quantized to `GRID_FREE`.
 * The dragged edge or corner ends under the pointer and the opposite one
 * stays exactly where it is drawn: for a left or top handle the stated `x`
 * or `y` is the opposite edge less the achieved drawn size.
 *
 * - `scale` (corners only) sets the item's `scale` to its scale times the
 *   larger of the two axis ratios of the dragged corner's distance from the
 *   fixed corner after and before the drag, floored at `MIN_SCALE`; scale 1,
 *   the default, unstates it. On a member's card the fixed corner is its
 *   frame's top left and the dragged corner the card's bottom right, and the
 *   scale is the group's.
 * - `box` sets `width` and `height`; a request at or below the box's own
 *   content stores `null`. On a member's card they are the card's own.
 * - `stretch` sets `length` from a left or right handle and `spacing` from
 *   a top or bottom one, both from a corner: the largest value whose box
 *   does not pass the pointer, floored at `MIN_LENGTH` and `MIN_SPACING`.
 *   Every stated size of the boxes stretched follows its own content by
 *   `kept`, keeping its proportion to it: along time the item's and, for a
 *   group, every member's card's width, so the members' lines keep one
 *   length and every margin stretches with them; vertically the item's and
 *   its members' cards' heights. A member's card stretches its group along
 *   time, the card's own box following the pointer, and only its own card's
 *   `spacing` vertically, the card's and its frame's heights following.
 *   The places are `stretchChanges` at the value found.
 * - In the group editor the frame does not grow along time: a horizontal
 *   stretch states the frame's `width` at its drawn width and caps the
 *   group's `length` where its content, the cards' widths following, would
 *   pass it; the frame's content follows the pointer, whichever box is
 *   dragged. Vertically the frame adapts.
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
): PlaceChanges {
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
    return new Map([[keyOf(resized, "scale"), values]]);
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
    return new Map([[keyOf(resized, "box"), values]]);
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
    return new Map([[keyOf(resized, "box"), values]]);
  }

  const member = resized.kind === "member";
  /** The dragged box's drawn size on an axis in `of`, in item coordinates. */
  const sizeIn = (of: Drawing, axis: Axis) =>
    member
      ? cardOf(of, resized.key, item.key).size[axis.size]
      : itemOf(of, item.key).place[axis.size];
  let stretched = block;
  let changes: PlaceChanges = new Map();
  const stretchTo = (factor: Axis["factor"], value: number) => {
    const more = stretchChanges(stretched, settings, metrics, level, resized, factor, value);
    changes = merged(changes, more);
    let places = stretched.places;
    for (const [key, values] of more) places = placesWith(places, key, values);
    stretched = { ...stretched, places };
  };

  if (sx !== 0) {
    const { at, start, pinned } = stretchOf(block, settings, metrics, level, resized, HORIZONTAL);
    if (pinned === null) {
      const target = member
        ? sizeIn(drawing, HORIZONTAL) + dx / scale
        : ((sx > 0 ? right + dx : right) - left) / scale;
      stretchTo(
        "length",
        solve((value) => at(value).drawn, start, target, MIN_LENGTH),
      );
    } else {
      // The frame is pinned, so the frame's content follows the pointer, whichever box is dragged.
      const content = (value: number) => at(value).content;
      stretchTo("length", solve(content, start, content(start) + dx / scale, MIN_LENGTH));
    }
  }

  if (sy !== 0) {
    const { at, start } = stretchOf(stretched, settings, metrics, level, resized, VERTICAL);
    const target = member
      ? sizeIn(drawing, VERTICAL) + dy / scale
      : ((sy > 0 ? bottom + dy : bottom) - top) / scale;
    stretchTo(
      "spacing",
      solve((value) => at(value).drawn, start, target, MIN_SPACING),
    );
  }

  if (sx >= 0 && sy >= 0) return changes;
  const after = drawingOf(stretched, settings, metrics);
  const own: PlaceValues = {};
  if (sx < 0) own.x = quantize(right - scale * sizeIn(after, HORIZONTAL), GRID_FREE);
  if (sy < 0) own.y = quantize(bottom - scale * sizeIn(after, VERTICAL), GRID_FREE);
  return merged(changes, new Map([[item.key, own]]));
}
