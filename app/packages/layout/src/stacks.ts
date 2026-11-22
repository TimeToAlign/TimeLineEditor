/**
 * Stacks of labels at the thick end of their wedges (`docs/drawing.md` in
 * TimeToShare, sections 6.4, Markers, 6.6, Wedges, Labels of named
 * timestamps and Cross-section lines, and 8.3): their tiers, counted in
 * lines; where a turned wedge carries a stack; and the gap a named
 * timestamp's cross-section line leaves where its wedge and its stack stand.
 * The markers band and the ancestor lines share it.
 */

import { LABEL_GAP, MARKER_HEIGHT } from "./constants.ts";
import { labelExtent, Rows } from "./fit.ts";
import { sineCosine, wedgeCorners } from "./rotation.ts";

/** A stack of labels to tier: its centre's abscissa unturned, its line count, its widest label. */
export interface StackItem {
  readonly x: number;
  readonly lines: number;
  readonly width: number;
}

/** The stacks tiered: the first line `n1` of each, from 1, and the line count `T` of the tiers. */
export interface Tiers {
  readonly first: readonly number[];
  readonly lines: number;
}

/**
 * One first fit of `items`, in order, into tiers (section 6.3), each stack
 * one item, as wide as its widest label and centred on its unturned
 * abscissa: a tier is as many lines high as its highest stack, and the
 * first line of a stack in tier `k` is `m1 + … + m(k−1) + 1`.
 */
export function tiersOf(items: readonly StackItem[]): Tiers {
  const rows = new Rows();
  const tierOf = items.map((item) => rows.place(labelExtent(item.x, item.width)));
  const heights = rows.rows.map(() => 0);
  items.forEach((item, index) => {
    const tier = (tierOf[index] ?? 1) - 1;
    heights[tier] = Math.max(heights[tier] ?? 0, item.lines);
  });
  const before: number[] = [];
  let lines = 0;
  for (const height of heights) {
    before.push(lines);
    lines += height;
  }
  return { first: tierOf.map((tier) => (before[tier - 1] ?? 0) + 1), lines };
}

/**
 * Where a wedge of `rotation` degrees carries its stack (section 6.6, Labels
 * of named timestamps): `vx` the carry across, by which its labels are
 * centred off the wedge's tip, and the distances out from the wedge's tip
 * at which each of its lines starts, with the side its baselines lie on.
 */
export interface Carried {
  readonly vx: number;
  /** The distance out from the line at which each line of the stack starts, from its first. */
  readonly starts: readonly number[];
  /** The baselines lie beyond each start inwards, away from the tip, as on the other side. */
  readonly inwards: boolean;
  /** The distances out of the box's two sides, nearer the line first. */
  readonly box: readonly [number, number];
}

/**
 * The stack of `count` labels, the widest `W` wide, each line `h` high, whose
 * first line `n1` lies in the tiers of a band whose wedges' tips lie `tip`
 * out from the line (`c + w / 2`), carried by a wedge turned `rotation`: at
 * 0 its unturned place, line `n` starting `tip + 13 + 2 + (n − 1) × h` out;
 * else the box `H = count × h` high whose centre lies on the wedge's axis at
 * `t = D + W / 2 × |s| + H / 2 × |k|` from the tip, `D = 13 + 2 + (n1 − 1) ×
 * h`, `tip + t × k` out, summed in that order, its lines filling it from its
 * side nearer the tip.
 */
export function carried(
  rotation: number,
  tip: number,
  n1: number,
  count: number,
  W: number,
  h: number,
): Carried {
  const H = count * h;
  if (rotation === 0) {
    const starts = Array.from(
      { length: count },
      (_, index) => tip + MARKER_HEIGHT + LABEL_GAP + (n1 + index - 1) * h,
    );
    const first = tip + MARKER_HEIGHT + LABEL_GAP + (n1 - 1) * h;
    return { vx: 0, starts, inwards: false, box: [first, first + H] };
  }
  const [s, k] = sineCosine(rotation);
  const D = MARKER_HEIGHT + LABEL_GAP + (n1 - 1) * h;
  const t = D + (W / 2) * Math.abs(s) + (H / 2) * Math.abs(k);
  const centre = tip + t * k;
  const inwards = k < 0;
  const starts = Array.from({ length: count }, (_, index) =>
    inwards ? centre + H / 2 - index * h : centre - H / 2 + index * h,
  );
  return { vx: t * s, starts, inwards, box: [centre - H / 2, centre + H / 2] };
}

/** Whether the vertical through a wedge's tip runs through its body: `|r| ≤ 12` or `|r| ≥ 168`. */
export const verticalMeetsBody = (rotation: number): boolean =>
  Math.abs(rotation) <= 12 || Math.abs(rotation) >= 168;

/**
 * The gap of a named timestamp's cross-section line (section 6.6), as the
 * smallest and the largest distance out from its line, or null for none:
 * of its wedge, when it is displayed and the vertical meets its body, the
 * tip at `tip` and its corners; of its stack, when it holds a displayed
 * label and lies across the tip's abscissa `x` (`X + vx − W / 2 ≤ X ≤ X +
 * vx + W / 2`), the box's two sides.
 */
export function gapOf(
  x: number,
  rotation: number,
  tip: number,
  wedge: boolean,
  stack: { readonly carried: Carried; readonly width: number } | null,
): readonly [number, number] | null {
  const distances: number[] = [];
  if (wedge && verticalMeetsBody(rotation)) {
    const [first, second] = wedgeCorners(rotation);
    distances.push(tip, tip + first.out, tip + second.out);
  }
  if (stack !== null) {
    const { vx, box } = stack.carried;
    const half = stack.width / 2;
    if (x + vx - half <= x && x <= x + vx + half) distances.push(...box);
  }
  return distances.length === 0 ? null : [Math.min(...distances), Math.max(...distances)];
}

/** An interval of ordinates `[y1, y2]`, `y1 ≤ y2`. */
export type Span = readonly [number, number];

/**
 * `span` less the interval `gap`, as up to two pieces from the top, none
 * without a length.
 */
export function cut(span: Span, gap: Span | null): Span[] {
  const [y1, y2] = span;
  const pieces: Span[] =
    gap === null || gap[1] <= y1 || gap[0] >= y2
      ? [[y1, y2]]
      : [
          [y1, Math.min(y2, gap[0])],
          [Math.max(y1, gap[1]), y2],
        ];
  return pieces.filter(([low, high]) => high > low);
}
