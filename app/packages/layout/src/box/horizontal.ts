/**
 * The box's one horizontal layout (`docs/drawing.md` in TimeToShare,
 * section 8.2), in item coordinates: the name column `n`, the start `s0` of
 * every member drawing, the right margin `Mr` past every line's end, and an
 * item's right edge `Ri` before its request.
 */

import { G, K, Q } from "../constants.ts";
import type { DrawnElement } from "../elements.ts";
import { largestRightEdge } from "../geometry.ts";
import type { TextMeasure } from "../metrics.ts";
import type { Item } from "./places.ts";

/** Where the name column and the member drawings start. */
export interface Columns {
  /** The name column's left edge `n`: `K`, `Q` further when the box holds a frame. */
  readonly n: number;
  /** The start `s0` of every member drawing. */
  readonly s0: number;
}

/** The columns, the right margin `Mr` and how far a box-held card's end lies past `R + K`. */
export interface Horizontal extends Columns {
  /** `Mr`, or undefined when nothing drawn has a right edge. */
  readonly Mr: number | undefined;
  /** `Q` when the box holds a frame: a box-held card then ends where a frame of its length does. */
  readonly inset: number;
}

/** One member drawing drawn at `s0`, with its item's length `L`. */
export interface DrawnAt {
  readonly elements: readonly DrawnElement[];
  readonly L: number;
}

/**
 * The columns of the box's items (section 8.2): `s0` lies past the name
 * column, the widest drawn name `N` and the gap `G` after it, so that no
 * centred label crosses the column's left edge and no left chevron of an
 * ancestor line crosses the gap.
 */
export function columnsOf(items: readonly Item[]): Columns {
  const n = items.some((item) => item.frame !== null) ? Q + K : K;
  const laid = items.flatMap((item) => item.cards.map((card) => ({ card, L: item.length })));
  const names = laid.flatMap(({ card }) => card.layout.names);
  const N = names.length === 0 ? 0 : Math.max(...names);
  const gap = names.length === 0 ? 0 : G;
  let s0 = n + N + gap;
  for (const { card, L } of laid) {
    for (const item of card.layout.centred) s0 = Math.max(s0, n + item.width / 2 - L * item.u);
  }
  for (const wa of laid.flatMap(({ card }) => card.layout.chevrons)) {
    s0 = Math.max(s0, n + N + gap + 8 * wa);
  }
  return { n, s0 };
}

/**
 * The horizontal layout once every member drawing is drawn at `s0`: `Mr`
 * the largest distance of a drawn right edge past its line's end `s0 + L`.
 */
export function horizontalOf(
  columns: Columns,
  items: readonly Item[],
  drawn: readonly DrawnAt[],
  measure: TextMeasure,
): Horizontal {
  const margins = drawn.flatMap(({ elements, L }) => {
    const edge = largestRightEdge(elements, measure);
    return edge === undefined ? [] : [edge - (columns.s0 + L)];
  });
  return {
    ...columns,
    Mr: margins.length === 0 ? undefined : Math.max(...margins),
    inset: items.some((item) => item.frame !== null) ? Q : 0,
  };
}

/**
 * The right edge `Ri` of an item of length `L` before its request: its
 * content's, `s0 + L + Mr`, or `s0` when nothing has a right edge; past its
 * frame's title, whose right edge is `title`, when it has one.
 */
export function contentRight(horizontal: Horizontal, L: number, title?: number): number {
  const { s0, Mr } = horizontal;
  const content = Mr === undefined ? s0 : s0 + L + Mr;
  return title === undefined ? content : Math.max(content, title);
}
