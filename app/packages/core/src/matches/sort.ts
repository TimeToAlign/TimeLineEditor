/**
 * Orderings without comparisons and without an object per item: a stable
 * radix sort of 64-bit keys within groups, and a counting order of pairs.
 */

/** Values sorted within their groups: group `g` holds `ends[g − 1]` (0 for the first) up to `ends[g]`. */
export interface SortedValues {
  /** Per sorted place the item's index. */
  readonly items: Uint32Array;
  readonly high: Uint32Array;
  readonly low: Uint32Array;
  readonly ends: Uint32Array;
}

/** Below this size a group is sorted by insertion. */
const SMALL = 48;

/**
 * Sort `count` items by `group` (below `groups`), then by the unsigned 64-bit
 * key `high`·2^32 + `low`, equal keys in their given order. The items are
 * split by group in one counting pass; each group is then sorted least
 * significant digit first, the keys travelling with the items so every pass
 * reads in sequence; a digit that is the same for the whole group is
 * skipped. Digits are 16 bits wide in a group of 4,096 items or more, 8 bits
 * below. The three input arrays are overwritten.
 */
export function sortValues(
  group: Uint32Array,
  groups: number,
  high: Uint32Array,
  low: Uint32Array,
): SortedValues {
  const count = group.length;
  const ends = new Uint32Array(groups);
  for (let i = 0; i < count; i += 1) {
    const g = group[i] as number;
    ends[g] = (ends[g] as number) + 1;
  }
  for (let g = 1; g < groups; g += 1) ends[g] = (ends[g] as number) + (ends[g - 1] as number);
  const fill = new Uint32Array(groups);
  for (let g = 1; g < groups; g += 1) fill[g] = ends[g - 1] as number;
  let items: Uint32Array = new Uint32Array(count);
  let keyHigh: Uint32Array = new Uint32Array(count);
  let keyLow: Uint32Array = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) {
    const g = group[i] as number;
    const at = fill[g] as number;
    items[at] = i;
    keyHigh[at] = high[i] as number;
    keyLow[at] = low[i] as number;
    fill[g] = at + 1;
  }
  // The inputs, read once, serve as buffers from here on.
  let nextItems: Uint32Array = new Uint32Array(count);
  let nextHigh = high;
  let nextLow = low;
  const starts = new Uint32Array(0x10001);
  const digits = group;
  for (let g = 0; g < groups; g += 1) {
    const start = g === 0 ? 0 : (ends[g - 1] as number);
    const end = ends[g] as number;
    if (end - start < 2) continue;
    if (end - start < SMALL) {
      insertionSort(items, keyHigh, keyLow, start, end);
      continue;
    }
    // Only the bits that differ within the group are digits.
    const firstHigh = keyHigh[start] as number;
    const firstLow = keyLow[start] as number;
    let differHigh = 0;
    let differLow = 0;
    for (let i = start + 1; i < end; i += 1) {
      differHigh |= (keyHigh[i] as number) ^ firstHigh;
      differLow |= (keyLow[i] as number) ^ firstLow;
    }
    if (differHigh === 0 && differLow === 0) continue;
    const lowest =
      differLow !== 0
        ? 31 - Math.clz32(differLow & -differLow)
        : 63 - Math.clz32(differHigh & -differHigh);
    const highest = differHigh !== 0 ? 63 - Math.clz32(differHigh) : 31 - Math.clz32(differLow);
    const span = highest - lowest + 1;
    const passes = Math.ceil(span / (end - start < 4096 ? 8 : 16));
    const bits = Math.ceil(span / passes);
    const mask = bits === 32 ? -1 >>> 0 : (1 << bits) - 1;
    let swapped = false;
    for (let pass = 0; pass < passes; pass += 1) {
      const shift = lowest + pass * bits;
      // Where the digit lies: in the low word, across both words, or in the high word.
      const across = shift < 32 && shift + bits > 32;
      const inHigh = shift >= 32;
      const by = shift % 32;
      const up = 32 - by;
      if (inHigh) {
        for (let i = start; i < end; i += 1) digits[i] = ((keyHigh[i] as number) >>> by) & mask;
      } else if (across) {
        for (let i = start; i < end; i += 1) {
          digits[i] = (((keyLow[i] as number) >>> by) | ((keyHigh[i] as number) << up)) & mask;
        }
      } else {
        for (let i = start; i < end; i += 1) digits[i] = ((keyLow[i] as number) >>> by) & mask;
      }
      starts.fill(0, 0, mask + 2);
      for (let i = start; i < end; i += 1) {
        const digit = (digits[i] as number) + 1;
        starts[digit] = (starts[digit] as number) + 1;
      }
      starts[0] = start;
      for (let digit = 1; digit <= mask; digit += 1) {
        starts[digit] = (starts[digit] as number) + (starts[digit - 1] as number);
      }
      for (let i = start; i < end; i += 1) {
        const digit = digits[i] as number;
        const at = starts[digit] as number;
        nextItems[at] = items[i] as number;
        nextHigh[at] = keyHigh[i] as number;
        nextLow[at] = keyLow[i] as number;
        starts[digit] = at + 1;
      }
      [items, nextItems] = [nextItems, items];
      [keyHigh, nextHigh] = [nextHigh, keyHigh];
      [keyLow, nextLow] = [nextLow, keyLow];
      swapped = !swapped;
    }
    if (swapped) {
      // The group's sorted run lies in the other arrays: copy it back.
      nextItems.set(items.subarray(start, end), start);
      nextHigh.set(keyHigh.subarray(start, end), start);
      nextLow.set(keyLow.subarray(start, end), start);
      [items, nextItems] = [nextItems, items];
      [keyHigh, nextHigh] = [nextHigh, keyHigh];
      [keyLow, nextLow] = [nextLow, keyLow];
    }
  }
  return { items, high: keyHigh, low: keyLow, ends };
}

