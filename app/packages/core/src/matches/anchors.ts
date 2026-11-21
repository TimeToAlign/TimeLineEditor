/**
 * The anchor index: from the MatchClaim table's columns and a row mask, the
 * unique coordinates, the unique AlignmentAnchors with the claims stating
 * each, the potential MatchStamps (the connected sets of coordinates under
 * the anchors), each timeline's coordinates in order, and the matched spans
 * of interval claims.
 *
 * Built once per table and mask in O(n log n) (a radix sort of the values,
 * a counting order of the anchors, one union-find), with no object per row:
 * every reference is
 * an integer, every part a typed array. Exact values stay in their columns;
 * a coordinate keeps the address of one value stating it (`row * 4 +
 * column`, the columns as `valueColumns` orders them).
 */

import type { CoordinateValue } from "../number/coordinate.ts";
import { Rational } from "../number/rational.ts";
import { toFloat } from "../number/real.ts";
import type { MatchClaimColumns } from "./columns.ts";
import { checkColumns, HIGH_WORD, LOW_WORD, valueAt, valueColumns, wordsOf } from "./columns.ts";
import { pairOrder, sortValues } from "./sort.ts";

/** One entry per unique (timeline, exact value), ordered by timeline, position, exact value. */
export interface Coordinates {
  readonly count: number;
  readonly timeline: Uint32Array;
  /** The sort and hit-test key; never an equality on an exact axis. */
  readonly position: Float64Array;
  /** One value stating the coordinate, as `row * 4 + column`. */
  readonly source: Uint32Array;
  /**
   * The order: the coordinates of timeline `t` are `byTimeline[t]` up to
   * `byTimeline[t + 1]`, ascending by position.
   */
  readonly byTimeline: Uint32Array;
}

/** Unique AlignmentAnchors: coordinate pairs, lower number first, ordered by (low, high). */
export interface Anchors {
  readonly count: number;
  readonly low: Uint32Array;
  readonly high: Uint32Array;
  /** The rows stating anchor `a` are `claimRows[claimOffsets[a] … claimOffsets[a + 1]]`, ascending. */
  readonly claimOffsets: Uint32Array;
  readonly claimRows: Uint32Array;
  /** Per row its start anchor, −1 when it gives none (NOMATCH, conceptual, masked). */
  readonly startOf: Int32Array;
  /** Per row its end anchor, −1 when it is no interval claim passing the mask. */
  readonly endOf: Int32Array;
}

/** Per coordinate the coordinates it is joined to, ascending, with the anchor joining each. */
export interface Neighbours {
  readonly offsets: Uint32Array;
  readonly coordinates: Uint32Array;
  readonly anchors: Uint32Array;
}

/** The potential MatchStamps, numbered by their first coordinate. */
export interface PotentialMatchStamps {
  readonly count: number;
  /** Per coordinate its MatchStamp. */
  readonly of: Uint32Array;
  /** The coordinates of MatchStamp `m` are `members[offsets[m] … offsets[m + 1]]`, ascending. */
  readonly offsets: Uint32Array;
  readonly members: Uint32Array;
}

/** Per interval claim passing the mask (in row order) its start and end anchor. */
export interface MatchedSpans {
  readonly count: number;
  readonly rows: Uint32Array;
  readonly start: Uint32Array;
  readonly end: Uint32Array;
}

export interface AnchorIndex {
  readonly columns: MatchClaimColumns;
  readonly mask: Uint8Array | null;
  /** Each timeline's ID to its number in `columns.timelines`. */
  readonly timelineNumbers: ReadonlyMap<string, number>;
  readonly coordinates: Coordinates;
  readonly anchors: Anchors;
  readonly neighbours: Neighbours;
  readonly matchStamps: PotentialMatchStamps;
  readonly spans: MatchedSpans;
}

/** Columns already checked. */
const checked = new WeakSet<MatchClaimColumns>();

/** Exact order of two values of one exact axis, by cross-multiplication. */
function compareExact(
  left: { numerator: bigint; denominator: bigint },
  right: { numerator: bigint; denominator: bigint },
): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

/**
 * Build the anchor index of `columns` under `mask` (1: the row passes the
 * belief filter; `null`: every row passes).
 *
 * @throws {RangeError} for columns the encoding refuses (`checkColumns`,
 * on the first build from them) or a mask of another length.
 */
