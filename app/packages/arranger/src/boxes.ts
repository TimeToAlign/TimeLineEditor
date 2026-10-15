/**
 * The boxes of a block's drawing and what the pointer does with them. A
 * drawing shows three kinds of box (`docs/drawing.md` in timeskeleton,
 * section 8): the block's own box (its background), a group's frame and a
 * timeline's card. Every other drawn thing is an element.
 *
 * This module is the one place that maps a pointer target to what it hits,
 * a box of one of those kinds or an element, with its address; that decides
 * what a press selects; that decides what the pointer highlights; and that
 * decides which boxes hold part of the selection. A double-click on a box
 * will dispatch from here to that box's editor.
 *
 * A hit is classified by the drawing's element types, never by the form of
 * an address: a frame is addressed by its bare group id, exactly like a
 * timeline's line.
 */

import type { BlockId } from "@timetoalign/tilie-core";
import type { Drawing, DrawnElement, RectElement } from "@timetoalign/tilie-layout";
import type { Descriptor } from "@timetoalign/tilie-writers";

/** The kinds of box a drawing shows: the block's own box, a group's frame, a timeline's card. */
export type BoxKind = "block" | "group" | "card";

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
  /** Block-qualified: the block id for the block's own box, else `<block>/<element address>`. */
  readonly address: string;
  /** Whether the target is a segment's boundary line. */
  readonly boundary: boolean;
  /**
   * The innermost drawn card or frame holding the point, by its element
   * address; `null` outside every one, or when no point was given.
   */
  readonly within: string | null;
}

/** What the pointer highlights in a block, by element address as the descriptors carry it. */
export interface Hover {
  /** A card or a frame. The block's own box is never marked: its node shows it. */
  readonly box: string | null;
  readonly boundary: string | null;
}

export const NO_HOVER: Hover = { box: null, boundary: null };

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
   * Every drawn address, with the cards and frames holding an element
   * that carries it, by their addresses; a box does not hold itself.
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
    const holders = new Map<string, Set<string>>();
    for (const element of drawing.elements) {
      if (element.type === "block") continue;
      const points = pointsIn(element);
      const held = holders.get(element.address) ?? new Set<string>();
      for (const rect of rects) {
        if (rect !== element && points.every((point) => holds(rect, point))) held.add(rect.address);
      }
      holders.set(element.address, held);
    }
    found = { kinds, rects, boundaries, holders };
    boxes.set(drawing, found);
  }
  return found;
}

function holds(rect: RectElement, { x, y }: DrawingPoint): boolean {
  return rect.x <= x && x <= rect.x + rect.width && rect.y <= y && y <= rect.y + rect.height;
}

/**
 * The points a box must hold to hold a drawn element. A card or frame is
 * held by a box holding both its corners: a card lies wholly inside its
 * frame (section 8.4), and a frame inside no card. Any other element lies
 * wholly inside its member drawing, and so inside its card, and no two
 * cards and no two frames overlap, so one point of it decides: the middle
 * of a line or map, the middle of a region's span, a jump's start, the
 * middle of a break, boundary or wedge, a text's anchor on its baseline.
 */
function pointsIn(element: Exclude<DrawnElement, { readonly type: "block" }>): DrawingPoint[] {
  switch (element.type) {
    case "group":
    case "card":
      return [
        { x: element.x, y: element.y },
        { x: element.x + element.width, y: element.y + element.height },
      ];
    case "timeline":
    case "child":
    case "ancestor":
      return [{ x: (element.xs + element.xe) / 2, y: element.y }];
    case "map":
      return [{ x: (element.xs + element.xe) / 2, y: element.yc }];
    case "region":
      return [{ x: element.xm, y: (element.yb + element.ya) / 2 }];
    case "jump":
      return [{ x: element.start[0], y: element.start[1] }];
    case "break":
    case "boundary":
      return [{ x: element.x, y: (element.y1 + element.y2) / 2 }];
    case "wedge":
      return [{ x: element.x, y: (element.yt + element.yb) / 2 }];
    case "name":
    case "label":
      return [{ x: element.x, y: element.baseline }];
  }
}

/**
 * What `target` hits in block `block`, drawn as `drawing`: the element
 * carrying the nearest `data-address` at or above it, classified by the
 * drawing's element of that address (a card, a frame, else an element), or
 * the block's own box when nothing there carries an address. With `point`
 * (in the drawing's units), also the box under it: the last drawn card or
 * frame whose rectangle holds it, edges included. A frame is drawn before
 * its cards and cards never overlap, so that box is the innermost; a box
 * that is not displayed is not drawn and holds no point.
 */
export function hitOf(
  block: BlockId,
  drawing: Drawing,
  target: EventTarget | null,
  point?: DrawingPoint,
): Hit {
  const { kinds, rects, boundaries } = boxesOf(drawing);
  const within =
    point === undefined ? null : (rects.findLast((rect) => holds(rect, point))?.address ?? null);
  const addressed = target instanceof Element ? target.closest("[data-address]") : null;
  const element = addressed?.getAttribute("data-address") ?? null;
  if (addressed === null || element === null) {
    return { block, kind: "block", address: block, boundary: false, within };
  }
  return {
    block,
    kind: kinds.get(element) ?? "element",
    address: `${block}/${element}`,
    // A wedge may carry a boundary's `S/start` form, but it is a polygon.
    boundary: addressed.localName === "line" && boundaries.has(element),
    within,
  };
}

/**
 * What a press selects: what it hit. A card selects the card (its shadow
 * carries the card's address and does the same), a frame its group, the
 * block's own box the block, any other element that element.
 */
export function selectionOf(hit: Hit): string {
  return hit.address;
}

/**
 * What the pointer highlights: the box under it (a card or a frame), and the
 * boundary it is on.
 */
export function hoverOf(hit: Hit): Hover {
  return {
    box: hit.within,
    boundary: hit.boundary ? hit.address.slice(hit.block.length + 1) : null,
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
 * an element drawn inside it carries a selected address, the box itself
 * excepted. So a selected card marks its frame and the block but not
 * itself; a line marks its card, that card's frame and the block; and an
 * address drawn in several cards, such as an ancestor line, marks each of
 * them. The block's own box holds every drawn element; an address that is
 * not drawn marks nothing.
 */
export function holdingOf(drawing: Drawing, selected: ReadonlySet<string>): Holding {
  const held = new Set<string>();
  let block = false;
  if (selected.size === 0) return { block, boxes: held };
  const { holders } = boxesOf(drawing);
  for (const address of selected) {
    const holding = holders.get(address);
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

/** Whether a descriptor shows the hover: the hovered box's own rectangle, or the hovered boundary. */
export function showsHover(mark: Mark | undefined, address: string | null, hover: Hover): boolean {
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
