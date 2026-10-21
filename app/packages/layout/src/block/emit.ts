/**
 * The block around the laid-out items (`docs/drawing.md` in TimeToShare,
 * sections 8.4 and 8.6): each item drawn at its place and scale, the block
 * grown to hold them and the title, and everything shifted from the place
 * origin into the block.
 */

import { BUNDLE_ADDRESS } from "@timetoalign/tilie-core";
import type { DrawnAxis, DrawnBox, ElementRange } from "../boxes.ts";
import { placedAt, placedAxis, placedBox } from "../canvas.ts";
import type { Style } from "../cascade.ts";
import { K, P } from "../constants.ts";
import type { Drawing, DrawnElement, Placement } from "../elements.ts";
import type { TextMeasure } from "../metrics.ts";
import { type LaidItem, titleElement } from "./items.ts";
import type { Title } from "./places.ts";

/** What the block holds besides its items: its style, its drawn title and the title's slot `Pt`. */
export interface BlockContent {
  readonly style: Style;
  readonly title: Title | undefined;
  /** No item rises above `Pt` below the block's top edge: the title's slot and `F`, else `P`. */
  readonly Pt: number;
}

/**
 * The drawing of the items `laid` in a block (section 8.4). The block grows left
 * and up to hold every item with the padding `P` and the title's slot above
 * them, so the place origin lies at `(Ox, Oy)` in the block; its content runs
 * from `Xl` to `Xr` and from `Yt` to `Yb` in place coordinates, and its size
 * is at least the requested one. The block's own record comes first, its range
 * every element.
 */
export function emitDrawing(
  laid: readonly LaidItem[],
  block: BlockContent,
  placement: Placement,
  measure: TextMeasure,
): Drawing {
  const xs = laid.map(({ item }) => item.x);
  const ys = laid.map(({ item }) => item.y);
  const Xl = laid.length === 0 ? 0 : Math.min(0, Math.min(...xs) - P);
  const Yt = laid.length === 0 ? 0 : Math.min(0, Math.min(...ys) - block.Pt);
  const Ox = 0 - Xl;
  const Oy = 0 - Yt;

  // Every position below is in place coordinates; the place origin is added to each last.
  const elements: DrawnElement[] = [];
  const boxes: DrawnBox[] = [];
  const axes: DrawnAxis[] = [];
  const rights: number[] = [];
  const bottoms: number[] = [];
  // The displayed title lies at the block's top left corner, its slot ending h(s) lower.
  if (block.title !== undefined) {
    const { size } = block.title;
    const left = Xl + P;
    const top = Yt + P;
    const title = titleElement(block.title, left, top + measure.ascent(size));
    elements.push(title);
    rights.push(left + measure.width(title.text, size));
    bottoms.push(top + measure.lineHeight(size));
  }
  for (const { item, ...local } of laid) {
    const { x, y, scale } = item;
    // After the elements before it and the block's own, element 0.
    const offset = 1 + elements.length;
    const shifted = ({ start, end }: ElementRange) => ({
      start: offset + start,
      end: offset + end,
    });
    for (const element of local.elements) elements.push(placedAt(element, x, y, scale));
    for (const record of local.boxes) {
      boxes.push({ ...placedBox(record, x, y, scale), range: shifted(record.range) });
    }
    for (const axis of local.axes) axes.push(placedAxis(axis, x, y, scale));
    for (const right of local.rights) rights.push(x + scale * right);
    for (const bottom of local.bottoms) bottoms.push(y + scale * bottom);
  }

  const Xr = rights.length === 0 ? 2 * P + K : P + Math.max(...rights);
  const Yb = bottoms.length === 0 ? P : P + Math.max(...bottoms);
  const Wb = Xr - Xl;
  const Hb = Yb - Yt;
  const W = placement.width === null ? Wb : Math.max(Wb, placement.width);
  const H = placement.height === null ? Hb : Math.max(Hb, placement.height);
  const inBlock = elements.map((element) => placedAt(element, Ox, Oy));
  inBlock.unshift({
    type: "block",
    address: BUNDLE_ADDRESS,
    style: block.style,
    width: W,
    height: H,
  });
  const own: DrawnBox = {
    kind: "block",
    key: null,
    address: BUNDLE_ADDRESS,
    holder: null,
    x: 0,
    y: 0,
    width: W,
    height: H,
    range: { start: 0, end: inBlock.length },
    displayed: true,
  };
  return {
    width: W,
    height: H,
    origin: { x: Ox, y: Oy },
    boxes: [own, ...boxes.map((record) => placedBox(record, Ox, Oy))],
    axes: axes.map((axis) => placedAxis(axis, Ox, Oy)),
    elements: inBlock,
    unmapped: [...measure.unmapped].sort((left, right) => left - right),
  };
}