export function anchorIndexOf(
  columns: MatchClaimColumns,
  mask: Uint8Array | null = null,
): AnchorIndex {
  if (!checked.has(columns)) {
    checkColumns(columns);
    checked.add(columns);
  }
  if (mask !== null && mask.length !== columns.rows) {
    throw new RangeError(`the mask has ${mask.length} entries for ${columns.rows} rows`);
  }
  const { rows, timelines, startPresent, endPresent } = columns;
  const cells = valueColumns(columns);
  const numeratorWords = cells.map((cell) => wordsOf(cell.numerator));
  const denominatorWords = cells.map((cell) => wordsOf(cell.denominator));

  // Anchor slots, in row order: a row's start anchor, then its end anchor.
  let slots = 0;
  for (let row = 0; row < rows; row += 1) {
    if (startPresent[row] !== 1 || (mask !== null && mask[row] !== 1)) continue;
    slots += endPresent[row] === 1 ? 2 : 1;
  }
  const slotRow = new Uint32Array(slots);
  const slotEnd = new Uint8Array(slots);
  for (let row = 0, p = 0; row < rows; row += 1) {
    if (startPresent[row] !== 1 || (mask !== null && mask[row] !== 1)) continue;
    slotRow[p] = row;
    p += 1;
    if (endPresent[row] === 1) {
      slotRow[p] = row;
      slotEnd[p] = 1;
      p += 1;
    }
  }

  // Value slots: anchor slot p's side A is 2p, its side B 2p + 1, each with
  // its timeline and its position's two words as unsigned keys in the
  // doubles' order (−0 taken as 0).
  const values = 2 * slots;
  const valueTimeline = new Uint32Array(values);
  const valueHigh = new Uint32Array(values);
  const valueLow = new Uint32Array(values);
  const valueSource = new Uint32Array(values);
  const sideTimeline = [columns.a.timeline, columns.b.timeline];
  const positionWords = cells.map(
    (cell) => new Uint32Array(cell.position.buffer, cell.position.byteOffset, 2 * rows),
  );
  const scratch = new Float64Array(1);
  const scratchWords = new Uint32Array(scratch.buffer);
  for (let p = 0; p < slots; p += 1) {
    const row = slotRow[p] as number;
    const end = slotEnd[p] as number;
    for (let side = 0; side < 2; side += 1) {
      const column = end * 2 + side;
      const at = 2 * p + side;
      valueTimeline[at] = (sideTimeline[side] as Uint32Array)[row] as number;
      valueSource[at] = row * 4 + column;
      const words = positionWords[column] as Uint32Array;
      const low = words[2 * row + LOW_WORD] as number;
      // −0 is 0.
      const high =
        low === 0 && words[2 * row + HIGH_WORD] === 0x80000000
          ? 0
          : (words[2 * row + HIGH_WORD] as number);
      if (high >>> 31 === 1) {
        valueHigh[at] = ~high >>> 0;
        valueLow[at] = ~low >>> 0;
      } else {
        valueHigh[at] = (high | 0x80000000) >>> 0;
        valueLow[at] = low;
      }
    }
  }
  const sorted = sortValues(valueTimeline, timelines.length, valueHigh, valueLow);
  const order = sorted.items;
  const sortedHigh = sorted.high;
  const sortedLow = sorted.low;

  const sameWords = (left: number, right: number): boolean => {
    const leftRow = left >>> 2;
    const rightRow = right >>> 2;
    const ln = numeratorWords[left & 3] as Int32Array;
    const rn = numeratorWords[right & 3] as Int32Array;
    const ld = denominatorWords[left & 3] as Int32Array;
    const rd = denominatorWords[right & 3] as Int32Array;
    return (
      ln[2 * leftRow + LOW_WORD] === rn[2 * rightRow + LOW_WORD] &&
      ln[2 * leftRow + HIGH_WORD] === rn[2 * rightRow + HIGH_WORD] &&
      ld[2 * leftRow + LOW_WORD] === rd[2 * rightRow + LOW_WORD] &&
      ld[2 * leftRow + HIGH_WORD] === rd[2 * rightRow + HIGH_WORD]
    );
  };
  const exactOf = (source: number) => {
    const cell = cells[source % 4];
    const row = Math.floor(source / 4);
    return {
      numerator: cell?.numerator[row] as bigint,
      denominator: cell?.denominator[row] as bigint,
    };
  };

  // Coordinates: runs of one timeline and position, split by exact value.
  const coordinateOfValue = new Uint32Array(values);
  const coordinateTimeline = new Uint32Array(values);
  const coordinatePosition = new Float64Array(values);
  const coordinateSource = new Uint32Array(values);
  const floats = Uint8Array.from(timelines, (timeline) =>
    timeline.numberType === "float" ? 1 : 0,
  );
  const ends = sorted.ends;
  let coordinateCount = 0;
  let timeline = 0;
  for (let i = 0; i < values; ) {
    while ((ends[timeline] as number) <= i) timeline += 1;
    const blockStop = ends[timeline] as number;
    const low = sortedLow[i] as number;
    const high = sortedHigh[i] as number;
    let j = i + 1;
    while (j < blockStop && sortedLow[j] === low && sortedHigh[j] === high) j += 1;
    // The run's position, rebuilt from its keys.
    if (high >>> 31 === 1) {
      scratchWords[HIGH_WORD] = high ^ 0x80000000;
      scratchWords[LOW_WORD] = low;
    } else {
      scratchWords[HIGH_WORD] = ~high;
      scratchWords[LOW_WORD] = ~low;
    }
    const position = scratch[0] as number;
    const first = order[i] as number;
    let uniform = true;
    if (j > i + 1 && floats[timeline] !== 1) {
      const source = valueSource[first] as number;
      for (let k = i + 1; k < j && uniform; k += 1) {
        uniform = sameWords(valueSource[order[k] as number] as number, source);
      }
    }
    if (uniform) {
      coordinateTimeline[coordinateCount] = timeline;
      coordinatePosition[coordinateCount] = position;
      coordinateSource[coordinateCount] = valueSource[first] as number;
      for (let k = i; k < j; k += 1) coordinateOfValue[order[k] as number] = coordinateCount;
      coordinateCount += 1;
    } else {
      const run = Array.from(order.subarray(i, j)).sort((left, right) =>
        compareExact(exactOf(valueSource[left] as number), exactOf(valueSource[right] as number)),
      );
      let previous = -1;
      for (const item of run) {
        const source = valueSource[item] as number;
        if (previous < 0 || !sameWords(valueSource[previous] as number, source)) {
          coordinateTimeline[coordinateCount] = timeline;
          coordinatePosition[coordinateCount] = position;
          coordinateSource[coordinateCount] = source;
          coordinateCount += 1;
        }
        coordinateOfValue[item] = coordinateCount - 1;
        previous = item;
      }
    }
    i = j;
  }
  const byTimeline = new Uint32Array(timelines.length + 1);
  for (let c = 0; c < coordinateCount; c += 1) {
    const t = (coordinateTimeline[c] as number) + 1;
    byTimeline[t] = (byTimeline[t] as number) + 1;
  }
  for (let t = 1; t <= timelines.length; t += 1) {
    byTimeline[t] = (byTimeline[t] as number) + (byTimeline[t - 1] as number);
  }

  // Anchors: unique (low, high) coordinate pairs.
  const slotLow = new Uint32Array(slots);
  const slotHigh = new Uint32Array(slots);
  for (let p = 0; p < slots; p += 1) {
    const u = coordinateOfValue[2 * p] as number;
    const v = coordinateOfValue[2 * p + 1] as number;
    slotLow[p] = u < v ? u : v;
    slotHigh[p] = u < v ? v : u;
  }
  const anchorOrder = pairOrder(slotLow, slotHigh, coordinateCount);
  const anchorLow = new Uint32Array(slots);
  const anchorHigh = new Uint32Array(slots);
  const claimOffsets = new Uint32Array(slots + 1);
  const claimRows = new Uint32Array(slots);
  const startOf = new Int32Array(rows).fill(-1);
  const endOf = new Int32Array(rows).fill(-1);
  let anchorCount = 0;
  let claimCount = 0;
  for (let i = 0; i < slots; i += 1) {
    const p = anchorOrder[i] as number;
    const low = slotLow[p] as number;
    const high = slotHigh[p] as number;
    if (
      anchorCount === 0 ||
      anchorLow[anchorCount - 1] !== low ||
      anchorHigh[anchorCount - 1] !== high
    ) {
      anchorLow[anchorCount] = low;
      anchorHigh[anchorCount] = high;
      claimOffsets[anchorCount] = claimCount;
      anchorCount += 1;
    }
    const row = slotRow[p] as number;
    if (claimCount === claimOffsets[anchorCount - 1] || claimRows[claimCount - 1] !== row) {
      claimRows[claimCount] = row;
      claimCount += 1;
    }
    (slotEnd[p] === 1 ? endOf : startOf)[row] = anchorCount - 1;
  }
  claimOffsets[anchorCount] = claimCount;

  // Matched spans.
  let spanCount = 0;
  for (let row = 0; row < rows; row += 1) if ((endOf[row] as number) >= 0) spanCount += 1;
  const spanRows = new Uint32Array(spanCount);
  const spanStart = new Uint32Array(spanCount);
  const spanEnd = new Uint32Array(spanCount);
  for (let row = 0, s = 0; row < rows; row += 1) {
    if ((endOf[row] as number) < 0) continue;
    spanRows[s] = row;
    spanStart[s] = startOf[row] as number;
    spanEnd[s] = endOf[row] as number;
    s += 1;
  }

  // Neighbours: in anchor order each list comes out ascending.
  const neighbourOffsets = new Uint32Array(coordinateCount + 1);
  for (let a = 0; a < anchorCount; a += 1) {
    const low = (anchorLow[a] as number) + 1;
    const high = (anchorHigh[a] as number) + 1;
    neighbourOffsets[low] = (neighbourOffsets[low] as number) + 1;
    if (high !== low) neighbourOffsets[high] = (neighbourOffsets[high] as number) + 1;
  }
  for (let c = 1; c <= coordinateCount; c += 1) {
    neighbourOffsets[c] = (neighbourOffsets[c] as number) + (neighbourOffsets[c - 1] as number);
  }
  const filled = neighbourOffsets.slice(0, coordinateCount);
  const neighbourTotal = neighbourOffsets[coordinateCount] as number;
  const neighbourCoordinates = new Uint32Array(neighbourTotal);
  const neighbourAnchors = new Uint32Array(neighbourTotal);
  const join = (from: number, to: number, anchor: number) => {
    const at = filled[from] as number;
    neighbourCoordinates[at] = to;
    neighbourAnchors[at] = anchor;
    filled[from] = at + 1;
  };
  for (let a = 0; a < anchorCount; a += 1) {
    const low = anchorLow[a] as number;
    const high = anchorHigh[a] as number;
    join(low, high, a);
    if (high !== low) join(high, low, a);
  }

  // Potential MatchStamps: union-find, each root its set's smallest coordinate.
  const parent = new Uint32Array(coordinateCount);
  for (let c = 0; c < coordinateCount; c += 1) parent[c] = c;
  const find = (start: number): number => {
    let c = start;
    while (parent[c] !== c) {
      const up = parent[parent[c] as number] as number;
      parent[c] = up;
      c = up;
    }
    return c;
  };
  for (let a = 0; a < anchorCount; a += 1) {
    const left = find(anchorLow[a] as number);
    const right = find(anchorHigh[a] as number);
    if (left < right) parent[right] = left;
    else if (right < left) parent[left] = right;
  }
  const stampOf = new Uint32Array(coordinateCount);
  let stampCount = 0;
  for (let c = 0; c < coordinateCount; c += 1) {
    const root = find(c);
    if (root === c) {
      stampOf[c] = stampCount;
      stampCount += 1;
    } else {
      stampOf[c] = stampOf[root] as number;
    }
  }
  const stampOffsets = new Uint32Array(stampCount + 1);
  for (let c = 0; c < coordinateCount; c += 1) {
    const m = (stampOf[c] as number) + 1;
    stampOffsets[m] = (stampOffsets[m] as number) + 1;
  }
  for (let m = 1; m <= stampCount; m += 1) {
    stampOffsets[m] = (stampOffsets[m] as number) + (stampOffsets[m - 1] as number);
  }
  const stampFill = stampOffsets.slice(0, stampCount);
  const stampMembers = new Uint32Array(coordinateCount);
  for (let c = 0; c < coordinateCount; c += 1) {
    const m = stampOf[c] as number;
    const at = stampFill[m] as number;
    stampMembers[at] = c;
    stampFill[m] = at + 1;
  }

  return {
    columns,
    mask,
    timelineNumbers: new Map(timelines.map((timeline, number) => [timeline.id, number])),
    coordinates: {
      count: coordinateCount,
      timeline: coordinateTimeline.slice(0, coordinateCount),
      position: coordinatePosition.slice(0, coordinateCount),
      source: coordinateSource.slice(0, coordinateCount),
      byTimeline,
    },
    anchors: {
      count: anchorCount,
      low: anchorLow.slice(0, anchorCount),
      high: anchorHigh.slice(0, anchorCount),
      claimOffsets: claimOffsets.slice(0, anchorCount + 1),
      claimRows: claimRows.slice(0, claimCount),
      startOf,
      endOf,
    },
    neighbours: {
      offsets: neighbourOffsets,
      coordinates: neighbourCoordinates,
      anchors: neighbourAnchors,
    },
    matchStamps: {
      count: stampCount,
      of: stampOf,
      offsets: stampOffsets,
      members: stampMembers,
    },
    spans: { count: spanCount, rows: spanRows, start: spanStart, end: spanEnd },
  };
}

