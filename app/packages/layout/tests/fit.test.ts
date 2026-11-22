/** The rows of first fit against section 6.3 read literally; the cases are tests/README.md's. */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Extent, Rows } from "../src/fit.ts";

/**
 * Section 6.3 read literally: an item tries rows 1, 2, 3, … in turn and goes to the first
 * holding no item its extent conflicts with, every item of the row compared.
 */
class LiteralRows {
  readonly rows: Extent[][] = [];

  place(extent: Extent): number {
    const conflicts = ([a1, b1]: Extent, [a2, b2]: Extent) => (a1 < b2 && a2 < b1) || a1 === a2;
    let row = 1;
    while ((this.rows[row - 1] ?? []).some((other) => conflicts(extent, other))) row += 1;
    while (this.rows.length < row) this.rows.push([]);
    (this.rows[row - 1] as Extent[]).push(extent);
    return row;
  }
}

/** The row of each extent, in order, and the rows' extents, by both first fits. */
function placed(extents: readonly Extent[]) {
  const rows = new Rows();
  const literal = new LiteralRows();
  return {
    actual: { rows: extents.map((extent) => rows.place(extent)), held: rows.rows },
    expected: { rows: extents.map((extent) => literal.place(extent)), held: literal.rows },
    count: rows.count,
  };
}

describe("the rows of first fit", () => {
  it.each([
    {
      extents: [
        [0, 1],
        [1, 2],
        [2, 3],
      ] as Extent[],
      rows: [1, 1, 1],
    },
    {
      extents: [
        [0, 2],
        [0, 1],
        [1, 3],
      ] as Extent[],
      rows: [1, 2, 2],
    },
    {
      extents: [
        [0, 4],
        [2, 2],
        [4, 4],
        [4, 6],
      ] as Extent[],
      rows: [1, 2, 1, 2],
    },
    {
      extents: [
        [5, 6],
        [3, 4],
        [4, 5],
        [3.5, 4.5],
      ] as Extent[],
      rows: [1, 1, 1, 2],
    },
  ])("places $extents in the rows $rows", ({ extents, rows }) => {
    const { actual, expected } = placed(extents);
    expect(expected.rows).toEqual(rows);
    expect(actual).toEqual(expected);
  });

  // Ends from 0 to 6 in halves: starts tie, items touch, contain one another and have no length.
  const end = fc.integer({ min: 0, max: 12 }).map((halves) => halves / 2);
  const extent = fc.tuple(end, end).map(([a, b]): Extent => (a <= b ? [a, b] : [b, a]));
  const unusual = fc.constantFrom(Number.NaN, Infinity, -Infinity, -0, 0, 3, 6);
  const anyExtent = fc.oneof(
    { weight: 6, arbitrary: extent },
    { weight: 1, arbitrary: fc.tuple(end, end) },
    { weight: 1, arbitrary: fc.tuple(fc.oneof(end, unusual), fc.oneof(end, unusual)) },
  );
  const byStart = (left: Extent, right: Extent) => left[0] - right[0];
  const sequence = (items: fc.Arbitrary<Extent>, maxLength: number) =>
    fc
      .tuple(fc.array(items, { maxLength }), fc.constantFrom("given", "ascending", "descending"))
      .map(([extents, order]) => {
        if (order === "given") return extents;
        const sorted = [...extents].sort(byStart);
        return order === "ascending" ? sorted : sorted.reverse();
      });

  it("gives every item the literal row, in short sequences of any extents", () => {
    fc.assert(
      fc.property(sequence(anyExtent, 24), (extents) => {
        const { actual, expected } = placed(extents);
        expect(actual).toEqual(expected);
      }),
      { seed: 63, numRuns: 2000 },
    );
  });

  it("gives every item the literal row, in long sequences", () => {
    fc.assert(
      fc.property(sequence(extent, 400), (extents) => {
        const { actual, expected } = placed(extents);
        expect(actual).toEqual(expected);
      }),
      { seed: 631, numRuns: 200 },
    );
  });

  it("counts the rows it fills", () => {
    fc.assert(
      fc.property(sequence(anyExtent, 24), (extents) => {
        const { expected, count } = placed(extents);
        expect(count).toBe(expected.held.length);
      }),
      { seed: 632, numRuns: 500 },
    );
  });
});
