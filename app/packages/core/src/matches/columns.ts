/**
 * The MatchClaim table as typed columns, the form a server sends it in.
 *
 * Every value of an anchor lies on its timeline's own axis (TimeToShare's
 * README, "The MatchClaim table") and is held exactly in three columns: a
 * float `position`, an int64 `numerator` and an int64 `denominator`. An
 * `int` value is `numerator / 1`, a `fraction` value `numerator /
 * denominator` in lowest terms with a positive denominator, a `float` value
 * its `position` itself (numerator and denominator 0). The position of an
 * exact value is the double nearest to it, ties to even (Python's
 * `float(value)`), and `checkColumns` refuses any other; it orders and
 * hit-tests, and equality on an exact axis never reads it. The repository's `decisions/0029-match-claim-columns.md`
 * records the encoding.
 */

import type { NumberType } from "@timetoalign/timetoshare";
import type { CoordinateValue } from "../number/coordinate.ts";
import { gcd, Rational } from "../number/rational.ts";
import { toFloat, toRational } from "../number/real.ts";

/** A timeline the table holds values for: its ID and the number type of its axis. */
export interface ClaimTimeline {
  readonly id: string;
  readonly numberType: NumberType;
}

/** One value column: per row a position and an exact numerator and denominator. */
export interface ValueColumn {
  readonly position: Float64Array;
  readonly numerator: BigInt64Array;
  readonly denominator: BigInt64Array;
}

/** One side of every MatchClaim: its timeline number and its start and end values. */
export interface ClaimSide {
  /** Per row an index into `MatchClaimColumns.timelines`. */
  readonly timeline: Uint32Array;
  readonly start: ValueColumn;
  readonly end: ValueColumn;
}

/**
 * The MatchClaim table's columns: `rows` rows, a claim ID per row, the sides
 * A and B, and per row whether it has a start anchor and an end anchor
 * (1 or 0). A NOMATCH or conceptual MatchClaim has neither; a row with an
 * end anchor has a start anchor. A value column's cells of a row without
 * that anchor are not read.
 */
export interface MatchClaimColumns {
  readonly rows: number;
  readonly claimIds: readonly string[];
  readonly timelines: readonly ClaimTimeline[];
  readonly a: ClaimSide;
  readonly b: ClaimSide;
  readonly startPresent: Uint8Array;
  readonly endPresent: Uint8Array;
}

/** One value in the three columns. */
export interface ValueCell {
  readonly position: number;
  readonly numerator: bigint;
  readonly denominator: bigint;
}

/** A coordinate value as its three cells: a float as itself, an exact value as its lowest terms. */
export function valueCell(value: CoordinateValue): ValueCell {
  if (typeof value === "number") return { position: value + 0, numerator: 0n, denominator: 0n };
  const exact = toRational(value);
  return {
    position: toFloat(exact) + 0,
    numerator: exact.numerator,
    denominator: exact.denominator,
  };
}

/** One MatchClaim given by values, for `matchClaimColumns`. */
export interface ClaimValues {
  readonly id: string;
  /** Timeline numbers of sides A and B. */
  readonly timelines: readonly [number, number];
  /** The start values of A and B; absent for a MatchClaim without anchors. */
  readonly start?: readonly [CoordinateValue, CoordinateValue];
  /** The end values of A and B, for an interval claim. */
  readonly end?: readonly [CoordinateValue, CoordinateValue];
}

function emptyColumn(rows: number): ValueColumn {
  return {
    position: new Float64Array(rows),
    numerator: new BigInt64Array(rows),
    denominator: new BigInt64Array(rows),
  };
}

function writeCell(column: ValueColumn, row: number, value: CoordinateValue): void {
  const cell = valueCell(value);
  column.position[row] = cell.position;
  column.numerator[row] = cell.numerator;
  column.denominator[row] = cell.denominator;
}

/** The columns of MatchClaims given by values: the encoding, written out once. */
export function matchClaimColumns(
  timelines: readonly ClaimTimeline[],
  claims: readonly ClaimValues[],
): MatchClaimColumns {
  const rows = claims.length;
  const side = (): ClaimSide => ({
    timeline: new Uint32Array(rows),
    start: emptyColumn(rows),
    end: emptyColumn(rows),
  });
  const a = side();
  const b = side();
  const startPresent = new Uint8Array(rows);
  const endPresent = new Uint8Array(rows);
  claims.forEach((claim, row) => {
    a.timeline[row] = claim.timelines[0];
    b.timeline[row] = claim.timelines[1];
    if (claim.start !== undefined) {
      startPresent[row] = 1;
      writeCell(a.start, row, claim.start[0]);
      writeCell(b.start, row, claim.start[1]);
    }
    if (claim.end !== undefined) {
      endPresent[row] = 1;
      writeCell(a.end, row, claim.end[0]);
      writeCell(b.end, row, claim.end[1]);
    }
  });
  return {
    rows,
    claimIds: claims.map((claim) => claim.id),
    timelines,
    a,
    b,
    startPresent,
    endPresent,
  };
}

