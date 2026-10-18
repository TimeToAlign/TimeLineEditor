/**
 * The boxes of a block's drawing and what the pointer does with them. A
 * drawing shows three kinds of box (`docs/drawing.md` in timeskeleton,
 * section 8): the block's own box (its background), a group's frame and a
 * timeline's card. Every other drawn thing is an element. A timeline's
 * editor adds a fourth kind, the bands of its timeline (section 6.4,
 * `bands.ts`), which the drawing records and never draws.
 *
 * This module is the one place that maps a pointer target to what it hits,
 * a box of one of those kinds or an element, with its address; that decides
 * what a press selects; that decides what the pointer highlights; and that
 * decides which boxes hold part of the selection, by what each box draws,
 * never by where it lies. While an editor is open,
 * only what lies inside the edited element is selected and highlighted. The
 * editor a double-click on a hit opens is `editorTargetOf`'s (`editors.ts`).
 *
 * A hit is classified by the drawing's element types, never by the form of
 * an address: a frame is addressed by its bare group id, exactly like a
 * timeline's line.
 */

import type { Address, BlockId, EditorKind } from "@timetoalign/tilie-core";
import { parseBand } from "@timetoalign/tilie-core";
import type { Drawing, DrawnBand, RectElement } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";
import { bandAt } from "./bands.ts";

/**
 * The kinds of box: the three a drawing shows, the block's own box, a
 * group's frame and a timeline's card, and a band of a timeline, which the
 * drawing records but never draws.
 */
export type BoxKind = "block" | "group" | "card" | "band";

/** A point in a drawing's own units. */
export interface DrawingPoint {
  readonly x: number;
  readonly y: number;
}

/** What a pointer target hits in block `block`. */
export interface Hit {
  readonly block: BlockId;
  /** A box's kind, or `"element"` for anything else drawn. */
  readonly kind: BoxKind | "element";
  /**
   * Block-qualified: the block id for the block's own box, else `<block>/<element address>`,
   * a band's being `<block>/<timeline>/<kind>_1`.
   */
  readonly address: string;
  /** Whether the target is a segment's boundary line. */
  readonly boundary: boolean;
  /**
   * The drawn card or frame on top at the point, by its element address;
   * `null` outside every one, or when no point was given.
   */
  readonly within: string | null;
  /**
   * The band hit, as the drawing records it (a timeline drawn with two lines
   * has a record at each, and this is the one holding the point); `null`
   * for every other hit.
   */
  readonly band: DrawnBand | null;
}

/** What the pointer highlights in a block, by element address as the descriptors carry it. */
export interface Hover {
  /** A card or a frame. The block's own box is never marked: its node shows it. */
  readonly box: string | null;
  readonly boundary: string | null;
  /** A band of the edited timeline, `<timeline>/<kind>_1`. */
  readonly band: string | null;
}

export const NO_HOVER: Hover = { box: null, boundary: null, band: null };

/**
 * A descriptor that carries a box's or a boundary's mark: the block's
 * background, a card's own rectangle, the card's shadow, a frame, a
 * boundary's line.
 */
export type Mark = "block" | "card" | "shadow" | "group" | "boundary";

interface Boxes {
  /** The kind of every drawn card and frame, by address. */
  readonly kinds: ReadonlyMap<string, "group" | "card">;
  /** The drawn cards and frames, in drawing order. */
  readonly rects: readonly RectElement[];
  readonly boundaries: ReadonlySet<string>;
  /**
   * Every drawn address, with the drawn cards and frames it is drawn as
   * part of, by their addresses; a box is not part of itself.
   */
  readonly holders: ReadonlyMap<string, ReadonlySet<string>>;
}

/** The boxes holding part of a selection: the block's own box, and its cards and frames by address. */
export interface Holding {
  readonly block: boolean;
  readonly boxes: ReadonlySet<string>;
}

const boxes = new WeakMap<Drawing, Boxes>();
const marks = new WeakMap<readonly Descriptor[], ReadonlyMap<Descriptor, Mark>>();

function boxesOf(drawing: Drawing): Boxes {
  let found = boxes.get(drawing);
  if (found === undefined) {
    const kinds = new Map<string, "group" | "card">();
    const rects: RectElement[] = [];
    const boundaries = new Set<string>();
    for (const element of drawing.elements) {
      if (element.type === "group" || element.type === "card") {
        kinds.set(element.address, element.type);
        rects.push(element);
      } else if (element.type === "boundary") {
        boundaries.add(element.address);
      }
    }
    found = { kinds, rects, boundaries, holders: holdersOf(drawing, kinds) };
    boxes.set(drawing, found);
  }
  return found;
}

function holds(rect: RectElement, { x, y }: DrawingPoint): boolean {
  return rect.x <= x && x <= rect.x + rect.width && rect.y <= y && y <= rect.y + rect.height;
}

