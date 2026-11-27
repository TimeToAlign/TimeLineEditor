import { Rational, type Real, toFloat } from "@timetoalign/tilie-core/numbers";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { proportion } from "../src/numbers.ts";

const r = (numerator: bigint, denominator = 1n) => Rational.fromParts(numerator, denominator);

/** The oracle: the exact quotient rounded once, or the float division of the nearest doubles. */
function oracle(t: Real, length: Real): number {
  const isZero = typeof length === "number" ? length === 0 : length.numerator === 0n;
  if (isZero) return 0;
  if (t instanceof Rational && length instanceof Rational) return toFloat(t.divide(length));
  const a = t instanceof Rational ? toFloat(t) : t;
  const b = length instanceof Rational ? toFloat(length) : length;
  return a / b;
}

/** A bigint of magnitude below `2^bits`, either sign. */
const integer = (bits: number) =>
  fc.bigInt({ min: -(2n ** BigInt(bits)) + 1n, max: 2n ** BigInt(bits) - 1n });
const positive = (bits: number) => fc.bigInt({ min: 1n, max: 2n ** BigInt(bits) - 1n });

/** An exact value whose parts have up to `bits` bits (a denominator at least 1). */
const exact = (bits: number) => fc.tuple(integer(bits), positive(bits)).map(([n, d]) => r(n, d));
const nonzero = (bits: number) =>
  fc
    .tuple(
      integer(bits).filter((n) => n !== 0n),
      positive(bits),
    )
    .map(([n, d]) => r(n, d));
const parts = fc.oneof(
  fc.constant(20),
  fc.constant(26),
  fc.constant(27),
  fc.integer({ min: 1, max: 70 }),
);

describe("proportion", () => {
  it("gives the double the exact quotient rounds to, for exact values on both sides of 2^53", () => {
    fc.assert(
      fc.property(
        parts.chain((bits) => fc.tuple(exact(bits), nonzero(bits))),
        ([t, length]) => {
          expect(Object.is(proportion(t, length), oracle(t, length))).toBe(true);
        },
      ),
      { seed: 20261127, numRuns: 20_000 },
    );
  });

  it("gives the float division of the nearest doubles where either value is a float", () => {
    const float = fc.double({ noNaN: true, noDefaultInfinity: true });
    fc.assert(
      fc.property(
        parts.chain((bits) => fc.tuple(exact(bits), float, nonzero(bits))),
        ([t, x, length]) => {
          expect(Object.is(proportion(t, x), oracle(t, x))).toBe(true);
          expect(Object.is(proportion(x, length), oracle(x, length))).toBe(true);
        },
      ),
      { seed: 20261127, numRuns: 5_000 },
    );
  });

  it("gives the hand-derived doubles", () => {
    expect(proportion(r(1n, 3n), r(1n))).toBe(0.3333333333333333);
    expect(Object.is(proportion(r(0n), r(-5n)), 0)).toBe(true);
    expect(proportion(r(2n ** 53n - 1n), r(3n))).toBe(3002399751580330.5);
    expect(proportion(r(2n ** 53n + 1n), r(1n))).toBe(9007199254740992);
    expect(proportion(r(1n, 2n ** 26n + 1n), r(1n, 2n ** 27n + 1n))).toBe(1.999999985098839);
    expect(proportion(r(2n, 3n), 0.5)).toBe(1.3333333333333333);
    expect(proportion(r(7n), r(0n))).toBe(0);
  });
});