/**
 * The four value columns in their fixed order: 0 side A's start, 1 side B's
 * start, 2 side A's end, 3 side B's end. A value is addressed as `row * 4 +
 * column`.
 */
export function valueColumns(columns: MatchClaimColumns): readonly ValueColumn[] {
  return [columns.a.start, columns.b.start, columns.a.end, columns.b.end];
}

/** The timeline number of a value column's side in a row. */
export function timelineAt(columns: MatchClaimColumns, row: number, column: number): number {
  return ((column & 1) === 0 ? columns.a.timeline[row] : columns.b.timeline[row]) as number;
}

/** The exact value of a column's row on an `int` or `fraction` axis. */
function exactIn(column: ValueColumn, row: number): Rational {
  return Rational.fromParts(column.numerator[row] as bigint, column.denominator[row] as bigint);
}

/** The exact value `row * 4 + column` holds on an `int` or `fraction` axis. */
export function exactAt(columns: MatchClaimColumns, source: number): Rational {
  return exactIn(valueColumns(columns)[source & 3] as ValueColumn, source >>> 2);
}

/** The value `row * 4 + column` holds, in its timeline's number type. */
export function valueAt(columns: MatchClaimColumns, source: number): CoordinateValue {
  const row = source >>> 2;
  const column = source & 3;
  const numberType = (columns.timelines[timelineAt(columns, row, column)] as ClaimTimeline)
    .numberType;
  const cells = valueColumns(columns)[column] as ValueColumn;
  if (numberType === "float") return cells.position[row] as number;
  const exact = exactIn(cells, row);
  return numberType === "int" ? exact.numerator : exact;
}

const claimRows = new WeakMap<MatchClaimColumns, ReadonlyMap<string, number>>();

/**
 * Each claim ID of the columns to its row.
 *
 * @throws {RangeError} for an ID given to two rows.
 */
function claimRowsBuilt(columns: MatchClaimColumns): ReadonlyMap<string, number> {
  const { claimIds } = columns;
  const rows = new Map<string, number>();
  for (let row = 0; row < claimIds.length; row += 1) rows.set(claimIds[row] as string, row);
  if (rows.size !== claimIds.length) {
    // An ID repeats: find the first repetition, for the message.
    const first = new Map<string, number>();
    claimIds.forEach((id, row) => {
      const earlier = first.get(id);
      if (earlier !== undefined) {
        throw new RangeError(`row ${row}: the claim ID '${id}' names row ${earlier} already`);
      }
      first.set(id, row);
    });
  }
  claimRows.set(columns, rows);
  return rows;
}

/**
 * Each claim ID of the columns to its row, built once per columns (by
 * `checkColumns`, or on the first call).
 */
export function claimRowOf(columns: MatchClaimColumns): ReadonlyMap<string, number> {
  return claimRows.get(columns) ?? claimRowsBuilt(columns);
}

const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
/** The index of an int64's low and high 32-bit word in an `Int32Array` view of it. */
export const LOW_WORD = LITTLE_ENDIAN ? 0 : 1;
export const HIGH_WORD = LITTLE_ENDIAN ? 1 : 0;

/** The 32-bit words of an int64 column, viewed without copying. */
export function wordsOf(values: BigInt64Array): Int32Array {
  return new Int32Array(values.buffer, values.byteOffset, values.length * 2);
}

function gcdNumber(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) {
    const rest = a % b;
    a = b;
    b = rest;
  }
  return a;
}

const TWO_32 = 2 ** 32;
const SAFE_HIGH = 2 ** 20; // |value| < 2^52: the two words make a safe integer

/** Whether a positive denominator shares no factor with its numerator. */
function lowestTerms(
  numerator: BigInt64Array,
  numeratorWords: Int32Array,
  denominatorWords: Int32Array,
  row: number,
  denominator: BigInt64Array,
): boolean {
  const denominatorHigh = denominatorWords[2 * row + HIGH_WORD] as number;
  const denominatorLow = (denominatorWords[2 * row + LOW_WORD] as number) >>> 0;
  if (denominatorHigh === 0 && (denominatorLow & (denominatorLow - 1)) === 0) {
    // A power of two below 2^32: in lowest terms exactly when the numerator is odd.
    return denominatorLow === 1 || ((numeratorWords[2 * row + LOW_WORD] as number) & 1) === 1;
  }
  const numeratorHigh = numeratorWords[2 * row + HIGH_WORD] as number;
  if (denominatorHigh < SAFE_HIGH && numeratorHigh < SAFE_HIGH && numeratorHigh >= -SAFE_HIGH) {
    const n = numeratorHigh * TWO_32 + ((numeratorWords[2 * row + LOW_WORD] as number) >>> 0);
    return gcdNumber(Math.abs(n), denominatorHigh * TWO_32 + denominatorLow) === 1;
  }
  return gcd(numerator[row] as bigint, denominator[row] as bigint) === 1n;
}

/**
 * The double nearest to an exact value (ties to even), as Python's
 * `float(value)`: an IEEE division of numerator by denominator when both are
 * doubles exactly (below 2^52 in magnitude), which is correctly rounded,
 * else `toFloat` of the value.
 */