/**
 * Every address `drawing` draws, with the drawn cards and frames (`kinds`)
 * it is drawn as part of: those whose range of elements (`DrawnItem` and
 * `DrawnCard` in layout) holds an element carrying it, the box's own
 * rectangle excepted. A frame's range holds its title, its cards and their
 * member drawings, a card's its member drawing, ancestor lines included,
 * so the answer depends on what each box drew, never on where it lies.
 */
function holdersOf(
  drawing: Drawing,
  kinds: ReadonlyMap<string, "group" | "card">,
): ReadonlyMap<string, ReadonlySet<string>> {
  const holders = new Map<string, Set<string>>();
  for (const { address } of drawing.elements) {
    if (address !== null && !holders.has(address)) holders.set(address, new Set());
  }
  for (const { address, range } of [...drawing.items, ...drawing.cards]) {
    if (!kinds.has(address)) continue;
    for (const { address: part } of drawing.elements.slice(range.start, range.end)) {
      if (part !== null && part !== address) holders.get(part)?.add(address);
    }
  }
  return holders;
}

/**
 * The point of `drawing` under the client point `(x, y)`, the drawing shown
 * in the screen rectangle `box` (its `<svg>`'s); `null` while it is shown at
 * no size.
 */
export function drawingPointAt(
  drawing: Drawing,
  box: Pick<DOMRectReadOnly, "left" | "top" | "width" | "height">,
  x: number,
  y: number,
): DrawingPoint | null {
  if (box.width === 0 || box.height === 0) return null;
  return {
    x: ((x - box.left) * drawing.width) / box.width,
    y: ((y - box.top) * drawing.height) / box.height,
  };
}

/**
 * The timeline whose bands block `block` offers under `editing`, the
 * innermost open editor: the edited timeline when `editing` is a timeline
 * editor in this block, else `null` (on the arranger, in a bundle or group
 * editor, and in another block's editor). Hitting a band, marking it,
 * dragging it, stepping it by key and keeping it selected (`offersBand`)
 * all ask this one rule.
 */
export function bandTimelineOf(
  block: BlockId,
  editing: { readonly target: Address; readonly kind: EditorKind } | null,
): string | null {
  if (editing?.kind !== "timeline" || !editing.target.startsWith(`${block}/`)) return null;
  return editing.target.slice(block.length + 1);
}

/**
 * What `target` hits in block `block`, drawn as `drawing`: the element
 * carrying the nearest `data-address` at or above it, classified by the
 * drawing's element of that address (a card, a frame, else an element), or
 * the block's own box when nothing there carries an address. With `point`
 * (in the drawing's units), also the box under it: the last drawn card or
 * frame whose rectangle holds it, edges included, which is the one drawn
 * on top: a frame is drawn before its cards, and items that overlap are
 * drawn in item order. A box that is not displayed is not drawn and holds
 * no point.
 *
 * A band is hit only in the timeline editor of its timeline, when `editing`,
 * the innermost open editor, is that editor in this block
 * (`bandTimelineOf`): where the target is a box (the block's own, a frame,
 * a card) or nothing, the band of the edited timeline whose rectangle holds
 * `point` (`bandAt`) is hit instead, its record carried as `band`, so a
 * drawn element is always hit before a band.
 */
export function hitOf(
  block: BlockId,
  drawing: Drawing,
  target: EventTarget | null,
  point?: DrawingPoint,
  editing: { readonly target: Address; readonly kind: EditorKind } | null = null,
): Hit {
  const { kinds, rects, boundaries } = boxesOf(drawing);
  const within =
    point === undefined ? null : (rects.findLast((rect) => holds(rect, point))?.address ?? null);
  const addressed = target instanceof Element ? target.closest("[data-address]") : null;
  const element = addressed?.getAttribute("data-address") ?? null;
  const kind = element === null ? "block" : (kinds.get(element) ?? "element");
  const timeline = bandTimelineOf(block, editing);
  const band =
    kind === "element" || point === undefined || timeline === null
      ? null
      : bandAt(drawing, timeline, point);
  if (band !== null) {
    const address = `${block}/${band.address}`;
    return { block, kind: "band", address, boundary: false, within, band };
  }
  if (addressed === null || element === null) {
    return { block, kind: "block", address: block, boundary: false, within, band: null };
  }
  return {
    block,
    kind,
    address: `${block}/${element}`,
    // A wedge may carry a boundary's `S/start` form, but it is a polygon.
    boundary: addressed.localName === "line" && boundaries.has(element),
    within,
    band: null,
  };
}

/**
 * What a press selects: what it hit, when it lies inside the edited element,
 * else nothing (`null`). A card selects the card (its shadow carries the
 * card's address and does the same), a frame its group, any other element
 * that element, each when `inside` (the drawn addresses inside the edited
 * element, `BlockNodeData.inside`) holds its element address; the block's own
 * box selects the block on the arranger (`editing` null) and in the block's
 * own bundle editor, never in another editor. A band selects itself: only a
 * band of the edited timeline is hit.
 */
