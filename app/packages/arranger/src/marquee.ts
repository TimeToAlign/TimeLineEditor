/** The marquee inside an editor: the elements a rectangle drawn on the canvas holds. */

import type { Address, ElementAddress } from "@timetoalign/tilie-core";
import { addressKey, inBlock } from "@timetoalign/tilie-core";
import type { Bounds, Drawing } from "@timetoalign/tilie-layout";
import { boundsOf, lineAxes, TextMeasure } from "@timetoalign/tilie-layout";
import type { FontMetrics } from "@timetoalign/timetoshare";
import { boxOf, raisedRoot, stackingOf } from "./boxes.ts";
import { affordancesOf } from "./coordinates.ts";
import { gapOf } from "./gaps.ts";
import type { BlockNode } from "./node.ts";
import { ownerOf } from "./selectionRules.ts";

/** An axis-aligned rectangle: on the canvas, or in a drawing's own units. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The bounds of the points with the abscissas `xs` and the ordinates `ys`. */
function spanning(xs: readonly number[], ys: readonly number[]): Bounds {
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
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

/**
 * Bounds in the drawing of `node` as the canvas shows them: each edge moved
 * by the node's position and scaled, so an edge is never rebuilt from a
 * width or a height.
 */
function boundsOnCanvas(node: BlockNode, { left, top, right, bottom }: Bounds): Bounds {
  const { x, y } = node.position;
  const scale = node.data.block.scale;
  return {
    left: x + left * scale,
    top: y + top * scale,
    right: x + right * scale,
    bottom: y + bottom * scale,
  };
}

/** Whether the canvas rectangle `outer` holds the canvas bounds `inner`, edges included. */
function holds(outer: Rect, inner: Bounds): boolean {
  return (
    outer.x <= inner.left &&
    outer.y <= inner.top &&
    inner.right <= outer.x + outer.width &&
    inner.bottom <= outer.y + outer.height
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
 * which is taken when all of them lie inside; a gap of an elision, its
 * ellipses and its labels stand for the gap (`gapOf`), whose bounds span its
 * card (a group elision's, its frame's member cards) from top to bottom,
 * every piece of it taken or none. What an ancestor card draws
 * (`docs/drawing.md` in TimeToShare, section 8.8), an affordance on its lines
 * included, counts only while that card is raised (`raisedRoot`, the node's
 * editor): otherwise the card lies below the frames (`stackingOf`), and the
 * marquee reads the drawings above them alone, so an address drawn there
 * and in the card is taken by its drawings outside, and one drawn only
 * there is never taken. This is the one exception to "a coordinate is placed
 * wherever it is seen": a marquee selects addresses, not places, and what an
 * unraised card alone shows beside the frames is taken once it is raised.
 * Frames and cards are containers, which a click selects, never a marquee;
 * a band draws nothing, so no marquee selects one either.
 */
export function elementsInRect(
  node: BlockNode,
  rect: Rect,
  inside: ReadonlySet<string>,
  metrics: FontMetrics,
): Address[] {
  const { drawing, block, editing } = node.data;
  const stacking = stackingOf(drawing, raisedRoot(block, editing));
  const { behind } = stacking;
  const measure = new TextMeasure(metrics);
  const taken = new Map<string, { readonly address: ElementAddress; held: boolean }>();
  const take = (address: ElementAddress, bounds: Bounds) => {
    const owner =
      ownerOf(block.manifest, address)?.address ?? gapOf(block.manifest, address) ?? address;
    const key = addressKey(owner);
    const held = holds(rect, boundsOnCanvas(node, bounds));
    const known = taken.get(key);
    if (known === undefined) taken.set(key, { address: owner, held });
    else known.held &&= held;
  };
  drawing.elements.forEach((element, index) => {
    const { address } = element;
    if (behind(index) || isContainerAddress(drawing, address)) return;
    if (inside.has(addressKey(address))) take(address, boundsOf(element, measure));
  });
  const affordances = affordancesOf(block.manifest, drawing, stacking.raised);
  const lines = affordances.length === 0 ? null : lineAxes(drawing);
  for (const { address, line, points } of affordances) {
    const axis = lines?.get(line);
    if (axis !== undefined && stacking.sunk(axis)) continue;
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
