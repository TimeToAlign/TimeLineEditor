/**
 * The page of placed drawings and the one number format of the writers
 * (`docs/drawing.md` in timeskeleton, sections 7.1 and 7.3).
 */

import { fromFloat } from "@timetoalign/tilie-core";
import type { Drawing } from "@timetoalign/tilie-layout";

/** One drawing placed at canvas position `(x, y)` and scaled by `scale`. */
export interface Placed {
  readonly drawing: Drawing;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** A placed drawing's position on the page. */
export interface OnPage extends Placed {
  readonly pageX: number;
  readonly pageY: number;
}

export interface Page {
  readonly width: number;
  readonly height: number;
  readonly drawings: readonly OnPage[];
}

/** The margin of the page on every side. */
export const MARGIN = 16;

/** The bounding box of the placed boxes plus the margin on every side. */
export function page(placed: readonly Placed[]): Page {
  if (placed.length === 0) throw new RangeError("a page holds at least one drawing");
  const left = Math.min(...placed.map((item) => item.x));
  const top = Math.min(...placed.map((item) => item.y));
  const right = Math.max(...placed.map((item) => item.x + item.drawing.width * item.scale));
  const bottom = Math.max(...placed.map((item) => item.y + item.drawing.height * item.scale));
  return {
    width: right - left + 2 * MARGIN,
    height: bottom - top + 2 * MARGIN,
    drawings: placed.map((item) => ({
      ...item,
      pageX: item.x - left + MARGIN,
      pageY: item.y - top + MARGIN,
    })),
  };
}

/**
 * The exact value of a double rounded to the nearest multiple of 1/10000,
 * ties to the even multiple, in decimal without exponent or trailing zeros;
 * a value that rounds to zero is `0`.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError(`${value} is not a finite number`);
  const exact = fromFloat(value);
  const scaled = exact.numerator * 10000n;
  const { denominator } = exact;
  let quotient = scaled / denominator;
  let remainder = scaled - quotient * denominator;
  if (remainder < 0n) {
    quotient -= 1n;
    remainder += denominator;
  }
  const twice = 2n * remainder;
  if (twice > denominator || (twice === denominator && quotient % 2n !== 0n)) quotient += 1n;
  if (quotient === 0n) return "0";
  const negative = quotient < 0n;
  const magnitude = negative ? -quotient : quotient;
  const whole = magnitude / 10000n;
  const fraction = (magnitude % 10000n).toString().padStart(4, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction === "" ? "" : `.${fraction}`}`;
}
