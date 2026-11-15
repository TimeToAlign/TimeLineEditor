/**
 * A value typed for an axis, read as the exact value its text spells.
 *
 * Text is never read through a JavaScript float: a decimal is read digit by
 * digit, so `0.1` is exactly 1/10, and the caller expresses it in the axis's
 * number type. A sign is read wherever a number is; whether a negative
 * value is allowed is the caller's to say.
 */

import type { NumberType } from "@timetoalign/timetoshare";
import type { Problem } from "../errors.ts";
import { ErrorCode, problem } from "../errors.ts";
import { Rational } from "./rational.ts";

/** The largest decimal exponent read; a larger one spells no value an axis holds. */
const MAX_EXPONENT = 1000;

const INTEGER = /^([+-]?)(\d+)$/;
const GROUPED = /^([+-]?)(\d{1,3}(?: \d{3})+)$/;
const RATIO = /^([+-]?)(\d+)\/(\d+)$/;
const MIXED = /^([+-]?)(\d+) +(\d+)\/(\d+)$/;
const DECIMAL = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

function signed(sign: string | undefined, value: Rational): Rational {
  return sign === "-" ? Rational.fromParts(-value.numerator, value.denominator) : value;
}

/** The exact value of decimal text (`1`, `-0.25`, `.5`, `2.`, `1e-07`); `undefined` for other text. */
function decimal(text: string): Rational | undefined {
  const match = DECIMAL.exec(text);
  if (match === null) return undefined;
  const [, sign, whole, fraction, bare, exponent] = match;
  const digits = bare ?? fraction ?? "";
  const power = Number(exponent ?? "0");
  if (Math.abs(power) > MAX_EXPONENT) return undefined;
  const places = BigInt(digits.length);
  const mantissa = BigInt(`${whole ?? "0"}${digits}`);
  const value =
    power >= 0
      ? Rational.fromParts(mantissa * 10n ** BigInt(power), 10n ** places)
      : Rational.fromParts(mantissa, 10n ** (places - BigInt(power)));
  return signed(sign, value);
}

/** The exact value of an integer, `n/d` or `a b/c`; `undefined` for other text or a zero denominator. */
function fraction(text: string): Rational | undefined {
  const integer = INTEGER.exec(text);
  if (integer !== null) return signed(integer[1], Rational.fromParts(BigInt(integer[2] ?? ""), 1n));
  const ratio = RATIO.exec(text);
  if (ratio !== null) {
    const denominator = BigInt(ratio[3] ?? "");
    if (denominator === 0n) return undefined;
    return signed(ratio[1], Rational.fromParts(BigInt(ratio[2] ?? ""), denominator));
  }
  const mixed = MIXED.exec(text);
  if (mixed !== null) {
    const denominator = BigInt(mixed[4] ?? "");
    if (denominator === 0n) return undefined;
    const whole = Rational.fromParts(BigInt(mixed[2] ?? ""), 1n);
    return signed(mixed[1], whole.add(Rational.fromParts(BigInt(mixed[3] ?? ""), denominator)));
  }
  return decimal(text);
}

/** The digits of an integer, plain or in groups of three separated by one space (`514 041`). */
function integerOf(text: string): Rational | undefined {
  const match = INTEGER.exec(text) ?? GROUPED.exec(text);
  if (match === null) return undefined;
  return signed(match[1], Rational.fromParts(BigInt((match[2] ?? "").replaceAll(" ", "")), 1n));
}

/** What each number type reads, and what a refusal says it accepts. */
const READERS: {
  readonly [type in NumberType]: {
    readonly read: (text: string) => Rational | undefined;
    readonly accepts: string;
  };
} = {
  fraction: { read: fraction, accepts: "an integer, n/d, a b/c or a decimal" },
  float: { read: decimal, accepts: "a decimal number" },
  int: { read: integerOf, accepts: "an integer" },
};

/**
 * The exact value `text` spells for an axis of `numberType`, surrounding
 * white space ignored: on a fraction axis an integer, `n/d`, a mixed
 * fraction `a b/c` or a decimal; on a float axis a decimal (`0.1`, `.5`,
 * `1e-07`); on an int axis the digits, plain or grouped by three with
 * single spaces. Every form takes an optional sign. Any other text, a zero
 * denominator and a decimal exponent beyond ±1000 are refused as
 * `invalid_value` at `[]`.
 */
export function parseAxisValue(text: string, numberType: NumberType): Rational | Problem {
  const { read, accepts } = READERS[numberType];
  const trimmed = text.trim();
  const value = read(trimmed);
  return (
    value ??
    problem(
      ErrorCode.invalidValue,
      `${JSON.stringify(trimmed)} is no ${numberType} value; write ${accepts}`,
      [],
    )
  );
}