/** A coordinate's exact value, in its timeline's number type. */
export function coordinateValue(index: AnchorIndex, coordinate: number): CoordinateValue {
  return valueAt(index.columns, index.coordinates.source[coordinate] as number);
}

/** The first coordinate of `timeline` whose position is not below `position`. */
function lowerBound(index: AnchorIndex, timeline: number, position: number): number {
  const { byTimeline, position: positions } = index.coordinates;
  let low = byTimeline[timeline] as number;
  let high = byTimeline[timeline + 1] as number;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((positions[middle] as number) < position) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * The coordinate of `timeline` (an ID) holding exactly `value`, or −1. A
 * float axis takes a `number`, an exact axis a `bigint` or a `Rational`;
 * another kind of value lies on no coordinate.
 */
export function coordinateOf(index: AnchorIndex, timeline: string, value: CoordinateValue): number {
  const number = index.timelineNumbers.get(timeline);
  if (number === undefined) return -1;
  const float = index.columns.timelines[number]?.numberType === "float";
  if (float !== (typeof value === "number")) return -1;
  const exact =
    typeof value === "number"
      ? null
      : typeof value === "bigint"
        ? Rational.fromParts(value, 1n)
        : value;
  const position = exact === null ? (value as number) + 0 : toFloat(exact) + 0;
  const { byTimeline, position: positions, source } = index.coordinates;
  const end = byTimeline[number + 1] as number;
  for (let c = lowerBound(index, number, position); c < end; c += 1) {
    if (positions[c] !== position) break;
    if (exact === null) return c;
    const at = source[c] as number;
    const cell = valueColumns(index.columns)[at % 4];
    const row = Math.floor(at / 4);
    const found = {
      numerator: cell?.numerator[row] as bigint,
      denominator: cell?.denominator[row] as bigint,
    };
    if (compareExact(found, exact) === 0) return c;
  }
  return -1;
}

/**
 * The coordinate of `timeline` (a number) nearest to `position` within
 * `tolerance` (both in the timeline's units, as doubles), or −1; of two
 * equally near the lower numbered.
 */
export function coordinateNear(
  index: AnchorIndex,
  timeline: number,
  position: number,
  tolerance: number,
): number {
  const { byTimeline, position: positions } = index.coordinates;
  const start = byTimeline[timeline] as number;
  const end = byTimeline[timeline + 1] as number;
  const at = lowerBound(index, timeline, position);
  let best = -1;
  let distance = tolerance;
  if (at > start) {
    // The last coordinate below `position`: the first of its run of equal positions.
    let below = at - 1;
    while (below > start && positions[below - 1] === positions[below]) below -= 1;
    const gap = position - (positions[below] as number);
    if (gap <= distance) {
      best = below;
      distance = gap;
    }
  }
  if (at < end) {
    const gap = (positions[at] as number) - position;
    if (gap < distance || (gap === distance && best < 0)) best = at;
  }
  return best;
}

/**
 * The coordinates of `timeline` (a number) with positions from `from` to
 * `to`, both included: the range `[first, end)` of coordinate numbers.
 */
export function coordinatesWithin(
  index: AnchorIndex,
  timeline: number,
  from: number,
  to: number,
): readonly [number, number] {
  const first = lowerBound(index, timeline, from);
  const { byTimeline, position: positions } = index.coordinates;
  const last = byTimeline[timeline + 1] as number;
  let low = first;
  let high = last;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((positions[middle] as number) <= to) low = middle + 1;
    else high = middle;
  }
  return [first, low];
}