export function selectionOf(
  hit: Hit,
  editing: { readonly target: Address } | null,
  inside: ReadonlySet<string>,
): string | null {
  if (hit.kind === "band") return hit.address;
  if (hit.kind === "block") {
    return editing === null || editing.target === hit.block ? hit.address : null;
  }
  return inside.has(hit.address.slice(hit.block.length + 1)) ? hit.address : null;
}

/**
 * What the pointer highlights: the box under it (a card or a frame), the
 * boundary it is on, and the band it is on.
 */
export function hoverOf(hit: Hit): Hover {
  const element = hit.address.slice(hit.block.length + 1);
  return {
    box: hit.within,
    boundary: hit.boundary ? element : null,
    band: hit.kind === "band" ? element : null,
  };
}

/**
 * The descriptors of `drawing` that carry a box's or a boundary's mark,
 * memoized by the descriptor list. A card and its shadow are both `rect`s
 * carrying the card's address; the shadow is written first (section 7.2),
 * so the card is the last `rect` carrying its address and any `rect`
 * before it with that address is its shadow. The block's background is
 * the first descriptor, a `rect` with no address (section 8.5). Every
 * other descriptor is absent.
 */
export function marksOf(
  drawing: Drawing,
  descriptors: readonly Descriptor[],
): ReadonlyMap<Descriptor, Mark> {
  let found = marks.get(descriptors);
  if (found === undefined) {
    const { kinds, boundaries } = boxesOf(drawing);
    const cards = new Map<string, Descriptor>();
    const named = new Map<Descriptor, Mark>();
    const [background] = descriptors;
    if (background?.tag === "rect" && addressOf(background) === null) {
      named.set(background, "block");
    }
    for (const descriptor of descriptors) {
      const address = addressOf(descriptor);
      if (address === null) continue;
      const kind = kinds.get(address);
      if (descriptor.tag === "rect" && kind === "card") {
        const shadow = cards.get(address);
        if (shadow !== undefined) named.set(shadow, "shadow");
        cards.set(address, descriptor);
        named.set(descriptor, "card");
      } else if (descriptor.tag === "rect" && kind === "group") {
        named.set(descriptor, "group");
      } else if (descriptor.tag === "line" && boundaries.has(address)) {
        named.set(descriptor, "boundary");
      }
    }
    found = named;
    marks.set(descriptors, found);
  }
  return found;
}

/**
 * The boxes of `drawing` holding part of the selection `selected` (element
 * addresses, as the descriptors carry them): a box holds the selection when
 * an element drawn as part of it carries a selected address, the box itself
 * excepted. A card holds its member drawing, its timeline and everything
 * drawn with it; a frame its title, its members' cards and what they hold;
 * the block's own box every drawn element. Where a box lies plays no part,
 * so items that overlap change nothing. So a selected card marks its frame
 * and the block but not itself; a line marks its card, that card's frame
 * and the block; and an address drawn in several cards, such as an
 * ancestor line, marks each of them. An address that is not drawn marks
 * nothing. A band, which draws nothing, counts as its timeline's line.
 */
export function holdingOf(drawing: Drawing, selected: ReadonlySet<string>): Holding {
  const held = new Set<string>();
  let block = false;
  if (selected.size === 0) return { block, boxes: held };
  const { holders } = boxesOf(drawing);
  for (const address of selected) {
    const holding = holders.get(parseBand(address)?.timeline ?? address);
    if (holding === undefined) continue;
    block = true;
    for (const box of holding) held.add(box);
  }
  return { block, boxes: held };
}

/** A descriptor's `data-address`, or `null`. */
export function addressOf(descriptor: Descriptor): string | null {
  const value = descriptor.attrs.find(([name]) => name === "data-address")?.[1];
  return typeof value === "string" ? value : null;
}

/**
 * Whether a descriptor shows the selection: it carries a selected address
 * and is not a card's shadow, so a selected card glows on its own rectangle.
 */
export function showsSelection(
  mark: Mark | undefined,
  address: string | null,
  selected: ReadonlySet<string>,
): boolean {
  return address !== null && mark !== "shadow" && selected.has(address);
}

/**
 * Whether a descriptor shows that its box holds part of the selection: a
 * card's or a frame's own `rect` whose address is among `holding`
 * (`holdingOf`), never a card's shadow.
 */
export function showsContainedSelection(
  mark: Mark | undefined,
  address: string | null,
  holding: ReadonlySet<string>,
): boolean {
  return (mark === "card" || mark === "group") && address !== null && holding.has(address);
}

/**
 * Whether a descriptor shows the hover: the hovered box's own rectangle, or
 * the hovered boundary, when its address lies inside the edited element
 * (`inside`, as for `selectionOf`).
 */
export function showsHover(
  mark: Mark | undefined,
  address: string | null,
  hover: Hover,
  inside: ReadonlySet<string>,
): boolean {
  if (address === null || !inside.has(address)) return false;
  switch (mark) {
    case "card":
    case "group":
      return address === hover.box;
    case "boundary":
      return address === hover.boundary;
    default:
      return false;
  }
}
