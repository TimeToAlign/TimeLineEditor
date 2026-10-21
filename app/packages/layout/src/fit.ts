/**
 * First fit: items placed one at a time into numbered rows, by their extents
 * (`docs/drawing.md` in TimeToShare, section 6.3).
 */

import { nth } from "./traversal.ts";

export type Extent = readonly [number, number];

function conflicts([a1, b1]: Extent, [a2, b2]: Extent): boolean {
  return (a1 < b2 && a2 < b1) || a1 === a2;
}

export class Rows {
  readonly rows: Extent[][] = [];

  place(extent: Extent): number {
    let row = 1;
    while ((this.rows[row - 1] ?? []).some((other) => conflicts(extent, other))) row += 1;
    while (this.rows.length < row) this.rows.push([]);
    nth(this.rows, row - 1).push(extent);
    return row;
  }

  get count(): number {
    return this.rows.length;
  }
}

/** The extent `[L × u − wi / 2 − 1, L × u + wi / 2 + 1]` of a centred label (section 6.3). */
export const labelExtent = (centre: number, width: number): Extent => [
  centre - width / 2 - 1,
  centre + width / 2 + 1,
];

/** First fit of centred labels, in order, into the tiers `rows`: the tier of each. */
export function labelTiers<T extends { readonly width: number }>(
  labels: readonly T[],
  centre: (label: T) => number,
  rows: Rows,
): Map<T, number> {
  return new Map(
    labels.map((label) => [label, rows.place(labelExtent(centre(label), label.width))]),
  );
}

export const widen = ([a1, b1]: Extent, [a2, b2]: Extent): Extent => [
  Math.min(a1, a2),
  Math.max(b1, b2),
];