function nearestDouble(
  numeratorWords: Int32Array,
  denominatorWords: Int32Array,
  row: number,
  column: ValueColumn,
): number {
  const numeratorHigh = numeratorWords[2 * row + HIGH_WORD] as number;
  const denominatorHigh = denominatorWords[2 * row + HIGH_WORD] as number;
  if (denominatorHigh < SAFE_HIGH && numeratorHigh < SAFE_HIGH && numeratorHigh >= -SAFE_HIGH) {
    const n = numeratorHigh * TWO_32 + ((numeratorWords[2 * row + LOW_WORD] as number) >>> 0);
    const d = denominatorHigh * TWO_32 + ((denominatorWords[2 * row + LOW_WORD] as number) >>> 0);
    return n / d;
  }
  return toFloat(exactIn(column, row));
}

const COLUMN_NAMES = ["a.start", "b.start", "a.end", "b.end"];
const INT = 0;
const FRACTION = 1;
const FLOAT = 2;
const KIND: Readonly<Record<NumberType, number>> = { int: INT, fraction: FRACTION, float: FLOAT };

/**
 * Check the columns against the encoding, once per table: an index built
 * from columns checks them on its first build, so a rebuild under another
 * mask does not; columns are never changed after they arrive.
 *
 * @throws {RangeError} for a column whose length is not the row count, a
 * claim ID given to two rows, a timeline number beyond the timelines, an
 * end anchor without a start anchor, a position that is not finite, a
 * denominator other than 1 on an int axis, a denominator below 1 or a
 * fraction not in lowest terms on a fraction axis, or an exact value whose
 * position is not the double nearest to it.
 */
export function checkColumns(columns: MatchClaimColumns): void {
  const { rows, timelines } = columns;
  if (!Number.isSafeInteger(rows) || rows < 0 || rows >= 2 ** 30) {
    throw new RangeError(`${rows} is no row count`);
  }
  const lengths: [string, { readonly length: number }][] = [
    ["claimIds", columns.claimIds],
    ["startPresent", columns.startPresent],
    ["endPresent", columns.endPresent],
    ["a.timeline", columns.a.timeline],
    ["b.timeline", columns.b.timeline],
  ];
  valueColumns(columns).forEach((column, index) => {
    for (const part of ["position", "numerator", "denominator"] as const) {
      lengths.push([`${COLUMN_NAMES[index]}.${part}`, column[part]]);
    }
  });
  for (const [name, values] of lengths) {
    if (values.length !== rows) {
      throw new RangeError(`${name} has ${values.length} entries for ${rows} rows`);
    }
  }
  claimRowsBuilt(columns);
  for (const side of ["a", "b"] as const) {
    const numbers = columns[side].timeline;
    for (let row = 0; row < rows; row += 1) {
      if ((numbers[row] as number) >= timelines.length) {
        throw new RangeError(
          `row ${row}: ${side}.timeline ${numbers[row]} names no timeline (${timelines.length} given)`,
        );
      }
    }
  }
  const { startPresent, endPresent } = columns;
  for (let row = 0; row < rows; row += 1) {
    if (endPresent[row] === 1 && startPresent[row] !== 1) {
      throw new RangeError(`row ${row}: an end anchor without a start anchor`);
    }
  }
  const kinds = Uint8Array.from(timelines, (timeline) => KIND[timeline.numberType]);
  valueColumns(columns).forEach((column, index) => {
    const present = index < 2 ? startPresent : endPresent;
    const numbers = (index & 1) === 0 ? columns.a.timeline : columns.b.timeline;
    const positions = column.position;
    const numeratorWords = wordsOf(column.numerator);
    const denominatorWords = wordsOf(column.denominator);
    const refuse = (row: number, problem: string): never => {
      const timeline = timelines[numbers[row] as number] as ClaimTimeline;
      throw new RangeError(`row ${row}: ${COLUMN_NAMES[index]} on '${timeline.id}': ${problem}`);
    };
    for (let row = 0; row < rows; row += 1) {
      if (present[row] !== 1) continue;
      const position = positions[row] as number;
      if (position - position !== 0) refuse(row, `the position ${position}`);
      const kind = kinds[numbers[row] as number] as number;
      if (kind === FLOAT) continue;
      const high = denominatorWords[2 * row + HIGH_WORD] as number;
      const low = denominatorWords[2 * row + LOW_WORD] as number;
      if (kind === INT) {
        if (high !== 0 || low !== 1) {
          refuse(row, `the denominator ${column.denominator[row]} of an int value`);
        }
      } else if (high !== 0 || low !== 1) {
        if (high < 0 || (high === 0 && low === 0)) {
          refuse(row, `the denominator ${column.denominator[row]}`);
        } else if (
          !lowestTerms(column.numerator, numeratorWords, denominatorWords, row, column.denominator)
        ) {
          refuse(row, `${column.numerator[row]}/${column.denominator[row]} is not in lowest terms`);
        }
      }
      const nearest = nearestDouble(numeratorWords, denominatorWords, row, column);
      if (position !== nearest) {
        refuse(
          row,
          `the position ${position} of ${exactIn(column, row)}, whose double is ${nearest}`,
        );
      }
    }
  });
}
