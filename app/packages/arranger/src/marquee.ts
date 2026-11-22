/** The marquee inside an editor: the elements a rectangle drawn on the canvas holds. */

import type { Address, ElementAddress } from "@timetoalign/tilie-core";
import { addressKey, inBlock } from "@timetoalign/tilie-core";
import type { Bounds, Drawing } from "@timetoalign/tilie-layout";
import { boundsOf, lineAxes, TextMeasure } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { boxOf, drawnBehind } from "./boxes.ts";
import { affordancesOf, raisedRoot } from "./coordinates.ts";
import type { BlockNode } from "./node.ts";
import { ownerOf } from "./selectionRules.ts";

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
 * The rectangle of an element's geometric bounds (layout's `boundsOf`,
 * TimeToShare's drawing specification, section 6.7), in the drawing's units.
 */
function rectOf({ left, top, right, bottom }: Bounds): Rect {
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Whether a drawn element carrying `address` is a container's own
 * rectangle rather than an element: the block's background (the bundle's
 * address `{}`), a frame, a card or its shadow. The marquee and the focus
 * read elements only.
 */
export function isContainerAddress(drawing: Drawing, address: ElementAddress): boolean {
  return boxOf(drawing, address) !== undefined;
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
 * as addresses in the node's block, in drawing order, each once: the
 * addresses among `inside` (the node's `inside`, by their keys) whose every
 * drawn element lies wholly in `rect`, edges included (`boundsOf`, on the
 * canvas). An address drawn in several places, such as an ancestor line
 * in several cards, is taken only when all of them lie inside. Every part of
 * a named timestamp (its wedge, labels and line, and the affordance of one
 * that draws nothing, `affordancesOf`) stands for the timestamp, and every
 * alignment anchor's line and label for its named MatchStamp (`ownerOf`),
 * which is taken when all of them lie inside. What an ancestor card draws
 * (`docs/drawing.md` in TimeToShare, section 8.8), an affordance on its lines
 * included, counts only while that card is raised (`raisedRoot`, the node's
 * editor): otherwise the card lies behind the frames, and the marquee reads
 * the drawings outside ancestor cards alone, so an address drawn there and
 * in the card is taken by its drawings outside, and one drawn only there is
 * never taken. Frames and cards are containers, which a click selects,
 * never a marquee; a band draws nothing, so no marquee selects one either.
 */
export function elementsInRect(
  node: BlockNode,
  rect: Rect,
  inside: ReadonlySet<string>,
  metrics: FontMetrics,
): Address[] {
  const { drawing, block, editing } = node.data;
  const raised = raisedRoot(block, editing);
  const behind = drawnBehind(drawing, raised);
  const measure = new TextMeasure(metrics);
  const taken = new Map<string, { readonly address: ElementAddress; held: boolean }>();
  const take = (address: ElementAddress, bounds: Rect) => {
    const owner = ownerOf(block.manifest, address)?.address ?? address;
    const key = addressKey(owner);
    const held = holds(rect, rectOnCanvas(node, bounds));
    const known = taken.get(key);
    if (known === undefined) taken.set(key, { address: owner, held });
    else known.held &&= held;
  };
  drawing.elements.forEach((element, index) => {
    const { address } = element;
    if (behind(index) || isContainerAddress(drawing, address)) return;
    if (inside.has(addressKey(address))) take(address, rectOf(boundsOf(element, measure)));
  });
  const affordances = affordancesOf(block.manifest, drawing, raised);
  const lines = affordances.length === 0 ? null : lineAxes(drawing);
  for (const { address, line, points } of affordances) {
    const axis = lines?.get(line);
    if (axis?.ancestor !== undefined && axis.card.member !== raised) continue;
    if (!inside.has(addressKey(address))) continue;
    take(
      address,
      spanning(
        points.map(([px]) => px),
        points.map(([, py]) => py),
      ),
    );
  }
  return [...taken.values()]
    .filter((item) => item.held)
    .map((item) => inBlock(node.id, item.address));
}