/** The anchor joining two coordinates, or −1. */
export function anchorOf(index: AnchorIndex, left: number, right: number): number {
  const low = Math.min(left, right);
  const high = Math.max(left, right);
  const { offsets, coordinates, anchors } = index.neighbours;
  let first = offsets[low] as number;
  let last = offsets[low + 1] as number;
  while (first < last) {
    const middle = (first + last) >>> 1;
    if ((coordinates[middle] as number) < high) first = middle + 1;
    else last = middle;
  }
  return first < (offsets[low + 1] as number) && coordinates[first] === high
    ? (anchors[first] as number)
    : -1;
}

/** The coordinates of a potential MatchStamp, ascending. */
export function matchStampMembers(index: AnchorIndex, matchStamp: number): Uint32Array {
  const { offsets, members } = index.matchStamps;
  return members.subarray(offsets[matchStamp] as number, offsets[matchStamp + 1] as number);
}

/** The anchors of a potential MatchStamp, ascending. */
export function matchStampAnchors(index: AnchorIndex, matchStamp: number): Uint32Array {
  const { offsets, coordinates, anchors } = index.neighbours;
  const found: number[] = [];
  for (const member of matchStampMembers(index, matchStamp)) {
    for (let at = offsets[member] as number; at < (offsets[member + 1] as number); at += 1) {
      if ((coordinates[at] as number) >= member) found.push(anchors[at] as number);
    }
  }
  return Uint32Array.from(found).sort();
}

