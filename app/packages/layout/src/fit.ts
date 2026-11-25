/**
 * First fit: items placed one at a time into numbered rows, by their extents
 * (`docs/drawing.md` in TimeToShare, section 6.3).
 */

import { nth } from "./traversal.ts";

/** An extent `[a, b]` along the axis, from its start `a` to its end `b`. */
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

/** Numbered rows filled by first fit: each extent goes to the first row it conflicts with none of. */
export class Rows {
  readonly #rows: Row[] = [];

  /** Each row's extents, from row 1, each row's in the order placed. */
  get rows(): readonly (readonly Extent[])[] {
    return this.#rows.map((row) => row.extents);
  }

  /** Places `extent` in the first row it fits, adding a row when none does: that row's number, from 1. */
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

  /** The number of rows. */
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

/** The smallest extent covering both `[a1, b1]` and `[a2, b2]`. */
export const widen = ([a1, b1]: Extent, [a2, b2]: Extent): Extent => [
  Math.min(a1, a2),
  Math.max(b1, b2),
];

/** An item a tiered first fit places: its own extent, and its drawn label's when it has one. */
export interface TieredItem {
  readonly extent: Extent;
  readonly label: Extent | undefined;
}

/** What a tiered first fit gives (section 6.4, Regions). */
export interface Tiered {
  /** The row of each item, from 1. */
  readonly row: readonly number[];
  /** The label tier of each item within its row, from 1; `undefined` for an item without a label. */
  readonly tier: readonly (number | undefined)[];
  /** The number `Tk` of label tiers of each row `k`, from row 1: at least 1, so every row keeps a label's room. */
  readonly tiers: readonly number[];
}

/**
 * A tiered first fit (section 6.4, Regions): the items, in order, placed by
 * their own extents alone into rows, so that a label never moves its item;
 * and each item's label, in the same order, by its label extent into the
 * label tiers of its item's row, each row filling its own tiers. A label
 * that conflicts with one before it in its row's first tier lies in a later
 * tier, joined to its item by a leader line.
 */
export function tieredFit(items: readonly TieredItem[]): Tiered {
  const rows = new Rows();
  const labelRows: Rows[] = [];
  const row: number[] = [];
  const tier: (number | undefined)[] = [];
  for (const item of items) {
    const k = rows.place(item.extent);
    row.push(k);
    while (labelRows.length < k) labelRows.push(new Rows());
    tier.push(item.label === undefined ? undefined : nth(labelRows, k - 1).place(item.label));
  }
  return { row, tier, tiers: labelRows.map((labels) => Math.max(1, labels.count)) };
}
