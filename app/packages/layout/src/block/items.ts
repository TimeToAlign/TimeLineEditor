/**
 * One item of the block laid out in item coordinates (`docs/drawing.md` in
 * TimeToShare, sections 8.2, 8.4 and 8.5): a group's frame with its title
 * and its members' cards, or a block-held card, an item of one card without a
 * frame. Both take the same path: the cards' member drawings drawn at the
 * shared start, the right edge, then the elements in drawing order with the
 * records of the item's containers and the axes of its lines.
 */

import { type DrawnAxis, type DrawnBox, identityOf } from "../boxes.ts";
import { K, Q, SHADOW_OFFSET } from "../constants.ts";
import type { DrawnElement, TextElement } from "../elements.ts";
import { rightEdge } from "../geometry.ts";
import type { MemberDrawn } from "../member.ts";
import type { TextMeasure } from "../metrics.ts";
import { shown } from "../traversal.ts";
import { axesOf } from "./axes.ts";
import { type Columns, contentRight, type Horizontal } from "./horizontal.ts";
import type { Card, Item, Title } from "./places.ts";

/** An item with each card's member drawing drawn at the shared start `s0`, in item coordinates. */
export interface ItemDrawing {
  readonly item: Item;
  /** Its cards' member drawings, in the order of its cards. */
  readonly drawn: readonly MemberDrawn[];
  /** Its cards' axes, in the order of its cards and of their lines. */
  readonly axes: readonly (readonly DrawnAxis[])[];
}

/** What an item draws, in item coordinates; its ranges count from its first element. */
export interface LaidItem {
  readonly item: Item;
  readonly elements: readonly DrawnElement[];
  readonly boxes: readonly DrawnBox[];
  readonly axes: readonly DrawnAxis[];
  /** The right and bottom edges it draws, its cards' shadows included, for the block's size. */
  readonly rights: readonly number[];
  readonly bottoms: readonly number[];
}

/** A title's name element at `x` with its baseline at `baseline`. */
export function titleElement(title: Title, x: number, baseline: number): TextElement {
  const { address, style, text } = title;
  return { type: "name", address, style, x, baseline, anchor: "start", text };
}

/** Draw each card of `item` at the columns: its member drawing's start `s0`, its top its card's. */
export function drawItem(item: Item, { n, s0 }: Columns): ItemDrawing {
  const drawn = item.cards.map((card) => card.layout.drawAt(s0, n, card.top));
  return {
    item,
    drawn,
    axes: item.cards.map((card, index) =>
      axesOf(card.member, drawn[index] ?? EMPTY, s0, item.length),
    ),
  };
}

const EMPTY: MemberDrawn = { elements: [], bands: [] };

/**
 * Lay out an item drawn as `drawing` (sections 8.2, 8.4 and 8.5). A frame
 * holds its cards `Q` in from its edges, below its title; a block-held card is
 * its item. Its right edge before its request is `Ri`, past its title, at
 * least its requested `width` less `K` and its inset (`Q` for a frame, the
 * block's inset for a block-held card). Every card ends at `Ri + K`, a block-held
 * card its inset further, unless its own request widens it; a frame holds
 * them and `Q` more. A card takes its room whether displayed or not, its
 * shadow only when drawn. The records follow the elements: the frame, then
 * each card and each of its bands, held by that card, each with the
 * identity core lists it with.
 */
export function layoutItem(
  drawing: ItemDrawing,
  horizontal: Horizontal,
  measure: TextMeasure,
): LaidItem {
  const { item } = drawing;
  const { frame, stated } = item;
  const title =
    frame?.title === undefined
      ? undefined
      : titleElement(frame.title, Q, Q + measure.ascent(frame.title.size));
  const inset = frame === null ? horizontal.inset : Q;
  let R = contentRight(
    horizontal,
    item.length,
    title === undefined ? undefined : rightEdge(title, measure),
  );
  if (stated.width !== undefined) R = Math.max(R, stated.width - K - inset);
  const end = frame === null ? R + K + inset : R + K;
  const left = frame === null ? 0 : Q;
  const cardRights = item.cards.map((card) =>
    card.stated.width === undefined ? end : Math.max(end, left + card.stated.width),
  );
  const right = frame === null ? end : Math.max(end, ...cardRights) + Q;
  const place = { x: item.x, y: item.y, length: item.length, scale: item.scale };
  const itemRecord = {
    item: {
      place: {
        ...place,
        spacing: item.spacing,
        margin: item.margin,
        width: right,
        height: item.height,
      },
      stated,
    },
  };

  const elements: DrawnElement[] = [];
  const boxes: DrawnBox[] = [];
  const rights = [right];
  const bottoms = [item.height];
  const frameShown = frame !== null && shown(frame.holder.style);
  if (frame !== null) {
    if (frameShown) {
      elements.push({
        type: "frame",
        address: frame.address,
        style: frame.holder.style,
        x: 0,
        y: 0,
        width: right,
        height: item.height,
        shadowOffset: 0,
      });
    }
    if (title !== undefined) elements.push(title);
  }
  const cards = item.cards.map((card, index) => {
    const cardRight = cardRights[index] ?? end;
    const bottom = card.top + card.height;
    const from = elements.length;
    rights.push(cardRight);
    bottoms.push(bottom);
    const displayed = shown(card.style);
    if (displayed) {
      if (card.style.shadow !== "none") {
        rights.push(cardRight + SHADOW_OFFSET);
        bottoms.push(bottom + SHADOW_OFFSET);
      }
      elements.push(cardElement(card, left, cardRight, bottom));
    }
    const drawn = drawing.drawn[index] ?? EMPTY;
    // The member drawing's ranges count from its first element, which follows the card's own.
    const offset = elements.length;
    elements.push(...drawn.elements);
    const range = { start: from, end: elements.length };
    const bands = drawn.bands.map((band) => ({
      ...band,
      range: { start: offset + band.range.start, end: offset + band.range.end },
    }));
    return { card, bands, cardRight, bottom, displayed, range };
  });
  if (frame !== null) {
    boxes.push({
      ...identityOf(frame.ref),
      x: 0,
      y: 0,
      width: right,
      height: item.height,
      range: { start: 0, end: elements.length },
      displayed: frameShown,
      contentCount: item.cards.length,
      ...itemRecord,
    });
  }
  for (const { card, bands, cardRight, bottom, displayed, range } of cards) {
    boxes.push({
      ...identityOf(card.ref),
      x: left,
      y: card.top,
      width: cardRight - left,
      height: bottom - card.top,
      range,
      displayed,
      contentCount: card.layout.contentCount,
      ...(frame === null ? itemRecord : {}),
      card: {
        size: { width: cardRight - left, height: card.height },
        spacing: card.spacing,
        margin: card.margin,
        stated: card.stated,
      },
    });
    boxes.push(...bands);
  }
  return { item, elements, boxes, axes: drawing.axes.flat(), rights, bottoms };
}

/** A card's rectangle from `left` to `right` and from its top to `bottom`. */
function cardElement(card: Card, left: number, right: number, bottom: number): DrawnElement {
  return {
    type: "card",
    address: card.address,
    style: card.style,
    x: left,
    y: card.top,
    width: right - left,
    height: bottom - card.top,
    shadowOffset: SHADOW_OFFSET,
  };
}