/** The rows of the MatchClaims stating any of `anchors`, ascending, each once. */
export function claimRowsOf(index: AnchorIndex, anchors: ArrayLike<number>): Uint32Array {
  const { claimOffsets, claimRows } = index.anchors;
  const rows: number[] = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const a = anchors[i] as number;
    for (let at = claimOffsets[a] as number; at < (claimOffsets[a + 1] as number); at += 1) {
      rows.push(claimRows[at] as number);
    }
  }
  const sorted = Uint32Array.from(rows).sort();
  let kept = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (kept === 0 || sorted[kept - 1] !== sorted[i]) {
      sorted[kept] = sorted[i] as number;
      kept += 1;
    }
  }
  return sorted.slice(0, kept);
}

/**
 * The anchors between two timelines in the first one's order, and per gap
 * between neighbouring anchors (1 or 0) whether a matched span between the
 * two timelines covers it.
 */
export interface Segments {
  readonly anchors: Uint32Array;
  readonly covered: Uint8Array;
}

/**
 * The segments of two timelines (numbers), built on demand in one sweep
 * over the first timeline's coordinates.
 *
 * @throws {RangeError} when both are one timeline.
 */
export function segmentsOf(index: AnchorIndex, first: number, second: number): Segments {
  if (first === second) throw new RangeError(`segments need two timelines, not ${first} twice`);
  const { byTimeline, timeline } = index.coordinates;
  const { offsets, coordinates, anchors } = index.neighbours;
  const found: number[] = [];
  for (let c = byTimeline[first] as number; c < (byTimeline[first + 1] as number); c += 1) {
    for (let at = offsets[c] as number; at < (offsets[c + 1] as number); at += 1) {
      if (timeline[coordinates[at] as number] === second) found.push(anchors[at] as number);
    }
  }
  const place = new Map(found.map((anchor, at) => [anchor, at]));
  const depth = new Int32Array(found.length);
  const { claimOffsets, claimRows, startOf, endOf } = index.anchors;
  found.forEach((anchor, at) => {
    for (let k = claimOffsets[anchor] as number; k < (claimOffsets[anchor + 1] as number); k += 1) {
      const row = claimRows[k] as number;
      if (startOf[row] !== anchor || (endOf[row] as number) < 0) continue;
      const other = place.get(endOf[row] as number);
      if (other === undefined) continue;
      const from = Math.min(at, other);
      const to = Math.max(at, other);
      if (from === to) continue;
      depth[from] = (depth[from] as number) + 1;
      depth[to] = (depth[to] as number) - 1;
    }
  });
  const covered = new Uint8Array(Math.max(found.length - 1, 0));
  let open = 0;
  for (let gap = 0; gap < covered.length; gap += 1) {
    open += depth[gap] as number;
    covered[gap] = open > 0 ? 1 : 0;
  }
  return { anchors: Uint32Array.from(found), covered };
}
