/**
 * First fit: items placed one at a time into numbered rows, by their extents
 * (`docs/drawing.md` in TimeToShare, section 6.3).
 */

import { nth } from "./traversal.ts";

export type Extent = readonly [number, number];

/** Whether `[a1, b1]` and `[a2, b2]` conflict (section 6.3). */
const meet = (a1: number, b1: number, a2: number, b2: number): boolean =>
  (a1 < b2 && a2 < b1) || a1 === a2;

const conflicts = ([a1, b1]: Extent, [a2, b2]: Extent): boolean => meet(a1, b1, a2, b2);

/**
 * One row's extents, the ordered ones also kept sorted by start. Extents in
 * one row conflict with none of the others, so ordered ones start at distinct
 * points and each ends at or before the next one's start: sorted by start,
 * their ends are sorted too. An ordered extent `[a, b]` then conflicts with
 * one of them only if it conflicts with the last one starting at or before
 * `a` or the first one starting after it: every earlier one ends at or before
 * that last one's start and starts before it, every later one starts at or
 * after that first one's end. An extent is ordered when `a <= b` (so not when
 * it holds NaN); the others are compared with every extent of the row, as the
 * specification states the test.
 */
class Row {
  /** Every extent the row holds, in the order placed. */
  readonly extents: Extent[] = [];
  /** The starts of the ordered extents, ascending. */
  readonly #starts: number[] = [];
  /** The ends of the ordered extents, in the order of `#starts`. */
  readonly #ends: number[] = [];
  /** The extents whose start is after their end, or that hold NaN. */
  readonly #unordered: Extent[] = [];

  /** The number of ordered extents starting at or before `a`. */
  #startingBy(a: number): number {
    const starts = this.#starts;
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (nth(starts, middle) <= a) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  /** Whether `[a, b]` conflicts with the ordered extent at `index`, one of the row's. */
  #meets(a: number, b: number, index: number): boolean {
    return meet(a, b, nth(this.#starts, index), nth(this.#ends, index));
  }

  /** Whether `extent`, `[a, b]`, conflicts with an extent of the row. */
  conflictsWith(extent: Extent, a: number, b: number): boolean {
    if (this.#unordered.length > 0 && this.#unordered.some((other) => conflicts(extent, other))) {
      return true;
    }
    if (!(a <= b)) return this.#starts.some((_, index) => this.#meets(a, b, index));
    const next = this.#startingBy(a);
    return (
      (next > 0 && this.#meets(a, b, next - 1)) ||
      (next < this.#starts.length && this.#meets(a, b, next))
    );
  }

  /** Adds `extent`, `[a, b]`. */
  add(extent: Extent, a: number, b: number): void {
    this.extents.push(extent);
    if (!(a <= b)) {
      this.#unordered.push(extent);
      return;
    }
    const index = this.#startingBy(a);
    if (index === this.#starts.length) {
      this.#starts.push(a);
      this.#ends.push(b);
    } else {
      this.#starts.splice(index, 0, a);
      this.#ends.splice(index, 0, b);
    }
  }
}

export class Rows {
  readonly #rows: Row[] = [];

  /** Each row's extents, from row 1, each row's in the order placed. */
  get rows(): readonly (readonly Extent[])[] {
    return this.#rows.map((row) => row.extents);
  }

  place(extent: Extent): number {
    const [a, b] = extent;
    const copy: Extent = [a, b];
    let index = 0;
    while (index < this.#rows.length && nth(this.#rows, index).conflictsWith(copy, a, b)) {
      index += 1;
    }
    if (index === this.#rows.length) this.#rows.push(new Row());
    nth(this.#rows, index).add(copy, a, b);
    return index + 1;
  }

  get count(): number {
    return this.#rows.length;
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
