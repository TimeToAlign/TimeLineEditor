/**
 * One drawing unfolding out of another, read at a progress `t` from 0 to 1
 * (decision record 0034). Rows (a drawn line and what is drawn with it)
 * are paired between the drawing a motion starts from and the drawing it
 * ends at by a key; each row of the end drawing travels from its paired
 * row's ordinate to its own, a row with no pair travels with its paired
 * neighbours and blends in, and a rectangle opens from one box to another.
 * Pure: no DOM and no drawing type, so any motion between two drawings of
 * the canvas reuses it with its own reading of the records (`raise.ts` for
 * a raised ancestor card); one progress value drives it
 * (`unfolding.svelte.ts`). Every distance is in drawing units.
 */

import { cubicInOut } from "svelte/easing";

/** A row of a drawing: what pairs it with a row of another drawing, and the ordinate of its line. */
export interface Row {
  readonly key: string;
  readonly y: number;
}

/** A rectangle in drawing units. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * How a row of the end drawing moves: `shift` the vertical distance from
 * its place at rest to where the motion starts it (the paired row's
 * ordinate less its own), `enters` whether it has no pair and so blends in.
 */
export interface RowMotion {
  readonly shift: number;
  readonly enters: boolean;
}

/** Where an element lies at a progress: shifted vertically by `dy`, drawn at `opacity` times its own. */
export interface Frame {
  readonly dy: number;
  readonly opacity: number;
}

/** The time a whole motion takes, from 0 to 1 or back, in milliseconds. */
export const UNFOLD_DURATION = 400;

/** The easing of the progress: slow at both ends, so the rows leave and settle softly. */
export const UNFOLD_EASING: (t: number) => number = cubicInOut;

/**
 * The motion of every row of `to`, the end drawing, keyed by its row's key,
 * against `from`, the drawing the motion starts from. A row whose key
 * `from` holds is paired with the first such row of `from` and shifted by
 * its ordinate less its own. A row `from` lacks enters, shifted as the
 * paired rows around it: by the paired rows' ordinates in `to`, the shift
 * interpolated linearly between the nearest paired row above it and the
 * nearest below, the nearest one's beyond the first or the last, 0 where no
 * row is paired. A key repeated in `to` keeps its first row.
 */
export function pairRows(from: readonly Row[], to: readonly Row[]): ReadonlyMap<string, RowMotion> {
  const starts = new Map<string, number>();
  for (const row of from) if (!starts.has(row.key)) starts.set(row.key, row.y);
  const anchors = to
    .flatMap((row) => {
      const start = starts.get(row.key);
      return start === undefined ? [] : [{ y: row.y, shift: start - row.y }];
    })
    .sort((a, b) => a.y - b.y);
  const motions = new Map<string, RowMotion>();
  for (const row of to) {
    if (motions.has(row.key)) continue;
    const start = starts.get(row.key);
    motions.set(
      row.key,
      start === undefined
        ? { shift: shiftAmong(anchors, row.y), enters: true }
        : { shift: start - row.y, enters: false },
    );
  }
  return motions;
}

/** The shift at the ordinate `y` among paired rows sorted by ordinate (`pairRows`). */
function shiftAmong(anchors: readonly { y: number; shift: number }[], y: number): number {
  const below = anchors.findIndex((anchor) => anchor.y >= y);
  if (below === 0) return anchors[0]?.shift ?? 0;
  if (below < 0) return anchors.at(-1)?.shift ?? 0;
  const upper = anchors[below - 1];
  const lower = anchors[below];
  if (upper === undefined || lower === undefined || lower.y === upper.y) return lower?.shift ?? 0;
  return upper.shift + ((lower.shift - upper.shift) * (y - upper.y)) / (lower.y - upper.y);
}

/**
 * Where an element moving by `motion` lies at progress `t`: shifted by
 * `shift × (1 − t)`, opaque when its row is paired and at `t` when it
 * enters; an element of no row (`null`) does not move and blends in.
 */
export function frameAt(motion: RowMotion | null, t: number): Frame {
  if (motion === null) return { dy: 0, opacity: t };
  return { dy: motion.shift * (1 - t), opacity: motion.enters ? t : 1 };
}

/** The rectangle between `from` (at `t` = 0) and `to` (at `t` = 1), each edge linearly. */
export function rectAt(from: Rect, to: Rect, t: number): Rect {
  const at = (a: number, b: number) => a + (b - a) * t;
  return {
    x: at(from.x, to.x),
    y: at(from.y, to.y),
    width: at(from.width, to.width),
    height: at(from.height, to.height),
  };
}

/**
 * The milliseconds a progress takes from `from` to `to`: the part of
 * `UNFOLD_DURATION` the distance is, so a motion reversed half-way takes
 * half the time back; 0 under reduced motion, a plain switch.
 */
export function durationOf(from: number, to: number, reduced: boolean): number {
  return reduced ? 0 : Math.abs(to - from) * UNFOLD_DURATION;
}
