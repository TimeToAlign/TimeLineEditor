/**
 * The block around the laid-out items (`docs/drawing.md` in TimeToShare,
 * sections 8.4 and 8.6): each item drawn at its place and scale, the block
 * grown to hold them and the title, and everything shifted from the place
 * origin into the block.
 */

import { BUNDLE_ADDRESS } from "@timetoalign/tilie-core";
import {
  type DrawnAxis,
  type DrawnBox,
  type ElementRange,
  type ElisionExposure,
  identityOf,
} from "../boxes.ts";
import { placedAt, placedAxis, placedBox } from "../canvas.ts";
import type { Style } from "../cascade.ts";
import { K, P } from "../constants.ts";
import type { Drawing, DrawnElement, Placement } from "../elements.ts";
import type { TextMeasure } from "../metrics.ts";
import type { LaidAncestorCard } from "./ancestors.ts";
import { type LaidItem, titleElement } from "./items.ts";
import type { Title } from "./places.ts";

/** What the block holds besides its items: its style, its drawn title and the title's slot `Pt`. */
export interface BlockContent {
  readonly style: Style;
  readonly title: Title | undefined;
  /**
   * No item rises above `Pt` below the block's top edge: the title's slot and `F`, else `P`, and
   * the block's margin.
   */
  readonly Pt: number;
  /** The block's margin `Vb`, again below its lowest item. */
  readonly margin: number;
  /** The displayed ancestor cards (section 8.8), drawn before every item. */
  readonly ancestors: readonly LaidAncestorCard[];
  /**
   * The elements drawn after every item (section 8.7), from the drawn lines and boxes in the
   * block's coordinates: the groupstamps' lines across their groups' frames, then the alignment
   * anchors and their labels, none of which take room.
   */
  readonly after: (
    axes: readonly DrawnAxis[],
    boxes: readonly DrawnBox[],
  ) => readonly DrawnElement[];
}

/**
 * The drawing of the items `laid` in a block (section 8.4). The block grows left
 * and up to hold every item with the padding `P` and the title's slot above
 * them, so the place origin lies at `(Ox, Oy)` in the block; its content runs
 * from `Xl` to `Xr` and from `Yt` to `Yb` in place coordinates, the block's
 * margin below its lowest item (a block without items has none), and its size
 * is at least the requested one. The displayed ancestor cards, each drawn at
 * its frame's place and scale after the title and before every item, take no
 * room but grow the block as an item does, their shadows included. The
 * elements `block.after` gives from the lines and boxes in the block follow
 * every item's. The block's own record comes first, then the ancestor
 * cards', then the items'; the block's range is every element. The axes are
 * the items' lines', then the ancestor cards'.
 */
export function emitDrawing(
  laid: readonly LaidItem[],
  block: BlockContent,
  placement: Placement,
  measure: TextMeasure,
): Drawing {
  const placed = (card: LaidAncestorCard) => {
    const { x, y, scale } = card.place;
    return { left: x + scale * card.x, top: y + scale * card.y };
  };
  const xs = [
    ...laid.map(({ item }) => item.x),
    ...block.ancestors.map((card) => placed(card).left),
  ];
  const ys = [
    ...laid.map(({ item }) => item.y),
    ...block.ancestors.map((card) => placed(card).top),
  ];
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
  let titleBottom: number | undefined;
  // The displayed title lies at the block's top left corner, its slot ending h(s) lower.
  if (block.title !== undefined) {
    const { size } = block.title;
    const left = Xl + P;
    const top = Yt + P;
    const title = titleElement(block.title, left, top + measure.ascent(size));
    elements.push(title);
    rights.push(left + measure.width(title.text, size));
    titleBottom = top + measure.lineHeight(size);
  }
  for (const card of block.ancestors) {
    const { x, y, scale } = card.place;
    const start = 1 + elements.length;
    for (const element of card.elements) elements.push(placedAt(element, x, y, scale));
    const { left, top } = placed(card);
    boxes.push({
      ...identityOf(card.ref),
      x: left,
      y: top,
      width: scale * card.width,
      height: scale * card.height,
      range: { start, end: 1 + elements.length },
      displayed: true,
      contentCount: card.contentCount,
      ancestor: { group: card.group, member: card.member, groups: card.groups },
    });
    for (const right of card.rights) rights.push(x + scale * right);
    for (const bottom of card.bottoms) bottoms.push(y + scale * bottom);
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
  // The gaps of the frames' group elisions after every item, frame by frame (section 8.5).
  for (const { item, trailing } of laid) {
    const { x, y, scale } = item;
    for (const element of trailing) elements.push(placedAt(element, x, y, scale));
  }
  // The ancestor cards' axes after every item's, so that a timeline's first drawn line is always
  // a line of a card of an item.
  for (const card of block.ancestors) {
    const { x, y, scale } = card.place;
    for (const axis of card.axes) axes.push(placedAxis(axis, x, y, scale));
  }

  const Xr = rights.length === 0 ? 2 * P + K : P + Math.max(...rights);
  const lowest = bottoms.length === 0 ? [] : [Math.max(...bottoms) + block.margin];
  const edges = titleBottom === undefined ? lowest : [...lowest, titleBottom];
  const Yb = edges.length === 0 ? P : P + Math.max(...edges);
  const Wb = Xr - Xl;
  const Hb = Yb - Yt;
  const W = placement.width === null ? Wb : Math.max(Wb, placement.width);
  const H = placement.height === null ? Hb : Math.max(Hb, placement.height);
  const inBlock = elements.map((element) => placedAt(element, Ox, Oy));
  const blockAxes = axes.map((axis) => placedAxis(axis, Ox, Oy));
  const blockBoxes = boxes.map((record) => placedBox(record, Ox, Oy));
  inBlock.push(...block.after(blockAxes, blockBoxes));
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
    contentCount: laid.length,
  };
  // What each container decides of its elisions, in drawing order: the ancestor cards, then the
  // items, each placed into the block.
  const exposures = [
    ...block.ancestors.map((card) => card.exposure),
    ...laid.flatMap((item) => item.exposures),
  ].map((exposure) => placedExposure(exposure, Ox, Oy));
  return {
    width: W,
    height: H,
    origin: { x: Ox, y: Oy },
    boxes: [own, ...blockBoxes],
    axes: blockAxes,
    elements: inBlock,
    elisions: exposures,
    unmapped: [...measure.unmapped].sort((left, right) => left - right),
  };
}

/**
 * An exposure in its item's coordinates placed into the block, the place origin at `(Ox, Oy)`:
 * its item's place shifted by it, each gap's edges taken to `x + scale × x1`.
 */
function placedExposure(exposure: ElisionExposure, Ox: number, Oy: number): ElisionExposure {
  const { x, y, scale } = exposure.place;
  const left = Ox + x;
  return {
    ...exposure,
    place: { x: left, y: Oy + y, scale },
    gaps: exposure.gaps.map((gap) => ({
      ...gap,
      x1: Ox + (x + scale * gap.x1),
      x2: Ox + (x + scale * gap.x2),
    })),
  };
}
