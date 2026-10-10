/**
 * Exact rational numbers over BigInt.
 *
 * A `Rational` is always normalized: the denominator is positive and shares
 * no factor with the numerator. It is built from integers only, never from
 * a JavaScript float, so a value read from a document stays exact.
 */

/** An integer a `Rational` may be built from: a bigint or a safe integer. */
export type IntegerInput = bigint | number;

/** Anything a `Rational` may be built from. */
export type RationalInput =
  | IntegerInput
  | string
  | readonly [IntegerInput, IntegerInput]
  | Rational;

const DECIMAL_INTEGER = /^[+-]?\d+$/;

/** Read an integer, refusing every number that is not a safe integer. */
export function toBigInt(value: IntegerInput): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError(`${String(value)} is not an exact integer; pass a bigint or a safe integer`);
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** An exact fraction with a positive denominator, in lowest terms. */
export class Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;

  private constructor(numerator: bigint, denominator: bigint) {
    this.numerator = numerator;
    this.denominator = denominator;
  }

  /**
   * Build a normalized rational from a Fraction pair, an integer or a
   * decimal integer string.
   *
   * @throws {TypeError} if a component is a JavaScript number that is not a safe integer, or the string is not a decimal integer.
   * @throws {RangeError} if the denominator is zero.
   */
  static of(value: RationalInput): Rational {
    if (value instanceof Rational) return value;
    if (typeof value === "string") {
      if (!DECIMAL_INTEGER.test(value)) {
        throw new TypeError(`${JSON.stringify(value)} is not a decimal integer`);
      }
      return new Rational(BigInt(value), 1n);
    }
    if (Array.isArray(value)) {
      const [numerator, denominator] = value as readonly [IntegerInput, IntegerInput];
      return Rational.fromParts(toBigInt(numerator), toBigInt(denominator));
    }
    return new Rational(toBigInt(value as IntegerInput), 1n);
  }

  /** Normalize a numerator and denominator. */
  static fromParts(numerator: bigint, denominator: bigint): Rational {
    if (denominator === 0n) throw new RangeError("a rational denominator cannot be zero");
    const sign = denominator < 0n ? -1n : 1n;
    const divisor = gcd(numerator, denominator) || 1n;
    return new Rational((sign * numerator) / divisor, (sign * denominator) / divisor);
  }

  add(other: Rational): Rational {
    return Rational.fromParts(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  subtract(other: Rational): Rational {
    return Rational.fromParts(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }

  /** `-1`, `0` or `1` as this value is below, equal to or above `other`. */
  compare(other: Rational): -1 | 0 | 1 {
    const difference = this.numerator * other.denominator - other.numerator * this.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }

  equals(other: Rational): boolean {
    return this.numerator === other.numerator && this.denominator === other.denominator;
  }

  /** The Fraction pair `[numerator, denominator]`. */
  toFraction(): readonly [bigint, bigint] {
    return [this.numerator, this.denominator];
  }

  toString(): string {
    return this.denominator === 1n ? `${this.numerator}` : `${this.numerator}/${this.denominator}`;
  }
}
