/** The viewport of an editor: the edited element centred in the canvas area left of the drawer. */

import type { Address } from "@timetoalign/tilie-core";
import { contains } from "@timetoalign/tilie-core";
import { TextMeasure } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timeskeleton";
import type { Viewport } from "@xyflow/svelte";
import { isDisplayed, keyedBox } from "./boxes.ts";
import { addressParts } from "./editing.ts";
import { elementBounds, isContainerAddress, type Rect, rectOnCanvas } from "./marquee.ts";
import type { BlockNode } from "./project.ts";

/** How long, in milliseconds, the view takes to move to an editor and back. */
export const FOCUS_DURATION = 1000;
/** The share of the canvas area left free on each side of the focused element. */
export const FOCUS_MARGIN = 0.1;
/** The zooms the focus stays within. */
export const FOCUS_MIN_ZOOM = 0.05;
export const FOCUS_MAX_ZOOM = 4;

/** Svelte Flow's viewport: a canvas point `p` lies at `p × zoom + (x, y)` on the screen. */
export type { Viewport };

/**
 * The canvas rectangle of the editor target `target` in `node`'s block: the
 * block's box for the block itself, the displayed frame of a group or card
 * of a timeline, and for a timeline drawn in no displayed card of its own (a
 * child, or a hidden card) the rectangle spanning every element drawn inside
 * it (core's `contains`, `elementBounds`).
 */
export function targetBounds(node: BlockNode, target: Address, metrics: FontMetrics): Rect {
  const { drawing, block } = node.data;
  const { block: id, element } = addressParts(target);
  if (id !== node.id) throw new RangeError(`${target} does not lie in block ${node.id}`);
  if (element === null) {
    return rectOnCanvas(node, { x: 0, y: 0, width: drawing.width, height: drawing.height });
  }
  const box = keyedBox(drawing, element);
  if (box !== undefined && isDisplayed(box)) return rectOnCanvas(node, box);
  const measure = new TextMeasure(metrics);
  const spans = drawing.elements
    .filter(
      (drawn) =>
        !isContainerAddress(drawing, drawn.address) &&
        drawn.address !== null &&
        contains(block.manifest, element, drawn.address),
    )
    .map((drawn) => elementBounds(drawn, measure));
  if (spans.length === 0) throw new RangeError(`${target} is not drawn`);
  const x = Math.min(...spans.map((span) => span.x));
  const y = Math.min(...spans.map((span) => span.y));
  const right = Math.max(...spans.map((span) => span.x + span.width));
  const bottom = Math.max(...spans.map((span) => span.y + span.height));
  return rectOnCanvas(node, { x, y, width: right - x, height: bottom - y });
}

/**
 * The viewport that centres `bounds` (canvas units) in the pane (`pane`,
 * screen pixels) less the drawer of width `drawerWidth` on its right, with
 * `FOCUS_MARGIN` of that area free on each side: the zoom at which the
 * bounds fill the remaining area along the tighter axis, clamped to
 * `[FOCUS_MIN_ZOOM, FOCUS_MAX_ZOOM]`.
 */
export function focusViewport(
  bounds: Rect,
  pane: { readonly width: number; readonly height: number },
  drawerWidth: number,
): Viewport {
  const width = Math.max(0, pane.width - drawerWidth);
  const fill = 1 - 2 * FOCUS_MARGIN;
  const fit = Math.min((width * fill) / bounds.width, (pane.height * fill) / bounds.height);
  const zoom = Math.min(FOCUS_MAX_ZOOM, Math.max(FOCUS_MIN_ZOOM, fit));
  return {
    x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: pane.height / 2 - (bounds.y + bounds.height / 2) * zoom,
    zoom,
  };
}
