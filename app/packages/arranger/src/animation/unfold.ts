/**
 * One drawing unfolding out of another, read at a progress `t` from 0 to 1
 * (decision record 0034). Rows (a drawn line and what is drawn with it)
 * are paired between the drawing a motion starts from and the drawing it
 * ends at by a key; each row of the end drawing travels from its paired
 * row's ordinate to its own, a row with no pair travels with its paired
 * neighbours and blends in, and a rectangle opens from one box to another.
 * Sideways, a card's abscissas are read through knots, each an abscissa and
 * the position it draws on the card's root: an element of the end drawing
 * starts where the other drawing draws the same positions and travels to
 * its own, stretched between its two ends (an elided card turning whole,
 * or unfolding out of its member card).
 * Pure: no DOM and no drawing type, so any motion between two drawings of
 * the canvas reuses it with its own reading of the records (`raise.ts` for
 * a raised ancestor card, `elide.ts` for a card's elisions); one progress
 * value drives it (`unfolding.svelte.ts`, `cardMotions.svelte.ts`). Every
 * distance is in drawing units.
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

/**
 * A point of a card's horizontal axis: the abscissa `x` and the position
 * `at` it draws, on the card's root's own axis, as a float. A card's knots,
 * sorted by `x`, draw its positions piecewise linearly between them: a full
 * run at its own scale, a gap at its own width.
 */
export interface Knot {
  readonly x: number;
  readonly at: number;
}

/**
 * The position the abscissa `x` draws among `knots` (sorted by `x`): linear
 * between the two knots around it, a knot's own position exactly at it,
 * the first or the last knot's beyond them; `null` without knots.
 */
export function positionAt(knots: readonly Knot[], x: number): number | null {
  const first = knots[0];
  const last = knots.at(-1);
  if (first === undefined || last === undefined) return null;
  if (x <= first.x) return first.at;
  if (x >= last.x) return last.at;
  for (let index = 1; index < knots.length; index += 1) {
    const right = knots[index];
    const left = knots[index - 1];
    if (right === undefined || left === undefined || x > right.x) continue;
    if (x === right.x) return right.at;
    if (x === left.x) return left.at;
    return left.at + ((right.at - left.at) * (x - left.x)) / (right.x - left.x);
  }
  return last.at;
}

/**
 * The abscissa drawing the position `at` among `knots` (sorted by `x`, so by
 * `at` too): linear between the two knots around it, a knot's own abscissa
 * exactly at its position, the first or the last knot's beyond them (a
 * position the knots do not reach is drawn at their nearer end); `null`
 * without knots.
 */
export function abscissaAt(knots: readonly Knot[], at: number): number | null {
  const first = knots[0];
  const last = knots.at(-1);
  if (first === undefined || last === undefined) return null;
  if (at <= first.at) return first.x;
  if (at >= last.at) return last.x;
  for (let index = 1; index < knots.length; index += 1) {
    const right = knots[index];
    const left = knots[index - 1];
    if (right === undefined || left === undefined || at > right.at) continue;
    if (at === right.at) return right.x;
    if (at === left.at) return left.x;
    return left.x + ((right.x - left.x) * (at - left.at)) / (right.at - left.at);
  }
  return last.x;
}

/**
 * Where the motion starts the abscissa `x` of the end drawing, whose card
 * draws through `to`: at the abscissa the start drawing's card draws the
 * same position through `from`, plus `offset` (the move of the place origin
 * between the two drawings, so both are read on the canvas); `x` itself
 * moved by `offset` where either drawing has no knots. An abscissa beyond
 * `to`'s first or last knot starts as far beyond that knot's start, so a
 * card's names and padding travel with its line's ends.
 */
export function startOf(
  from: readonly Knot[],
  to: readonly Knot[],
  offset: number,
  x: number,
): number {
  const first = to[0];
  const last = to.at(-1);
  if (first === undefined || last === undefined) return x + offset;
  const held = x < first.x ? first : x > last.x ? last : null;
  const at = positionAt(to, held === null ? x : held.x);
  const start = at === null ? null : abscissaAt(from, at);
  if (start === null) return x + offset;
  return held === null ? start + offset : start + offset + (x - held.x);
}

/**
 * How an element moves sideways: `left` and `right` its extent at rest,
 * `fromLeft` and `fromRight` where the motion starts them (equal ends for
 * an element drawn at one abscissa, a text or a mark, which moves without
 * stretching).
 */
export interface Across {
  readonly left: number;
  readonly right: number;
  readonly fromLeft: number;
  readonly fromRight: number;
}

/**
 * How an element of a card moves between two drawings: sideways `across`
 * (`null`: it does not), down by `dy` at the start (its start's ordinate
 * less its own), and whether it `enters`, blending in.
 */
export interface Motion {
  readonly across: Across | null;
  readonly dy: number;
  readonly enters: boolean;
}

/**
 * An element's extent at a progress: each end linearly from where the
 * motion starts it to its own, exactly its start at 0 and its own at 1.
 */
export function spanAt(
  across: Across,
  t: number,
): { readonly left: number; readonly right: number } {
  if (t >= 1) return { left: across.left, right: across.right };
  if (t <= 0) return { left: across.fromLeft, right: across.fromRight };
  return {
    left: across.fromLeft + (across.left - across.fromLeft) * t,
    right: across.fromRight + (across.right - across.fromRight) * t,
  };
}

/**
 * Where an element lies at a progress, as the map `x ↦ sx · x + dx`,
 * `y ↦ y + dy` and its opacity times its own: the identity with opacity 1
 * at rest.
 */
export interface Placed {
  readonly sx: number;
  readonly dx: number;
  readonly dy: number;
  readonly opacity: number;
}

/** Where an element lies at rest. */
export const AT_REST: Placed = { sx: 1, dx: 0, dy: 0, opacity: 1 };

/**
 * Where an element moving by `motion` lies at progress `t`: its extent
 * `spanAt` (stretched from its start's to its own, moved without
 * stretching where it has no width), shifted down by `dy × (1 − t)`, at
 * opacity `t` when it enters and 1 otherwise; exactly `AT_REST` at 1.
 */
export function placedAt(motion: Motion, t: number): Placed {
  if (t >= 1) return AT_REST;
  const dy = motion.dy * (1 - t);
  const opacity = motion.enters ? t : 1;
  if (motion.across === null) return { sx: 1, dx: 0, dy, opacity };
  const { left, right } = motion.across;
  const span = spanAt(motion.across, t);
  const sx = right > left ? (span.right - span.left) / (right - left) : 1;
  return { sx, dx: span.left - sx * left, dy, opacity };
}

/** A raise's frame (`frameAt`) as the map `placedAt` gives. */
export function framePlaced({ dy, opacity }: Frame): Placed {
  return { sx: 1, dx: 0, dy, opacity };
}

/** `inner`, then `outer`: the map of both, the opacities multiplied. */
export function composed(outer: Placed, inner: Placed): Placed {
  return {
    sx: outer.sx * inner.sx,
    dx: outer.sx * inner.dx + outer.dx,
    dy: outer.dy + inner.dy,
    opacity: outer.opacity * inner.opacity,
  };
}
