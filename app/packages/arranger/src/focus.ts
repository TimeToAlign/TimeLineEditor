/** The viewport of an editor: the edited element centred in the canvas area left of the drawer. */

import type { Address } from "@timetoalign/tilie-core";
import { addressKey, contains, resolveElement, samePlaceKey } from "@timetoalign/tilie-core";
import { boundsOf, TextMeasure } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timetoshare";
import type { Viewport } from "@xyflow/svelte";
import { isDisplayed, keyedBox, raisedRoot, stackingOf } from "./boxes.ts";
import { addressParts } from "./editing.ts";
import { isContainerAddress, type Rect, rectOnCanvas } from "./marquee.ts";
import type { BlockNode } from "./node.ts";

/** How long, in milliseconds, the view takes to move to an editor and back. */
export const FOCUS_DURATION = 1000;
/** The share of the canvas area left free on each side of the focused element. */
export const FOCUS_MARGIN = 0.1;
/** The smallest zoom the focus moves to. */
export const FOCUS_MIN_ZOOM = 0.05;
/** The largest zoom the focus moves to. */
export const FOCUS_MAX_ZOOM = 4;

/** Svelte Flow's viewport: a canvas point `p` lies at `p × zoom + (x, y)` on the screen. */
export type { Viewport };

/**
 * The canvas rectangle of the editor target `target` in `node`'s block: the
 * block's box for the block itself, the displayed frame of a group or card
 * of a timeline (its first, for a member of several groups), and for a
 * timeline drawn in no displayed card of its own (a
 * child, or a hidden card) the rectangle spanning every element drawn inside
 * it (core's `contains`, layout's `boundsOf`), leaving out the copies an
 * ancestor card draws below the frames while it is not raised
 * (`stackingOf`).
 */
export function targetBounds(node: BlockNode, target: Address, metrics: FontMetrics): Rect {
  const { drawing, block } = node.data;
  const { block: id, element } = addressParts(target);
  if (id !== node.id) {
    throw new RangeError(`${addressKey(target)} does not lie in block ${node.id}`);
  }
  if (element === null) {
    return rectOnCanvas(node, { x: 0, y: 0, width: drawing.width, height: drawing.height });
  }
  const resolved = resolveElement(block.manifest, element);
  const [container] =
    resolved?.kind === "frame"
      ? [resolved.container]
      : resolved?.kind === "timeline"
        ? resolved.cards
        : [];
  const box = container?.key == null ? undefined : keyedBox(drawing, container.key);
  if (box !== undefined && isDisplayed(box)) return rectOnCanvas(node, box);
  const measure = new TextMeasure(metrics);
  const { behind } = stackingOf(drawing, raisedRoot(block, node.data.editing));
  const spans = drawing.elements
    .filter(
      (drawn, index) =>
        !behind(index) &&
        !isContainerAddress(drawing, drawn.address) &&
        element.id !== undefined &&
        contains(block.manifest, element.id, drawn.address),
    )
    .map((drawn) => boundsOf(drawn, measure));
  if (spans.length === 0) throw new RangeError(`${addressKey(target)} is not drawn`);
  const x = Math.min(...spans.map((span) => span.left));
  const y = Math.min(...spans.map((span) => span.top));
  const right = Math.max(...spans.map((span) => span.right));
  const bottom = Math.max(...spans.map((span) => span.bottom));
  return rectOnCanvas(node, { x, y, width: right - x, height: bottom - y });
}

/**
 * How far the elided ancestor cards behind the frame of the group `target`
 * reach out from the frame's horizontal centre `c`, in canvas units: the
 * largest of `c` less a card's left edge and its right edge less `c`, over
 * the displayed ancestor cards lying behind that frame (`ancestor.groups`:
 * a root drawn once behind a row lies behind each of its groups) that
 * elide: that draw a gap,
 * or that Proportional fits at `r = 1` (drawing none, since the whole card
 * fits). `null` for a target
 * that is no group, for a group whose frame is not drawn, and where no such
 * card is drawn: every card drawn whole.
 */
export function elidedReach(node: BlockNode, target: Address): number | null {
  const { drawing, block } = node.data;
  const { element } = addressParts(target);
  if (element === null) return null;
  const resolved = resolveElement(block.manifest, element);
  if (resolved?.kind !== "frame" || resolved.container.key === null) return null;
  const frame = keyedBox(drawing, resolved.container.key);
  if (frame === undefined || !isDisplayed(frame)) return null;
  const { x, width } = rectOnCanvas(node, frame);
  const c = x + width / 2;
  const group = resolved.container.key.item;
  let reach: number | null = null;
  for (const box of drawing.boxes) {
    const { key: cardKey } = box;
    if (box.ancestor?.groups.includes(group) !== true || cardKey === null || !isDisplayed(box)) {
      continue;
    }
    const exposure = drawing.elisions.find(
      ({ kind, key }) => kind === "ancestor_card" && samePlaceKey(key, cardKey),
    );
    const elides =
      exposure !== undefined &&
      (exposure.gaps.length > 0 ||
        (exposure.drawn === "proportional" && exposure.proportion === 1));
    if (!elides) continue;
    const card = rectOnCanvas(node, box);
    reach = Math.max(reach ?? 0, c - card.x, card.x + card.width - c);
  }
  return reach;
}

/**
 * The viewport that centres `bounds` (canvas units) in the pane (`pane`,
 * screen pixels) less the drawer of width `drawerWidth` on its right, with
 * `FOCUS_MARGIN` of that area free on each side: the zoom at which the
 * bounds fill the remaining area along the tighter axis, clamped to
 * `[FOCUS_MIN_ZOOM, FOCUS_MAX_ZOOM]`. With `reach`, the canvas units that
 * must be seen on each side of the bounds' horizontal centre (an elided
 * ancestor card's, `elidedReach`), the zoom is at most the one at which
 * that reach fills half the area left free of the margins:
 * `min(zoom, f · W / (2 · reach))`, `f` the area less both margins and `W`
 * the width left of the drawer, still at least `FOCUS_MIN_ZOOM`.
 */
export function focusViewport(
  bounds: Rect,
  pane: { readonly width: number; readonly height: number },
  drawerWidth: number,
  reach: number | null = null,
): Viewport {
  const width = Math.max(0, pane.width - drawerWidth);
  const fill = 1 - 2 * FOCUS_MARGIN;
  const fit = Math.min((width * fill) / bounds.width, (pane.height * fill) / bounds.height);
  const framed = Math.min(FOCUS_MAX_ZOOM, Math.max(FOCUS_MIN_ZOOM, fit));
  const zoom =
    reach === null || reach <= 0
      ? framed
      : Math.max(FOCUS_MIN_ZOOM, Math.min(framed, (width * fill) / (2 * reach)));
  return {
    x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: pane.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  };
}
