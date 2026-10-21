/** The marquee inside an editor: the elements a rectangle drawn on the canvas holds. */

import { qualify } from "@timetoalign/tilie-core";
import type { Drawing, DrawnElement } from "@timetoalign/tilie-layout";
import { TextMeasure } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { boxOf } from "./boxes.ts";
import type { BlockNode } from "./project.ts";

/** An axis-aligned rectangle: on the canvas, or in a drawing's own units. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function spanning(xs: readonly number[], ys: readonly number[]): Rect {
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/**
 * The rectangle a drawn element spans, in the drawing's units: the
 * rectangle of the coordinates the drawing states for it (the block's
 * background its whole drawing, a frame's or a card's rectangle itself, a
 * line from its start to its end on its ordinate, a map likewise on its
 * centre, a region between its edges and ordinates, a jump around its
 * curve's points and its arrowhead, a flow marker, boundary or wedge on its
 * abscissa between its ordinates), and a text over its measured width (from
 * its anchor, or centred on it) from its baseline less the font's ascent to
 * its baseline plus the descent. Stroke widths and markers are not counted.
 */
export function elementBounds(element: DrawnElement, measure: TextMeasure): Rect {
  switch (element.type) {
    case "block":
      return { x: 0, y: 0, width: element.width, height: element.height };
    case "group":
    case "card":
      return { x: element.x, y: element.y, width: element.width, height: element.height };
    case "timeline":
    case "child":
    case "ancestor":
      return spanning([element.xs, element.xe], [element.y]);
    case "map":
      return spanning([element.xs, element.xe], [element.yc]);
    case "region":
      return spanning([element.x1, element.x2], [element.ya, element.yb]);
    case "jump_from": {
      const points = [element.start, element.c1, element.c2, element.tip, ...element.corners];
      return spanning(
        points.map(([x]) => x),
        points.map(([, y]) => y),
      );
    }
    case "flow_marker":
    case "boundary":
      return spanning([element.x], [element.y1, element.y2]);
    case "wedge":
      return spanning([element.x], [element.yt, element.yb]);
    case "name":
    case "label": {
      const size = element.style["font-size"];
      const width = measure.width(element.text, size);
      const x = element.anchor === "middle" ? element.x - width / 2 : element.x;
      return {
        x,
        y: element.baseline - measure.ascent(size),
        width,
        height: measure.ascent(size) + measure.descent(size),
      };
    }
  }
}

/**
 * Whether a drawn element carrying `address` is a container's own
 * rectangle rather than an element: the block's background (no address), a
 * frame, a card or its shadow. The marquee and the focus read elements only.
 */
export function isContainerAddress(drawing: Drawing, address: string | null): boolean {
  return address === null || boxOf(drawing, address) !== undefined;
}

/** A rectangle in the drawing of `node` as the canvas shows it: moved by the node's position and scaled. */
export function rectOnCanvas(node: BlockNode, rect: Rect): Rect {
  const scale = node.data.block.scale;
  return {
    x: node.position.x + rect.x * scale,
    y: node.position.y + rect.y * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

function holds(outer: Rect, inner: Rect): boolean {
  return (
    outer.x <= inner.x &&
    outer.y <= inner.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * The elements of `node` a marquee over the canvas rectangle `rect` selects,
 * as block-qualified addresses in drawing order, each once: the addresses
 * among `inside` (the node's `inside`) whose every drawn element lies wholly
 * in `rect`, edges included (`elementBounds`, on the canvas). An address
 * drawn in several places, such as an ancestor line in several cards, is
 * taken only when all of them lie inside. Frames and cards are containers,
 * which a click selects, never a marquee; a band draws nothing, so no
 * marquee selects one either.
 */
export function elementsInRect(
  node: BlockNode,
  rect: Rect,
  inside: ReadonlySet<string>,
  metrics: FontMetrics,
): string[] {
  const { drawing } = node.data;
  const measure = new TextMeasure(metrics);
  const taken = new Map<string, boolean>();
  for (const element of drawing.elements) {
    const { address } = element;
    if (address === null || isContainerAddress(drawing, address) || !inside.has(address)) continue;
    const held = holds(rect, rectOnCanvas(node, elementBounds(element, measure)));
    taken.set(address, (taken.get(address) ?? true) && held);
  }
  return [...taken].filter(([, held]) => held).map(([address]) => qualify(node.id, address));
}