function insertionSort(
  items: Uint32Array,
  high: Uint32Array,
  low: Uint32Array,
  start: number,
  end: number,
): void {
  for (let i = start + 1; i < end; i += 1) {
    const item = items[i] as number;
    const h = high[i] as number;
    const l = low[i] as number;
    let j = i - 1;
    while (j >= start) {
      const jh = high[j] as number;
      if (jh < h || (jh === h && (low[j] as number) <= l)) break;
      items[j + 1] = items[j] as number;
      high[j + 1] = jh;
      low[j + 1] = low[j] as number;
      j -= 1;
    }
    items[j + 1] = item;
    high[j + 1] = h;
    low[j + 1] = l;
  }
}

/**
 * The order of pairs by `first` (each below `range`), then `second`, equal
 * pairs in their given order: a counting pass over `first`, then each run
 * of one `first` ordered by `second` (insertion for a short run).
 */
export function pairOrder(first: Uint32Array, second: Uint32Array, range: number): Uint32Array {
  const count = first.length;
  const starts = new Uint32Array(range + 1);
  for (let i = 0; i < count; i += 1) {
    const key = (first[i] as number) + 1;
    starts[key] = (starts[key] as number) + 1;
  }
  for (let key = 1; key <= range; key += 1) {
    starts[key] = (starts[key] as number) + (starts[key - 1] as number);
  }
  const order = new Uint32Array(count);
  const fill = starts.slice(0, range);
  for (let i = 0; i < count; i += 1) {
    const key = first[i] as number;
    const at = fill[key] as number;
    order[at] = i;
    fill[key] = at + 1;
  }
  for (let key = 0; key < range; key += 1) {
    const start = starts[key] as number;
    const end = starts[key + 1] as number;
    if (end - start < 2) continue;
    if (end - start > 16) {
      order
        .subarray(start, end)
        .sort((x, y) => (second[x] as number) - (second[y] as number) || x - y);
      continue;
    }
    for (let i = start + 1; i < end; i += 1) {
      const item = order[i] as number;
      const value = second[item] as number;
      let j = i - 1;
      while (j >= start && (second[order[j] as number] as number) > value) {
        order[j + 1] = order[j] as number;
        j -= 1;
      }
      order[j + 1] = item;
    }
  }
  return order;
}
