/**
 * The page of the geometry specification (`docs/geometry.md` in timeskeleton,
 * sections 8.1 to 8.3): one block on a page measured in page units, the
 * exact page transform, the one number formatting rule and the text rules
 * shared by the SVG and TikZ writers.
 */

import { fromFloat, type JsonObject, Rational } from "@timetoalign/tilie-core";
import type { LosslessBlock } from "@timetoalign/tilie-layout";
import { isJsonFloat } from "@timetoalign/timeskeleton";

/** The page options shared by both writers. */
export interface PageOptions {
  /** The width of every block in page units (default 400). */
  readonly width?: number;
  /** The height of a row in page units (default 32). */
  readonly rowHeight?: number;
}

/** The kinds of primitive this version draws; a writer skips any other kind. */
export const KINDS: ReadonlySet<string> = new Set([
  "timeline",
  "child",
  "map",
  "region",
  "break",
  "jump",
  "wedge",
  "label",
]);

export const MARGIN = Rational.of(16n);
export const INNER_SEP = Rational.of(2n);

/** The exact value of a number of the geometry: an integer, a float or a Fraction pair. */
export function exact(value: unknown): Rational {
  if (Array.isArray(value)) return Rational.of([value[0] as bigint, value[1] as bigint]);
  if (typeof value === "bigint") return Rational.of(value);
  if (isJsonFloat(value)) return fromFloat(value.value);
  if (typeof value === "number") {
    return Number.isInteger(value) && !Object.is(value, -0)
      ? Rational.of(BigInt(value))
      : fromFloat(value);
  }
  throw new TypeError(`not a geometry number: ${String(value)}`);
}

/**
 * Format an exact value: rounded to the nearest multiple of 1/10000, ties to
 * the even multiple; decimal, no exponent, no trailing zeros, `0` for zero.
 */
export function formatNumber(value: Rational): string {
  const scaled = value.numerator * 10000n;
  const { denominator } = value;
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

export const fmt = formatNumber;

const q = (value: bigint | number, denominator = 1n): Rational =>
  Rational.fromParts(BigInt(value), denominator);

export { q };

/** One block placed on the page. */
export interface PlacedBlock {
  readonly block: JsonObject;
  readonly primitives: readonly JsonObject[];
  /** The page abscissa of a position on the root's axis. */
  readonly rootX: (value: unknown) => Rational;
  /** The page abscissa of a position on the frame's axis. */
  readonly frameX: (value: unknown) => Rational;
  /** The page ordinate of a height in rows, downwards (SVG) or upwards (TikZ). */
  readonly y: (value: unknown) => Rational;
  /** The top and bottom page ordinates of the block. */
  readonly top: Rational;
  readonly bottom: Rational;
  /** The width of the name column in page units. */
  readonly names: Rational;
}

/** The page: its width, height and placed block. */
export interface Page {
  readonly width: Rational;
  readonly rowHeight: Rational;
  readonly height: Rational;
  readonly block: PlacedBlock;
}

function option(value: number | undefined, fallback: bigint): Rational {
  return value === undefined ? Rational.of(fallback) : exact(value);
}

const member = (value: unknown, ...keys: string[]): unknown =>
  keys.reduce<unknown>((current, key) => (current as JsonObject)[key], value);

/** Place one block on the page; `upwards` selects TikZ ordinates. */
export function page(block: LosslessBlock, options: PageOptions, upwards: boolean): Page {
  const width = option(options.width, 400n);
  const rowHeight = option(options.rowHeight, 32n);
  const value = block as unknown as JsonObject;
  const rows = value.rows as JsonObject;
  const min = q(Number(rows.min));
  const max = q(Number(rows.max));
  const height = q(Number(rows.max) - Number(rows.min) + 1).multiply(rowHeight);
  const frameLength = exact(member(value, "frame", "length"));
  const scale = width.divide(frameLength);
  const plotOffset = exact(member(value, "frame", "plot", "offset"));
  const names = exact(member(value, "frame", "names", "length"));
  const scalar = exact(member(value, "placement", "scalar"));
  const offset = exact(member(value, "placement", "offset"));
  const half = q(1, 2n);
  const y = upwards
    ? (position: unknown) => exact(position).subtract(min).add(half).multiply(rowHeight)
    : (position: unknown) => max.add(half).subtract(exact(position)).multiply(rowHeight);
  const placed: PlacedBlock = {
    block: value,
    primitives: (value.primitives as JsonObject[]).filter((primitive) =>
      KINDS.has(primitive.kind as string),
    ),
    frameX: (position) => exact(position).multiply(scale),
    rootX: (position) =>
      plotOffset
        .add(scalar.multiply(exact(position)))
        .add(offset)
        .multiply(scale),
    y,
    top: upwards ? height : q(0),
    bottom: upwards ? q(0) : height,
    names: names.multiply(scale),
  };
  return { width, rowHeight, height, block: placed };
}

/** A label's text: control characters as spaces, a name-column label cut to its column. */
export function labelText(label: JsonObject, block: PlacedBlock): string | undefined {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the rule replaces them
  const text = (label.text as string).replace(/[\u0000-\u001f]/g, " ");
  if ((label.at as JsonObject).space !== "frame") return text;
  const limit = block.names.subtract(q(4)).multiply(q(5, 21n)).floor();
  const points = Array.from(text);
  if (BigInt(points.length) <= limit) return text;
  if (limit < 1n) return undefined;
  return `${points.slice(0, Number(limit) - 1).join("")}…`;
}

/** The page point of a label's `at`. */
export function labelPoint(label: JsonObject, block: PlacedBlock): readonly [Rational, Rational] {
  const at = label.at as JsonObject;
  const x = at.space === "frame" ? block.frameX(at.x) : block.rootX(at.x);
  return [x, block.y(at.y)];
}
